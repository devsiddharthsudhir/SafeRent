import { load } from "cheerio";
import Jimp from "jimp";

import { cacheGet, cacheSet, getDailyCount, incDailyCount } from "../../lib/cache.js";
import type { CrosspostMatch, Listing, Signal } from "../../lib/scoring/types.js";
import { loadWeights } from "../../lib/weights.js";
import { extractListingFromUrl, isSafePublicUrl } from "../extractListing.js";
import { addressSimilarity, hashSimilarity, titleSimilarity } from "./similarity.js";

type ProviderName = "serper" | "brave" | "duckduckgo";


export type CrosspostResult = {
  providerDiagnostics: {
    provider: ProviderName;
    mode: "live" | "cache" | "skipped";
    ms?: number;
    reason?: string;
  }[];
  matches: CrosspostMatch[];
  signals: Signal[];
};

const MAX_HITS_PER_PROVIDER = 8;

const SEARCH_TIMEOUT_MS = Number(process.env.WEB_VERIFY_SEARCH_TIMEOUT_MS || 2000);
const DETAIL_FETCH_MAX = Number(process.env.CROSSPOST_DETAIL_FETCH_MAX || 4);
const DETAIL_FETCH_TTL_MS = Number(process.env.CROSSPOST_DETAIL_FETCH_TTL_MS || 6 * 60 * 60 * 1000);
const IMAGE_HASH_TTL_MS = Number(process.env.CROSSPOST_IMAGE_HASH_TTL_MS || 24 * 60 * 60 * 1000);

