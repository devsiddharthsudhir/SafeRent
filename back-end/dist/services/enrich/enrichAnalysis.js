import fs from "node:fs";
import path from "node:path";
import { readAnalysis, writeAnalysis } from "../../lib/analysisStore.js";
import { recommendedActions, verdictFromScore } from "../../lib/scoring/verdict.js";
import { computeConfidenceInfo } from "../../lib/scoring/confidence.js";
import { findCrossposts } from "./crosspost.js";
function sigmoid(z) { return 1 / (1 + Math.exp(-z)); }
function loadWeights() {
    const p = path.resolve(process.cwd(), "data", "weights.json");
    return JSON.parse(fs.readFileSync(p, "utf-8"));
}
function recompute(analysis, signals) {
    const weights = loadWeights();
    const bias = weights.bias ?? 0;
    const calibA = weights.calibration?.a ?? 1;
    const calibB = weights.calibration?.b ?? 0;
    let z = bias;
    for (const s of signals)
        z += s.contribution;
    const pCal = sigmoid(calibA * z + calibB);
    const riskScore = Math.max(0, Math.min(100, Math.round(pCal * 100)));
    const verdict = verdictFromScore(riskScore, signals);
    const topSignals = [...signals]
        .sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution))
        .slice(0, 4);
    const topReasons = topSignals.map((s) => s.label);
    const conf = computeConfidenceInfo(analysis.listing, signals, {
        hasUploadedImages: false,
        enrichmentDone: true,
        crosspostsCount: Array.isArray(analysis.crossposts) ? analysis.crossposts.length : 0,
    });
    return {
        ...analysis,
        riskProbability: pCal,
        rawLogit: Number(z.toFixed(6)),
        riskScore,
        verdict,
        topReasons,
        recommendedActions: recommendedActions(verdict),
        confidence: conf.confidence,
        confidenceLabel: conf.confidenceLabel,
        dataQualityHints: conf.dataQualityHints,
        redundancySteps: conf.redundancySteps,
        signals: [...signals].sort((a, b) => b.contribution - a.contribution),
    };
}
export async function runEnrichment(analysisId) {
    const analysis = readAnalysis(analysisId);
    if (!analysis)
        return null;
    const allow = process.env.WEB_VERIFY_ENABLED !== "false";
    const low = Number(process.env.CROSSPOST_THRESHOLD_LOW || "0.45");
    const high = Number(process.env.CROSSPOST_THRESHOLD_HIGH || "0.60");
    const forced = Boolean(analysis.enrichmentForced);
    const strong = analysis.riskProbability >= low;
    if (!allow) {
        const patched = { ...analysis, enrichmentStatus: "skipped", enrichmentReason: "WEB_VERIFY_ENABLED=false" };
        writeAnalysis(analysisId, patched);
        return patched;
    }
    if (!forced && !strong) {
        const patched = {
            ...analysis,
            enrichmentStatus: "skipped",
            enrichmentReason: `Risk probability below threshold (${low})`,
        };
        writeAnalysis(analysisId, patched);
        return patched;
    }
    const mode = analysis.enrichmentMode || (analysis.riskProbability >= high ? "both" : "serper");
    writeAnalysis(analysisId, {
        ...analysis,
        enrichmentStatus: "running",
        enrichmentMode: mode,
        enrichmentForced: forced,
    });
    try {
        const { matches, providerDiagnostics, signals: extraSignals } = await findCrossposts(analysis.listing, { mode, imageHashes: analysis.imageHashes });
        const mergedSignals = [...analysis.signals, ...extraSignals];
        const updated = recompute({
            ...analysis,
            enrichmentStatus: "done",
            crossposts: matches,
            providerDiagnostics,
        }, mergedSignals);
        writeAnalysis(analysisId, updated);
        return updated;
    }
    catch (e) {
        const patched = {
            ...analysis,
            enrichmentStatus: "failed",
            enrichmentReason: e?.message || "Enrichment failed",
        };
        writeAnalysis(analysisId, patched);
        return patched;
    }
}
