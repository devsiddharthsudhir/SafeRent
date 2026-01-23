import fs from "node:fs";
import path from "node:path";

export type RetentionSweepSummary = {
  ranAt: string;
  retentionDays: number;
  cacheRetentionDays: number;
  uploadsRetentionDays: number;
  deleted: {
    analysisFiles: number;
    cacheFiles: number;
    uploadFiles: number;
  };
  trimmed: {
    analysesJsonlRemoved: number;
    feedbackJsonlRemoved: number;
  };
  notes: string[];
};

function envBool(key: string, dflt: boolean) {
  const v = String(process.env[key] || "").trim().toLowerCase();
  if (!v) return dflt;
  return v === "1" || v === "true" || v === "yes";
}

function envInt(key: string, dflt: number) {
  const v = Number(process.env[key] || "");
  return Number.isFinite(v) && v > 0 ? Math.floor(v) : dflt;
}

function safeParseIso(s: any): number | null {
  const t = Date.parse(String(s || ""));
  return Number.isFinite(t) ? t : null;
}

function olderThan(ms: number, days: number) {
  return ms < Date.now() - days * 24 * 60 * 60 * 1000;
}

function ensureDir(p: string) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function listFiles(dir: string): string[] {
  try {
    return fs
      .readdirSync(dir)
      .map((f) => path.join(dir, f))
      .filter((p) => {
        try {
          return fs.statSync(p).isFile();
        } catch {
          return false;
        }
      });
  } catch {
    return [];
  }
}

function atomicWrite(filePath: string, content: string) {
  const tmp = `${filePath}.tmp`;
  fs.writeFileSync(tmp, content, "utf-8");
  fs.renameSync(tmp, filePath);
}

function trimJsonlByCreatedAt(filePath: string, retentionDays: number): { kept: number; removed: number } {
  if (!fs.existsSync(filePath)) return { kept: 0, removed: 0 };

  const lines = fs.readFileSync(filePath, "utf-8").split("\n").filter(Boolean);
  const keep: string[] = [];
  let removed = 0;

  for (const ln of lines) {
    try {
      const obj = JSON.parse(ln);
      const t = safeParseIso(obj?.createdAt);
      if (t !== null && olderThan(t, retentionDays)) {
        removed++;
        continue;
      }
      keep.push(ln);
    } catch {
      // If a line is corrupt, drop it rather than keep unknown data.
      removed++;
    }
  }

  atomicWrite(filePath, keep.join("\n") + (keep.length ? "\n" : ""));
  return { kept: keep.length, removed };
}

