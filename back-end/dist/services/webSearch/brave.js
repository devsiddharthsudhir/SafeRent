import { cacheGet, cacheSet, getDailyCount, incDailyCount } from "../../lib/cache.js";
const BRAVE_TTL_MS = 6 * 60 * 60 * 1000; // 6h
function enabled() {
    return Boolean(process.env.BRAVE_SEARCH_API_KEY);
}
export async function braveSearch(q, opts) {
    const token = process.env.BRAVE_SEARCH_API_KEY || "";
    if (!token) {
        return { hits: [], mode: "skipped", reason: "BRAVE_SEARCH_API_KEY missing", ms: 0 };
    }
    const dailyLimit = Number(process.env.BRAVE_DAILY_LIMIT || "400");
    if (getDailyCount("brave") >= dailyLimit) {
        return { hits: [], mode: "skipped", reason: "Brave daily limit reached", ms: 0 };
    }
    const country = (opts?.country || "CA").toUpperCase();
    const lang = (opts?.lang || "en").toLowerCase();
    const count = Math.max(3, Math.min(opts?.count || 8, 10));
    const cacheKey = `brave:v1:${country}:${lang}:${count}:${q}`;
    const cached = cacheGet(cacheKey);
    if (cached) {
        return { hits: (cached.hits || []), mode: "cache", ms: 0 };
    }
    const t0 = Date.now();
    const controller = new AbortController();
    const timeoutMs = Number(opts?.timeoutMs || process.env.WEB_VERIFY_SEARCH_TIMEOUT_MS || "2000");
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const u = new URL("https://api.search.brave.com/res/v1/web/search");
        u.searchParams.set("q", q);
        u.searchParams.set("country", country);
        u.searchParams.set("search_lang", lang);
        u.searchParams.set("count", String(count));
        const r = await fetch(u.toString(), {
            headers: {
                "X-Subscription-Token": token,
                "Accept": "application/json",
            },
            signal: controller.signal,
        });
        const ms = Date.now() - t0;
        if (!r.ok) {
            return { hits: [], mode: "skipped", reason: `Brave HTTP ${r.status}`, ms };
        }
        incDailyCount("brave", 1);
        const j = (await r.json());
        const results = Array.isArray(j?.web?.results) ? j.web.results : [];
        const hits = results
            .map((x) => ({
            title: String(x?.title || "").trim(),
            url: String(x?.url || "").trim(),
            snippet: String(x?.description || x?.snippet || "").trim(),
        }))
            .filter((h) => h.url && (h.url.startsWith("http://") || h.url.startsWith("https://")));
        cacheSet(cacheKey, { hits }, BRAVE_TTL_MS);
        return { hits, mode: "live", ms };
    }
    catch (e) {
        const ms = Date.now() - t0;
        return { hits: [], mode: "skipped", reason: e?.message || "Brave fetch failed", ms };
    }
    finally {
        clearTimeout(timer);
    }
}
export function braveEnabled() {
    return enabled();
}
