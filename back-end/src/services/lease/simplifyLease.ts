import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { nanoid } from "nanoid";
import { inferProvince } from "../../lib/scoring/canada.js";
import { getClauseLibrary } from "./clauseLibrary.js";
import type { Listing } from "../../lib/scoring/types.js";

export type LeaseFlagSeverity = "low" | "medium" | "high";

export type LeaseFlag = {
  id: string;
  title: string;
  severity: LeaseFlagSeverity;
  why: string;
  suggestion: string;
  excerpt?: string;
};

export type LeaseClause = {
  id: string;
  /** A short label (e.g., "3.1 Late Fees" or "Utilities") */
  title: string;
  /** Original clause text as extracted */
  raw: string;
  /** Plain-English explanation of the clause */
  plainEnglish: string;
  /** Highest severity among matched flags (if any) */
  severity?: LeaseFlagSeverity;
  /** IDs of flags/patterns that match this clause */
  matchedFlagIds?: string[];
};

export type LeaseSimplifyResult = {
  ok: true;
  disclaimer: string;
  provinceGuess: string;
  extractedChars: number;
  warnings: string[];
  leaseRiskScore: number; // 0..100
  leaseVerdict: "low" | "medium" | "high" | "unclear";
  keyTerms: {
    rentMonthly?: number;
    deposit?: number;
    termType?: "fixed" | "month_to_month" | "unknown";
    termStart?: string;
    termEnd?: string;
    noticeToEndDays?: number;
    utilities?: string;
    occupants?: string;
  };
  laymanSummary: string[];
  flags: LeaseFlag[];
  clauses: LeaseClause[];
};

function runPdftotext(pdfPath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile("pdftotext", ["-layout", pdfPath, "-"], { maxBuffer: 25 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) return reject(new Error(stderr || err.message));
      resolve(String(stdout || ""));
    });
  });
}

async function tryPdfParse(buffer: Buffer): Promise<string | null> {
  try {
    const mod: any = await import("pdf-parse");
    const parse = mod?.default || mod;
    const res = await parse(buffer);
    const t = res?.text ? String(res.text) : "";
    const cleaned = t.trim();
    return cleaned ? cleaned : null;
  } catch {
    return null;
  }
}

function cleanText(t: string) {
  return String(t || "")
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function isMostlyUpper(s: string) {
  const letters = s.replace(/[^A-Za-z]/g, "");
  if (letters.length < 6) return false;
  const upper = letters.replace(/[^A-Z]/g, "").length;
  return upper / letters.length > 0.75;
}

function looksLikeClauseHeading(line: string) {
  const l = String(line || "").trim();
  if (!l) return false;
  if (l.length < 4 || l.length > 120) return false;
  if (/^page\s+\d+/i.test(l)) return false;
  if (/^(the\s+)?residential\s+tenancy/i.test(l)) return false;

  // Numbered clauses: "1.", "1.1", "12.3" ...
  if (/^\d+(?:\.\d+){0,3}\s*[.)-]\s+\S/.test(l)) return true;
  // Section/article style
  if (/^(section|article)\s+\d+\b/i.test(l)) return true;
  // Schedule/appendix headers
  if (/^(schedule|appendix)\s+[A-Z0-9]+\b/i.test(l)) return true;
  // ALL CAPS headings
  if (isMostlyUpper(l) && l.split(/\s+/).length <= 10) return true;
  return false;
}

function normalizeHeadingToTitle(line: string) {
  const l = String(line || "").trim().replace(/\s+/g, " ");
  // Keep numbering if present, but normalize separators
  const m = l.match(/^(\d+(?:\.\d+){0,3})\s*[.)-]\s*(.+)$/);
  if (m) return `${m[1]} ${m[2]}`.trim();
  return l;
}

