import fs from "node:fs";
import path from "node:path";
import { readJsonl } from "./lib/storage.js";
import { writeEvaluationArtifacts } from "./lib/evaluation.js";

// This is a lightweight "online" trainer for the heuristic risk model.
// It updates signal weights + bias from feedback labels, and optionally re-fits
// a Platt scaling calibration layer (a,b) to better align probabilities.

// Labels
export type Label = "scam" | "predatory" | "legit" | "unknown";

type AnalysisRow = {
  analysisId?: string;
  signals?: Array<{ id?: string; value?: number; weight?: number }>;
};

type FeedbackRow = {
  analysisId?: string;
  label?: Label | string;
};

const weightsPath = path.resolve(process.cwd(), "data", "weights.json");

function clamp(x: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, x));
}

function sigmoid(z: number) {
  return 1 / (1 + Math.exp(-z));
}

function safeParseLabel(raw: any): Label | null {
  const s = String(raw || "").trim().toLowerCase();
  if (s === "scam") return "scam";
  if (s === "predatory") return "predatory";
  if (s === "legit") return "legit";
  if (s === "unknown") return "unknown";
  return null;
}

function labelToY(label: Label): number | null {
  // risk label mapping for fast training
  // scam = 1, predatory = 0.75, legit = 0, unknown ignored
  if (label === "unknown") return null;
  if (label === "legit") return 0;
  if (label === "predatory") return 0.75;
  return 1;
}

function loadWeights(): any {
  try {
    const raw = fs.readFileSync(weightsPath, "utf-8");
    const w = JSON.parse(raw);
    w.signals ||= {};
    if (typeof w.bias !== "number") w.bias = -1.2;
    if (!w.calibration) w.calibration = { a: 1, b: 0 };
    return w;
  } catch {
    return { bias: -1.2, signals: {}, calibration: { a: 1, b: 0 } };
  }
}

function saveWeights(w: any) {
  fs.mkdirSync(path.dirname(weightsPath), { recursive: true });
  fs.writeFileSync(weightsPath, JSON.stringify(w, null, 2), "utf-8");
}

type Stats = { posSum: number; negSum: number; n: number };

type Args = {
  calibrate: boolean;
  report: boolean;
};

function parseArgs(argv: string[]): Args {
  const out: Args = { calibrate: true, report: true };
  for (const a of argv) {
    if (a === "--calibrate") out.calibrate = true;
    if (a === "--no-calibrate") out.calibrate = false;
    if (a === "--report") out.report = true;
    if (a === "--no-report") out.report = false;
  }
  return out;
}

function computeZFromSignals(signals: Array<{ id?: string; value?: number; weight?: number }>, weights: any): number {
  const bias: number = typeof weights.bias === "number" ? weights.bias : 0;
  const weightMap: Record<string, number> = weights.signals || {};
  let z = bias;
  for (const s of signals || []) {
    const id = String(s?.id || "").trim();
    if (!id) continue;
    const v = typeof s.value === "number" && Number.isFinite(s.value) ? clamp(s.value, 0, 1) : 1;
    const w = typeof weightMap[id] === "number" ? weightMap[id] : (typeof s.weight === "number" ? s.weight : 0);
    z += w * v;
  }
  return z;
}

