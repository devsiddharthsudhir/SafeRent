import fs from "node:fs";
import path from "node:path";
import { readJsonl } from "./storage.js";
import { verdictFromScore } from "./scoring/verdict.js";
function sigmoid(z) {
    return 1 / (1 + Math.exp(-z));
}
function safeParseLabel(raw) {
    const s = String(raw || "").trim().toLowerCase();
    if (s === "scam")
        return "scam";
    if (s === "predatory")
        return "predatory";
    if (s === "legit")
        return "legit";
    if (s === "unknown")
        return "unknown";
    return null;
}
function labelToY(label) {
    if (label === "legit")
        return 0;
    if (label === "predatory")
        return 0.75;
    return 1;
}
function getSignalValue(s) {
    const v = typeof s.value === "number" ? s.value : 0;
    if (!Number.isFinite(v))
        return 0;
    return Math.max(0, Math.min(1, v));
}
function loadWeights() {
    const p = path.resolve(process.cwd(), "data", "weights.json");
    const raw = fs.readFileSync(p, "utf-8");
    const w = JSON.parse(raw);
    w.signals ||= {};
    if (!w.calibration)
        w.calibration = { a: 1, b: 0 };
    return w;
}
function recomputeFromSignals(signals, weights) {
    const bias = typeof weights.bias === "number" ? weights.bias : 0;
    const a = typeof weights.calibration?.a === "number" ? weights.calibration.a : 1;
    const b = typeof weights.calibration?.b === "number" ? weights.calibration.b : 0;
    const weightMap = weights.signals || {};
    let z = bias;
    for (const s of signals || []) {
        const id = String(s?.id || "").trim();
        if (!id)
            continue;
        const v = getSignalValue(s);
        const w = typeof weightMap[id] === "number" ? weightMap[id] : (typeof s.weight === "number" ? s.weight : 0);
        z += w * v;
    }
    const p = sigmoid(a * z + b);
    const score = Math.max(0, Math.min(100, Math.round(p * 100)));
    return { z, p, score };
}
function toPredClass(score, signals) {
    const v = verdictFromScore(score, signals);
    if (v === "likely_scam")
        return "scam";
    if (v === "likely_predatory")
        return "predatory";
    if (v === "likely_legit")
        return "legit";
    return "unclear";
}
function makeBins(examples, binCount = 10) {
    const bins = [];
    for (let i = 0; i < binCount; i++) {
        const lo = i / binCount;
        const hi = (i + 1) / binCount;
        const inBin = examples.filter((e) => (i === binCount - 1 ? e.probability >= lo && e.probability <= hi : e.probability >= lo && e.probability < hi));
        const n = inBin.length;
        if (!n) {
            bins.push({ bin: `${lo.toFixed(1)}-${hi.toFixed(1)}`, n: 0, avgPred: 0, observed: 0 });
            continue;
        }
        const avgPred = inBin.reduce((s, e) => s + e.probability, 0) / n;
        const observed = inBin.reduce((s, e) => {
            if (e.trueLabel === "unknown")
                return s;
            if (e.trueLabel === "legit")
                return s;
            return s + 1;
        }, 0) / n;
        bins.push({ bin: `${lo.toFixed(1)}-${hi.toFixed(1)}`, n, avgPred: Number(avgPred.toFixed(4)), observed: Number(observed.toFixed(4)) });
    }
    return bins;
}
function binaryMetrics(examples, threshold) {
    let tp = 0, fp = 0, tn = 0, fn = 0;
    for (const e of examples) {
        if (e.trueLabel === "unknown")
            continue;
        const y = e.trueLabel === "legit" ? 0 : 1;
        const yhat = e.probability >= threshold ? 1 : 0;
        if (y === 1 && yhat === 1)
            tp++;
        else if (y === 0 && yhat === 1)
            fp++;
        else if (y === 0 && yhat === 0)
            tn++;
        else
            fn++;
    }
    const precision = tp + fp ? tp / (tp + fp) : 0;
    const recall = tp + fn ? tp / (tp + fn) : 0;
    const f1 = precision + recall ? (2 * precision * recall) / (precision + recall) : 0;
    const accuracy = tp + tn + fp + fn ? (tp + tn) / (tp + tn + fp + fn) : 0;
    return {
        threshold,
        tp,
        fp,
        tn,
        fn,
        precision: Number(precision.toFixed(4)),
        recall: Number(recall.toFixed(4)),
        f1: Number(f1.toFixed(4)),
        accuracy: Number(accuracy.toFixed(4)),
    };
}
export function runEvaluation() {
    const weights = loadWeights();
    const analyses = readJsonl("analyses");
    const feedback = readJsonl("feedback");
    const byId = new Map();
    for (const a of analyses) {
        const id = String(a?.analysisId || "").trim();
        if (id)
            byId.set(id, a);
    }
    const examples = [];
    const labelCounts = { scam: 0, predatory: 0, legit: 0, unknown: 0 };
    for (const fb of feedback) {
        const analysisId = String(fb?.analysisId || "").trim();
        if (!analysisId)
            continue;
        const lbl = safeParseLabel(fb?.label);
        if (!lbl)
            continue;
        const a = byId.get(analysisId);
        if (!a || !Array.isArray(a.signals))
            continue;
        labelCounts[lbl] = (labelCounts[lbl] || 0) + 1;
        // recompute with current weights to evaluate current model state
        const { z, p, score } = recomputeFromSignals(a.signals, weights);
        const verdict = toPredClass(score, a.signals);
        examples.push({
            analysisId,
            trueLabel: lbl,
            rawLogit: Number(z.toFixed(6)),
            probability: Number(p.toFixed(6)),
            score,
            verdict,
            title: a?.listing?.title,
            city: a?.listing?.city,
            price: a?.listing?.price,
            sourceUrl: a?.listing?.source_url,
        });
    }
    const used = examples.filter((e) => e.trueLabel !== "unknown");
    const thresholds = [0.3, 0.5, 0.7];
    const metricsByThreshold = thresholds.map((t) => binaryMetrics(used, t));
    // pick best f1 over a coarse sweep
    let best = null;
    for (let t = 0.05; t <= 0.95 + 1e-9; t += 0.05) {
        const m = binaryMetrics(used, Number(t.toFixed(2)));
        if (!best || m.f1 > best.f1)
            best = m;
    }
    // multiclass confusion (true: scam|predatory|legit; pred: scam|predatory|legit|unclear)
    const trueLabels = ["scam", "predatory", "legit"];
    const predLabels = ["scam", "predatory", "legit", "unclear"];
    const confusion = {};
    for (const t of trueLabels) {
        confusion[t] = {};
        for (const p of predLabels)
            confusion[t][p] = 0;
    }
    let correctStrict = 0;
    let totalStrict = 0;
    for (const e of used) {
        const t = e.trueLabel;
        confusion[t][e.verdict] = (confusion[t][e.verdict] || 0) + 1;
        totalStrict++;
        if (e.verdict === t)
            correctStrict++;
    }
    const accuracyStrict = totalStrict ? correctStrict / totalStrict : 0;
    const report = {
        generatedAt: new Date().toISOString(),
        examplesTotal: feedback.length,
        examplesUsed: used.length,
        labelCounts,
        binary: {
            positiveDefinition: "unsafe=scam|predatory",
            metricsByThreshold,
            bestF1: best,
        },
        multiclass: {
            labelsTrue: trueLabels,
            labelsPred: predLabels,
            confusion,
            accuracyStrict: Number(accuracyStrict.toFixed(4)),
        },
        calibration: {
            bins: makeBins(used, 10),
        },
    };
    return { examples, report };
}
export function writeEvaluationArtifacts(outDir) {
    const base = outDir ? path.resolve(outDir) : path.resolve(process.cwd(), "data", "metrics");
    fs.mkdirSync(base, { recursive: true });
    const { examples, report } = runEvaluation();
    const reportPath = path.join(base, "latest.json");
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf-8");
    const csvPath = path.join(base, "latest.csv");
    const header = [
        "analysisId",
        "trueLabel",
        "probability",
        "score",
        "verdict",
        "rawLogit",
        "title",
        "city",
        "price",
        "sourceUrl",
    ];
    const lines = [header.join(",")];
    for (const e of examples) {
        const row = [
            e.analysisId,
            e.trueLabel,
            String(e.probability),
            String(e.score),
            e.verdict,
            String(e.rawLogit),
            safeCsv(e.title),
            safeCsv(e.city),
            e.price != null ? String(e.price) : "",
            safeCsv(e.sourceUrl),
        ];
        lines.push(row.join(","));
    }
    fs.writeFileSync(csvPath, lines.join("\n"), "utf-8");
    return { reportPath, csvPath };
}
function safeCsv(v) {
    const s = String(v ?? "");
    const needs = /[\n\r,\"]/g.test(s);
    const escaped = s.replace(/\"/g, '""');
    return needs ? `"${escaped}"` : escaped;
}