function splitLeaseIntoClauses(fullText: string): Array<{ title: string; raw: string }> {
  const text = String(fullText || "").replace(/\r\n/g, "\n");
  const lines = text.split("\n");

  const clauses: Array<{ title: string; raw: string }> = [];
  let buf: string[] = [];
  let curTitle = "";

  const flush = () => {
    const raw = buf.join("\n").trim();
    if (!raw) return;
    const title = (curTitle || "Clause").trim();
    clauses.push({ title, raw });
  };

  for (let i = 0; i < lines.length; i++) {
    const line = String(lines[i] || "").trimEnd();
    const trimmed = line.trim();

    const isHeading = looksLikeClauseHeading(trimmed);
    if (isHeading) {
      // If we have content already, start a new clause.
      if (buf.length) {
        flush();
        buf = [];
      }
      curTitle = normalizeHeadingToTitle(trimmed);
      buf.push(trimmed);
      continue;
    }

    // If we see a blank line and buffer is large enough, allow paragraph-based splitting
    if (!trimmed && buf.length >= 6) {
      flush();
      buf = [];
      curTitle = "Clause";
      continue;
    }

    // Normal line
    if (trimmed) buf.push(trimmed);
  }
  if (buf.length) flush();

  // If the heuristic produced too few chunks, fall back to paragraph chunks.
  if (clauses.length < 6) {
    const paras = text
      .split(/\n{2,}/)
      .map((p) => p.trim())
      .filter(Boolean);
    return paras.map((p, idx) => ({ title: `Clause ${idx + 1}`, raw: p }));
  }

  // Cap extremely noisy splits
  if (clauses.length > 160) {
    // Merge every 2 clauses to keep UI and LLM usage sane
    const merged: Array<{ title: string; raw: string }> = [];
    for (let i = 0; i < clauses.length; i += 2) {
      const a = clauses[i];
      const b = clauses[i + 1];
      merged.push({
        title: a.title,
        raw: b ? `${a.raw}\n\n${b.raw}` : a.raw,
      });
    }
    return merged;
  }

  return clauses;
}

function simplifyLegalese(s: string) {
  let t = String(s || "");
  t = t.replace(/\bshall\b/gi, "must");
  t = t.replace(/\bhereinafter\b/gi, "from now on");
  t = t.replace(/\bpursuant to\b/gi, "under");
  t = t.replace(/\bprior to\b/gi, "before");
  t = t.replace(/\bcommence\b/gi, "start");
  t = t.replace(/\bterminate\b/gi, "end");
  t = t.replace(/\btenant\b/gi, "you (tenant)");
  t = t.replace(/\blandlord\b/gi, "the landlord");
  t = t.replace(/\s+/g, " ").trim();
  return t;
}

