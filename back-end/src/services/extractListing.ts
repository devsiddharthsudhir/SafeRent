import { load } from "cheerio";

const TIMEOUT_MS = 8000;
const MAX_BYTES = 2_000_000; // 2 MB

export function isSafePublicUrl(raw: string) {
  try {
    const u = new URL(raw);

    if (!(u.protocol === "http:" || u.protocol === "https:")) return false;

    const host = u.hostname.toLowerCase();

    if (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "0.0.0.0" ||
      host === "::1" ||
      host.endsWith(".local") ||
      host.endsWith(".internal")
    ) {
      return false;
    }

    const isIp = /^[0-9.]+$/.test(host);
    if (isIp) {
      if (host.startsWith("10.")) return false;
      if (host.startsWith("192.168.")) return false;
      if (host.startsWith("169.254.")) return false;
      const m = host.match(/^172\.(\d+)\./);
      if (m) {
        const second = Number(m[1]);
        if (second >= 16 && second <= 31) return false;
      }
    }

    return true;
  } catch {
    return false;
  }
}

function pickFirst(...vals: Array<string | undefined | null>) {
  for (const v of vals) {
    const t = (v || "").trim();
    if (t) return t;
  }
  return "";
}

function cleanText(s: string) {
  return s.replace(/\s+/g, " ").trim();
}

function cleanMultilineText(s: string) {
  const t = String(s ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\u00a0/g, " ")
    // basic HTML-to-text normalization for descriptions coming from embedded JSON
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p\s*>/gi, "\n")
    .replace(/<p\b[^>]*>/gi, "")
    .replace(/<li\b[^>]*>/gi, "- ")
    .replace(/<\/li\s*>/gi, "\n")
    .replace(/<\/ul\s*>/gi, "\n")
    .replace(/<\/ol\s*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    // trim trailing spaces per line
    .replace(/[ \t]+\n/g, "\n")
    // collapse excessive blank lines (keep paragraph breaks)
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  // normalize repeated spaces inside lines but preserve leading bullets/indentation
  return t
    .split("\n")
    .map((line) => line.replace(/[ \t]{2,}/g, " ").trimEnd())
    .join("\n")
    .trim();
}

function sliceBetweenHeadings(raw: string, startHeading: string, endHeadings: string[]) {
  const text = String(raw ?? "");
  const lower = text.toLowerCase();
  const startIdx = lower.indexOf(startHeading.toLowerCase());
  if (startIdx < 0) return "";
  const after = text.slice(startIdx + startHeading.length);
  const afterLower = after.toLowerCase();

  let endIdx = after.length;
  for (const h of endHeadings) {
    const j = afterLower.indexOf(h.toLowerCase());
    if (j >= 0 && j < endIdx) endIdx = j;
  }
  return after.slice(0, endIdx);
}

type ScanBest<T> = { score: number; value: T };

function walkJson(
  obj: any,
  fn: (key: string | null, value: any, parent: any) => void,
  depth = 0,
  seen = new Set<any>()
) {
  if (!obj || depth > 20) return;
  if (typeof obj !== "object") return;
  if (seen.has(obj)) return;
  seen.add(obj);

  if (Array.isArray(obj)) {
    for (const v of obj) walkJson(v, fn, depth + 1, seen);
    return;
  }

  for (const [k, v] of Object.entries(obj)) {
    fn(k, v, obj);
    walkJson(v, fn, depth + 1, seen);
  }
}

/**
 * Best-effort: find a nested object that has all required properties.
 * Used for brittle vendor JSON where the surrounding key names can change.
 */
function findObjectWithProps(root: any, props: string[]): any | null {
  let found: any | null = null;
  walkJson(root, (_k, v) => {
    if (found) return;
    if (!v || typeof v !== "object" || Array.isArray(v)) return;
    const o = v as Record<string, unknown>;
    for (const p of props) {
      if (!(p in o)) return;
    }
    found = v;
  });
  return found;
}

function scanJsonForMonthlyPrice(obj: any): { price: number; currency?: string } | null {
  /**
   * IMPORTANT (TS strict):
   * If a `let best = null` is only assigned inside a callback, TypeScript can
   * sometimes infer `never` in certain control-flow scenarios. Keep it explicit.
   */
  type Scored<T> = { score: number; value: T };

  // NOTE:
  // In TS strict mode, a variable that is only written inside a callback can
  // sometimes be incorrectly narrowed ("never"/"null") at the return site.
  // Using a ref object keeps the type stable without sacrificing runtime logic.
  const bestRef: { current: Scored<{ price: number; currency?: string }> | null } = { current: null };

  walkJson(obj, (k, v, parent) => {
    const key = String(k ?? "").toLowerCase();

    // strings that already look like "$1,390/mo"
    if (typeof v === "string" && v.length < 250) {
      const raw = v.replace(/\u00a0/g, " ");
      const pm = pickBestMonthlyPrice(raw);
      if (pm && pm.price >= 100 && pm.price <= 20000) {
        const score =
          10 +
          (/(\/mo|\/month|per month|monthly)/i.test(raw) ? 4 : 0) +
          (key.includes("rent") || key.includes("monthly") ? 2 : 0) +
          (key.includes("price") ? 1 : 0);

        const best = bestRef.current;
        if (!best || score > best.score) bestRef.current = { score, value: pm };
      }
      return;
    }

    // numeric candidates: require rent/price-ish keys
    if (typeof v === "number" && v >= 100 && v <= 20000) {
      if (key.includes("rent") || key.includes("monthly") || key.includes("price")) {
        const score = 4 + (key.includes("rent") ? 3 : 0) + (key.includes("monthly") ? 1 : 0);

        const cur = normalizeCurrency(
          typeof (parent as any)?.currency === "string"
            ? (parent as any).currency
            : typeof (parent as any)?.currencyCode === "string"
              ? (parent as any).currencyCode
              : ""
        );

        const best = bestRef.current;
        if (!best || score > best.score) bestRef.current = { score, value: { price: v, currency: cur || undefined } };
      }
    }
  });

  return bestRef.current?.value ?? null;
}

