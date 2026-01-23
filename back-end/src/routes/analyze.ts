import express from "express";
import fs from "node:fs";
import path from "node:path";
import multer from "multer";
import { analyzeListing } from "../lib/scoring/score.js";
import type { Listing } from "../lib/scoring/types.js";
import { appendJsonl, readJsonl } from "../lib/storage.js";
import { readAnalysis, writeAnalysis } from "../lib/analysisStore.js";
import { queueEnrichment } from "../services/enrich/runner.js";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 6 * 1024 * 1024 } });
export const analyzeRouter = express.Router();

const listingsPath = path.resolve(process.cwd(), "data", "listings.json");

function normalizeListingInput(input: any): Listing {
  const l = { ...(input || {}) } as any;

  // URL fields (extractor / extension use different keys)
  const url = l.source_url || l.url || l.sourceUrl || l.sourceURL || "";
  if (url) {
    l.source_url = url;
    l.url = url; // used by crosspost/enrichment
  }

  // Address/location hint fields
  const addr = l.address_hint || l.addressHint || l.address || "";
  if (addr) {
    l.address_hint = addr;
    l.addressHint = addr;
  }

  // Coerce common numeric fields
  if (typeof l.price === "string") {
    const n = Number(String(l.price).replace(/[\s,]/g, ""));
    if (Number.isFinite(n)) l.price = n;
  }
  if (typeof l.bedrooms === "string") {
    const n = Number(String(l.bedrooms));
    if (Number.isFinite(n)) l.bedrooms = n;
  }
  if (typeof l.bathrooms === "string") {
    const n = Number(String(l.bathrooms));
    if (Number.isFinite(n)) l.bathrooms = n;
  }

  // Normalise missing strings
  l.title = String(l.title || "");
  l.description = String(l.description || "");
  l.currency = String(l.currency || "");
  l.city = l.city ? String(l.city) : undefined;
  l.neighborhood = l.neighborhood ? String(l.neighborhood) : undefined;

  return l as Listing;
}

function getDemoListings(): any[] {
  return JSON.parse(fs.readFileSync(listingsPath, "utf-8"));
}

function buildKnownHashes(): string[] {
  const analyses = readJsonl("analyses");
  const hashes: string[] = [];
  for (const a of analyses) if (Array.isArray(a.imageHashes)) hashes.push(...a.imageHashes);
  return hashes.slice(-2000);
}

function ddgEnabled() {
  return String(process.env.WEB_VERIFY_DDG_ENABLED || "true").toLowerCase() !== "false";
}

function hasPaidKeys() {
  return Boolean(
    String(process.env.SERPER_API_KEY || "").trim() ||
      String(process.env.BRAVE_API_KEY || process.env.BRAVE_SEARCH_API_KEY || "").trim()
  );
}

analyzeRouter.post("/analyze", upload.array("images", 6), async (req, res) => {
  try {
    let listing: Listing | null = null;

    if (req.is("application/json")) {
      const body = req.body as any;
      if (body?.listingId) listing = getDemoListings().find((l) => l.id === body.listingId) || null;
      else if (body?.listing) listing = body.listing;
    } else {
      const listingStr = (req.body as any).listing;
      if (listingStr) listing = JSON.parse(listingStr);
      const listingId = (req.body as any).listingId;
      if (!listing && listingId) listing = getDemoListings().find((l) => l.id === listingId) || null;
    }

    if (!listing) return res.status(400).json({ error: "Provide listingId or listing" });

    // Normalize field names so scoring/enrichment see consistent data
    listing = normalizeListingInput(listing);

    const files = (req.files as Express.Multer.File[]) || [];
    const buffers: Buffer[] = [];

    if (files.length === 0 && Array.isArray((listing as any).image_urls)) {
      for (const u of (listing as any).image_urls as string[]) {
        const local = path.resolve(process.cwd(), "public", u.replace(/^\//, ""));
        if (fs.existsSync(local)) buffers.push(fs.readFileSync(local));
      }
    } else {
      for (const f of files) buffers.push(f.buffer);
    }

    const knownHashes = buildKnownHashes();
    const base = await analyzeListing(listing, buffers, knownHashes);

    // Decide whether to queue cross-site verification
    const webEnabled = process.env.WEB_VERIFY_ENABLED !== "false";
    const paid = hasPaidKeys();
    const ddg = ddgEnabled();
    const hasAnyProvider = paid || ddg;

    const low = Number(process.env.CROSSPOST_THRESHOLD_LOW || "0.45");
    const high = Number(process.env.CROSSPOST_THRESHOLD_HIGH || "0.60");

    const mode: "serper" | "both" | undefined =
      base.riskProbability >= high ? "both" : base.riskProbability >= low ? "serper" : undefined;

    const shouldVerify = Boolean(mode) && webEnabled && hasAnyProvider;

    const enrichmentReason = !webEnabled
      ? "WEB_VERIFY_ENABLED=false"
      : !hasAnyProvider
        ? "No web verification providers configured"
        : shouldVerify && !paid && ddg
          ? "Using free DuckDuckGo fallback (no API keys)"
          : !mode
            ? `Risk probability below threshold (${low})`
            : undefined;

    const analysis = {
      ...base,
      enrichmentStatus: shouldVerify ? ("queued" as const) : ("skipped" as const),
      enrichmentMode: shouldVerify ? mode : undefined,
      enrichmentReason,
    };

    // Persist: a full json by id + an append-only log
    writeAnalysis(analysis.analysisId, analysis);
    appendJsonl("analyses", analysis);

    if (shouldVerify) queueEnrichment(analysis.analysisId);

    res.json(analysis);
  } catch (e: any) {
    res.status(500).json({ error: "Analyze failed", detail: e?.message || String(e) });
  }
});

// Retrieve latest analysis (supports enrichment polling)
analyzeRouter.get("/analysis/:analysisId", (req, res) => {
  const { analysisId } = req.params;
  const a = readAnalysis(analysisId);
  if (!a) return res.status(404).json({ error: "Not found" });
  res.json(a);
});

// Manually trigger verification
analyzeRouter.post("/verify", express.json(), (req, res) => {
  const analysisId = String((req.body as any)?.analysisId || "").trim();
  if (!analysisId) return res.status(400).json({ error: "analysisId required" });
  const a = readAnalysis(analysisId);
  if (!a) return res.status(404).json({ error: "Not found" });

  const webEnabled = process.env.WEB_VERIFY_ENABLED !== "false";
  const paid = hasPaidKeys();
  const ddg = ddgEnabled();
  const hasAnyProvider = paid || ddg;

  if (!webEnabled) {
    const patched = { ...a, enrichmentStatus: "skipped" as const, enrichmentReason: "WEB_VERIFY_ENABLED=false" };
    writeAnalysis(analysisId, patched);
    return res.json(patched);
  }

  if (!hasAnyProvider) {
    const patched = {
      ...a,
      enrichmentStatus: "skipped" as const,
      enrichmentReason: "No web verification providers configured",
    };
    writeAnalysis(analysisId, patched);
    return res.json(patched);
  }

  const patched = {
    ...a,
    enrichmentStatus: "queued" as const,
    enrichmentReason: !paid && ddg ? "Using free DuckDuckGo fallback (no API keys)" : undefined,
    enrichmentMode: "both" as const,
    enrichmentForced: true,
  };

  writeAnalysis(analysisId, patched);
  queueEnrichment(analysisId);
  res.json(patched);
});
