import compression from "compression";
import cors from "cors";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import path from "node:path";
import { nanoid } from "nanoid";
import { analyzeRouter } from "./routes/analyze.js";
import { demoRouter } from "./routes/demo.js";
import { feedbackRouter } from "./routes/feedback.js";
import { reportRouter } from "./routes/report.js";
import { reputationRouter } from "./routes/reputation.js";
import { leaseRouter } from "./routes/lease.js";
import { adminRouter } from "./routes/admin.js";
import { maybeScheduleRetentionSweep } from "./lib/retention.js";
import { runEnvChecks } from "./lib/envCheck.js";
// ✅ add this
import { extractRouter } from "./routes/extract.js";
const app = express();
// Behind Netlify/Render/etc, trust the proxy so req.ip + rate limits work.
app.set("trust proxy", 1);
app.disable("x-powered-by");
const originEnv = process.env.CORS_ORIGIN || "";
const allowedOrigins = originEnv
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);
runEnvChecks();
app.use(helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
}));
app.use(compression());
app.use(express.json({ limit: "2mb" }));
// Request ID + structured request logging (no bodies)
app.use((req, res, next) => {
    const rid = String(req.headers["x-request-id"] || "").trim() || nanoid(10);
    req.requestId = rid;
    res.setHeader("x-request-id", rid);
    const t0 = Date.now();
    res.on("finish", () => {
        const ms = Date.now() - t0;
        const entry = {
            t: new Date().toISOString(),
            rid,
            ip: req.ip,
            method: req.method,
            path: req.originalUrl,
            status: res.statusCode,
            ms,
            ua: String(req.headers["user-agent"] || "").slice(0, 160),
        };
        // eslint-disable-next-line no-console
        console.log(JSON.stringify(entry));
    });
    next();
});
app.use(cors({
    origin: (origin, cb) => {
        if (!origin)
            return cb(null, true);
        if (allowedOrigins.length === 0)
            return cb(null, true);
        const ok = allowedOrigins.includes(origin);
        return cb(ok ? null : new Error("CORS blocked"), ok);
    },
}));
// Normalize CORS errors as JSON (avoids default HTML responses)
app.use((err, req, res, next) => {
    if (err && String(err.message || "").includes("CORS")) {
        return res.status(403).json({ error: "CORS blocked", requestId: req.requestId });
    }
    return next(err);
});
app.use(rateLimit({
    windowMs: 60_000,
    limit: 120,
    standardHeaders: "draft-7",
    legacyHeaders: false,
}));
// Heavier limiter for expensive endpoints (analyze, extract, lease)
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
const publicDir = path.resolve(process.cwd(), "public");
app.use("/sample-images", express.static(path.join(publicDir, "sample-images")));
app.use("/uploads", express.static(path.join(publicDir, "uploads")));
app.get("/api/health", (_req, res) => res.json({ ok: true, name: "RentPulse API" }));
app.use("/api/demo", demoRouter);
app.use("/api", analyzeRouter);
app.use("/api", feedbackRouter);
app.use("/api", reputationRouter);
app.use("/api", reportRouter);
app.use("/api", leaseRouter);
// ✅ add this
app.use("/api", extractRouter);
// Admin (optional, protected by ADMIN_TOKEN)
app.use("/api/admin", adminRouter);
// Schedule retention sweep (optional)
maybeScheduleRetentionSweep();
const port = process.env.PORT ? Number(process.env.PORT) : 4000;
// 404 + error handler (JSON)
app.use((req, res) => {
    res.status(404).json({ error: "Not found", path: req.originalUrl, requestId: req.requestId });
});
app.use((err, req, res, _next) => {
    const raw = Number(err?.status || err?.statusCode || 500);
    const status = raw >= 400 && raw <= 599 ? raw : 500;
    const isProd = String(process.env.NODE_ENV || "").toLowerCase() === "production";
    // eslint-disable-next-line no-console
    console.error(JSON.stringify({
        t: new Date().toISOString(),
        rid: req.requestId,
        level: "error",
        msg: err?.message || "Unhandled error",
    }));
    const msg = status >= 500 ? "Server error" : String(err?.message || "Request failed");
    res.status(status).json({
        error: msg,
        requestId: req.requestId,
        ...(isProd ? {} : { detail: String(err?.message || "") }),
    });
});
const server = app.listen(port, () => console.log(`RentPulse backend on http://localhost:${port}`));
// Graceful shutdown (Render/containers)
function shutdown(sig) {
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ t: new Date().toISOString(), level: "info", msg: `shutdown ${sig}` }));
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 8_000).unref();
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
