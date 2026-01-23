import { Router } from "express";
import { extractListingFromUrl, isSafePublicUrl } from "../services/extractListing.js";

export const extractRouter = Router();

extractRouter.get("/extract", async (req, res) => {
  const url = String(req.query.url || "").trim();

  if (!url) return res.status(400).send("Missing url parameter.");
  if (!isSafePublicUrl(url)) {
    return res.status(400).send("Invalid or blocked URL. Please paste a public https listing link.");
  }

  try {
    // Link fetch is best-effort. Some marketplaces block server-side scraping.
    // Timeout is handled inside extractListingFromUrl().
    const listing = await extractListingFromUrl(url);
    return res.json(listing);
  } catch (e: any) {
    const msg = e?.message || String(e);
    if (msg.startsWith("BLOCKED:")) {
      return res.json({ blocked: true, message: msg.replace(/^BLOCKED:\s*/i, "") });
    }
    if (msg.startsWith("FETCH:")) {
      return res.json({ blocked: true, message: msg.replace(/^FETCH:\s*/i, "") });
    }
    return res.json({ blocked: true, message: msg });
  }
});