export function runRetentionSweep(overrides?: Partial<{ retentionDays: number; cacheRetentionDays: number; uploadsRetentionDays: number }>): RetentionSweepSummary {
  const enabled = envBool("RETENTION_ENABLED", true);
  const notes: string[] = [];

  const retentionDays = overrides?.retentionDays ?? envInt("RETENTION_DAYS", 30);
  const cacheRetentionDays = overrides?.cacheRetentionDays ?? envInt("CACHE_RETENTION_DAYS", 7);
  const uploadsRetentionDays = overrides?.uploadsRetentionDays ?? envInt("UPLOADS_RETENTION_DAYS", 7);

  const summary: RetentionSweepSummary = {
    ranAt: new Date().toISOString(),
    retentionDays,
    cacheRetentionDays,
    uploadsRetentionDays,
    deleted: { analysisFiles: 0, cacheFiles: 0, uploadFiles: 0 },
    trimmed: { analysesJsonlRemoved: 0, feedbackJsonlRemoved: 0 },
    notes,
  };

  if (!enabled) {
    notes.push("RETENTION_ENABLED=false (sweep skipped)");
    return summary;
  }

  const dataDir = path.resolve(process.cwd(), "data");
  const analysisDir = path.join(dataDir, "analysis");
  const cacheDir = path.join(dataDir, "cache");
  const analysesJsonl = path.join(dataDir, "analyses.jsonl");
  const feedbackJsonl = path.join(dataDir, "feedback.jsonl");

  const uploadsDir = path.resolve(process.cwd(), "public", "uploads");

  // Ensure dirs exist (so stats don't break on fresh deploy)
  ensureDir(dataDir);
  ensureDir(analysisDir);
  ensureDir(cacheDir);
  ensureDir(uploadsDir);

  // 1) Trim JSONL logs
  try {
    const a = trimJsonlByCreatedAt(analysesJsonl, retentionDays);
    summary.trimmed.analysesJsonlRemoved = a.removed;
  } catch {
    notes.push("analyses.jsonl trim failed");
  }
  try {
    const f = trimJsonlByCreatedAt(feedbackJsonl, retentionDays);
    summary.trimmed.feedbackJsonlRemoved = f.removed;
  } catch {
    notes.push("feedback.jsonl trim failed");
  }

  // 2) Delete old analysis files (JSON per analysisId)
  for (const file of listFiles(analysisDir)) {
    try {
      const stat = fs.statSync(file);
      let t = stat.mtimeMs;
      try {
        const obj = JSON.parse(fs.readFileSync(file, "utf-8"));
        const created = safeParseIso(obj?.createdAt);
        if (created !== null) t = created;
      } catch {
        // ignore parse errors, fallback to mtime
      }
      if (olderThan(t, retentionDays)) {
        fs.unlinkSync(file);
        summary.deleted.analysisFiles++;
      }
    } catch {
      // ignore
    }
  }

  // 3) Delete old cache files (expired OR older than cacheRetentionDays)
  for (const file of listFiles(cacheDir)) {
    try {
      const stat = fs.statSync(file);
      let expired = false;
      try {
        const env = JSON.parse(fs.readFileSync(file, "utf-8"));
        const expiresAt = Number(env?.expiresAt);
        if (Number.isFinite(expiresAt) && expiresAt > 0 && expiresAt < Date.now()) expired = true;
      } catch {
        expired = true; // corrupt cache entry
      }
      if (expired || olderThan(stat.mtimeMs, cacheRetentionDays)) {
        fs.unlinkSync(file);
        summary.deleted.cacheFiles++;
      }
    } catch {
      // ignore
    }
  }

  // 4) Delete old uploaded files (avoid .keep)
  for (const file of listFiles(uploadsDir)) {
    try {
      if (path.basename(file) === ".keep") continue;
      const stat = fs.statSync(file);
      if (olderThan(stat.mtimeMs, uploadsRetentionDays)) {
        fs.unlinkSync(file);
        summary.deleted.uploadFiles++;
      }
    } catch {
      // ignore
    }
  }

  return summary;
}

export function getRetentionStats() {
  const dataDir = path.resolve(process.cwd(), "data");
  const analysisDir = path.join(dataDir, "analysis");
  const cacheDir = path.join(dataDir, "cache");
  const analysesJsonl = path.join(dataDir, "analyses.jsonl");
  const feedbackJsonl = path.join(dataDir, "feedback.jsonl");
  const uploadsDir = path.resolve(process.cwd(), "public", "uploads");

  const countLines = (p: string): number => {
    try {
      if (!fs.existsSync(p)) return 0;
      return fs.readFileSync(p, "utf-8").split("\n").filter(Boolean).length;
    } catch {
      return 0;
    }
  };

  return {
    analysisFiles: listFiles(analysisDir).length,
    cacheFiles: listFiles(cacheDir).length,
    uploadFiles: listFiles(uploadsDir).length,
    analysesJsonlLines: countLines(analysesJsonl),
    feedbackJsonlLines: countLines(feedbackJsonl),
  };
}

export function maybeScheduleRetentionSweep() {
  const enabled = envBool("RETENTION_ENABLED", true);
  if (!enabled) return;

  const runOnStart = envBool("RETENTION_RUN_ON_START", true);
  const everyHours = envInt("RETENTION_SWEEP_EVERY_HOURS", 24);

  if (runOnStart) {
    try {
      const res = runRetentionSweep();
      // eslint-disable-next-line no-console
      console.log(JSON.stringify({ t: new Date().toISOString(), event: "retention_sweep", res }));
    } catch {
      // ignore
    }
  }

  // Run periodically (best-effort)
  const ms = Math.max(1, everyHours) * 60 * 60 * 1000;
  setInterval(() => {
    try {
      const res = runRetentionSweep();
      // eslint-disable-next-line no-console
      console.log(JSON.stringify({ t: new Date().toISOString(), event: "retention_sweep", res }));
    } catch {
      // ignore
    }
  }, ms).unref?.();
}