function envCsv(key: string): string[] {
  const v = String(process.env[key] || "").trim();
  if (!v) return [];
  return v
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function hostnameOf(u: string) {
  try {
    return new URL(u).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function allowedToFetchDetail(url: string, baseHost: string): boolean {
  if (!isSafePublicUrl(url)) return false;
  const host = hostnameOf(url);
  if (!host) return false;

  const allow = envCsv("CROSSPOST_FETCH_ALLOWLIST");

  // Safe default: allow only the same host unless an allowlist is provided.
  if (!allow.length) return host === baseHost;

  return allow.some((d) => host === d || host.endsWith(`.${d}`));
}

async function timed<T>(fn: () => Promise<T>): Promise<{ ms: number; v: T }> {
  const t0 = Date.now();
  const v = await fn();
  return { ms: Date.now() - t0, v };
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(t);
  }
}

async function safeFetchJson(url: string, init: RequestInit, timeoutMs: number) {
  const r = await fetchWithTimeout(url, init, timeoutMs);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

async function safeFetchText(url: string, init: RequestInit, timeoutMs: number) {
  const r = await fetchWithTimeout(url, init, timeoutMs);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.text();
}

function hasSerperKey() {
  return Boolean(String(process.env.SERPER_API_KEY || "").trim());
}

function hasBraveKey() {
  return Boolean(String(process.env.BRAVE_API_KEY || process.env.BRAVE_SEARCH_API_KEY || "").trim());
}

function ddgEnabled() {
  return String(process.env.WEB_VERIFY_DDG_ENABLED || "true").toLowerCase() !== "false";
}

function dailyLimitFor(provider: ProviderName) {
  const v = (key: string, def: number) => {
    const n = Number(process.env[key] || "");
    return Number.isFinite(n) && n > 0 ? n : def;
  };
  if (provider === "serper") return v("SERPER_DAILY_LIMIT", 400);
  if (provider === "brave") return v("BRAVE_DAILY_LIMIT", 400);
  return v("DDG_DAILY_LIMIT", 300);
}

// Cache helpers
async function cached<T>(key: string, ttlMs: number, loadFn: () => Promise<T>): Promise<{ v: T; mode: "cache" | "live"; ms: number }> {
  const cachedVal = cacheGet<T>(key);
  if (cachedVal) return { v: cachedVal, mode: "cache", ms: 0 };
  const { ms, v } = await timed(loadFn);
  cacheSet(key, v, ttlMs);
  return { v, mode: "live", ms };
}

async function searchSerper(query: string): Promise<{ hits: any[]; ms: number; mode: "live" | "cache" }> {
  const key = String(process.env.SERPER_API_KEY || "").trim();
  if (!key) throw new Error("missing SERPER_API_KEY");

  const cacheKey = `serper:${query}`;
  const { v, ms, mode } = await cached<any[]>(cacheKey, 60 * 60 * 1000, async () => {
    const body = JSON.stringify({
      q: query,
      num: MAX_HITS_PER_PROVIDER,
      gl: "ca",
      hl: "en",
    });

    const data = await safeFetchJson(
      "https://google.serper.dev/search",
      {
        method: "POST",
        headers: {
          "X-API-KEY": key,
          "Content-Type": "application/json",
        },
        body,
      },
      SEARCH_TIMEOUT_MS
    );

    return Array.isArray(data?.organic) ? data.organic : [];
  });

  return { hits: v, ms, mode };
}

async function searchBrave(query: string): Promise<{ hits: any[]; ms: number; mode: "live" | "cache" }> {
  const key = String(process.env.BRAVE_API_KEY || process.env.BRAVE_SEARCH_API_KEY || "").trim();
  if (!key) throw new Error("missing BRAVE_API_KEY (or BRAVE_SEARCH_API_KEY)");

  const cacheKey = `brave:${query}`;
  const { v, ms, mode } = await cached<any[]>(cacheKey, 60 * 60 * 1000, async () => {
    const url = new URL("https://api.search.brave.com/res/v1/web/search");
    url.searchParams.set("q", query);
    url.searchParams.set("count", String(MAX_HITS_PER_PROVIDER));

    const data = await safeFetchJson(
      url.toString(),
      {
        method: "GET",
        headers: {
          "X-Subscription-Token": key,
          Accept: "application/json",
        },
      },
      SEARCH_TIMEOUT_MS
    );

    return Array.isArray(data?.web?.results) ? data.web.results : [];
  });

  return { hits: v, ms, mode };
}

function resolveDuckLink(href: string): string {
  const raw = String(href || "").trim();
  if (!raw) return "";

  // Direct
  if (raw.startsWith("http://") || raw.startsWith("https://")) {
    try {
      const u = new URL(raw);
      // DuckDuckGo redirect wrapper
      if (u.hostname.endsWith("duckduckgo.com") && u.pathname.startsWith("/l/")) {
        const uddg = u.searchParams.get("uddg");
        if (uddg) return decodeURIComponent(uddg);
      }
    } catch {}
    return raw;
  }

  // Relative wrapper like /l/?uddg=...
  if (raw.startsWith("/")) {
    try {
      const u = new URL(`https://duckduckgo.com${raw}`);
      const uddg = u.searchParams.get("uddg");
      if (uddg) return decodeURIComponent(uddg);
      return u.toString();
    } catch {
      return "";
    }
  }

  return "";
}

async function searchDuckDuckGo(query: string): Promise<{ hits: any[]; ms: number; mode: "live" | "cache" }> {
  const cacheKey = `ddg:${query}`;

  const { v, ms, mode } = await cached<any[]>(cacheKey, 60 * 60 * 1000, async () => {
    // Use the "html" endpoint (more parseable)
    const url = new URL("https://html.duckduckgo.com/html/");
    url.searchParams.set("q", query);

    const html = await safeFetchText(
      url.toString(),
      {
        method: "GET",
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122 Safari/537.36",
          Accept: "text/html",
        },
      },
      SEARCH_TIMEOUT_MS
    );

    const $ = load(html);
    const hits: any[] = [];

    $(".result").each((_, el) => {
      if (hits.length >= MAX_HITS_PER_PROVIDER) return;

      const a = $(el).find("a.result__a").first();
      const href = resolveDuckLink(String(a.attr("href") || ""));
      const title = String(a.text() || "").trim();
      const snip = String($(el).find(".result__snippet").first().text() || "").trim();

      if (!href || !title) return;
      hits.push({ url: href, title, snippet: snip });
    });

    // Fallback selectors if DDG tweaks markup
    if (!hits.length) {
      $("a.result__a").each((_, el) => {
        if (hits.length >= MAX_HITS_PER_PROVIDER) return;
        const href = resolveDuckLink(String($(el).attr("href") || ""));
        const title = String($(el).text() || "").trim();
        if (!href || !title) return;
        hits.push({ url: href, title, snippet: "" });
      });
    }

    return hits;
  });

  return { hits: v, ms, mode };
}

function buildQuery(listing: Listing): string {
  const bits: string[] = [];
  const title = (listing.title || "").trim();
  const city = (listing.city || "").trim();
  const addr = String((listing as any).addressHint || (listing as any).address_hint || "").trim();

  if (title) bits.push(`"${title.slice(0, 80)}"`);
  if (addr) bits.push(`"${addr.slice(0, 60)}"`);
  if ((listing as any).price) bits.push(String((listing as any).price));
  if (city) bits.push(city);
  bits.push("rent");

  return bits.join(" ");
}

async function cachedListingExtract(url: string): Promise<ReturnType<typeof extractListingFromUrl> | null> {
  const k = `listing:${url}`;
  const cachedVal = cacheGet<any>(k);
  if (cachedVal) return cachedVal;
  try {
    const v = await extractListingFromUrl(url, { timeoutMs: 8000, maxBytes: 2_000_000 });
    cacheSet(k, v, DETAIL_FETCH_TTL_MS);
    return v;
  } catch {
    return null;
  }
}

function aHash(img: Jimp, size = 8): string {
  const small = img.clone().resize(size, size).greyscale();
  const pixels: number[] = [];

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      pixels.push(Jimp.intToRGBA(small.getPixelColor(x, y)).r);
    }
  }

  const avg = pixels.reduce((a, b) => a + b, 0) / Math.max(1, pixels.length);
  return pixels.map((v) => (v >= avg ? "1" : "0")).join("");
}

