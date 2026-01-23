import crypto from "node:crypto";

import { cacheGet, cacheSet } from "../../lib/cache.js";

export type GeoPoint = { lat: number; lng: number };

function sha1(s: string) {
  return crypto.createHash("sha1").update(s).digest("hex").slice(0, 16);
}

function clean(v: unknown) {
  return String(v || "").replace(/\s+/g, " ").trim();
}

function isValidLatLng(lat: unknown, lng: unknown) {
  const la = Number(lat);
  const lo = Number(lng);
  if (!Number.isFinite(la) || !Number.isFinite(lo)) return false;
  if (Math.abs(la) > 90 || Math.abs(lo) > 180) return false;
  return true;
}

/**
 * Free (but rate-limited) geocoding via Nominatim (OpenStreetMap).
 *
 * Production note:
 * - Keep concurrency low.
 * - Cache aggressively.
 * - Provide a clear User-Agent (override via NOMINATIM_USER_AGENT).
 */
export async function geocodeCanada(query: string): Promise<GeoPoint | null> {
  const q = clean(query);
  if (q.length < 3) return null;

  const key = `geo:nominatim:ca:v1:${sha1(q)}`;
  const cached = cacheGet<any>(key);
  if (cached) {
    if (cached?.miss) return null;
    if (isValidLatLng(cached?.lat, cached?.lng)) {
      return { lat: Number(cached.lat), lng: Number(cached.lng) };
    }
  }

  const url =
    "https://nominatim.openstreetmap.org/search?format=json&limit=1&addressdetails=0&countrycodes=ca&q=" +
    encodeURIComponent(q);

  const ua =
    process.env.NOMINATIM_USER_AGENT ||
    "SafeRent-RentPulse/1.6 (set NOMINATIM_USER_AGENT)";

  const resp = await fetch(url, {
    headers: {
      "User-Agent": ua,
      Accept: "application/json",
    },
  });

  if (!resp.ok) {
    // short negative cache to avoid tight loops on transient failures
    cacheSet(key, { miss: true }, 15 * 60 * 1000);
    return null;
  }

  const data = (await resp.json()) as any;
  if (!Array.isArray(data) || data.length === 0) {
    cacheSet(key, { miss: true }, 6 * 60 * 60 * 1000);
    return null;
  }

  const first = data[0] || {};
  const lat = Number(first.lat);
  const lng = Number(first.lon);

  if (!isValidLatLng(lat, lng)) {
    cacheSet(key, { miss: true }, 6 * 60 * 60 * 1000);
    return null;
  }

  const out = { lat, lng };
  cacheSet(key, out, 14 * 24 * 60 * 60 * 1000);
  return out;
}
