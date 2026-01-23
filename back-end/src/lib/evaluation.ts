import fs from "node:fs";
import path from "node:path";
import { readJsonl } from "./storage.js";
import type { AnalysisResult, Signal } from "./scoring/types.js";
import { verdictFromScore } from "./scoring/verdict.js";

function sigmoid(z: number) {
  return 1 / (1 + Math.exp(-z));
}

export type Label = "scam" | "predatory" | "legit" | "unknown";
export type PredClass = "scam" | "predatory" | "legit" | "unclear";

export type EvalExample = {
  analysisId: string;
  trueLabel: Label;
  // model outputs (recomputed from current weights)
  rawLogit: number;
  probability: number;
  score: number; // 0..100
  verdict: PredClass;
  // optional context
  title?: string;
  city?: string;
  price?: number;
  sourceUrl?: string;
};

export type CalibrationBin = {
  bin: string; // e.g. "0.0-0.1"
  n: number;
  avgPred: number;
  observed: number;
};

export type BinaryMetrics = {
  threshold: number;
  tp: number;
  fp: number;
  tn: number;
  fn: number;
  precision: number;
  recall: number;
  f1: number;
  accuracy: number;
};

export type EvalReport = {
  generatedAt: string;
  examplesTotal: number;
  examplesUsed: number;
  labelCounts: Record<string, number>;
  binary: {
    positiveDefinition: "unsafe=scam|predatory";
    metricsByThreshold: BinaryMetrics[];
    bestF1: BinaryMetrics | null;
  };
  multiclass: {
    labelsTrue: Array<Exclude<Label, "unknown">>;
    labelsPred: PredClass[];
    confusion: Record<string, Record<string, number>>; // true -> pred -> count
    accuracyStrict: number;
  };
  calibration: {
    bins: CalibrationBin[];
  };
};

function safeParseLabel(raw: any): Label | null {
  const s = String(raw || "").trim().toLowerCase();
  if (s === "scam") return "scam";
  if (s === "predatory") return "predatory";
  if (s === "legit") return "legit";
  if (s === "unknown") return "unknown";
  return null;
}

function labelToY(label: Exclude<Label, "unknown">): number {
  if (label === "legit") return 0;
  if (label === "predatory") return 0.75;
  return 1;
}

function getSignalValue(s: Signal): number {
  const v = typeof s.value === "number" ? s.value : 0;
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
}

function loadWeights(): any {
  const p = path.resolve(process.cwd(), "data", "weights.json");
  const raw = fs.readFileSync(p, "utf-8");
  const w = JSON.parse(raw);
  w.signals ||= {};
  if (!w.calibration) w.calibration = { a: 1, b: 0 };
  return w;
}

function recomputeFromSignals(signals: Signal[], weights: any): { z: number; p: number; score: number } {
  const bias: number = typeof weights.bias === "number" ? weights.bias : 0;
  const a: number = typeof weights.calibration?.a === "number" ? weights.calibration.a : 1;
  const b: number = typeof weights.calibration?.b === "number" ? weights.calibration.b : 0;

  const weightMap: Record<string, number> = weights.signals || {};

  let z = bias;
  for (const s of signals || []) {
    const id = String((s as any)?.id || "").trim();
    if (!id) continue;
    const v = getSignalValue(s);
    const w = typeof weightMap[id] === "number" ? weightMap[id] : (typeof (s as any).weight === "number" ? (s as any).weight : 0);
    z += w * v;
  }

  const p = sigmoid(a * z + b);
  const score = Math.max(0, Math.min(100, Math.round(p * 100)));
  return { z, p, score };
}

function toPredClass(score: number, signals: Signal[]): PredClass {
  const v = verdictFromScore(score, signals);
  if (v === "likely_scam") return "scam";
  if (v === "likely_predatory") return "predatory";
  if (v === "likely_legit") return "legit";
  return "unclear";
}

function makeBins(examples: EvalExample[], binCount = 10): CalibrationBin[] {
  const bins: CalibrationBin[] = [];
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
      if (e.trueLabel === "unknown") return s;
      if (e.trueLabel === "legit") return s;
      return s + 1;
    }, 0) / n;
    bins.push({ bin: `${lo.toFixed(1)}-${hi.toFixed(1)}`, n, avgPred: Number(avgPred.toFixed(4)), observed: Number(observed.toFixed(4)) });
  }
  return bins;
}