function plainEnglishForClause(raw: string): string {
  const t = simplifyLegalese(raw);
  const lower = t.toLowerCase();

  // Small set of targeted explainers (best-effort; not legal advice)
  const money = t.match(/(?:CAD|C\$|\$)\s*([0-9][0-9,]{1,8})(?:\.\d{1,2})?/i);
  const amount = money ? Number(money[1].replace(/,/g, "")) : undefined;
  const days = t.match(/\b(\d{1,3})\s*days?\b/i);
  const dayCount = days ? Number(days[1]) : undefined;

  if (/deposit|damage deposit|security deposit/.test(lower)) {
    const a = Number.isFinite(amount as any) ? `about $${Math.round(amount as number)}` : "a deposit";
    return `In simple terms: this clause talks about the deposit (often called a security/damage deposit). It says you may need to pay ${a}. Check whether it is refundable, what conditions apply, and when it must be returned.`;
  }
  if (/rent/.test(lower) && (/(due|payable|payment)/.test(lower) || amount)) {
    const a = Number.isFinite(amount as any) ? `around $${Math.round(amount as number)}` : "the stated amount";
    return `In simple terms: this clause is about rent. It says you must pay rent (${a}) on the schedule described (for example monthly on a specific date). Confirm the exact due date, accepted payment methods, and any late payment consequences.`;
  }
  if (/utilities|hydro|electric|water|gas|internet/.test(lower)) {
    return `In simple terms: this clause explains which utilities are included in rent and which ones you must pay separately. Make sure the wording is specific (e.g., hydro/electricity, water, heat, internet) so there are no surprise bills later.`;
  }
  if (/enter|entry|inspect|inspection|showing/.test(lower) && /landlord/.test(lower)) {
    return `In simple terms: this clause is about landlord entry/inspections. It describes when the landlord can enter the unit and what notice they must give. Verify the notice period and the reasons allowed for entry.`;
  }
  if (/repair|maintenance|maintain|damage|wear and tear/.test(lower)) {
    return `In simple terms: this clause is about repairs and maintenance. It may describe what you must take care of versus what the landlord must repair. Watch for wording that makes you responsible for major repairs or normal wear-and-tear.`;
  }
  if (/terminate|termination|end this lease|notice/.test(lower)) {
    const d = Number.isFinite(dayCount as any) ? `${dayCount} days` : "a certain number of days";
    return `In simple terms: this clause covers ending the lease and notice requirements. It says you may need to give ${d} notice (or follow a specific process). Confirm how notice must be delivered (email/letter) and any penalties for early termination.`;
  }
  if (/fee|charge|penalty|administration fee|processing fee/.test(lower)) {
    return `In simple terms: this clause mentions fees or penalties (for example, admin fees, processing charges, or penalties). Make sure the fees are clearly defined, reasonable, and not open-ended.`;
  }
  if (/sublet|sub-?let|assign|assignment/.test(lower)) {
    return `In simple terms: this clause is about subletting/assigning the lease. It explains whether you can move out and have someone else take over, and what approvals are needed. Check if the landlord can refuse unreasonably or charge extra fees.`;
  }
  if (/pets?/.test(lower)) {
    return `In simple terms: this clause is about pets. It may restrict pets, require approval, or impose fees. Confirm what is allowed and whether there are extra charges or conditions.`;
  }
  if (/indemnif|liability|hold harmless/.test(lower)) {
    return `In simple terms: this clause is about liability/indemnity. It may say you are responsible for certain losses or damages. Be careful with broad wording that makes you liable even when the issue is not your fault.`;
  }

  // Generic fallback: shorten + simplify language
  const short = t.replace(/\s+/g, " ").trim();
  const snippet = short.length > 520 ? `${short.slice(0, 520)}…` : short;
  return `In simple terms: ${snippet}`;
}

function extractSnippet(text: string, re: RegExp, maxLen = 220): string | undefined {
  const m = re.exec(text);
  if (!m) return undefined;
  const idx = m.index;
  const start = Math.max(0, idx - Math.floor(maxLen / 2));
  const end = Math.min(text.length, idx + Math.floor(maxLen / 2));
  const snippet = text.slice(start, end).replace(/\s+/g, " ").trim();
  return snippet.length ? snippet : undefined;
}

function n(s: string): number | undefined {
  const m = s.match(/([0-9][0-9,]{1,8})(?:\.\d{1,2})?/);
  if (!m) return undefined;
  const val = Number(m[1].replace(/,/g, ""));
  return Number.isFinite(val) ? val : undefined;
}

function findMoneyNear(text: string, keyword: RegExp): number | undefined {
  const m = text.match(new RegExp(`${keyword.source}[^\n]{0,80}`, "i"));
  if (!m) return undefined;
  const amt = m[0].match(/(?:CAD|C\$|\$)\s*([0-9][0-9,]{1,8})(?:\.\d{1,2})?/i);
  if (!amt) return undefined;
  return n(amt[1]);
}

function findDaysNear(text: string, keyword: RegExp): number | undefined {
  const m = text.match(new RegExp(`${keyword.source}[^\n]{0,90}`, "i"));
  if (!m) return undefined;
  const d = m[0].match(/\b(\d{1,3})\s*days?\b/i);
  if (!d) return undefined;
  const val = Number(d[1]);
  return Number.isFinite(val) ? val : undefined;
}

