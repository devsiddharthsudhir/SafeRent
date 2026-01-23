import fs from "node:fs";
import path from "node:path";

export type WeightsFile = {
  bias?: number;
  calibration?: { a?: number; b?: number };
  signals?: Record<string, number>;
};

function normalizeWeights(raw: any): WeightsFile {
  const w: WeightsFile = raw && typeof raw === "object" ? raw : {};

  if (!w.signals || typeof w.signals !== "object") w.signals = {};
  if (!w.calibration || typeof w.calibration !== "object") w.calibration = { a: 1, b: 0 };

  if (typeof w.calibration!.a !== "number") w.calibration!.a = 1;
  if (typeof w.calibration!.b !== "number") w.calibration!.b = 0;
  if (typeof w.bias !== "number") w.bias = 0;

  return w;
}

/**
 * Loads data/weights.json from the backend root (process.cwd()).
 * Works with `tsx watch` because imports like "./weights.js" resolve to this TS file.
 */
export function loadWeights(): WeightsFile {
  const p = path.resolve(process.cwd(), "data", "weights.json");

  // Friendly fallback so dev doesn’t crash if weights.json is missing
  if (!fs.existsSync(p)) {
    return normalizeWeights({ bias: 0, calibration: { a: 1, b: 0 }, signals: {} });
  }

  const raw = fs.readFileSync(p, "utf-8");
  return normalizeWeights(JSON.parse(raw));
}
