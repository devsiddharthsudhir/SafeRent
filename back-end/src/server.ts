import compression from "compression";
import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import { nanoid } from "nanoid";
import fs from "node:fs";
import path from "node:path";

import { adminRouter } from "./routes/admin.js";
import { analyzeRouter } from "./routes/analyze.js";
import { demoRouter } from "./routes/demo.js";
import { extractRouter } from "./routes/extract.js";
import { feedbackRouter } from "./routes/feedback.js";
import { leaseRouter } from "./routes/lease.js";
import { reportRouter } from "./routes/report.js";
import { reputationRouter } from "./routes/reputation.js";
import { similarRouter } from "./routes/similar.js";

import { runEnvChecks } from "./lib/envCheck.js";
import { maybeScheduleRetentionSweep } from "./lib/retention.js";

// Robust .env loader: tries cwd/.env AND cwd/back-end/.env
function loadDotEnv() {
  const candidates = [
    path.resolve(process.cwd(), ".env"),
    path.resolve(process.cwd(), "back-end", ".env"),
  ];

  for (const p of candidates) {
    try {
      if (!fs.existsSync(p)) continue;
      const raw = fs.readFileSync(p, "utf-8");
      for (const line of raw.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eq = trimmed.indexOf("=");
        if (eq <= 0) continue;

        const k = trimmed.slice(0, eq).trim();
        let v = trimmed.slice(eq + 1).trim();
        if (!k) continue;

        if (
          (v.startsWith("\"") && v.endsWith("\"")) ||
          (v.startsWith("'") && v.endsWith("'"))
        ) {
          v = v.slice(1, -1);
        }

        if (process.env[k] == null) process.env[k] = v;
      }
      return;
    } catch {
      // ignore
    }
  }
}

loadDotEnv();

const app = express();
app.set("trust proxy", 1);
app.disable("x-powered-by");

const originEnv = String(process.env.CORS_ORIGIN || "");
const allowedOrigins = originEnv
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

runEnvChecks();

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
  })
);
app.use(compression());
app.use(express.json({ limit: "2mb" }));

// Request ID + structured logging
app.use((req: Request, res: Response, next: NextFunction) => {
  const rid = String(req.headers["x-request-id"] || "").trim() || nanoid(10);
  (req as any).requestId = rid;
  res.setHeader("x-request-id", rid);

  const t0 = Date.now();
  res.on("finish", () => {
    const ms = Date.now() - t0;
    console.log(
      JSON.stringify({
        t: new Date().toISOString(),
        rid,
        ip: req.ip,
        method: req.method,
        path: req.originalUrl,
        status: res.statusCode,
        ms,
      })
    );
  });

  next();
});

app.use(
  cors({
    origin: (origin: string | undefined, cb: (err: Error | null, allow?: boolean) => void) => {
      if (!origin) return cb(null, true);
      if (allowedOrigins.length === 0) return cb(null, true);

      const ok = allowedOrigins.includes(origin);
      return cb(ok ? null : new Error("CORS blocked"), ok);
    },
  })
);

// Normalize CORS errors as JSON
app.use((err: unknown, req: Request, res: Response, next: NextFunction) => {
  const msg = err instanceof Error ? err.message : String((err as any)?.message || "");
  if (msg.includes("CORS")) {
    return res.status(403).json({
      error: "CORS blocked",
      requestId: (req as any).requestId,
    });
  }
  return next(err as any);
});

/** ✅ Add these: friendly root endpoints (stops Render "/" spam + makes /api not look broken) */
app.get("/", (_req: Request, res: Response) => {
  res.status(200).type("text/plain; charset=utf-8").send("SafeRent API is running.");
});
app.head("/", (_req: Request, res: Response) => res.status(200).end());

app.get("/health", (_req: Request, res: Response) => res.json({ ok: true }));

// This makes /api and /api/ return something useful (instead of 404)
app.get("/api", (_req: Request, res: Response) => {
  res.status(200).json({
    ok: true,
    message: "SafeRent API base. Try /api/health",
    endpoints: ["/api/health", "/api/demo/listings"],
  });
});
app.head("/api", (_req: Request, res: Response) => res.status(200).end());

app.use(
  rateLimit({
    windowMs: 60_000,
    limit: 120,
    standardHeaders: "draft-7",
    legacyHeaders: false,
  })
);

const heavyLimit = Number(process.env.RATE_LIMIT_HEAVY_PER_MIN || 30);
const heavyLimiter = rateLimit({
  windowMs: 60_000,
  limit: Number.isFinite(heavyLimit) ? heavyLimit : 30,
  standardHeaders: "draft-7",
  legacyHeaders: false,
});

app.use("/api/analyze", heavyLimiter);
app.use("/api/verify", heavyLimiter);
app.use("/api/extract", heavyLimiter);
app.use("/api/lease", heavyLimiter);
app.use("/api/similar", heavyLimiter);

app.get("/api/health", (_req: Request, res: Response) =>
  res.json({ ok: true, name: "RentPulse API" })
);

app.use("/api/demo", demoRouter);
app.use("/api", analyzeRouter);
app.use("/api", feedbackRouter);
app.use("/api", reputationRouter);
app.use("/api", reportRouter);
app.use("/api", leaseRouter);
app.use("/api", extractRouter);
app.use("/api", similarRouter);

app.use("/api/admin", adminRouter);

maybeScheduleRetentionSweep();

const port = process.env.PORT ? Number(process.env.PORT) : 4000;

app.use((req: Request, res: Response) => {
  res.status(404).json({
    error: "Not found",
    path: req.originalUrl,
    requestId: (req as any).requestId,
  });
});

app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
  const raw = Number((err as any)?.status || (err as any)?.statusCode || 500);
  const status = raw >= 400 && raw <= 599 ? raw : 500;
  const isProd = String(process.env.NODE_ENV || "").toLowerCase() === "production";
  const message = err instanceof Error ? err.message : String((err as any)?.message || "");

  console.error(
    JSON.stringify({ t: new Date().toISOString(), rid: (req as any).requestId, level: "error", msg: message })
  );

  res.status(status).json({
    error: status >= 500 ? "Server error" : (message || "Request failed"),
    requestId: (req as any).requestId,
    ...(isProd ? {} : { detail: message }),
  });
});

app.listen(port, () => {
  console.log(`RentPulse backend on http://localhost:${port}`);
});

