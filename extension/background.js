// Default target (can be overridden in the extension Settings page)
// IMPORTANT:
// - Local dev:    http://localhost:5173/import
// - Production:   https://<your-domain>/import
//
// If you see DNS_PROBE_FINISHED_NXDOMAIN, your domain is not pointed to your deployed site yet.
// Open the extension Options and set the correct app URL (or fix DNS for your domain).
const DEFAULT_IMPORT_URL = "http://localhost:5173/import";
const KEY = "appImportUrl";

function getOptionsUrl(params = {}) {
  const u = new URL(chrome.runtime.getURL("options.html"));
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    u.searchParams.set(String(k), String(v));
  }
  return u.toString();
}

function normalizeImportUrl(input) {
  let v = String(input || "").trim();
  if (!v) v = DEFAULT_IMPORT_URL;
  if (!/^https?:\/\//i.test(v)) v = `https://${v}`;
  try {
    const u = new URL(v);
    // Accept either base URL (e.g. https://example.com) or full import URL
    const p = u.pathname || "/";
    if (!/\/import\/?$/i.test(p)) {
      u.pathname = p.replace(/\/+$/, "") + "/import";
    }
    // Strip any query/hash from the configured URL
    u.search = "";
    u.hash = "";
    return u.toString();
  } catch {
    return v;
  }
}

async function canReach(urlStr, timeoutMs = 2500) {
  try {
    const u = new URL(urlStr);
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeoutMs);
    // DNS failures will reject. CORS is irrelevant since we only need reachability.
    await fetch(u.origin, { method: "HEAD", mode: "no-cors", signal: controller.signal });
    clearTimeout(t);
    return true;
  } catch {
    return false;
  }
}