function scanJsonForDescription(obj: any): string | null {
  type Scored<T> = { score: number; value: T };
  // Same TS narrowing edge-case as above; keep state in a ref object.
  const bestRef: { current: Scored<string> | null } = { current: null };

  walkJson(obj, (k, v) => {
    if (typeof v !== "string") return;
    const key = String(k ?? "").toLowerCase();

    // ignore obviously irrelevant strings
    if (v.length < 80 || v.length > 8000) return;
    const raw = v.replace(/\u00a0/g, " ");

    // prefer keys that look like description/details/remarks
    let score = 0;
    if (key.includes("description")) score += 8;
    if (key.includes("details")) score += 6;
    if (key.includes("remark") || key.includes("remarks")) score += 6;
    if (key.includes("what") && key.includes("special")) score += 6;
    if (key.includes("marketing")) score += 4;
    if (key.includes("room") && key.includes("detail")) score += 6;

    // prefer content patterns we expect in "Room details"
    if (/\bfeatures\b/i.test(raw)) score += 3;
    if (/\brent\b/i.test(raw)) score += 2;
    if (/\bavailability\b/i.test(raw)) score += 1;
    if (/(\n|\r)/.test(raw)) score += 2;
    if (/^\s*[-•]/m.test(raw)) score += 2;

    // prefer longer but not crazy
    score += Math.min(6, Math.floor(raw.length / 250));

    // avoid boilerplate
    if (/terms of use|privacy policy|copyright/i.test(raw)) score -= 10;

    const best = bestRef.current;
    if (!best || score > best.score) bestRef.current = { score, value: raw };
  });

  return bestRef.current?.value ?? null;
}

function normalizeAbsoluteUrl(baseUrl: string, maybeUrl: unknown): string | null {
  if (!maybeUrl || typeof maybeUrl !== "string") return null;
  const raw = maybeUrl.trim();
  if (!raw) return null;
  if (raw.startsWith("data:")) return null;

  try {
    // Handles absolute, protocol-relative, and relative URLs.
    const u = new URL(raw, baseUrl);
    if (!(u.protocol === "http:" || u.protocol === "https:")) return null;
    return u.toString();
  } catch {
    return null;
  }
}