function guessProvinceFromLeaseText(text: string): string {
  const t = text.toLowerCase();
  if (/\b(british columbia|\bbc\b)\b/.test(t)) return "BC";
  if (/\b(ontario|\bon\b)\b/.test(t)) return "ON";
  if (/\b(alberta|\bab\b)\b/.test(t)) return "AB";
  if (/\b(quebec|québec|\bqc\b)\b/.test(t)) return "QC";
  return "";
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function scoreLease(flags: LeaseFlag[], extractedChars: number, warnings: string[]) {
  const sevRank: Record<LeaseFlagSeverity, number> = { high: 3, medium: 2, low: 1 };
  const hi = flags.filter((f) => f.severity === "high").length;
  const med = flags.filter((f) => f.severity === "medium").length;
  const low = flags.filter((f) => f.severity === "low").length;

  // Baseline from flags, with diminishing returns.
  const raw = hi * 22 + med * 10 + low * 4;
  const damp = 100 * (1 - Math.exp(-raw / 55));

  // If extraction is poor, keep it in "unclear" territory.
  const lowText = extractedChars < 900 || warnings.some((w) => /low-text|short/i.test(w));
  const score = clamp(Math.round(lowText ? damp * 0.75 : damp), 0, 100);

  let verdict: "low" | "medium" | "high" | "unclear";
  if (lowText && score < 35) verdict = "unclear";
  else if (score >= 65) verdict = "high";
  else if (score >= 35) verdict = "medium";
  else verdict = "low";

  // Put most severe first for consistent UI.
  const sorted = [...flags].sort((a, b) => (sevRank[b.severity] || 0) - (sevRank[a.severity] || 0));
  return { leaseRiskScore: score, leaseVerdict: verdict, flagsSorted: sorted };
}

function buildFlags(text: string, province: string): LeaseFlag[] {
  const flags: LeaseFlag[] = [];
  const lib = getClauseLibrary(province);

  const add = (f: Omit<LeaseFlag, "excerpt"> & { re?: RegExp }) => {
    flags.push({
      ...f,
      excerpt: f.re ? extractSnippet(text, f.re) : undefined,
    });
  };

  // Province mismatch hint
  const inferredFromText = guessProvinceFromLeaseText(text);
  const p = String(province || "").trim().toUpperCase();
  if (p && inferredFromText && inferredFromText !== p) {
    add({
      id: "lease_province_mismatch",
      title: "Province mismatch",
      severity: "medium",
      why: `This lease text mentions ${inferredFromText}, but you selected/guessed ${p}. Provincial rules differ.`,
      suggestion: "Confirm the correct province/jurisdiction and re-run the lease check with the right province.",
      re: new RegExp(inferredFromText, "i"),
    });
  }

  for (const pat of lib) {
    if (pat.provinces && pat.provinces.length) {
      if (!pat.provinces.map(x => x.toUpperCase()).includes(p)) continue;
    }
    if (pat.re.test(text)) {
      add({
        id: pat.id,
        title: pat.title,
        severity: pat.severity,
        why: pat.why,
        suggestion: pat.suggestion,
        re: pat.re,
      });
    }
  }

  // Dedupe by id (keep highest severity if duplicates somehow happen)
  const sevRank: Record<LeaseFlagSeverity, number> = { high: 3, medium: 2, low: 1 };
  const byId = new Map<string, LeaseFlag>();
  for (const f of flags) {
    const prev = byId.get(f.id);
    if (!prev || sevRank[f.severity] > sevRank[prev.severity]) byId.set(f.id, f);
  }

  return Array.from(byId.values());
}

function scoreLeaseFromFlags(flags: LeaseFlag[], extractedChars: number, warnings: string[]) {
  const sevRank: Record<LeaseFlagSeverity, number> = { high: 3, medium: 2, low: 1 };
  const counts = { high: 0, medium: 0, low: 0 } as Record<LeaseFlagSeverity, number>;
  for (const f of flags) counts[f.severity] = (counts[f.severity] || 0) + 1;

  // Weighted sum with gentle saturation so a lot of low flags doesn't max out the score.
  const raw = counts.high * 20 + counts.medium * 10 + counts.low * 4;
  const score = Math.max(0, Math.min(100, Math.round(100 * (1 - Math.exp(-raw / 55)))));

  const lowText = extractedChars < 700 || warnings.some((w) => /low-text|short/i.test(w));
  const verdict: "low" | "medium" | "high" | "unclear" =
    lowText ? "unclear" : score >= 70 ? "high" : score >= 35 ? "medium" : "low";

  return { score, verdict, counts, sevRank };
}

export async function extractLeaseTextFromUpload(file: { buffer: Buffer; originalname?: string; mimetype?: string }): Promise<{ text: string; warnings: string[] }> {
  const warnings: string[] = [];
  const name = String(file.originalname || "").toLowerCase();
  const type = String(file.mimetype || "").toLowerCase();

  if (type.includes("pdf") || name.endsWith(".pdf")) {
    // Prefer pure-JS parsing when available (works on Render/Windows without extra binaries).
    const parsed = await tryPdfParse(file.buffer);
    if (parsed) {
      const text = cleanText(parsed);
      if (text.length < 800) warnings.push("Text extraction looks short. If this is a scanned lease, try uploading a selectable-text PDF or paste the lease text.");
      warnings.push("PDF text extracted with a JS parser. If anything looks missing, try Paste text mode.");
      return { text, warnings };
    }

    // Fallback: system pdftotext (Poppler)
    const tmp = path.join(os.tmpdir(), `rentpulse-lease-${nanoid(8)}.pdf`);
    await fs.writeFile(tmp, file.buffer);
    try {
      const raw = await runPdftotext(tmp);
      const text = cleanText(raw);
      if (text.length < 800) warnings.push("Text extraction looks short. If this is a scanned lease, try uploading a selectable-text PDF or paste the lease text.");
      warnings.push("PDF text extracted via system pdftotext. If your deployment lacks this tool, install Poppler or rely on Paste text mode.");
      return { text, warnings };
    } catch (e: any) {
      warnings.push("Could not extract text from PDF automatically. Try Paste text mode, or ensure pdf-parse is installed and/or Poppler (pdftotext) is available on the server.");
      throw e;
    } finally {
      await fs.unlink(tmp).catch(() => void 0);
    }
  }

  // Plain text fallback
  const text = cleanText(file.buffer.toString("utf-8"));
  if (text.length < 400) warnings.push("Lease text is short. For best results, paste the full lease including addendums.");
  return { text, warnings };
}

export function simplifyLeaseText(text: string, provinceHint?: string): LeaseSimplifyResult {
  const cleaned = cleanText(text);
  const warnings: string[] = [];
  if (!cleaned) warnings.push("No text detected.");

  const provinceGuess = provinceHint || guessProvinceFromLeaseText(cleaned) || "";

  // Extract key terms (best-effort)
  const rentMonthly = findMoneyNear(cleaned, /(monthly\s*rent|rent\s*per\s*month|rent)/i);
  const deposit = findMoneyNear(cleaned, /(deposit|damage\s*deposit|security\s*deposit|last\s*month)/i);

  let termType: "fixed" | "month_to_month" | "unknown" = "unknown";
  if (/(month\s*to\s*month)/i.test(cleaned)) termType = "month_to_month";
  if (/(fixed\s*term|term\s*of\s*this\s*lease|ending\s*on)/i.test(cleaned)) termType = "fixed";

  const noticeToEndDays = findDaysNear(cleaned, /(notice|terminate|termination)/i);

  const utilitiesChunk = cleaned.match(/utilities[^\n]{0,120}/i)?.[0];
  const utilities = utilitiesChunk ? utilitiesChunk.replace(/\s+/g, " ").trim() : undefined;

  const occupantsChunk = cleaned.match(/occupants?[^\n]{0,120}/i)?.[0];
  const occupants = occupantsChunk ? occupantsChunk.replace(/\s+/g, " ").trim() : undefined;

  // Layman summary bullets
  const disclaimer = "This summary is a best-effort simplification, not legal advice.";
  const laymanSummary: string[] = [];
  laymanSummary.push(disclaimer);
  if (rentMonthly) laymanSummary.push(`Monthly rent looks like about CAD $${Math.round(rentMonthly)} (verify in the rent section).`);
  if (deposit) laymanSummary.push(`Deposit mentioned: about CAD $${Math.round(deposit)} (confirm if refundable and what it's for).`);
  if (termType === "month_to_month") laymanSummary.push("The lease appears to be month-to-month (more flexible, but notice rules matter)." );
  if (termType === "fixed") laymanSummary.push("The lease appears to be a fixed term (check start/end dates and renewal rules)." );
  if (noticeToEndDays) laymanSummary.push(`Notice to end/terminate is mentioned around ${noticeToEndDays} days (confirm the exact clause).`);
  if (utilities) laymanSummary.push(`Utilities clause spotted: “${utilities}”.`);
  if (occupants) laymanSummary.push(`Occupants clause spotted: “${occupants}”.`);

  if (cleaned.length < 800) warnings.push("Low-text lease detected. For best accuracy, paste the lease text (including addendums) or upload a selectable-text PDF.");

  const flags = buildFlags(cleaned, provinceGuess);

  // Clause-by-clause breakdown
  const chunks = splitLeaseIntoClauses(cleaned);
  const clauseLib = getClauseLibrary(provinceGuess);
  const sevRank: Record<LeaseFlagSeverity, number> = { high: 3, medium: 2, low: 1 };
  const clauses: LeaseClause[] = chunks.map((c, idx) => {
    const raw = c.raw.trim();
    const matched: string[] = [];
    let maxSev: LeaseFlagSeverity | undefined;
    for (const pat of clauseLib) {
      if (pat.provinces && pat.provinces.length) {
        if (!pat.provinces.map((x) => x.toUpperCase()).includes(String(provinceGuess || "").toUpperCase())) continue;
      }
      if (pat.re.test(raw)) {
        matched.push(pat.id);
        if (!maxSev || sevRank[pat.severity] > sevRank[maxSev]) maxSev = pat.severity;
      }
    }

    const title = c.title && c.title !== "Clause" ? c.title : `Clause ${idx + 1}`;
    return {
      id: `clause_${idx + 1}`,
      title,
      raw,
      plainEnglish: plainEnglishForClause(raw),
      severity: maxSev,
      matchedFlagIds: matched.length ? matched : undefined,
    };
  });

  // Province guess fallback using listing inference (rarely used here, but keeps the helper available)
  const provinceFinal = provinceGuess || "";

  const scored = scoreLeaseFromFlags(flags, cleaned.length, warnings);

  return {
    ok: true,
    disclaimer,
    provinceGuess: provinceFinal,
    extractedChars: cleaned.length,
    warnings,
    leaseRiskScore: scored.score,
    leaseVerdict: scored.verdict,
    keyTerms: {
      rentMonthly,
      deposit,
      termType,
      noticeToEndDays,
      utilities,
      occupants,
    },
    laymanSummary,
    flags: flags.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "high" ? -1 : a.severity === "medium" && b.severity === "low" ? -1 : 1)),
    clauses,
  };
}

// Small helper for future: allow reusing province inference from listing-like data.
export function inferProvinceFromListingLike(input: { city?: string; neighborhood?: string; description?: string; title?: string }): string {
  const listing: Listing = {
    title: input.title || "",
    description: input.description || "",
    price: 0,
    city: input.city,
    neighborhood: input.neighborhood,
  };
  return inferProvince(listing);
}

