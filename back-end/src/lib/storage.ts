import fs from "node:fs";
import path from "node:path";

const dataDir = path.resolve(process.cwd(), "data");
const analysesPath = path.join(dataDir, "analyses.jsonl");
const feedbackPath = path.join(dataDir, "feedback.jsonl");

function ensureDir() {
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
}

export function appendJsonl(file: "analyses" | "feedback", obj: any) {
  ensureDir();
  const p = file === "analyses" ? analysesPath : feedbackPath;
  fs.appendFileSync(p, JSON.stringify(obj) + "\n", "utf-8");
}

export function readJsonl(file: "analyses" | "feedback"): any[] {
  ensureDir();
  const p = file === "analyses" ? analysesPath : feedbackPath;
  if (!fs.existsSync(p)) return [];
  const lines = fs.readFileSync(p, "utf-8").split("\n").filter(Boolean);
  const out: any[] = [];
  for (const ln of lines) {
    try { out.push(JSON.parse(ln)); } catch {}
  }
  return out;
}
