import express from "express";
import { readJsonl } from "../lib/storage.js";
export const reportRouter = express.Router();
function verdictText(v) {
    // Plain language, non-absolute wording (avoid defamation/over-claims)
    if (v === "likely_scam")
        return "High risk indicators";
    if (v === "likely_predatory")
        return "Higher risk indicators";
    if (v === "likely_legit")
        return "Fewer risk indicators";
    return "Needs verification";
}
function safeStr(x) {
    if (x === null || x === undefined)
        return "";
    return String(x);
}
function fmtMoney(currency, price) {
    const cur = (currency || "CAD").toUpperCase();
    const n = Number(price);
    if (!Number.isFinite(n))
        return `${cur} ${safeStr(price)}`.trim();
    try {
        return new Intl.NumberFormat("en-CA", { style: "currency", currency: cur, maximumFractionDigits: 0 }).format(n);
    }
    catch {
        return `${cur} ${Math.round(n)}`;
    }
}
function asBullets(items, fallback) {
    if (!items || !items.length)
        return [`- ${fallback}`];
    return items.map((x) => `- ${safeStr(x)}`);
}
function mdEscape(s) {
    // minimal escape for markdown bullets/headers (keep readable)
    return s.replace(/\r\n/g, "\n");
}
function fmtDateUtc(iso) {
    const s = safeStr(iso);
    if (!s)
        return "";
    return s.replace("T", " ").replace("Z", " UTC");
}
reportRouter.get("/report/:analysisId", (req, res) => {
    const analysisId = req.params.analysisId;
    const analyses = readJsonl("analyses");
    const a = analyses.find(x => x.analysisId === analysisId);
    if (!a)
        return res.status(404).json({ error: "Not found" });
    // Prefer top contributing signals when available
    const signals = Array.isArray(a.signals) ? a.signals.slice() : [];
    signals.sort((s1, s2) => Math.abs(Number(s2?.contribution || 0)) - Math.abs(Number(s1?.contribution || 0)));
    const topReasons = Array.isArray(a.topReasons) ? a.topReasons.slice(0, 6) : [];
    const topSignals = signals.slice(0, 12);
    const listing = a.listing || {};
    const area = `${safeStr(listing.city)}${listing.neighborhood ? ` · ${safeStr(listing.neighborhood)}` : ""}`.trim();
    const md = [
        `## Analysis summary`,
        `**Result:** ${verdictText(safeStr(a.verdict))}  `,
        `**Risk score:** ${safeStr(a.riskScore)}/100  `,
        `**Checked:** ${fmtDateUtc(a.createdAt)}`,
        a?.confidenceLabel ? `**Confidence:** ${safeStr(a.confidenceLabel)}  ` : "",
        "",
        `## Listing`,
        listing.source_url ? `- **URL:** ${mdEscape(safeStr(listing.source_url))}` : "",
        `- **Title:** ${mdEscape(safeStr(listing.title))}`,
        `- **Price:** ${fmtMoney(listing.currency, listing.price)}${listing.bedrooms !== undefined ? ` · ${safeStr(listing.bedrooms)} bd` : ""}${listing.bathrooms !== undefined ? ` · ${safeStr(listing.bathrooms)} ba` : ""}`,
        area ? `- **Area:** ${mdEscape(area)}` : "",
        listing.address_hint ? `- **Address (hint):** ${mdEscape(safeStr(listing.address_hint))}` : "",
        "",
        `## Why this may be risky`,
        ...asBullets(topReasons, "No specific top reasons were recorded for this run."),
        "",
        `## Evidence (signals)`,
        ...(topSignals.length
            ? topSignals.map((s) => {
                const sev = safeStr(s.severity || "").toUpperCase();
                const cat = safeStr(s.category || "");
                const label = mdEscape(safeStr(s.label || s.id || "Signal"));
                const why = mdEscape(safeStr(s.why_it_matters || ""));
                const ev = safeStr(s.evidence);
                const line1 = `- **${label}**${cat ? ` (${cat})` : ""}${sev ? ` — ${sev}` : ""}: ${why}`.trim();
                if (!ev)
                    return line1;
                return `${line1}\n  - Evidence: ${mdEscape(ev)}`;
            })
            : [`- No signal breakdown available.`]),
        "",
        `## What to do next`,
        ...asBullets(Array.isArray(a.recommendedActions) ? a.recommendedActions : [], "Do an in-person viewing (or live video tour) before paying anything."),
        "",
        ...(Array.isArray(a.redundancySteps) && a.redundancySteps.length
            ? [
                `## If results look off (redundancy checks)`,
                ...asBullets(a.redundancySteps, ""),
                "",
            ]
            : []),
        ...(Array.isArray(a.dataQualityHints) && a.dataQualityHints.length
            ? [
                `## Data quality notes`,
                ...asBullets(a.dataQualityHints, ""),
                "",
            ]
            : []),
        ...(Array.isArray(a.crossposts) && a.crossposts.length
            ? [
                `## Possible cross-posts / similar listings`,
                ...a.crossposts.slice(0, 6).map((m) => {
                    const sim = Number(m?.similarity);
                    const simTxt = Number.isFinite(sim) ? ` (similarity ${Math.round(sim * 100)}%)` : "";
                    const priceTxt = m?.price ? ` · ${fmtMoney(m.currency || listing.currency, m.price)}` : "";
                    return `- ${mdEscape(safeStr(m.url))}${priceTxt}${simTxt}`;
                }),
                "",
            ]
            : []),
        `## Privacy reminder`,
        `- Remove personal identifiers (passport, SIN, bank info) before sharing reports or screenshots.`,
        `- This report is informational and does not prove fraud.`
    ]
        .filter(Boolean)
        .join("\n");
    res.json({ analysisId, markdown: md, analysis: a });
});