function binaryMetrics(examples: EvalExample[], threshold: number): BinaryMetrics {
  let tp = 0, fp = 0, tn = 0, fn = 0;
  for (const e of examples) {
    if (e.trueLabel === "unknown") continue;
    const y = e.trueLabel === "legit" ? 0 : 1;
    const yhat = e.probability >= threshold ? 1 : 0;
    if (y === 1 && yhat === 1) tp++;
    else if (y === 0 && yhat === 1) fp++;
    else if (y === 0 && yhat === 0) tn++;
    else fn++;
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

export function runEvaluation(): { examples: EvalExample[]; report: EvalReport } {
  const weights = loadWeights();
  const analyses = readJsonl("analyses") as any[];
  const feedback = readJsonl("feedback") as any[];

  const byId = new Map<string, any>();
  for (const a of analyses) {
    const id = String(a?.analysisId || "").trim();
    if (id) byId.set(id, a);
  }

  const examples: EvalExample[] = [];
  const labelCounts: Record<string, number> = { scam: 0, predatory: 0, legit: 0, unknown: 0 };

  for (const fb of feedback) {
    const analysisId = String(fb?.analysisId || "").trim();
    if (!analysisId) continue;
    const lbl = safeParseLabel(fb?.label);
    if (!lbl) continue;

    const a = byId.get(analysisId) as AnalysisResult | undefined;
    if (!a || !Array.isArray((a as any).signals)) continue;

    labelCounts[lbl] = (labelCounts[lbl] || 0) + 1;

    // recompute with current weights to evaluate current model state
    const { z, p, score } = recomputeFromSignals((a as any).signals as Signal[], weights);
    const verdict = toPredClass(score, (a as any).signals as Signal[]);

    examples.push({
      analysisId,
      trueLabel: lbl,
      rawLogit: Number(z.toFixed(6)),
      probability: Number(p.toFixed(6)),
      score,
      verdict,
      title: (a as any)?.listing?.title,
      city: (a as any)?.listing?.city,
      price: (a as any)?.listing?.price,
      sourceUrl: (a as any)?.listing?.source_url,
    });
  }

  const used = examples.filter((e) => e.trueLabel !== "unknown");
  const thresholds = [0.3, 0.5, 0.7];
  const metricsByThreshold = thresholds.map((t) => binaryMetrics(used, t));

  // pick best f1 over a coarse sweep
  let best: BinaryMetrics | null = null;
  for (let t = 0.05; t <= 0.95 + 1e-9; t += 0.05) {
    const m = binaryMetrics(used, Number(t.toFixed(2)));
    if (!best || m.f1 > best.f1) best = m;
  }

  // multiclass confusion (true: scam|predatory|legit; pred: scam|predatory|legit|unclear)
  const trueLabels: Array<Exclude<Label, "unknown">> = ["scam", "predatory", "legit"];
  const predLabels: PredClass[] = ["scam", "predatory", "legit", "unclear"];
  const confusion: Record<string, Record<string, number>> = {};
  for (const t of trueLabels) {
    confusion[t] = {};
    for (const p of predLabels) confusion[t][p] = 0;
  }

  let correctStrict = 0;
  let totalStrict = 0;
  for (const e of used) {
    const t = e.trueLabel as Exclude<Label, "unknown">;
    confusion[t][e.verdict] = (confusion[t][e.verdict] || 0) + 1;
    totalStrict++;
    if (e.verdict === t) correctStrict++;
  }
  const accuracyStrict = totalStrict ? correctStrict / totalStrict : 0;

  const report: EvalReport = {
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

export function writeEvaluationArtifacts(outDir?: string): { reportPath: string; csvPath: string } {
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

function safeCsv(v: any): string {
  const s = String(v ?? "");
  const needs = /[\n\r,\"]/g.test(s);
  const escaped = s.replace(/\"/g, '""');
  return needs ? `"${escaped}"` : escaped;
}