function isProbablyListingImage(url: string): boolean {
  const u = url.toLowerCase();

  // Avoid common UI assets.
  if (
    u.includes("sprite") ||
    u.includes("favicon") ||
    u.includes("logo") ||
    u.includes("avatar") ||
    u.includes("icon") ||
    u.includes("placeholder") ||
    u.includes("loading") ||
    u.includes("spinner")
  )
    return false;

  // Must look like an image URL (extension or known image CDNs).
  if (/\.(jpg|jpeg|png|webp)(\?|#|$)/i.test(u)) return true;
  if (u.includes("cloudfront.net") || u.includes("cloudinary.com") || u.includes("imgix.net")) return true;

  return false;
}

function collectMetaImages($: any, baseUrl: string): string[] {
  const imgs: string[] = [];

  const selectors = [
    'meta[property="og:image"]',
    'meta[property="og:image:url"]',
    'meta[property="og:image:secure_url"]',
    'meta[name="twitter:image"]',
    'meta[name="twitter:image:src"]',
    'link[rel="image_src"]',
    'link[rel="preload"][as="image"]',
  ];

  for (const sel of selectors) {
    $(sel).each((_: any, el: any) => {
      const v = $(el).attr("content") || $(el).attr("href");
      const abs = normalizeAbsoluteUrl(baseUrl, v);
      if (abs && isProbablyListingImage(abs)) imgs.push(abs);
    });
  }

  return imgs;
}

function findLabeledValue($: any, root: any, labelRe: RegExp): string | null {
  const candidates = root.find("dt,th,label,span,div,p,li").toArray();
  for (const el of candidates) {
    const t = cleanText($(el).text());
    if (!t) continue;
    if (!labelRe.test(t)) continue;

    const $el = $(el);
    const tag = (el.tagName || "").toLowerCase();

    // Common semantic patterns: <dt>Label</dt><dd>Value</dd>, <th>Label</th><td>Value</td>
    if (tag === "dt") {
      const v = cleanText($el.next("dd").text());
      if (v) return v;
    }
    if (tag === "th") {
      const v = cleanText($el.next("td").text());
      if (v) return v;
    }

    // Common UI pattern: label element followed by a value element
    const next = cleanText($el.next().text());
    if (next && next !== t) return next;

    // Another common UI pattern: row container with 2 columns (label + value)
    const parent = $el.parent();
    const kids = parent.children();
    if (kids.length >= 2) {
      const last = cleanText($(kids[kids.length - 1]).text());
      if (last && last !== t) return last;
    }
  }
  return null;
}

function parseNumberMaybe(s: string): number | undefined {
  const m = s.match(/(-?\d+(?:\.\d+)?)/);
  if (!m) return undefined;
  const n = Number(m[1]);
  if (!Number.isFinite(n)) return undefined;
  return n;
}

function plausibleMonthlyPrice(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n) && n >= 100 && n <= 20000;
}

function plausibleSmallCount(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 20;
}

function extractBedsBathsFromDom($: any, root: any): { bedrooms?: number; bathrooms?: number } {
  const bedVal =
    findLabeledValue($, root, /^bedrooms?$/i) ||
    findLabeledValue($, root, /^beds?$/i) ||
    findLabeledValue($, root, /^rooms?$/i);

  const bathVal =
    findLabeledValue($, root, /^bathrooms?$/i) || findLabeledValue($, root, /^baths?$/i);

  const bedrooms = bedVal ? parseNumberMaybe(bedVal) : undefined;
  const bathrooms = bathVal ? parseNumberMaybe(bathVal) : undefined;

  return {
    bedrooms: plausibleSmallCount(bedrooms) ? bedrooms : undefined,
    bathrooms: plausibleSmallCount(bathrooms) ? bathrooms : undefined,
  };
}

function inferBedsBathsHeuristics(text: string): { bedrooms?: number; bathrooms?: number } {
  const t = text.toLowerCase();

  // Studio
  if (/\bstudio\b/.test(t)) return { bedrooms: 0 };

  // Room listings
  const looksLikeRoom =
    /\b(room for rent|shared room|private room|roommate|roomies)\b/.test(t) ||
    (/\broom\b/.test(t) && /\b(shared|private|furnished)\b/.test(t));

  const bathroomsFromText = (() => {
    // numeric patterns
    const m =
      text.match(/\b(\d+(?:\.\d+)?)\s*(?:bath|bathroom|ba)\b/i) ||
      text.match(/\b(\d+(?:\.\d+)?)\s*(?:bath|bathroom)s?\b/i);
    if (m) return Number(m[1]);

    if (/\b(own|private|ensuite)\s+bath(room)?\b/.test(t)) return 1;
    if (/\bshared\s+bath(room)?\b/.test(t)) return 1;

    return undefined;
  })();

  const bedroomsFromText = (() => {
    const m =
      text.match(/\b(\d+(?:\.\d+)?)\s*(?:bed|bedroom|bd)\b/i) ||
      text.match(/\b(\d+(?:\.\d+)?)\s*(?:bed|bedroom)s?\b/i);
    if (m) return Number(m[1]);
    if (looksLikeRoom) return 1;
    return undefined;
  })();

  return {
    bedrooms: plausibleSmallCount(bedroomsFromText) ? bedroomsFromText : undefined,
    bathrooms: plausibleSmallCount(bathroomsFromText) ? bathroomsFromText : undefined,
  };
}

function parsePrice(text: string) {
  const t = String(text || "").replace(/,/g, "");
  const m = t.match(/\b(?:(CAD|USD|EUR|GBP)\s*)?(?:C\$|US\$|\$)?\s*(\d{2,6})\b/i);
  if (!m) return 0;
  const n = Number(m[2]);
  return Number.isFinite(n) ? n : 0;
}

function parseCurrency(text: string) {
  const t = String(text || "");
  const m = t.match(/\b(CAD|USD|EUR|GBP)\b/i);
  if (m) return m[1].toUpperCase();
  if (t.includes("C$")) return "CAD";
  if (t.includes("US$")) return "USD";
  return "";
}

function normalizeCurrency(raw: string) {
  const t = String(raw || "").trim().toUpperCase();
  if (!t) return "";
  if (t === "$" || t === "C$" || t === "CAD") return "CAD";
  if (t === "US$" || t === "USD") return "USD";
  if (t === "EUR") return "EUR";
  if (t === "GBP") return "GBP";
  return "";
}


/* --------------------------- Zillow (Next.js) parsing --------------------------- */

function tryParseJson<T = any>(raw: string | null | undefined): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function asNumberLike(v: any): number | undefined {
  if (v === null || v === undefined) return undefined;
  if (typeof v === "number") return Number.isFinite(v) ? v : undefined;
  if (typeof v === "string") {
    const t = v.trim();
    if (!t) return undefined;
    // prefer a number with optional decimal
    const m = t.replace(/,/g, "").match(/(-?\d+(?:\.\d+)?)/);
    if (!m) return undefined;
    const n = Number(m[1]);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

function asTextLike(v: any): string | undefined {
  if (typeof v === "string") {
    const t = v.trim();
    return t ? t : undefined;
  }
  return undefined;
}

function pickLargestMixedSource(mixedSources: any): string | undefined {
  if (!Array.isArray(mixedSources)) return undefined;
  let best: { w: number; url: string } | null = null;
  for (const s of mixedSources) {
    const url = asTextLike(s?.url);
    const w = asNumberLike(s?.width) ?? 0;
    if (!url) continue;
    if (!best || w > best.w) best = { w, url };
  }
  return best?.url;
}

function collectZillowPhotos(node: any): string[] {
  const urls: string[] = [];

  const maybePush = (u: any) => {
    const s = asTextLike(u);
    if (!s) return;
    if (!/^https?:\/\//i.test(s)) return;
    urls.push(s);
  };

  // common patterns
  if (Array.isArray(node?.photos)) {
    for (const p of node.photos) {
      maybePush(p?.url);
      maybePush(p?.href);
      maybePush(p?.imageUrl);
      maybePush(p?.imgSrc);
      maybePush(p?.src);
      const best = pickLargestMixedSource(p?.mixedSources);
      if (best) maybePush(best);
    }
  }
  if (Array.isArray(node?.responsivePhotos)) {
    for (const p of node.responsivePhotos) {
      const best = pickLargestMixedSource(p?.mixedSources);
      if (best) maybePush(best);
      maybePush(p?.url);
      maybePush(p?.imgSrc);
    }
  }
  if (Array.isArray(node?.imageUrls)) {
    for (const u of node.imageUrls) maybePush(u);
  }
  if (Array.isArray(node?.photoUrls)) {
    for (const u of node.photoUrls) maybePush(u);
  }

  maybePush(node?.imgSrc);
  maybePush(node?.heroImage);
  maybePush(node?.primaryPhoto?.url);
  maybePush(node?.primaryPhoto?.mixedSources && pickLargestMixedSource(node.primaryPhoto.mixedSources));

  return urls;
}

function extractZillowOverrides($: any, meta: { title?: string; description?: string; currency?: string; price?: number }) {
  const out: any = {};

  // Collect multiple embedded JSON blobs — Zillow pages can vary by build
  const jsonBlobs: string[] = [];
  const pushIf = (s?: string | null) => {
    const v = (s ?? "").trim();
    if (v.length > 5) jsonBlobs.push(v);
  };

  pushIf($("script#__NEXT_DATA__").html());
  pushIf($("script#hdpApolloPreloadedData").html());

  // Cheerio's .each callback params are (index, element). Explicit types avoid `noImplicitAny` errors.
  $("script[data-zrr-shared-data-key]").each((_i: number, el: any) => pushIf($(el).html()));
  $("script[type='application/ld+json']").each((_i: number, el: any) => pushIf($(el).html()));

  const parsedObjects: any[] = [];
  for (const blob of jsonBlobs) {
    const p = tryParseJson<any>(blob);
    if (p) parsedObjects.push(p);
  }

  // Basic fields
  let title = cleanText(String(meta.title ?? $("title").text() ?? "")).slice(0, 180);
  let description = String(meta.description ?? "");

  let city = "";
  let addressHint = "";
  let beds = 0;
  let baths = 0;

  // Price/currency
  let price = typeof meta.price === "number" ? meta.price : 0;
  let currency = normalizeCurrency(String(meta.currency ?? "")) || "";

  // Photos
  let image_urls: string[] = [];

  // Extract from parsed JSON (best-effort, resilient to schema changes)
  for (const obj of parsedObjects) {
    // photos
    try {
      const photos = collectZillowPhotos(obj);
      for (const p of photos) if (!image_urls.includes(p)) image_urls.push(p);
    } catch {}

    // best object that looks like a listing payload
    const home =
      findObjectWithProps(obj, ["beds", "baths", "city", "address"]) ||
      findObjectWithProps(obj, ["bedrooms", "bathrooms", "city", "address"]) ||
      findObjectWithProps(obj, ["streetAddress", "city", "state"]) ||
      null;

    if (home) {
      if (!beds) beds = asNumberLike((home as any).beds ?? (home as any).bedrooms ?? (home as any).bedroomCount) || 0;
      if (!baths) baths = asNumberLike((home as any).baths ?? (home as any).bathrooms ?? (home as any).bathroomCount) || 0;

      if (!city) city = asTextLike((home as any).city ?? (home as any).address?.city) || "";

      if (!addressHint) {
        const parts = [
          asTextLike((home as any).streetAddress ?? (home as any).address?.streetAddress),
          asTextLike((home as any).city ?? (home as any).address?.city),
          asTextLike((home as any).state ?? (home as any).province ?? (home as any).address?.state),
          asTextLike((home as any).zipcode ?? (home as any).postalCode ?? (home as any).address?.zipcode ?? (home as any).address?.postalCode),
        ].filter(Boolean);
        if (parts.length) addressHint = cleanText(parts.join(", "));
      }

      // prefer rich descriptions if present
      const maybeDesc =
        asTextLike((home as any).description) ||
        asTextLike((home as any).homeDescription) ||
        asTextLike((home as any).whatSpecial) ||
        asTextLike((home as any).marketingDescription) ||
        "";
      if (maybeDesc && maybeDesc.length > (description?.length ?? 0)) description = maybeDesc;
    }

    // price scan
    if (!price) {
      const found = scanJsonForMonthlyPrice(obj);
      if (found?.price) {
        price = found.price;
        if (!currency && found.currency) currency = found.currency;
      }
    }

    // description scan (Room details/remarks)
    if (!description || description.length < 120) {
      const d = scanJsonForDescription(obj);
      if (d && d.length > (description?.length ?? 0)) description = d;
    }

    // title hints
    if (!title || title.length < 10) {
      const t = asTextLike((home as any)?.title) || asTextLike((home as any)?.name) || "";
      if (t) title = cleanText(t).slice(0, 180);
    }
  }

  // DOM/meta hints (some builds expose formatted price/description directly)
  const domHintsRaw = [
    $("meta[property='og:price:amount']").attr("content"),
    $("meta[property='product:price:amount']").attr("content"),
    $("meta[name='twitter:data1']").attr("content"),
    $("meta[name='description']").attr("content"),
    $("[data-testid*='price']").first().text(),
    $("[data-testid*='rent']").first().text(),
    $("h1").first().text(),
    $("h2").first().text(),
    $("h3").first().text(),
  ]
    .map((x: any) => String(x || ""))
    .filter((x) => x.trim().length > 0);

  // price from DOM hints (guard against picking sqft / counts)
  if (!price) {
    for (const hRaw of domHintsRaw) {
      const h = cleanText(hRaw);
      const best = pickBestMonthlyPrice(h);
      if (best && best.price >= 100 && best.price <= 20000) {
        price = best.price;
        if (!currency && best.currency) currency = best.currency;
        break;
      }

      const hasMoney = /(c\$|us\$|\$|cad|usd|eur|gbp)/i.test(h);
      const hasPeriod = /(\/mo|\/month|per month|monthly|rent)/i.test(h);
      if (hasMoney && hasPeriod) {
        const p = parsePrice(h);
        if (p >= 100 && p <= 20000) {
          price = p;
          if (!currency) currency = normalizeCurrency(parseCurrency(h) || "");
          break;
        }
      }
    }
  }

  // final fallback: scan body text for monthly patterns
  if (!price) {
    const bodyText = cleanText(String($("body").text() || ""));
    const best = pickBestMonthlyPrice(bodyText);
    if (best && best.price >= 100 && best.price <= 20000) {
      price = best.price;
      if (!currency && best.currency) currency = best.currency;
    }
  }

  // Try to extract the "Room details" section as the description (matches the user's expectation)
  if (!description || description.length < 120) {
    const rawBody = String($("body").text() || "");
    const sliced = sliceBetweenHeadings(rawBody, "Room details", [
      "Facts & features",
      "Services availability",
      "Costs & fees breakdown",
      "What's special",
      "Similar rentals",
      "Similar homes",
    ]);
    const candidate = cleanMultilineText(sliced.replace(/^\\s*room details\\s*/i, ""));
    if (candidate.length >= 120) description = candidate;
  }

  // If description contains rent text, use it as a last-chance signal for price
  if (!price && description) {
    const best = pickBestMonthlyPrice(description);
    if (best && best.price >= 100 && best.price <= 20000) {
      price = best.price;
      if (!currency && best.currency) currency = best.currency;
    }
  }

  // Clean up / bound sizes
  title = cleanText(title).slice(0, 180);
  description = cleanMultilineText(String(description || "")).slice(0, 3500);
  addressHint = cleanText(addressHint).slice(0, 200);
  city = cleanText(city).slice(0, 80);

  if (!currency) currency = "CAD"; // default for CA-centric use

  if (title) out.title = title;
  if (price >= 100 && price <= 20000) out.price = price;
  if (currency) out.currency = currency;
  if (beds > 0 && beds <= 20) out.beds = beds;
  if (baths > 0 && baths <= 20) out.baths = baths;
  if (addressHint) out.addressHint = addressHint;
  if (city) out.city = city;
  if (description) out.description = description;
  if (image_urls.length) out.image_urls = image_urls;

  return out;
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
] as const;

function parseCanadianLocation(text: string): { city?: string; region?: string; neighborhood?: string } {
  // Try to extract a Canada-style location from free text.
  // Supports both province codes ("BC") and full province names ("British Columbia").
  const PROVINCE_NAME_TO_CODE: Record<string, string> = {
    "alberta": "AB",
    "british columbia": "BC",
    "manitoba": "MB",
    "new brunswick": "NB",
    "newfoundland and labrador": "NL",
    "northwest territories": "NT",
    "nova scotia": "NS",
    "nunavut": "NU",
    "ontario": "ON",
    "prince edward island": "PE",
    "quebec": "QC",
    "saskatchewan": "SK",
    "yukon": "YT",
  };

  const provinceCodeRe = /\b(BC|AB|SK|MB|ON|QC|NB|NS|PE|NL|NT|NU|YT)\b/i;
  const provinceNameRe = new RegExp(
    "\\b(" + Object.keys(PROVINCE_NAME_TO_CODE).map((k) => k.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")).join("|") + ")\\b",
    "i",
  );

  // Common patterns:
  // 1) "Downtown, Vancouver, BC"
  // 2) "Olds, Alberta"
  // 3) "Vancouver BC"
  const m1 = text.match(/\b([A-Z][A-Za-z'’.-]+(?:\s+[A-Z][A-Za-z'’.-]+)*)\s*,\s*([A-Z][A-Za-z'’.-]+(?:\s+[A-Z][A-Za-z'’.-]+)*)\s*,\s*(BC|AB|SK|MB|ON|QC|NB|NS|PE|NL|NT|NU|YT)\b/i);
  if (m1) {
    const neighborhood = m1[1].trim();
    const city = m1[2].trim();
    const region = m1[3].toUpperCase();
    return { city, region, neighborhood };
  }

  const m2 = text.match(/\b([A-Z][A-Za-z'’.-]+(?:\s+[A-Z][A-Za-z'’.-]+)*)\s*,\s*([A-Z][A-Za-z'’.-]+(?:\s+[A-Z][A-Za-z'’.-]+)*)\s*\b/);
  if (m2) {
    const left = m2[1].trim();
    const right = m2[2].trim();
    const rightLc = right.toLowerCase();

    // If right side is a province name, treat left as city.
    const asProvince = PROVINCE_NAME_TO_CODE[rightLc];
    if (asProvince) return { city: left, region: asProvince };

    // If any province exists anywhere nearby, return city + region.
    const code = (text.match(provinceCodeRe)?.[1] || "").toUpperCase();
    const name = text.match(provinceNameRe)?.[1]?.toLowerCase();
    const region = code || (name ? PROVINCE_NAME_TO_CODE[name] : "");
    if (region) return { city: left, region };
  }

  // Fallback: "City BC" or "... in City, BC"
  const m3 = text.match(/\b([A-Z][A-Za-z'’.-]+(?:\s+[A-Z][A-Za-z'’.-]+)*)\s+(BC|AB|SK|MB|ON|QC|NB|NS|PE|NL|NT|NU|YT)\b/i);
  if (m3) return { city: m3[1].trim(), region: m3[2].toUpperCase() };

  // Fallback: province name only (keep region)
  const name = text.match(provinceNameRe)?.[1]?.toLowerCase();
  if (name) return { region: PROVINCE_NAME_TO_CODE[name] };

  return {};
}

