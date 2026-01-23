import { load } from "cheerio";
const TIMEOUT_MS = 8000;
const MAX_BYTES = 2_000_000; // 2 MB
export function isSafePublicUrl(raw) {
    try {
        const u = new URL(raw);
        if (!(u.protocol === "http:" || u.protocol === "https:"))
            return false;
        const host = u.hostname.toLowerCase();
        if (host === "localhost" ||
            host === "127.0.0.1" ||
            host === "0.0.0.0" ||
            host === "::1" ||
            host.endsWith(".local") ||
            host.endsWith(".internal")) {
            return false;
        }
        const isIp = /^[0-9.]+$/.test(host);
        if (isIp) {
            if (host.startsWith("10."))
                return false;
            if (host.startsWith("192.168."))
                return false;
            if (host.startsWith("169.254."))
                return false;
            const m = host.match(/^172\.(\d+)\./);
            if (m) {
                const second = Number(m[1]);
                if (second >= 16 && second <= 31)
                    return false;
            }
        }
        return true;
    }
    catch {
        return false;
    }
}
function pickFirst(...vals) {
    for (const v of vals) {
        const t = (v || "").trim();
        if (t)
            return t;
    }
    return "";
}
function cleanText(s) {
    return s.replace(/\s+/g, " ").trim();
}
function parsePrice(text) {
    const t = String(text || "").replace(/,/g, "");
    const m = t.match(/\b(?:(CAD|USD|EUR|GBP)\s*)?(?:C\$|US\$|\$)?\s*(\d{2,6})\b/i);
    if (!m)
        return 0;
    const n = Number(m[2]);
    return Number.isFinite(n) ? n : 0;
}
function parseCurrency(text) {
    const t = String(text || "");
    const m = t.match(/\b(CAD|USD|EUR|GBP)\b/i);
    if (m)
        return m[1].toUpperCase();
    if (t.includes("C$"))
        return "CAD";
    if (t.includes("US$"))
        return "USD";
    return "";
}
function normalizeCurrency(raw) {
    const t = String(raw || "").trim().toUpperCase();
    if (!t)
        return "";
    if (t === "$" || t === "C$" || t === "CAD")
        return "CAD";
    if (t === "US$" || t === "USD")
        return "USD";
    if (t === "EUR")
        return "EUR";
    if (t === "GBP")
        return "GBP";
    return "";
}
const PROVINCE_CODES = [
    "BC",
    "ON",
    "AB",
    "QC",
    "MB",
    "SK",
    "NS",
    "NB",
    "NL",
    "PE",
    "NT",
    "NU",
    "YT",
];
function parseCanadianLocation(text) {
    const t = cleanText(String(text || "")).replace(/\u00a0/g, " ");
    if (!t)
        return {};
    // 1) "City, BC" / "City BC"
    const provAlt = PROVINCE_CODES.join("|");
    let m = t.match(new RegExp(`\\b([A-Z][A-Za-z]+(?:[\\s-][A-Z][A-Za-z]+){0,3})\\s*,\\s*(${provAlt})\\b`));
    if (!m)
        m = t.match(new RegExp(`\\b([A-Z][A-Za-z]+(?:[\\s-][A-Z][A-Za-z]+){0,3})\\s+(${provAlt})\\b`));
    if (m) {
        const city = m[1].trim();
        const region = m[2].trim();
        return { city, region };
    }
    // 2) Neighborhood hints
    const n = t.match(/\b(?:neighbourhood|neighborhood)\s*[:\-]\s*([^\n\|,]{2,60})/i);
    if (n)
        return { neighborhood: cleanText(n[1]) };
    return {};
}
function getMeta($, selectors) {
    for (const sel of selectors) {
        const v = String($(sel).attr("content") || "").trim();
        if (v)
            return v;
    }
    return "";
}
/**
 * Pick a “main listing” root container so we don’t accidentally parse
 * other listing cards/footers on the same page.
 */
