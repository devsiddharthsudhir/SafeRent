import express, { type Request, type Response } from "express";
import crypto from "node:crypto";

import { readAnalysis } from "../lib/analysisStore.js";
import { cacheGet, cacheSet } from "../lib/cache.js";
import { extractListingFromUrl, isSafePublicUrl } from "../services/extractListing.js";
import { geocodeCanada } from "../services/geocode/nominatim.js";
import { serperSearch } from "../services/webSearch/serper.js";

export const similarRouter = express.Router();

type SimilarReqBody = { analysisId: string; limit?: number };

function sha1(s: string) {
  return crypto.createHash("sha1").update(s).digest("hex").slice(0, 16);
}

function clean(v: unknown) {
  return String(v || "").replace(/\s+/g, " ").trim();
}

function num(v: unknown) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function buildQueries(listing: any) {
  const city = clean(listing?.city);
  const neigh = clean(listing?.neighborhood);
  const addr = clean(listing?.address_hint || listing?.addressHint);
  const beds = num(listing?.bedrooms);
  const price = num(listing?.price);

  const title = clean(listing?.title).toLowerCase();
  const bedsPhrase = beds > 0 ? `${beds} bedroom` : title.includes("studio") ? "studio" : "apartment";

  const priceHint = price > 0 ? String(Math.round(price / 50) * 50) : "";
  const addrShort = addr ? addr.split(",")[0].slice(0, 40) : "";

  const q1 = [bedsPhrase, "rent", neigh, city, "Canada", priceHint].filter(Boolean).join(" ");
  const q2 = [bedsPhrase, "rent", city, addrShort, "Canada", priceHint].filter(Boolean).join(" ");

  return Array.from(new Set([q1, q2].map(clean))).filter(Boolean);
}


function buildGeoQuery(item: any, base: any) {
  const addr = clean(item?.address_hint || item?.addressHint);
  const neigh = clean(item?.neighborhood);
  const city = clean(item?.city || base?.city);
  const prov = clean(item?.province || base?.province || base?.state || "");

  const parts: string[] = [];
  if (addr) parts.push(addr);
  else if (neigh) parts.push(neigh);
  if (city) parts.push(city);
  if (prov) parts.push(prov);
  parts.push("Canada");

  const q = clean(parts.filter(Boolean).join(", "));
  return q.length >= 3 ? q : "";
}

async function mapConcurrency<T, R>(items: T[], limit: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;

  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (true) {
      const idx = i++;
      if (idx >= items.length) break;
      out[idx] = await fn(items[idx]);
    }
  });

  await Promise.all(workers);
  return out;
}