function getMeta($: any, selectors: string[]) {
  for (const sel of selectors) {
    const v = String($(sel).attr("content") || "").trim();
    if (v) return v;
  }
  return "";
}

/**
 * Pick a “main listing” root container so we don’t accidentally parse
 * other listing cards/footers on the same page.
 */
function pickListingRoot($: any) {
  const h1 = $("h1").first();
  if (h1.length) {
    const mainish = h1.closest("main, article");
    if (mainish.length) return mainish;

    let cur = h1.parent();
    for (let i = 0; i < 6 && cur && cur.length; i++) {
      const t = cleanText(cur.text());
      if (t.length >= 300 && t.length <= 9000) return cur;
      cur = cur.parent();
    }
  }
  const main = $("main").first();
  if (main.length) return main;
  const article = $("article").first();
  if (article.length) return article;
  return $("body");
}

function pickBestMonthlyPrice(text: string) {
  const t = cleanText(String(text || "")).replace(/\u00a0/g, " ");
  if (!t) return { price: 0, currency: "" };

  type Cand = { price: number; currency: string; score: number; ctx: string };
  const cands: Cand[] = [];

  const push = (amount: string, currencyRaw: string, ctx: string) => {
    const price = parsePrice(`${currencyRaw} ${amount}`);
    if (!price) return;
    if (price < 50 || price > 20_000) return;

    const currency = normalizeCurrency(currencyRaw) || parseCurrency(currencyRaw) || "";
    const c = cleanText(ctx).toLowerCase();

    let score = 0;
    if (/(^|\b)(rent|price|monthly rent|per month|\/month|\/mo|monthly)(\b|$)/.test(c)) score += 6;
    if (/(per\s*month|\/\s*month|\/\s*mo|per\s*mo|monthly)/.test(c)) score += 5;

    if (/(deposit|security|damage|refundable|fee|application)/.test(c)) score -= 7;
    if (/(per\s*week|\/\s*week|daily|per\s*day)/.test(c)) score -= 4;

    if (price >= 200 && price <= 9000) score += 2;
    if (price < 200) score -= 3;

    cands.push({ price, currency, score, ctx: c });
  };

  // (rent/price) .... $1234
  const re1 = /(rent|price)[^\n\r$0-9]{0,40}(CAD|USD|EUR|GBP|C\$|US\$|\$)\s*([0-9][0-9,]{1,6})/gi;
  let m: RegExpExecArray | null;
  while ((m = re1.exec(t))) {
    push(m[3], m[2], t.slice(Math.max(0, m.index - 40), Math.min(t.length, m.index + 90)));
  }

  // $1234 / month
  const re2 =
    /(CAD|USD|EUR|GBP)?\s*(C\$|US\$|\$)\s*([0-9][0-9,]{1,6})\s*(?:\/\s*month|per\s*month|\/\s*mo|per\s*mo|monthly)/gi;
  while ((m = re2.exec(t))) {
    push(m[3], (m[1] || "") + (m[2] || ""), t.slice(Math.max(0, m.index - 40), Math.min(t.length, m.index + 90)));
  }

  // fallback: $1234 but only if nearby says rent/monthly
  const re3 = /(CAD|USD|EUR|GBP|C\$|US\$|\$)\s*([0-9][0-9,]{1,6})/gi;
  while ((m = re3.exec(t))) {
    const start = Math.max(0, m.index - 60);
    const end = Math.min(t.length, m.index + 80);
    const ctx = t.slice(start, end);
    if (!/(per\s*month|\/\s*month|\/\s*mo|monthly|rent)/i.test(ctx)) continue;
    push(m[2], m[1], ctx);
  }

  if (!cands.length) return { price: 0, currency: "" };
  cands.sort((a, b) => b.score - a.score);
  if (cands[0].score < 2) return { price: 0, currency: "" };
  return { price: cands[0].price, currency: cands[0].currency };
}