function pickListingRoot($) {
    const h1 = $("h1").first();
    if (h1.length) {
        const mainish = h1.closest("main, article");
        if (mainish.length)
            return mainish;
        let cur = h1.parent();
        for (let i = 0; i < 6 && cur && cur.length; i++) {
            const t = cleanText(cur.text());
            if (t.length >= 300 && t.length <= 9000)
                return cur;
            cur = cur.parent();
        }
    }
    const main = $("main").first();
    if (main.length)
        return main;
    const article = $("article").first();
    if (article.length)
        return article;
    return $("body");
}
function pickBestMonthlyPrice(text) {
    const t = cleanText(String(text || "")).replace(/\u00a0/g, " ");
    if (!t)
        return { price: 0, currency: "" };
    const cands = [];
    const push = (amount, currencyRaw, ctx) => {
        const price = parsePrice(`${currencyRaw} ${amount}`);
        if (!price)
            return;
        if (price < 50 || price > 50_000)
            return;
        const currency = normalizeCurrency(currencyRaw) || parseCurrency(currencyRaw) || "";
        const c = cleanText(ctx).toLowerCase();
        let score = 0;
        if (/(^|\b)(rent|price|monthly rent|per month|\/month|\/mo|monthly)(\b|$)/.test(c))
            score += 6;
        if (/(per\s*month|\/\s*month|\/\s*mo|per\s*mo|monthly)/.test(c))
            score += 5;
        if (/(deposit|security|damage|refundable|fee|application)/.test(c))
            score -= 7;
        if (/(per\s*week|\/\s*week|daily|per\s*day)/.test(c))
            score -= 4;
        if (price >= 200 && price <= 9000)
            score += 2;
        if (price < 200)
            score -= 3;
        cands.push({ price, currency, score, ctx: c });
    };
    // (rent/price) .... $1234
    const re1 = /(rent|price)[^\n\r$0-9]{0,40}(CAD|USD|EUR|GBP|C\$|US\$|\$)\s*([0-9][0-9,]{1,6})/gi;
    let m;
    while ((m = re1.exec(t))) {
        push(m[3], m[2], t.slice(Math.max(0, m.index - 40), Math.min(t.length, m.index + 90)));
    }
    // $1234 / month
    const re2 = /(CAD|USD|EUR|GBP)?\s*(C\$|US\$|\$)\s*([0-9][0-9,]{1,6})\s*(?:\/\s*month|per\s*month|\/\s*mo|per\s*mo|monthly)/gi;
    while ((m = re2.exec(t))) {
        push(m[3], (m[1] || "") + (m[2] || ""), t.slice(Math.max(0, m.index - 40), Math.min(t.length, m.index + 90)));
    }
    // fallback: $1234 but only if nearby says rent/monthly
    const re3 = /(CAD|USD|EUR|GBP|C\$|US\$|\$)\s*([0-9][0-9,]{1,6})/gi;
    while ((m = re3.exec(t))) {
        const start = Math.max(0, m.index - 60);
        const end = Math.min(t.length, m.index + 80);
        const ctx = t.slice(start, end);
        if (!/(per\s*month|\/\s*month|\/\s*mo|monthly|rent)/i.test(ctx))
            continue;
        push(m[2], m[1], ctx);
    }
    if (!cands.length)
        return { price: 0, currency: "" };
    cands.sort((a, b) => b.score - a.score);
    if (cands[0].score < 2)
        return { price: 0, currency: "" };
    return { price: cands[0].price, currency: cands[0].currency };
}
function readJsonLd($) {
    const out = [];
    $("script[type='application/ld+json']").each((_, el) => {
        const raw = $(el).contents().text();
        if (!raw)
            return;
        try {
            const j = JSON.parse(raw);
            const pushOne = (x) => {
                if (!x)
                    return;
                if (Array.isArray(x)) {
                    x.forEach(pushOne);
                    return;
                }
                if (Array.isArray(x?.["@graph"])) {
                    x["@graph"].forEach(pushOne);
                    return;
                }
                out.push(x);
            };
            pushOne(j);
        }
        catch {
            // ignore
        }
    });
    return out;
}
function pickOffer(obj) {
    if (!obj)
        return null;
    if (obj?.["@type"] === "Offer" || obj?.["@type"] === "AggregateOffer")
        return obj;
    if (obj?.offers) {
        if (Array.isArray(obj.offers))
            return obj.offers[0];
        return obj.offers;
    }
    return null;
}
function extractAddressHint({ text, jsonLd }) {
    // Prefer schema.org JSON-LD
    for (const node of jsonLd || []) {
        const addr = node?.address;
        if (!addr)
            continue;
        if (typeof addr === "string" && addr.trim().length > 6)
            return addr.trim().slice(0, 120);
        const street = String(addr?.streetAddress || "").trim();
        const loc = String(addr?.addressLocality || "").trim();
        const region = String(addr?.addressRegion || "").trim();
        const parts = [street, loc, region].filter(Boolean);
        if (parts.length)
            return parts.join(", ").slice(0, 120);
    }
    // Fallback: regex on the visible text
    const m = text.match(/\b\d{1,6}\s+[A-Za-z0-9.\- ]{2,35}\s+(Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Crescent|Cres|Court|Ct|Way|Place|Pl)\b[^\n]{0,30}/i);
    if (m)
        return m[0].replace(/\s+/g, " ").trim().slice(0, 120);
    return undefined;
}
function extractBedsBaths(text) {
    const out = {};
    const t = text.toLowerCase();
    const bed = t.match(/\b(\d{1,2})\s*(bed|beds|br)\b/);
    if (bed) {
        const n = Number(bed[1]);
        if (Number.isFinite(n) && n > 0 && n < 20)
            out.bedrooms = n;
    }
    const bath = t.match(/\b(\d{1,2})(?:\.5)?\s*(bath|baths|ba)\b/);
    if (bath) {
        const n = Number(bath[1]);
        if (Number.isFinite(n) && n > 0 && n < 20)
            out.bathrooms = n;
    }
    return out;
}
export async function extractListingFromUrl(url, opts) {
    const timeoutMs = Number(opts?.timeoutMs || TIMEOUT_MS);
    const maxBytes = Number(opts?.maxBytes || MAX_BYTES);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let r;
    try {
        r = await fetch(url, {
            signal: controller.signal,
            redirect: "follow",
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome Safari",
                Accept: "text/html,application/xhtml+xml",
            },
        });
    }
    catch {
        clearTimeout(timer);
        throw new Error("FETCH: Could not reach the listing page (network or blocked).");
    }
    finally {
        clearTimeout(timer);
    }
    if (!r.ok) {
        if (r.status === 403 || r.status === 429) {
            throw new Error("BLOCKED: This site blocks automated link fetch. Please use Paste text mode for this listing.");
        }
        throw new Error(`FETCH: Could not fetch listing page (HTTP ${r.status}).`);
    }
    const len = Number(r.headers.get("content-length") || "0");
    if (len && len > maxBytes) {
        throw new Error("FETCH: Listing page is too large to fetch safely.");
    }
    const html = await r.text();
    if (html.length > maxBytes) {
        throw new Error("FETCH: Listing page is too large to process safely.");
    }
    const $ = load(html);
    const root = pickListingRoot($);
    const title = cleanText(pickFirst($('meta[property="og:title"]').attr("content"), $("h1").first().text(), $("title").first().text()));
    const description = cleanText(pickFirst($('meta[property="og:description"]').attr("content"), $('meta[name="description"]').attr("content"), root.text(), $("main").text(), $("article").text())).slice(0, 1400);
    // Images: og:image + scoped root images
    const images = new Set();
    const ogImg = $('meta[property="og:image"]').attr("content");
    if (ogImg)
        images.add(ogImg);
    root
        .find("img")
        .slice(0, 30)
        .each((_, el) => {
        const srcset = ($(el).attr("srcset") || "").trim();
        const srcFromSet = srcset
            ? srcset
                .split(",")
                .map((p) => p.trim().split(" ")[0])
                .filter(Boolean)[0]
            : "";
        const src = srcFromSet || $(el).attr("src") || $(el).attr("data-src") || "";
        if (!src)
            return;
        if (src.startsWith("data:"))
            return;
        try {
            const abs = new URL(src, url).toString();
            images.add(abs);
        }
        catch {
            // ignore
        }
    });
    // JSON-LD
    const ld = readJsonLd($);
    let ldPrice;
    let ldCurrency;
    let ldCity;
    let ldNeighborhood;
    for (const obj of ld) {
        const offer = pickOffer(obj);
        if (offer) {
            const p = typeof offer.price === "string" ? parsePrice(offer.price) : Number(offer.price);
            if (Number.isFinite(p) && p > 0)
                ldPrice = p;
            const c = String(offer.priceCurrency || "").trim();
            if (c)
                ldCurrency = c.toUpperCase();
        }
        const addr = obj?.address;
        const locality = addr?.addressLocality || addr?.addressLocality?.name;
        const neigh = addr?.addressNeighborhood || addr?.addressNeighborhood?.name;
        if (locality && !ldCity)
            ldCity = String(locality).trim();
        if (neigh && !ldNeighborhood)
            ldNeighborhood = String(neigh).trim();
    }
    const metaPrice = $('meta[property="product:price:amount"]').attr("content") ||
        $('meta[property="og:price:amount"]').attr("content") ||
        "";
    const metaCurrency = $('meta[property="product:price:currency"]').attr("content") ||
        $('meta[property="og:price:currency"]').attr("content") ||
        "";
    const rootText = root.text();
    const bodyText = $("body").text();
    let price = ldPrice || (metaPrice ? parsePrice(metaPrice) : 0);
    let currency = (ldCurrency || parseCurrency(metaCurrency) || "").toUpperCase();
    // ✅ main fix: price from scoped listing root first
    if (!price) {
        const scoped = pickBestMonthlyPrice(rootText);
        if (scoped.price)
            price = scoped.price;
        if (!currency && scoped.currency)
            currency = scoped.currency;
    }
    // last fallback
    if (!price)
        price = parsePrice(rootText) || parsePrice(bodyText);
    if (!currency)
        currency = (parseCurrency(rootText) || parseCurrency(bodyText) || "").toUpperCase();
    const addressHint = extractAddressHint({ text: rootText || bodyText, jsonLd: ld }) || "";
    const bedsBaths = extractBedsBaths(`${title} ${rootText}`);
    // Location: JSON-LD is unreliable on many listing sites;...
    const metaPlace = getMeta($, [
        'meta[name="geo.placename"]',
        'meta[name="placename"]',
        'meta[property="og:locality"]',
    ]);
    // Prefer JSON-LD, then meta, then regex-from-page...
    let city = cleanText(pickFirst(ldCity, metaPlace));
    let neighborhood = cleanText(pickFirst(ldNeighborhood));
    if (!city || !neighborhood) {
        const loc = parseCanadianLocation([addressHint, title, description, rootText].join("\n"));
        if (!city && loc.city)
            city = loc.city;
        if (!neighborhood && loc.neighborhood)
            neighborhood = loc.neighborhood;
    }
    return {
        title: title || "Listing",
        description: description || "",
        price: price || 0,
        currency: currency || "",
        city: city || "",
        neighborhood: neighborhood || "",
        addressHint,
        bedrooms: bedsBaths.bedrooms,
        bathrooms: bedsBaths.bathrooms,
        image_urls: Array.from(images).slice(0, 6),
    };
}