similarRouter.post("/similar", async (req: Request, res: Response) => {
  try {
    const body = (req.body || {}) as SimilarReqBody;
    const analysisId = clean(body.analysisId);
    const limit = clamp(num(body.limit ?? 24) || 24, 6, 40);

    if (!analysisId) return res.status(400).json({ error: "analysisId required" });

    const analysis = readAnalysis<any>(analysisId);
    if (!analysis?.listing) return res.status(404).json({ error: "analysis not found" });

    if (!process.env.SERPER_API_KEY) {
      return res.json({ provider: "serper", mode: "skipped", reason: "SERPER_API_KEY missing", items: [] });
    }

    const listing = analysis.listing as any;
    const baseUrl = clean(listing?.url || listing?.source_url || "");

    const queries = buildQueries(listing);
    const cacheKey = `similar:v1:${analysisId}:${sha1(queries.join("|"))}:${limit}`;
    const cached = cacheGet<any>(cacheKey);
    if (cached?.items) return res.json({ ...cached, mode: "cache" });

    const searchResults = await Promise.all(
      queries.slice(0, 2).map((q) => serperSearch(q, { gl: "ca", hl: "en", num: 10 }))
    );

    const seen = new Set<string>();
    const hits: Array<{ title: string; url: string; snippet: string }> = [];

    for (const sr of searchResults) {
      for (const h of sr.hits || []) {
        const url = clean(h?.url);
        if (!url) continue;
        if (baseUrl && url === baseUrl) continue;
        if (!isSafePublicUrl(url)) continue;

        const key = url.replace(/[#?].*$/, "");
        if (seen.has(key)) continue;
        seen.add(key);

        hits.push({ title: clean(h?.title), url, snippet: clean(h?.snippet) });
        if (hits.length >= limit) break;
      }
      if (hits.length >= limit) break;
    }

    const concurrency = clamp(num(process.env.SIMILAR_EXTRACT_CONCURRENCY || 4), 1, 8);
    const timeoutMs = clamp(num(process.env.SIMILAR_EXTRACT_TIMEOUT_MS || 6500), 1500, 12000);
    const maxBytes = clamp(num(process.env.SIMILAR_EXTRACT_MAX_BYTES || 1_500_000), 200_000, 3_000_000);

    let items = await mapConcurrency(hits, concurrency, async (hit) => {
      const oneKey = `similar:extract:v1:${sha1(hit.url)}`;
      const cachedOne = cacheGet<any>(oneKey);
      if (cachedOne) return cachedOne;

      try {
        const ex = await extractListingFromUrl(hit.url, { timeoutMs, maxBytes });

        const enriched = {
          id: `web:${sha1(hit.url)}`,
          source_url: hit.url,
          title: (ex as any).title || hit.title || "Listing",
          description: (ex as any).description || hit.snippet || "",
          price: (ex as any).price || 0,
          currency: (ex as any).currency || "CAD",
          bedrooms: (ex as any).bedrooms,
          bathrooms: (ex as any).bathrooms,
          city: (ex as any).city || listing?.city || "",
          neighborhood: (ex as any).neighborhood || listing?.neighborhood || "",
          address_hint: (ex as any).addressHint || "",
          image_urls: Array.isArray((ex as any).image_urls) ? (ex as any).image_urls : [],
        };

        cacheSet(oneKey, enriched, 24 * 60 * 60 * 1000);
        return enriched;
      } catch {
        const fallback = {
          id: `web:${sha1(hit.url)}`,
          source_url: hit.url,
          title: hit.title || "Listing",
          description: hit.snippet || "",
          price: 0,
          currency: "CAD",
          city: listing?.city || "",
          neighborhood: listing?.neighborhood || "",
          address_hint: "",
          image_urls: [] as string[],
        };
        cacheSet(oneKey, fallback, 2 * 60 * 60 * 1000);
        return fallback;
      }
    });

    const geocodeOn = !["0", "false", "off", "no"].includes(
      String(process.env.SIMILAR_GEOCODE || "1").toLowerCase()
    );

    if (geocodeOn) {
      const geoConcurrency = clamp(num(process.env.SIMILAR_GEOCODE_CONCURRENCY || 2), 1, 4);

      items = await mapConcurrency(items, geoConcurrency, async (it: any) => {
        try {
          // Avoid repeated lookups if coords are already present.
          if (
            Number.isFinite(Number(it?.lat)) &&
            Number.isFinite(Number(it?.lng)) &&
            Math.abs(Number(it.lat)) <= 90 &&
            Math.abs(Number(it.lng)) <= 180
          ) {
            return it;
          }

          const q = buildGeoQuery(it, listing);
          if (!q) return it;

          const pt = await geocodeCanada(q);
          if (!pt) return it;

          return { ...it, lat: pt.lat, lng: pt.lng };
        } catch {
          return it;
        }
      });
    }


    const out = {
      provider: "serper",
      mode: searchResults.some((x) => x.mode === "live") ? "live" : "cache",
      items,
    };

    cacheSet(cacheKey, out, 15 * 60 * 1000);
    return res.json(out);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String((e as any)?.message || e);
    return res.status(500).json({ error: "similar failed", detail: msg });
  }
});