async function cachedImageHash(url: string): Promise<string | null> {
  const k = `imgHash:${url}`;
  const cachedVal = cacheGet<string>(k);
  if (cachedVal) return cachedVal;

  try {
    const r = await fetchWithTimeout(
      url,
      {
        method: "GET",
        headers: { Accept: "image/avif,image/webp,image/apng,image/*,*/*" },
      },
      6000
    );
    if (!r.ok) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    const img = await Jimp.read(buf);
    const hash = aHash(img, 8);
    cacheSet(k, hash, IMAGE_HASH_TTL_MS);
    return hash;
  } catch {
    return null;
  }
}

function computeMatchScore(
  listing: Listing,
  cand: { title?: string; addressHint?: string },
  baseHashes: string[],
  candHash?: string | null
) {
  const tSim = titleSimilarity(listing.title || "", cand.title || "");
  const lAddr = String((listing as any).addressHint || (listing as any).address_hint || "");
  const aSim = addressSimilarity(lAddr, cand.addressHint || "");

  let iSim = 0;
  if (baseHashes.length && candHash) {
    let best = 0;
    for (const h of baseHashes) best = Math.max(best, hashSimilarity(h, candHash));
    iSim = best;
  }

  // Address should dominate when available; otherwise title dominates.
  const score = Math.max(0, Math.min(1, 0.5 * tSim + 0.4 * aSim + 0.1 * iSim));
  return { score, tSim, aSim, iSim };
}

function parsePrice(val: any): number {
  const t = String(val || "").replace(/[\s,\u00a0]/g, "");
  const m = t.match(/(\d{2,6})/);
  if (!m) return 0;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : 0;
}

function canCallProvider(provider: ProviderName) {
  const used = getDailyCount(`calls:${provider}`);
  return used < dailyLimitFor(provider);
}

function markCall(provider: ProviderName) {
  incDailyCount(`calls:${provider}`, 1);
}