async function getImportUrl() {
  try {
    const { appImportUrl } = await chrome.storage.sync.get(KEY);
    const v = String(appImportUrl || "").trim();
    return normalizeImportUrl(v || DEFAULT_IMPORT_URL);
  } catch {
    return normalizeImportUrl(DEFAULT_IMPORT_URL);
  }
}

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id || !tab.url) return;

  const APP_IMPORT_URL = await getImportUrl();

  // If the app URL isn't reachable (common when DNS isn't configured yet),
  // open Options so you can set the correct deployed URL.
  const ok = await canReach(APP_IMPORT_URL);
  if (!ok) {
    await chrome.tabs.create({
      url: getOptionsUrl({ reason: "unreachable", target: APP_IMPORT_URL }),
    });
    return;
  }

  let result;
  try {
    const out = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        const pick = (...vals) =>
          vals.find((v) => typeof v === "string" && v.trim())?.trim() || "";

        const textSel = (sel) => {
          const el = document.querySelector(sel);
          const t = el?.textContent || el?.innerText || "";
          return String(t || "").trim();
        };

        const attrSel = (sel, attr) => {
          const el = document.querySelector(sel);
          return String(el?.getAttribute(attr) || "").trim();
        };

        const normalize = (s) => String(s || "").replace(/\s+/g, " ").trim();
const cleanMultilineText = (s) => {
  const t = String(s || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return t
    .split("\n")
    .map((line) => line.replace(/[ \t]{2,}/g, " ").trimEnd())
    .join("\n")
    .trim();
};
const sliceBetweenHeadings = (raw, startHeading, endHeadings) => {
  const text = String(raw || "");
  const lower = text.toLowerCase();
  const startIdx = lower.indexOf(String(startHeading || "").toLowerCase());
  if (startIdx < 0) return "";
  const after = text.slice(startIdx + String(startHeading || "").length);
  const afterLower = after.toLowerCase();
  let endIdx = after.length;
  for (const h of endHeadings || []) {
    const j = afterLower.indexOf(String(h || "").toLowerCase());
    if (j >= 0 && j < endIdx) endIdx = j;
  }
  return after.slice(0, endIdx);
};

        const parsePrice = (t) => {
          const s = String(t || "").replace(/\u00a0/g, " ");
          // Prefer prices that look monthly, but accept any reasonable currency-formatted number.
          const monthly = s.match(/(?:C\$|US\$|\$)\s*([0-9]{1,3}(?:[\s,][0-9]{3})+|[0-9]{3,6})(?:\.\d{1,2})?\s*(?:\/mo|per\s*month|monthly|\/month)?/i);
          const plain = !monthly ? s.match(/\b([0-9]{1,3}(?:[\s,][0-9]{3})+|[0-9]{3,6})\b/) : null;
          const raw = (monthly?.[1] || plain?.[1] || "").toString();
          const n = Number(raw.replace(/[^0-9]/g, ""));
          if (!Number.isFinite(n)) return 0;
          if (n < 50 || n > 50000) return 0;
          return n;
        };

        const parseCurrency = (t) => {
          const s = String(t || "");
          if (/\bCAD\b/i.test(s) || /C\$/i.test(s)) return "CAD";
          if (/\bUSD\b/i.test(s) || /US\$/i.test(s)) return "USD";
          if (/\bEUR\b/i.test(s)) return "EUR";
          if (/\bGBP\b/i.test(s)) return "GBP";
          return "";
        };

        const readJsonLd = () => {
          const scripts = Array.from(document.querySelectorAll('script[type="application/ld+json"]'));
          for (const s of scripts) {
            const raw = s.textContent || "";
            if (!raw.trim()) continue;
            try {
              const j = JSON.parse(raw);
              const stack = Array.isArray(j) ? [...j] : [j];
              while (stack.length) {
                const it = stack.shift();
                if (!it) continue;
                if (Array.isArray(it)) {
                  stack.push(...it);
                  continue;
                }
                if (it['@graph']) {
                  stack.push(it['@graph']);
                  continue;
                }
                const offers = it.offers || it.offer || null;
                const o = Array.isArray(offers) ? offers[0] : offers;
                const price = o?.price ?? o?.priceSpecification?.price;
                const currency = o?.priceCurrency ?? o?.priceSpecification?.priceCurrency;
                const addr = it.address || it.location?.address;
                const street = typeof addr === "string" ? addr : addr?.streetAddress;
                const city = addr?.addressLocality;
                const region = addr?.addressRegion;
                const neigh = addr?.addressNeighborhood;
                return {
                  price,
                  currency,
                  addressHint: normalize([street, city, region].filter(Boolean).join(", ")),
                  city,
                  neighborhood: neigh || "",
                  region,
                };
              }
            } catch {}
          }
          return null;
        };

        const PROV = ["BC","ON","AB","QC","MB","SK","NS","NB","NL","PE","NT","NU","YT"];
        const parseLocation = (txt) => {
          const s = normalize(txt || "").replace(/\u00a0/g, " ");
          if (!s) return {};
          const provAlt = PROV.join("|");
          let m = s.match(new RegExp(`\\b([A-Z][A-Za-z]+(?:[\\s-][A-Z][A-Za-z]+){0,3})\\s*,\\s*(${provAlt})\\b`));
          if (!m) m = s.match(new RegExp(`\\b([A-Z][A-Za-z]+(?:[\\s-][A-Z][A-Za-z]+){0,3})\\s+(${provAlt})\\b`));
          if (m) return { city: m[1].trim(), region: m[2].trim() };
          const n = s.match(/\b(?:neighbourhood|neighborhood)\s*[:\-]\s*([^\n\|,]{2,60})/i);
          if (n) return { neighborhood: normalize(n[1]) };
          return {};
        };

        const images = [];
        const ogImage = attrSel('meta[property="og:image"]', "content");
        if (ogImage) images.push(ogImage);
        document.querySelectorAll("img").forEach((img) => {
          const src = img.getAttribute("src") || img.getAttribute("data-src") || img.getAttribute("data-lazy-src");
          if (!src || src.startsWith("data:")) return;
          try {
            images.push(new URL(src, location.href).toString());
          } catch {}
        });

        const host = location.hostname;
        const bodyRaw = String(document.body?.innerText || "");
        const bodyText = normalize(bodyRaw);

        let title = "";
        let description = "";
        let addressHint = "";
        let price = 0;
        let currency = "";

        // ---- Site-specific extraction (best effort) ----
        if (/zumper\.com$/i.test(host)) {
          title = pick(textSel("h1"), textSel("[data-testid='listing-title']"), document.title);
          addressHint = pick(textSel("[data-testid='listing-address']"), textSel("[data-testid='property-address']"));
          const ptxt = pick(textSel("[data-testid='listing-price']"), textSel("[data-testid='price']"));
          price = parsePrice(ptxt);
          currency = parseCurrency(ptxt);
          description = pick(textSel("[data-testid='listing-description']"), textSel("main"));
        } else if (/rentals\.ca$/i.test(host)) {
          title = pick(textSel("h1"), document.title);
          addressHint = pick(textSel("[data-testid='address']"), textSel(".address"));
          const ptxt = pick(textSel("[data-testid='price']"), textSel(".price"), attrSel('meta[property="product:price:amount"]', "content"));
          price = parsePrice(ptxt);
          currency = parseCurrency(ptxt);
          description = pick(textSel(".description"), textSel("main"));
        } else if (/kijiji\.ca$/i.test(host)) {
          title = pick(textSel("h1"), document.title);
          const ptxt = pick(
            textSel("[data-testid='vip-price']"),
            textSel("[class*='price']"),
            attrSel('meta[property="product:price:amount"]', "content")
          );
          price = parsePrice(ptxt);
          currency = parseCurrency(ptxt) || "CAD";
          addressHint = pick(textSel("[data-testid='address']"), textSel("[class*='location']"));
          description = pick(textSel("[data-testid='vip-description']"), textSel("main"));
        } else if (/rentfaster\.ca$/i.test(host)) {
          title = pick(textSel("h1"), document.title);
          const ptxt = pick(textSel("[class*='price']"), textSel(".price"));
          price = parsePrice(ptxt);
          currency = parseCurrency(ptxt) || "CAD";
          addressHint = pick(textSel("[class*='address']"), textSel("[class*='location']"));
          description = pick(textSel("[class*='description']"), textSel("main"));
        } else if (/zillow\.com$/i.test(host)) {
          title = pick(
            textSel("h1"),
            attrSel('meta[property="og:title"]', "content"),
            document.title
          );
          addressHint = pick(
            textSel("[data-testid='address']"),
            textSel("[data-testid*='address']"),
            attrSel('meta[property="og:street-address"]', "content"),
            ""
          );

          // Price signals (many Zillow pages include one of these)
          const hint = pick(
            attrSel('meta[property="og:price:amount"]', "content"),
            attrSel('meta[property="product:price:amount"]', "content"),
            attrSel('meta[name="twitter:data1"]', "content"),
            textSel("[data-testid='price']"),
            textSel("[data-testid*='price']"),
            ""
          );
          const bodyMonthly =
            bodyText.match(/(?:C\$|US\$|\$)\s*[0-9][0-9,\s]{2,10}\s*\/(?:mo|month)\b/i)?.[0] ||
            bodyText.match(/\b\d{3,6}\s*\/(?:mo|month)\b/i)?.[0] ||
            "";
          price = parsePrice(hint) || parsePrice(bodyMonthly);
          currency = parseCurrency(hint) || parseCurrency(bodyMonthly) || parseCurrency(bodyText) || "CAD";

          // Description (prefer the visible “Room details” block)
          const roomDetails = cleanMultilineText(
            sliceBetweenHeadings(bodyRaw, "Room details", [
              "Facts & features",
              "Services availability",
              "Costs & fees breakdown",
              "What's special",
              "Similar rentals",
              "Similar homes",
            ])
          )
            .replace(/^\s*room details\s*/i, "")
            .trim();

          description = pick(
            roomDetails,
            textSel("[data-testid='description']"),
            textSel("[data-testid*='description']"),
            attrSel('meta[property="og:description"]', "content"),
            attrSel('meta[name="description"]', "content"),
            textSel("main"),
            ""
          );
        } else if (/facebook\.com$/i.test(host)) {
          // FB Marketplace is highly dynamic; best-effort only
          title = pick(textSel("h1"), document.title);
          const ptxt = bodyText.match(/\$\s*\d{3,6}/)?.[0] || "";
          price = parsePrice(ptxt);
          currency = parseCurrency(ptxt) || "CAD";
          description = pick(textSel("[role='main']"), "");
        }

        // ---- Fallback generic extraction ----
        if (!title) {
          const ogTitle = attrSel('meta[property="og:title"]', "content");
          title = pick(ogTitle, textSel("h1"), document.title) || "Listing";
        }

        if (!description) {
          const ogDesc = attrSel('meta[property="og:description"]', "content");
          description = pick(
            ogDesc,
            attrSel('meta[name="description"]', "content"),
            textSel("main"),
            textSel("article")
          );
        }

        description = cleanMultilineText(description).slice(0, 3200);

        const ld = readJsonLd();
        if (!price) {
          const metaPrice =
            attrSel('meta[property="product:price:amount"]', "content") ||
            attrSel('meta[name="price"]', "content") ||
            attrSel('meta[itemprop="price"]', "content") ||
            "";
          price = Number(ld?.price) || parsePrice(metaPrice) || parsePrice(bodyText);
        }
        if (!currency) {
          const metaCurrency =
            attrSel('meta[property="product:price:currency"]', "content") ||
            attrSel('meta[itemprop="priceCurrency"]', "content") ||
            "";
          currency = String(ld?.currency || "") || parseCurrency(metaCurrency) || parseCurrency(bodyText) || "CAD";
        }

        if (!addressHint) {
          addressHint = pick(ld?.addressHint, "");
        }
        if (!addressHint) {
          const m = bodyText.match(/\b\d{1,6}\s+[A-Za-z0-9.\- ]{2,35}\s+(Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Crescent|Cres|Court|Ct|Way|Place|Pl)\b[^\n]{0,30}/i);
          if (m) addressHint = normalize(m[0]).slice(0, 120);
        }

        // Beds/baths guess (light)
        const bb = (title + " " + description).toLowerCase();
        const bed = bb.match(/\b(\d{1,2})\s*(bed|beds|br)\b/);
        const bath = bb.match(/\b(\d{1,2})(?:\.5)?\s*(bath|baths|ba)\b/);
        const bedrooms = bed ? Number(bed[1]) : undefined;
        const bathrooms = bath ? Number(bath[1]) : undefined;

        let city = ld?.city ? String(ld.city) : "";
        let neighborhood = ld?.neighborhood ? String(ld.neighborhood) : "";

        // Fill in missing city/neighborhood from address hints and page text
        const loc = parseLocation([addressHint, title, description, document.title].join(" \n"));
        if (!city && loc.city) city = loc.city;
        if (!neighborhood && loc.neighborhood) neighborhood = loc.neighborhood;

        const uniqImagesBase = Array.from(new Set(images)).filter(
          (u) => /^https?:\/\//i.test(u) && u.length <= 600
        );
        let uniqImages = uniqImagesBase;
        if (/zillow\.com$/i.test(host)) {
          const z = uniqImagesBase.filter((u) =>
            /zillowstatic\.com|photos\.zillowstatic\.com/i.test(u)
          );
          if (z.length >= 3) uniqImages = z;
        }

        return {
          url: location.href,
          title,
          description: cleanMultilineText(description).slice(0, 3200),
          price: price || 0,
          currency: String(currency || "").toUpperCase(),
          city,
          neighborhood,
          addressHint,
          bedrooms,
          bathrooms,
          image_urls: uniqImages.slice(0, 10),
        };
      },
    });
    result = out?.[0]?.result;
  } catch {
    // If script injection fails (blocked page), fall back to URL-only import.
    result = { url: tab.url };
  }

  const payload = encodeURIComponent(JSON.stringify(result || { url: tab.url }));
  chrome.tabs.create({ url: `${APP_IMPORT_URL}?data=${payload}` });
});
