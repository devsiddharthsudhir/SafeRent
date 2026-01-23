import fs from "node:fs";
import path from "node:path";
import { classifyListingType, inferBedrooms, normalizeCity } from "./canada.js";
import type { Listing, Signal } from "./types.js";

type BaselineBand = { mean: number; sd: number };
type CityBaselines = {
  unit: Record<string, BaselineBand>; // "studio" | "1" | "2" | "3" | "4+"
  room: BaselineBand;
};

type RentBaselines = {
  updatedAt?: string;
  notes?: string;
  cities: Record<string, CityBaselines>;
};

const FALLBACK: RentBaselines = {
  updatedAt: "seed",
  cities: {
    "canada": {
      unit: {
        studio: { mean: 1600, sd: 350 },
        "1": { mean: 1900, sd: 450 },
        "2": { mean: 2400, sd: 600 },
        "3": { mean: 3000, sd: 750 },
        "4+": { mean: 3600, sd: 900 },
      },
      room: { mean: 1050, sd: 250 },
    },
  },
};

let cache: RentBaselines | null = null;

function loadBaselines(): RentBaselines {
  if (cache) return cache;
  try {
    const p = path.resolve(process.cwd(), "data", "ca_rent_baselines.json");
    const raw = fs.readFileSync(p, "utf-8");
    const parsed = JSON.parse(raw) as RentBaselines;
    cache = parsed?.cities ? parsed : FALLBACK;
  } catch {
    cache = FALLBACK;
  }
  return cache!;
}

function clamp(x: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, x));
}

function bandKeyForBedrooms(b: number | null): string {
  if (b === null) return "1";
  if (b <= 0) return "studio";
  if (b === 1) return "1";
  if (b === 2) return "2";
  if (b === 3) return "3";
  return "4+";
}

export function extractPriceSignals(listing: Listing, weightMap: Record<string, number>): Signal[] {
  if (!listing.price || listing.price <= 0) return [];

  const baselines = loadBaselines();
  const cityKeyRaw = normalizeCity(listing.city || listing.neighborhood || "");
  const cityKey = cityKeyRaw && baselines.cities[cityKeyRaw] ? cityKeyRaw : "canada";
  const city = baselines.cities[cityKey] || baselines.cities["canada"] || FALLBACK.cities["canada"];

  const type = classifyListingType(listing);
  const bedrooms = inferBedrooms(listing);
  const key = bandKeyForBedrooms(bedrooms);

  const band: BaselineBand =
    type === "room"
      ? city.room
      : (city.unit[key] || city.unit["1"] || FALLBACK.cities["canada"].unit["1"]);

  const z = (listing.price - band.mean) / Math.max(1, band.sd);

  // NOTE:
  // - For rooms: low prices can be legit, so only flag if it's *extremely* low.
  // - For units: low prices are a stronger scam bait signal.
  const out: Signal[] = [];

  const baselineExplain = `Baseline (${cityKey.toUpperCase()} ${type.toUpperCase()} ${type === "room" ? "" : `BR=${bedrooms ?? "?"}`.trim()}): mean≈${band.mean}, sd≈${band.sd}. Observed=${listing.price}, z=${z.toFixed(2)}`;

  // Very low
  const veryLowRoom = type === "room" && (listing.price < band.mean - 3 * band.sd) && listing.price < 350;
  const lowUnit = type !== "room" && z < -2.0;

  if (veryLowRoom || lowUnit) {
    const id = "price_anomaly_low";
    const weight = weightMap[id] ?? 0;
    const value = clamp(Math.abs(z) / 3, 0.2, 1);
    out.push({
      id,
      category: "Price",
      label: "Price is far below typical range for the area/type",
      why_it_matters:
        "Scam listings often use unusually low rent to create urgency and extract a deposit before a viewing.",
      evidence: baselineExplain,
      value,
      weight,
      contribution: weight * value,
      severity: type === "room" ? "medium" : "high",
    });
  }

  // Very high (predatory indicator, lower severity)
  if (z > 2.4) {
    const id = "price_anomaly_high";
    const weight = weightMap[id] ?? 0;
    const value = clamp((z - 2.4) / 2.0, 0.2, 1);
    out.push({
      id,
      category: "Price",
      label: "Price is far above typical range for the area/type",
      why_it_matters:
        "Unusually high rent can indicate predatory terms, hidden fees, or misleading listing details.",
      evidence: baselineExplain,
      value,
      weight,
      contribution: weight * value,
      severity: "medium",
    });
  }

  return out;
}