export async function findCrossposts(
  listing: Listing,
  opts?: { imageHashes?: string[]; mode?: "serper" | "both" }
): Promise<CrosspostResult> {
  const weights = loadWeights();

  const mode = opts?.mode || "serper";
  const baseHost = hostnameOf(String((listing as any).url || (listing as any).source_url || ""));
  const baseHashes = Array.isArray(opts?.imageHashes) ? opts!.imageHashes! : [];
  const query = buildQuery(listing);

  const providerDiagnostics: CrosspostResult["providerDiagnostics"] = [];
  const rawMatches: CrosspostMatch[] = [];

  const shouldTrySerper = (mode === "serper" || mode === "both") && hasSerperKey();
  const shouldTryBrave = mode === "both" && hasBraveKey();

  // Free fallback (parseable HTML). Used when paid providers are not configured.
  const shouldTryDdgFallback =
    ddgEnabled() &&
    (
      (!shouldTrySerper && !shouldTryBrave) ||
      (mode === "both" && !(shouldTrySerper && shouldTryBrave))
    );

  const tasks: Array<Promise<void>> = [];

  if (shouldTrySerper) {
    tasks.push(
      (async () => {
        if (!canCallProvider("serper")) {
          providerDiagnostics.push({ provider: "serper", mode: "skipped", reason: "daily call cap" });
          return;
        }
        try {
          markCall("serper");
          const { hits, ms, mode: m } = await searchSerper(query);
          providerDiagnostics.push({ provider: "serper", mode: m, ms });

          for (const h of hits.slice(0, MAX_HITS_PER_PROVIDER)) {
            const url = String(h?.link || "");
            if (!url || !isSafePublicUrl(url)) continue;
            rawMatches.push({
              url,
              provider: "serper",
              title: String(h?.title || ""),
              snippet: String(h?.snippet || ""),
              price: parsePrice(h?.snippet || ""),
              currency: "CAD",
              similarity: 0,
            });
          }
        } catch (e: any) {
          providerDiagnostics.push({
            provider: "serper",
            mode: "skipped",
            reason: e?.message || "serper failed",
          });
        }
      })()
    );
  } else if (mode === "serper" || mode === "both") {
    providerDiagnostics.push({ provider: "serper", mode: "skipped", reason: "SERPER_API_KEY not set" });
  }

  if (shouldTryBrave) {
    tasks.push(
      (async () => {
        if (!canCallProvider("brave")) {
          providerDiagnostics.push({ provider: "brave", mode: "skipped", reason: "daily call cap" });
          return;
        }
        try {
          markCall("brave");
          const { hits, ms, mode: m } = await searchBrave(query);
          providerDiagnostics.push({ provider: "brave", mode: m, ms });

          for (const h of hits.slice(0, MAX_HITS_PER_PROVIDER)) {
            const url = String(h?.url || "");
            if (!url || !isSafePublicUrl(url)) continue;
            rawMatches.push({
              url,
              provider: "brave",
              title: String(h?.title || ""),
              snippet: String(h?.description || ""),
              price: parsePrice(h?.description || ""),
              currency: "CAD",
              similarity: 0,
            });
          }
        } catch (e: any) {
          providerDiagnostics.push({ provider: "brave", mode: "skipped", reason: e?.message || "brave failed" });
        }
      })()
    );
  } else if (mode === "both") {
    providerDiagnostics.push({ provider: "brave", mode: "skipped", reason: "BRAVE_SEARCH_API_KEY not set" });
  }

  if (shouldTryDdgFallback) {
    tasks.push(
      (async () => {
        if (!canCallProvider("duckduckgo")) {
          providerDiagnostics.push({ provider: "duckduckgo", mode: "skipped", reason: "daily call cap" });
          return;
        }
        try {
          markCall("duckduckgo");
          const { hits, ms, mode: m } = await searchDuckDuckGo(query);
          providerDiagnostics.push({ provider: "duckduckgo", mode: m, ms });

          for (const h of hits.slice(0, MAX_HITS_PER_PROVIDER)) {
            const url = String(h?.url || "");
            if (!url || !isSafePublicUrl(url)) continue;
            rawMatches.push({
              url,
              provider: "duckduckgo",
              title: String(h?.title || ""),
              snippet: String(h?.snippet || ""),
              price: parsePrice(h?.snippet || ""),
              currency: "CAD",
              similarity: 0,
            });
          }
        } catch (e: any) {
          providerDiagnostics.push({
            provider: "duckduckgo",
            mode: "skipped",
            reason: e?.message || "duckduckgo failed",
          });
        }
      })()
    );
  } else if (ddgEnabled()) {
    // Only note it if enabled but not used
    providerDiagnostics.push({ provider: "duckduckgo", mode: "skipped", reason: "paid providers configured" });
  }

  await Promise.all(tasks);

  // If all providers failed / returned nothing, make one last effort with DDG.
  if (ddgEnabled() && rawMatches.length === 0 && providerDiagnostics.every((d) => d.provider !== "duckduckgo" || d.mode === "skipped")) {
    if (canCallProvider("duckduckgo")) {
      try {
        markCall("duckduckgo");
        const { hits, ms, mode: m } = await searchDuckDuckGo(query);
        providerDiagnostics.push({ provider: "duckduckgo", mode: m, ms, reason: "fallback_no_results" });
        for (const h of hits.slice(0, MAX_HITS_PER_PROVIDER)) {
          const url = String(h?.url || "");
          if (!url || !isSafePublicUrl(url)) continue;
          rawMatches.push({
            url,
            provider: "duckduckgo",
            title: String(h?.title || ""),
            snippet: String(h?.snippet || ""),
            price: parsePrice(h?.snippet || ""),
            currency: "CAD",
            similarity: 0,
          });
        }
      } catch (e: any) {
        providerDiagnostics.push({ provider: "duckduckgo", mode: "skipped", reason: e?.message || "duckduckgo failed" });
      }
    } else {
      providerDiagnostics.push({ provider: "duckduckgo", mode: "skipped", reason: "daily call cap" });
    }
  }

  // De-duplicate URLs
  const seen = new Set<string>();
  const uniq = rawMatches.filter((m) => {
    const u = m.url;
    if (seen.has(u)) return false;
    seen.add(u);
    return true;
  });

  // Strengthen matching via optional detail fetch (allowlist + budget).
  const matches: CrosspostMatch[] = [];
  let detailBudget = DETAIL_FETCH_MAX;

  for (const m of uniq) {
    // Quick similarity using title only (no network)
    let best = computeMatchScore(listing, { title: m.title }, baseHashes, null);

    if (detailBudget > 0 && allowedToFetchDetail(m.url, baseHost)) {
      detailBudget--;
      const detail = await cachedListingExtract(m.url);
      if (detail) {
        const firstImg = (detail as any)?.image_urls?.[0];
        const candHash = firstImg ? await cachedImageHash(firstImg) : null;

        best = computeMatchScore(
          listing,
          { title: (detail as any).title || m.title, addressHint: (detail as any).addressHint },
          baseHashes,
          candHash
        );

        m.title = (detail as any).title || m.title;
        m.price = (detail as any).price || m.price;
        m.currency = (detail as any).currency || m.currency;
      }
    }

    m.similarity = Number(best.score.toFixed(3));

    // Keep medium+ confidence matches
    if (m.similarity >= 0.35) matches.push(m);
  }

  const signals: Signal[] = buildCrosspostSignals(listing, matches, (weights.signals || {}) as Record<string, number>);

  return {
    providerDiagnostics,
    matches: matches.sort((a, b) => b.similarity - a.similarity).slice(0, 8),
    signals,
  };
}