function readJsonLd($: any) {
  const out: any[] = [];
  $("script[type='application/ld+json']").each((_: any, el: any) => {
    const raw = $(el).contents().text();
    if (!raw) return;
    try {
      const j = JSON.parse(raw);
      const pushOne = (x: any) => {
        if (!x) return;
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
    } catch {
      // ignore
    }
  });
  return out;
}

function pickOffer(obj: any): any {
  if (!obj) return null;
  if (obj?.["@type"] === "Offer" || obj?.["@type"] === "AggregateOffer") return obj;
  if (obj?.offers) {
    if (Array.isArray(obj.offers)) return obj.offers[0];
    return obj.offers;
  }
  return null;
}


function extractAddressHint({ text, jsonLd }: { text: string; jsonLd: any[] }): string | undefined {
  // Prefer schema.org JSON-LD
  for (const node of jsonLd || []) {
    const addr = (node as any)?.address;
    if (!addr) continue;
    if (typeof addr === "string" && addr.trim().length > 6) return addr.trim().slice(0, 120);
    const street = String((addr as any)?.streetAddress || "").trim();
    const loc = String((addr as any)?.addressLocality || "").trim();
    const region = String((addr as any)?.addressRegion || "").trim();
    const parts = [street, loc, region].filter(Boolean);
    if (parts.length) return parts.join(", ").slice(0, 120);
  }
  // Fallback: regex on the visible text
  const m = text.match(/\b\d{1,6}\s+[A-Za-z0-9.\- ]{2,35}\s+(Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Crescent|Cres|Court|Ct|Way|Place|Pl)\b[^\n]{0,30}/i);
  if (m) return m[0].replace(/\s+/g, " ").trim().slice(0, 120);
  return undefined;
}

function extractBedsBaths(text: string): { bedrooms?: number; bathrooms?: number } {
  const out: { bedrooms?: number; bathrooms?: number } = {};

  // Numeric patterns (bed / bath)
  const bed =
    text.match(/\b(\d+(?:\.\d+)?)\s*(?:bed|beds|bedroom|bedrooms|bd|br)\b/i) ||
    text.match(/\b(\d+(?:\.\d+)?)\s*-\s*bed\b/i);
  if (bed) {
    const n = Number(bed[1]);
    if (plausibleSmallCount(n)) out.bedrooms = n;
  }

  const bath =
    text.match(/\b(\d+(?:\.\d+)?)\s*(?:bath|baths|bathroom|bathrooms|ba)\b/i) ||
    text.match(/\b(\d+(?:\.\d+)?)\s*-\s*bath\b/i);
  if (bath) {
    const n = Number(bath[1]);
    if (plausibleSmallCount(n)) out.bathrooms = n;
  }

  // Heuristics for cases like room rentals and studio listings.
  const heur = inferBedsBathsHeuristics(text);
  if (out.bedrooms === undefined && heur.bedrooms !== undefined) out.bedrooms = heur.bedrooms;
  if (out.bathrooms === undefined && heur.bathrooms !== undefined) out.bathrooms = heur.bathrooms;

  return out;
}
export async function extractListingFromUrl(
  url: string,
  opts?: { timeoutMs?: number; maxBytes?: number }
) {
  const timeoutMs = Number(opts?.timeoutMs || TIMEOUT_MS);
  const maxBytes = Number(opts?.maxBytes || MAX_BYTES);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let host = "";
  let pageHref = url;
  try {
    const u = new URL(url);
    host = u.hostname;
    pageHref = u.toString();
  } catch {
    host = "";
    pageHref = url;
  }

  let r: Response;
  try {
    r = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome Safari",
        Accept: "text/html,application/xhtml+xml",
      },
    });
  } catch {
    clearTimeout(timer);
    throw new Error("FETCH: Could not reach the listing page (network or blocked).");
  } finally {
    clearTimeout(timer);
  }

  if (!r.ok) {
    if (r.status === 403 || r.status === 429) {
      throw new Error(
        "BLOCKED: This site blocks automated link fetch. Please use Paste text mode for this listing."
      );
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

  let title = cleanText(
    pickFirst(
      $('meta[property="og:title"]').attr("content"),
      $("h1").first().text(),
      $("title").first().text()
    )
  );

  let description = cleanMultilineText(
    pickFirst(
      $('meta[property="og:description"]').attr("content"),
      $('meta[name="description"]').attr("content"),
      root.text(),
      $("main").text(),
      $("article").text()
    )
  ).slice(0, 5000);

// Images: combine meta/OG, in-DOM images, and (later) JSON-LD images.
// Filter out common UI assets so we don't show broken placeholders in the UI.
const images = new Set<string>();
const imgCandidates: string[] = [];

// Meta / OG / Twitter / preload images
imgCandidates.push(...collectMetaImages($, url));

// In-DOM images
root.find("img").each((_: any, el: any) => {
  const $img = $(el);
  const raw =
    $img.attr("src") ||
    $img.attr("data-src") ||
    $img.attr("data-lazy") ||
    $img.attr("data-original") ||
    $img.attr("data-url") ||
    $img.attr("data-image") ||
    undefined;

  const srcset = $img.attr("srcset") || $img.attr("data-srcset");
  if (srcset) {
    const first = srcset.split(",")[0]?.trim().split(" ")[0];
    if (first) imgCandidates.push(first);
  }

  if (raw) imgCandidates.push(raw);
});

for (const raw of imgCandidates) {
  const abs = normalizeAbsoluteUrl(url, raw);
  if (!abs) continue;
  if (isProbablyListingImage(abs)) images.add(abs);
}

// If we filtered out everything, fall back to any absolute image candidate.
if (images.size === 0) {
  for (const raw of imgCandidates) {
    const abs = normalizeAbsoluteUrl(url, raw);
    if (!abs) continue;
    images.add(abs);
    if (images.size >= 8) break;
  }
}

  // JSON-LD
  const ld = readJsonLd($);
  let ldPrice: number | undefined;
  let ldCurrency: string | undefined;
  let ldCity: string | undefined;
  let ldNeighborhood: string | undefined;
  for (const obj of ld) {

// JSON-LD images (helps on sites that lazy-load carousels)
const pushImg = (v: any) => {
  if (!v) return;
  if (typeof v === "string") {
    const abs = normalizeAbsoluteUrl(url, v);
    if (abs && isProbablyListingImage(abs)) images.add(abs);
    return;
  }
  if (Array.isArray(v)) {
    for (const it of v) pushImg(it);
    return;
  }
  if (typeof v === "object") {
    const urlVal = (v as any).url || (v as any)["@id"] || (v as any).contentUrl;
    if (typeof urlVal === "string") pushImg(urlVal);
  }
};

pushImg((obj as any)?.image);
pushImg((obj as any)?.photo);
pushImg((obj as any)?.primaryImageOfPage);

    const offer = pickOffer(obj);
    if (offer) {
      const p = typeof offer.price === "string" ? parsePrice(offer.price) : Number(offer.price);
      if (Number.isFinite(p) && p > 0) ldPrice = p;
      const c = String(offer.priceCurrency || "").trim();
      if (c) ldCurrency = c.toUpperCase();
    }
    const addr = obj?.address;
    const locality = addr?.addressLocality || addr?.addressLocality?.name;
    const neigh = addr?.addressNeighborhood || addr?.addressNeighborhood?.name;
    if (locality && !ldCity) ldCity = String(locality).trim();
    if (neigh && !ldNeighborhood) ldNeighborhood = String(neigh).trim();
  }

  const metaPrice =
    $('meta[property="product:price:amount"]').attr("content") ||
    $('meta[property="og:price:amount"]').attr("content") ||
    $('meta[property="product:price"]').attr("content") ||
    "";

  const metaCurrency =
    $('meta[property="product:price:currency"]').attr("content") ||
    $('meta[property="og:price:currency"]').attr("content") ||
    $('meta[property="product:currency"]').attr("content") ||
    "";

  const isZillow = /(^|\.)zillow\.com$/i.test(host);
  const zOverrides = isZillow
    ? extractZillowOverrides($, {
        title,
        description,
        currency: parseCurrency(metaCurrency) || undefined,
        price: metaPrice ? parsePrice(metaPrice) : undefined,
      })
    : null;

  if (zOverrides?.title && zOverrides.title.length > title.length) title = cleanText(zOverrides.title);
  if (zOverrides?.description && zOverrides.description.length > description.length) description = cleanMultilineText(zOverrides.description);
  if (zOverrides?.image_urls?.length) {
    for (const u of zOverrides.image_urls) {
      const abs = normalizeAbsoluteUrl(url, u);
      if (abs) images.add(abs);
    }
  }

  const rootText = root.text();
  const bodyText = $("body").text();

  let price = ldPrice || (metaPrice ? parsePrice(metaPrice) : 0);
  if (typeof zOverrides?.price === 'number' && zOverrides.price > 0) price = zOverrides.price;

  // Guard against numeric IDs / sale prices accidentally parsed as "rent".
  if (price && !plausibleMonthlyPrice(price)) price = 0;

  let currency = (ldCurrency || parseCurrency(metaCurrency) || "").toUpperCase();
  if (!currency && typeof zOverrides?.currency === 'string' && zOverrides.currency) {
    currency = String(zOverrides.currency).toUpperCase();
  }

  // Normalize currency to ISO 4217-ish (3 letters) when present.
  if (currency && !/^[A-Z]{3}$/.test(currency)) currency = "";


  // ✅ main fix: price from scoped listing root first
  if (!price) {
    const scoped = pickBestMonthlyPrice(rootText);
    if (scoped.price) price = scoped.price;
    if (!currency && scoped.currency) currency = scoped.currency;
  }

  // last fallback: scan visible text for plausible monthly-rent patterns
  if (!price) {
    const fb = pickBestMonthlyPrice(rootText) || pickBestMonthlyPrice(bodyText);
    if (fb && plausibleMonthlyPrice(fb.price)) price = fb.price;
    if (!currency && fb?.currency) currency = fb.currency;
  }
  if (price && !plausibleMonthlyPrice(price)) price = 0;

  if (!currency) currency = (parseCurrency(rootText) || parseCurrency(bodyText) || "").toUpperCase();

  const addressHint = (zOverrides?.addressHint ?? extractAddressHint({ text: rootText || bodyText, jsonLd: ld })) || "";
const domBedsBaths = extractBedsBathsFromDom($, root);
const textBedsBaths = extractBedsBaths(`${title} ${rootText}`);
const bedsBaths = {
  bedrooms: zOverrides?.bedrooms ?? domBedsBaths.bedrooms ?? textBedsBaths.bedrooms,
  bathrooms: zOverrides?.bathrooms ?? domBedsBaths.bathrooms ?? textBedsBaths.bathrooms,
};

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
    if (!city && loc.city) city = loc.city;
    if (!neighborhood && loc.neighborhood) neighborhood = loc.neighborhood;
  }

  return {
    title: title || "Listing",
    description: description || "",
    price: price || 0,
    currency: currency || "CAD",
    city: city || "",
    neighborhood: neighborhood || "",
    addressHint,
    bedrooms: bedsBaths.bedrooms,
    bathrooms: bedsBaths.bathrooms,
    image_urls: Array.from(images).slice(0, 10),
  };
}

