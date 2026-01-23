import { cacheGet, cacheSet, getDailyCount, incDailyCount } from "../../lib/cache.js";
const SERPER_TTL_MS = 6 * 60 * 60 * 1000; // 6h
function enabled() {
    return Boolean(process.env.SERPER_API_KEY);
}
export async function serperSearch(q, opts) {
    const apiKey = process.env.SERPER_API_KEY || "";
    if (!apiKey)
        return { hits: [], mode: "skipped", reason: "SERPER_API_KEY missing", ms: 0 };
    const dailyLimit = Number(process.env.SERPER_DAILY_LIMIT || "400");
    if (getDailyCount("serper") >= dailyLimit) {
        return { hits: [], mode: "skipped", reason: "Serper daily limit reached", ms: 0 };
    }
    const gl = (opts?.gl || "ca").toLowerCase();
    const hl = (opts?.hl || "en").toLowerCase();
    const num = Math.max(3, Math.min(opts?.num || 8, 10));
    const cacheKey = `serper:v1:${gl}:${hl}:${num}:${q}`;
    const cached = cacheGet(cacheKey);
    if (cached) {
        return {
            hits: (cached.hits || []),
            mode: "cache",
            ms: 0,
        };
    }
    const t0 = Date.now();
    const controller = new AbortController();
    const timeoutMs = Number(opts?.timeoutMs || process.env.WEB_VERIFY_SEARCH_TIMEOUT_MS || "2000");
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const r = await fetch("https://google.serper.dev/search", {
            method: "POST",
            headers: {
                "X-API-KEY": apiKey,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ q, gl, hl, num }),
            signal: controller.signal,
        });
        const ms = Date.now() - t0;
        if (!r.ok) {
            return { hits: [], mode: "skipped", reason: `Serper HTTP ${r.status}`, ms };
        }
        incDailyCount("serper", 1);
        const j = (await r.json());
        const org = Array.isArray(j?.organic) ? j.organic : [];
        const hits = org
            .map((x) => ({
            title: String(x?.title || "").trim(),
            url: String(x?.link || "").trim(),
            snippet: String(x?.snippet || "").trim(),
        }))
            .filter((h) => h.url && (h.url.startsWith("http://") || h.url.startsWith("https://")));
        cacheSet(cacheKey, { hits }, SERPER_TTL_MS);
        return { hits, mode: "live", ms };
    }
    catch (e) {
        const ms = Date.now() - t0;
        return { hits: [], mode: "skipped", reason: e?.message || "Serper fetch failed", ms };
    }
    finally {
        clearTimeout(timer);
    }
}
export function serperEnabled() {
    return enabled();
}
