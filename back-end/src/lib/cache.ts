import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const dataDir = path.resolve(process.cwd(), "data");
const cacheDir = path.join(dataDir, "cache");

function ensureDir() {
  if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });
}

function keyToFile(key: string) {
  const h = crypto.createHash("sha1").update(key).digest("hex");
  return path.join(cacheDir, `${h}.json`);
}

type CacheEnvelope<T> = {
  expiresAt: number;
  value: T;
};

export function cacheGet<T = any>(key: string): T | null {
  try {
    ensureDir();
    const p = keyToFile(key);
    if (!fs.existsSync(p)) return null;
    const env = JSON.parse(fs.readFileSync(p, "utf-8")) as CacheEnvelope<T>;
    if (Date.now() > env.expiresAt) {
      try { fs.unlinkSync(p); } catch {}
      return null;
    }
    return env.value;
  } catch {
    return null;
  }
}

export function cacheSet<T = any>(key: string, value: T, ttlMs: number) {
  ensureDir();
  const env: CacheEnvelope<T> = { expiresAt: Date.now() + ttlMs, value };
  fs.writeFileSync(keyToFile(key), JSON.stringify(env), "utf-8");
}

export function cacheDel(key: string) {
  try {
    const p = keyToFile(key);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  } catch {}
}

export function todayKey() {
  const d = new Date();
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function getDailyCount(name: string): number {
  return cacheGet<number>(`daily:${name}:${todayKey()}`) || 0;
}

export function incDailyCount(name: string, by = 1): number {
  const k = `daily:${name}:${todayKey()}`;
  const current = cacheGet<number>(k) || 0;
  const next = current + by;
  // keep for ~3 days
  cacheSet(k, next, 3 * 24 * 60 * 60 * 1000);
  return next;
}