function fitPlattScaling(zs: number[], ys: number[], initA = 1, initB = 0) {
  // Newton-Raphson on 2 parameters (a,b) for p = sigmoid(a*z + b)
  // Minimizes cross-entropy with soft labels ys in [0,1]
  let a = initA;
  let b = initB;
  const lambda = 1e-4; // tiny L2 for stability

  for (let iter = 0; iter < 50; iter++) {
    let gA = 0;
    let gB = 0;
    let hAA = 0;
    let hAB = 0;
    let hBB = 0;

    for (let i = 0; i < zs.length; i++) {
      const z = clamp(zs[i], -12, 12);
      const y = clamp(ys[i], 0, 1);
      const p = sigmoid(a * z + b);
      const w = p * (1 - p);
      const diff = p - y;
      gA += diff * z;
      gB += diff;
      hAA += w * z * z;
      hAB += w * z;
      hBB += w;
    }

    // regularize Hessian
    hAA += lambda;
    hBB += lambda;

    const det = hAA * hBB - hAB * hAB;
    if (!Number.isFinite(det) || Math.abs(det) < 1e-12) break;

    // Solve H * d = g
    const dA = (hBB * gA - hAB * gB) / det;
    const dB = (-hAB * gA + hAA * gB) / det;

    if (!Number.isFinite(dA) || !Number.isFinite(dB)) break;

    a -= clamp(dA, -2, 2);
    b -= clamp(dB, -2, 2);

    if (Math.abs(dA) < 1e-4 && Math.abs(dB) < 1e-4) break;
  }

  // sane bounds
  a = clamp(a, 0.2, 6);
  b = clamp(b, -6, 6);

  return { a: Number(a.toFixed(4)), b: Number(b.toFixed(4)) };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const weights = loadWeights();

  // IMPORTANT: storage.ts expects "analyses" | "feedback"
  const analyses = readJsonl("analyses") as AnalysisRow[];
  const feedback = readJsonl("feedback") as FeedbackRow[];

  const analysisById = new Map<string, AnalysisRow>();
  for (const a of analyses) {
    if (a && typeof a.analysisId === "string" && a.analysisId) {
      analysisById.set(a.analysisId, a);
    }
  }

  const statsBySignal = new Map<string, Stats>();
  const zs: number[] = [];
  const ys: number[] = [];

  let pos = 0;
  let neg = 0;

  for (const fb of feedback) {
    const lbl = safeParseLabel(fb?.label);
    if (!lbl) continue;

    const y = labelToY(lbl);
    if (y === null) continue;

    const a = fb?.analysisId ? analysisById.get(String(fb.analysisId)) : null;
    if (!a || !Array.isArray(a.signals)) continue;

    // count pos/neg for bias (binary view)
    if (y >= 0.5) pos++;
    else neg++;

    // presence map (max value per signal id)
    const present = new Map<string, number>();
    for (const s of a.signals || []) {
      const id = String(s?.id || "").trim();
      if (!id) continue;
      const v = typeof s.value === "number" ? clamp(s.value, 0, 1) : 1;
      present.set(id, Math.max(present.get(id) || 0, v));
    }

    for (const [id, v] of present) {
      const st = statsBySignal.get(id) || { posSum: 0, negSum: 0, n: 0 };
      if (y >= 0.5) st.posSum += v;
      else st.negSum += v;
      st.n += 1;
      statsBySignal.set(id, st);
    }

    // calibration dataset
    const z = computeZFromSignals(a.signals, weights);
    zs.push(z);
    ys.push(y);
  }

  const total = pos + neg;
  if (total < 8) {
    console.log("[train] Not enough labels to train. Add at least ~8 feedback labels.");
    process.exit(0);
  }

  // --- Update bias from overall positive rate ---
  const p = clamp(pos / total, 0.05, 0.95);
  const targetBias = Math.log(p / (1 - p));
  const currentBias = Number(weights.bias ?? -1.2);
  weights.bias = Number((currentBias * 0.7 + targetBias * 0.3).toFixed(3));

  // --- Update per-signal weights using log-odds ---
  const minObs = 10; // require enough appearances to update a signal
  const alpha = 1.5; // smoothing
  const k = 0.35; // update rate
  const limit = 2.4; // cap absolute weight

  let updated = 0;
  for (const [id, st] of statsBySignal) {
    if (st.n < minObs) continue;

    const target = clamp(Math.log((st.posSum + alpha) / (st.negSum + alpha)), -limit, limit);
    const oldW = Number(weights.signals[id] ?? 0);
    const newW = oldW * (1 - k) + target * k;

    weights.signals[id] = Number(newW.toFixed(3));
    updated++;
  }

  // --- Optional calibration fit ---
  let calibrationUpdated = false;
  if (args.calibrate) {
    const n = zs.length;
    if (n >= 20) {
      const initA = Number(weights.calibration?.a ?? 1);
      const initB = Number(weights.calibration?.b ?? 0);
      const { a, b } = fitPlattScaling(zs, ys, initA, initB);
      weights.calibration = { a, b };
      calibrationUpdated = true;
    } else {
      console.log("[train] Skipping calibration: need at least ~20 labeled examples.");
    }
  }

  weights.updatedAt = new Date().toISOString();
  weights.training = {
    examples: total,
    pos,
    neg,
    signalsUpdated: updated,
    calibrationUpdated,
  };

  saveWeights(weights);

  console.log("[train] done", {
    examples: total,
    pos,
    neg,
    signalsUpdated: updated,
    bias: weights.bias,
    calibration: weights.calibration,
  });

  if (args.report) {
    const { reportPath, csvPath } = writeEvaluationArtifacts();
    console.log("[train] eval artifacts written", { reportPath, csvPath });
  }
}

main();
