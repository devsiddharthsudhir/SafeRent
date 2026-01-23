import type { Listing, Signal } from "./types.js";

export type ConfidenceLabel = "low" | "medium" | "high";

export type ConfidenceInfo = {
  confidence: number; // 0..1
  confidenceLabel: ConfidenceLabel;
  dataQualityHints: string[];
  redundancySteps: string[];
};

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function hasText(s: unknown, minLen: number) {
  return typeof s === "string" && s.trim().length >= minLen;
}

function guessHasImages(listing: Listing, opts?: { hasUploadedImages?: boolean }) {
  const urls = Array.isArray(listing.image_urls) ? listing.image_urls.length : 0;
  return Boolean(opts?.hasUploadedImages) || urls > 0;
}

/**
 * Confidence is NOT "accuracy". It's our estimate of how reliable the verdict is,
 * given the listing completeness + signal strength + conflicting evidence.
 */
export function computeConfidenceInfo(
  listing: Listing,
  signals: Signal[],
  opts?: { hasUploadedImages?: boolean; enrichmentDone?: boolean; crosspostsCount?: number }
): ConfidenceInfo {
  // --- 1) Data completeness
  const missing: string[] = [];
  let have = 0;
  let total = 0;

  const check = (ok: boolean, hintIfMissing: string) => {
    total += 1;
    if (ok) have += 1;
    else missing.push(hintIfMissing);
  };

  check(hasText(listing.title, 8), "Add a clearer title (property type, area, rent)." );
  check(hasText(listing.description, 120), "Add the full description text (fees, rules, viewing details)." );
  check(typeof listing.price === "number" && listing.price > 0, "Add the monthly rent (CAD)." );
  check(Boolean(listing.city) || Boolean(listing.neighborhood), "Add city + neighborhood (or nearest intersection)." );
  check(Boolean(listing.source_url) && /^https?:\/\//i.test(String(listing.source_url || "")), "Add the original listing URL." );
  check(guessHasImages(listing, { hasUploadedImages: opts?.hasUploadedImages }), "Add 2–6 photos (kitchen, bathroom, exterior, bedroom)." );

  const completeness = total ? have / total : 0.5;

  // --- 2) Signal strength
  let pos = 0;
  let neg = 0;
  let sumAbs = 0;
  for (const s of signals) {
    const c = Number(s.contribution || 0);
    sumAbs += Math.abs(c);
    if (c >= 0) pos += c;
    else neg += Math.abs(c);
  }
  const strength = clamp(sumAbs / 5.5, 0, 1);

  // --- 3) Conflicting evidence (both strong positive and strong negative contributions)
  const conflict = clamp(Math.min(pos, neg) / (Math.max(pos, neg) + 1e-6), 0, 1);

  // --- 4) Extra boosts
  const enrichBoost = opts?.enrichmentDone ? 0.06 : 0;
  const crosspostBoost = clamp((opts?.crosspostsCount || 0) / 6, 0, 1) * 0.05;

  // Base confidence: mostly driven by completeness + strength, penalized by conflict.
  let confidence = 0.22 + 0.38 * completeness + 0.40 * strength + enrichBoost + crosspostBoost - 0.22 * conflict;

  // If description is extremely short, cap confidence.
  if (!hasText(listing.description, 60)) confidence = Math.min(confidence, 0.55);
  // If there are no images and no URL, cap confidence harder.
  const hasUrl = Boolean(listing.source_url) && /^https?:\/\//i.test(String(listing.source_url || ""));
  const hasImgs = guessHasImages(listing, { hasUploadedImages: opts?.hasUploadedImages });
  if (!hasUrl && !hasImgs) confidence = Math.min(confidence, 0.5);

  confidence = clamp(confidence, 0, 1);

  const confidenceLabel: ConfidenceLabel =
    confidence >= 0.72 ? "high" : confidence >= 0.5 ? "medium" : "low";

  const dataQualityHints = missing.slice(0, 6);

  const redundancySteps: string[] = [
    "Do an in-person viewing (or live video tour) before sending any money.",
    "Ask for the landlord/agent’s full name and verify ownership (land registry / property manager website).",
    "Reverse-image search 2–3 listing photos to spot duplicates across cities.",
    "Compare rent vs nearby similar units (same beds/baths) to detect bait pricing.",
    "Never pay via e-Transfer, crypto, gift cards, or cash before the lease is signed and keys are verified.",
    "If you have a lease draft, run it through the Lease Simplifier to flag predatory clauses.",
  ];

  // Extra steps when confidence is low.
  if (confidenceLabel === "low") {
    redundancySteps.unshift(
      "Result confidence is low: add missing details (URL, photos, full description) and re-check."
    );
  }

  return { confidence, confidenceLabel, dataQualityHints, redundancySteps };
}