function buildCrosspostSignals(listing: Listing, matches: CrosspostMatch[], weightMap: Record<string, number>): Signal[] {
  const signals: Signal[] = [];
  if (!matches.length) return signals;

  // Only consider high-ish similarity for price comparisons
  const strong = matches.filter((m) => m.similarity >= 0.55);
  const prices = strong.map((m) => m.price || 0).filter((n) => n > 0);

  // If we saw many strong matches across different hosts, it's a credibility boost.
  const uniqueHosts = new Set(strong.map((m) => hostnameOf(m.url)).filter(Boolean));
  if (uniqueHosts.size >= 2) {
    const id = "web_crosspost_found";
    const weight = weightMap[id] ?? 0;
    const value = Math.min(1, uniqueHosts.size / 4);

    signals.push({
      id,
      category: "Web",
      label: "Listing appears cross-posted on other sites",
      why_it_matters:
        "Legitimate listings are often cross-posted. We only count matches when title/location signals strongly align.",
      evidence: `Found ${strong.length} high-similarity matches across ${uniqueHosts.size} different sites`,
      value,
      weight,
      contribution: weight * value,
      severity: "low",
    });
  }

  const basePrice = Number((listing as any).price || 0);
  if (basePrice > 0 && prices.length) {
    const min = Math.min(...prices);
    const max = Math.max(...prices);

    // Cheaper elsewhere (possible bait)
    if (min && min < basePrice * 0.92) {
      const id = "web_crosspost_lower_price";
      const weight = weightMap[id] ?? 0;
      const value = Math.min(1, (basePrice - min) / Math.max(1, basePrice));

      signals.push({
        id,
        category: "Web",
        label: "Same unit looks cheaper on another site",
        why_it_matters:
          "Large price mismatches can indicate bait-and-switch, duplicate reposts, or a scammer copying a real listing.",
        evidence: `This listing: ${basePrice} vs lowest matched: ${min} (max seen: ${max || "—"})`,
        value,
        weight,
        contribution: weight * value,
        severity: "medium",
      });
    }

    // Market range from crossposts (proxy for nominal)
    const sorted = prices.slice().sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)] || 0;

    if (median) {
      const low = median * 0.85;
      const high = median * 1.25;

      if (basePrice < low) {
        const id = "web_market_price_low";
        const weight = weightMap[id] ?? 0;
        const value = Math.min(1, (low - basePrice) / Math.max(1, low));

        signals.push({
          id,
          category: "Web",
          label: "Price is notably below similar cross-posts",
          why_it_matters: "Scams often use unusually low rent to trigger urgency.",
          evidence: `Cross-post median ~${median}, expected range ~${Math.round(low)}-${Math.round(high)}`,
          value,
          weight,
          contribution: weight * value,
          severity: "high",
        });
      } else if (basePrice > high) {
        const id = "web_market_price_high";
        const weight = weightMap[id] ?? 0;
        const value = Math.min(1, (basePrice - high) / Math.max(1, high));

        signals.push({
          id,
          category: "Web",
          label: "Price is above similar cross-posts",
          why_it_matters: "Above-market pricing can indicate predatory terms or hidden fees.",
          evidence: `Cross-post median ~${median}, expected range ~${Math.round(low)}-${Math.round(high)}`,
          value,
          weight,
          contribution: weight * value,
          severity: "medium",
        });
      }
    }
  }

  return signals;
}
