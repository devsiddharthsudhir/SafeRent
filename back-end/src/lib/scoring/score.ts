import { nanoid } from "nanoid";
import fs from "node:fs";
import path from "node:path";
import { extractBehaviorSignals } from "./behavior.js";
import { computeConfidenceInfo } from "./confidence.js";
import { extractImageSignals } from "./images.js";
import { extractNlpSignals } from "./nlp.js";
import { extractPolicySignals } from "./policy.js";
import { extractPriceSignals } from "./price.js";
import type { AnalysisResult, Listing, Signal } from "./types.js";
import { recommendedActions, verdictFromScore } from "./verdict.js";

function sigmoid(z: number) {
  return 1 / (1 + Math.exp(-z));
}

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n));
}

function loadWeights() {
  const p = path.resolve(process.cwd(), "data", "weights.json");
  return JSON.parse(fs.readFileSync(p, "utf-8")) as any;
}

// Keep in sync with verdict.ts (used only for score guardrails)
const STRONG_SCAM_SIGNAL_IDS = new Set<string>([
  "nlp_deposit_before_viewing",
  "nlp_no_viewing",
  "nlp_wire_transfer",
  "nlp_gift_cards",
  "nlp_crypto_payment",
  "nlp_etransfer",
  "nlp_out_of_country",
]);

function applyScoreGuardrails(
  score: number,
  signals: Signal[],
  confidenceLabel: "low" | "medium" | "high"
): number {
  let out = score;

  // Price-only risk can be noisy when extraction is imperfect (e.g., room listings where
  // the "bedrooms" count reflects the whole home). Keep it in "needs verification" range
  // unless other independent signals support the risk.
  const positiveSignals = signals.filter((s) => Number(s.contribution || 0) > 0.05);
  if (
    positiveSignals.length === 1 &&
    (positiveSignals[0].id === "price_anomaly_low" || positiveSignals[0].id === "price_anomaly_high")
  ) {
    out = Math.min(out, 45);
  }

  const strongCount = signals.filter(
    (s) => STRONG_SCAM_SIGNAL_IDS.has(s.id) && Number(s.contribution || 0) > 0
  ).length;

  const legitCount = signals.filter((s) => {
    const id = String(s.id || "");
    const isLegit = id.startsWith("nlp_legit_") || id === "web_crosspost_found";
    return isLegit && Number(s.contribution || 0) < 0;
  }).length;

  // If we see multiple strong scam triggers, ensure the score remains high.
  if (strongCount >= 2) out = Math.max(out, 82);

  // If we see multiple strong legitimacy cues and no scam trigger, cap to avoid false positives.
  if (strongCount === 0 && legitCount >= 2) out = Math.min(out, 55);

  // If confidence is low, avoid extreme scores unless strong triggers exist.
  if (confidenceLabel === "low" && strongCount === 0) {
    if (out > 80) out = Math.round(70 + (out - 70) * 0.35);
    if (out < 10) out = 15;
  }

  return Math.max(0, Math.min(100, out));
}

export async function analyzeListing(
  listing: Listing,
  imageBuffers: Buffer[],
  knownHashes: string[]
): Promise<AnalysisResult> {
  const weights = loadWeights();
  const weightMap: Record<string, number> = weights.signals || {};
  const bias: number = weights.bias ?? 0;
  const calibA: number = weights.calibration?.a ?? 1;
  const calibB: number = weights.calibration?.b ?? 0;

  const signals: Signal[] = [
    ...extractNlpSignals(listing, weightMap),
    ...extractPriceSignals(listing, weightMap),
    ...extractBehaviorSignals(listing, weightMap),
    ...extractPolicySignals(listing, weightMap),
  ];

  const img = await extractImageSignals(imageBuffers, knownHashes, weightMap);
  signals.push(...img.signals);

  // --- raw score
  let z = bias;
  for (const s of signals) z += s.contribution;

  // Base calibrated probability (0..1)
  const pCal = clamp01(sigmoid(calibA * z + calibB));

  // Confidence (NOT "accuracy") - used to dampen extreme probabilities when data quality is weak.
  const conf = computeConfidenceInfo(listing, signals, {
    hasUploadedImages: imageBuffers.length > 0,
    enrichmentDone: false,
    crosspostsCount: 0,
  });

  const damp = 0.6 + 0.4 * conf.confidence; // 0.6..1.0
  const pAdj = clamp01(0.5 + (pCal - 0.5) * damp);

  // Convert to UI score and apply guardrails.
  let riskScore = Math.round(pAdj * 100);
  riskScore = applyScoreGuardrails(riskScore, signals, conf.confidenceLabel);

  const riskProbability = clamp01(riskScore / 100);

  const verdict = verdictFromScore(riskScore, signals) as AnalysisResult["verdict"];

  const topSignals = [...signals]
    .sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution))
    .slice(0, 4);
  const topReasons = topSignals.map((s) => s.label);

  const subjectId = listing.landlord_subject_id || "subj_unknown";

  return {
    analysisId: nanoid(10),
    createdAt: new Date().toISOString(),
    subjectId,
    listing,
    riskScore,
    riskProbability,
    rawLogit: Number(z.toFixed(6)),
    verdict,
    signals: signals.sort((a, b) => b.contribution - a.contribution),
    topReasons,
    recommendedActions: recommendedActions(verdict),
    confidence: conf.confidence,
    confidenceLabel: conf.confidenceLabel,
    dataQualityHints: conf.dataQualityHints,
    redundancySteps: conf.redundancySteps,
    imageHashes: img.hashes,
  };
}
