import express from "express";
import fs from "node:fs";
import path from "node:path";
import { getRetentionStats, runRetentionSweep } from "../lib/retention.js";

export const adminRouter = express.Router();

function getBearerToken(authHeader: string | undefined): string {
  const h = String(authHeader || "").trim();
  if (!h) return "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? String(m[1] || "").trim() : "";
}

function requireAdmin(req: express.Request, res: express.Response, next: express.NextFunction) {
  const expected = String(process.env.ADMIN_TOKEN || "").trim();
  if (!expected) {
    // Hard-disable admin routes unless explicitly enabled
    return res.status(404).json({ error: "Admin endpoints are disabled" });
  }

  const headerToken = String(req.headers["x-admin-token"] || "").trim();
  const bearer = getBearerToken(req.headers.authorization);
  const token = headerToken || bearer;

  if (!token || token !== expected) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  return next();
}

adminRouter.use(requireAdmin);

adminRouter.get("/health", (_req, res) => res.json({ ok: true }));

adminRouter.get("/stats", (_req, res) => {
  try {
    const stats = getRetentionStats();
    return res.json({ ok: true, stats });
  } catch (e: any) {
    return res.status(500).json({ error: "stats failed", detail: e?.message || String(e) });
  }
});

adminRouter.post("/retention/sweep", express.json(), (req, res) => {
  try {
    const retentionDays = Number((req.body as any)?.retentionDays);
    const cacheRetentionDays = Number((req.body as any)?.cacheRetentionDays);
    const uploadsRetentionDays = Number((req.body as any)?.uploadsRetentionDays);

    const result = runRetentionSweep({
      retentionDays: Number.isFinite(retentionDays) && retentionDays > 0 ? Math.floor(retentionDays) : undefined,
      cacheRetentionDays: Number.isFinite(cacheRetentionDays) && cacheRetentionDays > 0 ? Math.floor(cacheRetentionDays) : undefined,
      uploadsRetentionDays: Number.isFinite(uploadsRetentionDays) && uploadsRetentionDays > 0 ? Math.floor(uploadsRetentionDays) : undefined,
    });

    return res.json({ ok: true, result });
  } catch (e: any) {
    return res.status(500).json({ error: "sweep failed", detail: e?.message || String(e) });
  }
});

adminRouter.get("/metrics/latest", (_req, res) => {
  try {
    const p = path.resolve(process.cwd(), "data", "metrics", "latest.json");
    if (!fs.existsSync(p)) return res.status(404).json({ error: "No metrics yet" });
    const json = JSON.parse(fs.readFileSync(p, "utf-8"));
    return res.json({ ok: true, metrics: json });
  } catch (e: any) {
    return res.status(500).json({ error: "metrics read failed", detail: e?.message || String(e) });
  }
});
