import {
  AlertTriangle,
  Clipboard,
  Download,
  FileSignature,
  Loader2,
  UploadCloud,
} from "lucide-react";
import { useMemo, useState } from "react";
import { simplifyLeaseFile, simplifyLeaseText } from "../lib/api";
import { buildSimplePdf, downloadPdf } from "../lib/simplePdf";
import type { LeaseClause, LeaseFlag, LeaseSimplifyResult } from "../lib/types";

const provinces = [
  { code: "", label: "Auto" },
  { code: "BC", label: "British Columbia" },
  { code: "ON", label: "Ontario" },
  { code: "AB", label: "Alberta" },
  { code: "QC", label: "Quebec" },
];

function sevPill(sev: LeaseFlag["severity"]) {
  // Keep these Tailwind classes because your styles.css now bridges them for dark mode too.
  if (sev === "high") return "bg-rose-50 border-rose-100 text-rose-800";
  if (sev === "medium") return "bg-amber-50 border-amber-100 text-amber-800";
  return "bg-slate-50 border-slate-100 text-slate-700";
}

function verdictPill(v?: LeaseSimplifyResult["leaseVerdict"]) {
  if (v === "high") return "bg-rose-50 border-rose-100 text-rose-800";
  if (v === "medium") return "bg-amber-50 border-amber-100 text-amber-800";
  if (v === "low") return "bg-emerald-50 border-emerald-100 text-emerald-800";
  return "bg-slate-50 border-slate-100 text-slate-700";
}

/**
 * Plain-English cleanup (UI-side):
 * - removes repeated prefixes like "In simple terms:"
 * - trims/normalizes whitespace
 * - builds short summary + bullet points
 * This does NOT change meaning; it improves readability.
 */
function normalizePlainEnglish(input?: string) {
  const raw = String(input || "").trim();
  if (!raw) return { summary: "", bullets: [] as string[] };

  let s = raw;

  // Remove common boilerplate prefixes (case-insensitive)
  s = s.replace(/^in simple terms\s*:\s*/i, "");
  s = s.replace(/^plain english\s*:\s*/i, "");
  s = s.replace(/^in plain english\s*:\s*/i, "");

  // Normalize whitespace
  s = s.replace(/\s+/g, " ").trim();

  // Split into simple points (avoid lookbehind for compatibility)
  const parts = s
    .split(/(?:\.\s+|\!\s+|\?\s+|;\s+|\n+)/g)
    .map((p) => p.trim())
    .filter(Boolean);

  // Deduplicate (basic)
  const seen = new Set<string>();
  const bullets: string[] = [];
  for (const p of parts) {
    const key = p.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    const clipped = p.length > 190 ? p.slice(0, 190).trim() + "…" : p;
    bullets.push(clipped);
    if (bullets.length >= 5) break;
  }

  const summary =
    bullets[0] ||
    (s.length > 190 ? s.slice(0, 190).trim() + "…" : s);

  return { summary, bullets };
}

/**
 * Adds "To-do" content for flagged clauses.
 * We use keyword-based fallbacks so you always show actionable steps.
 */
function todoForFlag(f: LeaseFlag): string[] {
  const hay = `${f.id} ${f.title} ${f.why} ${f.suggestion}`.toLowerCase();

  // deposit / non-refundable
  if (hay.includes("deposit") && (hay.includes("non") || hay.includes("nonref") || hay.includes("non-refundable"))) {
    return [
      "Ask to make the deposit refundable (or align it with provincial rules).",
      "Get refund conditions + return timeline in writing.",
      "Never pay a deposit until you verify the landlord and unit.",
    ];
  }

  // landlord entry / notice
  if (hay.includes("entry") && (hay.includes("without notice") || hay.includes("any time") || hay.includes("inspect"))) {
    return [
      "Ask to add notice requirements (written notice + reasonable hours).",
      "Confirm emergencies are the only exception.",
      "Get the corrected clause in the signed lease copy.",
    ];
  }

  // application / admin fees
  if (hay.includes("application") || hay.includes("processing") || hay.includes("admin fee")) {
    return [
      "Ask for a fee breakdown and legal basis (province-specific).",
      "Request removal if it’s not allowed or not refundable.",
      "Do not pay fees before viewing/verification.",
    ];
  }

  // penalties / late fees
  if (hay.includes("late fee") || hay.includes("penalt") || hay.includes("compound")) {
    return [
      "Ask to cap late fees and remove compounding penalties.",
      "Request a grace period and a clear, fixed fee schedule.",
      "Confirm fees are reasonable and enforceable in your province.",
    ];
  }

  // cleaning / move-out fees
  if (hay.includes("cleaning") || hay.includes("move-out") || hay.includes("professional")) {
    return [
      "Ask to make cleaning conditional on actual damage beyond normal wear.",
      "Require receipts and reasonable standards (not automatic).",
      "Ensure deductions follow the province’s deposit rules.",
    ];
  }

  // default safe fallback
  return [
    "Ask to rewrite/remove this clause before signing.",
    "Request everything in writing and keep a signed copy.",
    "If the landlord refuses, treat it as a high-risk lease term.",
  ];
}

export default function Lease() {
  const [mode, setMode] = useState<"upload" | "paste">("upload");
  const [province, setProvince] = useState<string>("");
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<LeaseSimplifyResult | null>(null);

  const [clauseQuery, setClauseQuery] = useState<string>("");
  const [openClauseId, setOpenClauseId] = useState<string | null>(null);

  const highCount = useMemo(
    () => (result?.flags || []).filter((f) => f.severity === "high").length,
    [result]
  );

  const clauses = useMemo<LeaseClause[]>(
    () => (result?.clauses || []) as LeaseClause[],
    [result]
  );

  const clauseStats = useMemo(() => {
    const counts = { high: 0, medium: 0, low: 0, any: 0 };
    for (const c of clauses) {
      if (!c?.severity) continue;
      counts.any += 1;
      if (c.severity === "high") counts.high += 1;
      else if (c.severity === "medium") counts.medium += 1;
      else counts.low += 1;
    }
    return { total: clauses.length, ...counts };
  }, [clauses]);

  const filteredClauses = useMemo(() => {
    const q = clauseQuery.trim().toLowerCase();
    if (!q) return clauses;
    return clauses.filter((c) => {
      const hay = `${c.title}\n${c.plainEnglish}\n${c.raw}`.toLowerCase();
      return hay.includes(q);
    });
  }, [clauses, clauseQuery]);

  async function run() {
    setErr(null);
    setBusy(true);
    setResult(null);
    try {
      // Friendly validation so mobile users don't hit silent failures
      if (mode === "upload") {
        if (!file) throw new Error("Choose a lease PDF (or text file) to analyze.");
        const r = await simplifyLeaseFile(file, province);
        setResult(r);
        return;
      }

      if (!text.trim()) throw new Error("Paste your lease text to analyze.");
      const r = await simplifyLeaseText(text, province);
      setResult(r);
    } catch (e: any) {
      setErr(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

function download() {
    if (!result) return;
    const lines: string[] = [];

    lines.push(`Province guess: ${result.provinceGuess || "(unknown)"}`);
    lines.push(`Extracted characters: ${result.extractedChars}`);
    if (typeof result.leaseRiskScore === "number") {
      lines.push(
        `Lease risk score: ${result.leaseRiskScore}/100 (${result.leaseVerdict || "unclear"})`
      );
    }

    if (result.warnings?.length) {
      lines.push("Warnings:");
      for (const w of result.warnings) lines.push(`- ${w}`);
    }

    lines.push("");
    lines.push("Layman summary:");
    for (const b of result.laymanSummary || []) lines.push(`- ${b}`);

    lines.push("");
    lines.push("Flagged clauses:");
    if (!result.flags?.length) {
      lines.push("- No obvious predatory clauses matched in text (still read carefully).");
    } else {
      for (const f of result.flags) {
        lines.push(`- [${f.severity.toUpperCase()}] ${f.title}`);
        lines.push(`  Why: ${f.why}`);
        lines.push(`  Suggestion: ${f.suggestion}`);
        const todos = todoForFlag(f);
        if (todos.length) {
          lines.push("  To-do:");
          for (const t of todos) lines.push(`   • ${t}`);
        }
        if (f.excerpt) lines.push(`  Excerpt: ${f.excerpt}`);
        lines.push("");
      }
    }

    if (result.clauses?.length) {
      lines.push("");
      lines.push("Clause-by-clause breakdown:");
      for (const c of result.clauses) {
        lines.push("");
        lines.push(`- ${c.title}${c.severity ? ` [${c.severity.toUpperCase()}]` : ""}`);
        const pe = normalizePlainEnglish(c.plainEnglish);
        lines.push(`  Plain English: ${pe.summary || ""}`);
        const raw = String(c.raw || "").replace(/\s+/g, " ").trim();
        const short = raw.length > 900 ? raw.slice(0, 900).trim() + "…" : raw;
        lines.push(`  Original: ${short}`);
      }
    }

    const bytes = buildSimplePdf(lines, { title: "SAFERENT Lease Summary" });
    downloadPdf("saferent-lease-summary.pdf", bytes);
  }

  function copySummary() {
    if (!result) return;
    const parts: string[] = [];
    parts.push("SAFERENT Lease Summary");
    parts.push(`Province: ${result.provinceGuess || "(unknown)"}`);
    if (typeof result.leaseRiskScore === "number")
      parts.push(`Lease risk score: ${result.leaseRiskScore}/100 (${result.leaseVerdict || "unclear"})`);
    parts.push("");
    parts.push("Layman summary:");
    for (const b of result.laymanSummary || []) parts.push(`- ${b}`);
    if (result.flags?.length) {
      parts.push("");
      parts.push("Flags:");
      for (const f of result.flags) {
        const todo = todoForFlag(f);
        parts.push(`- [${f.severity}] ${f.title}: ${f.suggestion}`);
        if (todo.length) {
          parts.push(`  To-do:`);
          for (const t of todo) parts.push(`   • ${t}`);
        }
      }
    }
    navigator.clipboard.writeText(parts.join("\n")).catch(() => void 0);
  }

  return (
    <div className="space-y-6">
      {/* TOP CARD */}
      <section className="glass rounded-3xl p-5 sm:p-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-2xl glass soft-border">
              <FileSignature size={18} />
            </div>
            <div className="min-w-0">
              <div className="text-xl font-semibold tracking-tight">Lease Simplifier</div>
              <div className="mt-1 text-sm subtle">
                Understand what you’re signing in plain English. We flag risky terms and tell you what to do next.
              </div>

              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                <span className="inline-flex items-center gap-2 rounded-full bg-white/5 px-3 py-1 soft-border">
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ background: "var(--sr-low)" }}
                  />
                  Plain-English summary
                </span>
                <span className="inline-flex items-center gap-2 rounded-full bg-white/5 px-3 py-1 soft-border">
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ background: "var(--sr-med)" }}
                  />
                  Predatory clause flags
                </span>
                <span className="inline-flex items-center gap-2 rounded-full bg-white/5 px-3 py-1 soft-border">
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ background: "var(--sr-primary)" }}
                  />
                  Next-step checklist
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 sm:justify-end">
            <span className="inline-flex items-center gap-2 rounded-full bg-white/5 px-3 py-1 text-xs soft-border">
              <span className="text-[10px] font-semibold tracking-wide">PRIVACY</span>
              <span className="subtle">We don’t publish your lease</span>
            </span>

            {typeof result?.leaseRiskScore === "number" ? (
              <span
                className={[
                  "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs",
                  verdictPill(result.leaseVerdict),
                ].join(" ")}
              >
                Risk {result.leaseRiskScore}/100
              </span>
            ) : null}
          </div>
        </div>

        <div className="mt-6 grid gap-4">
          {/* Mode + province */}
          <div className="grid gap-3 sm:flex sm:items-center sm:justify-between">
            <div className="grid grid-cols-2 gap-2 sm:flex sm:gap-2">
              <button
                type="button"
                onClick={() => setMode("upload")}
                className={[
                  "chip w-full rounded-2xl px-3 py-2.5 text-sm focus-ring soft-border",
                  mode === "upload" ? "bg-white/10" : "hover:bg-white/5",
                ].join(" ")}
              >
                Upload PDF
              </button>
              <button
                type="button"
                onClick={() => setMode("paste")}
                className={[
                  "chip w-full rounded-2xl px-3 py-2.5 text-sm focus-ring soft-border",
                  mode === "paste" ? "bg-white/10" : "hover:bg-white/5",
                ].join(" ")}
              >
                Paste text
              </button>
            </div>

            <div className="grid gap-1 sm:flex sm:items-center sm:gap-2">
              <span className="text-xs subtle">Province rules (optional)</span>
              <select
                className="w-full rounded-2xl soft-border bg-transparent px-3 py-2.5 text-sm focus-ring sm:w-auto"
                value={province}
                onChange={(e) => setProvince(e.target.value)}
              >
                {provinces.map((p) => (
                  <option key={p.code} value={p.code}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Upload / paste content */}
          {mode === "upload" ? (
            <div className="glass-strong rounded-2xl p-4 soft-border">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="font-semibold">Step 1: Choose your lease</div>
                  <div className="mt-1 text-sm subtle">
                    PDFs with selectable text work best. If it’s a scanned image, extraction can be limited.
                  </div>
                </div>

                <label className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white focus-ring sm:w-auto">
                  <UploadCloud size={18} />
                  {file ? "Replace file" : "Choose PDF"}
                  <input
                    type="file"
                    accept="application/pdf,text/plain"
                    className="hidden"
                    onChange={(e) => setFile(e.target.files?.[0] || null)}
                  />
                </label>
              </div>

              {file ? (
                <div className="mt-3 flex items-center gap-3 rounded-2xl bg-white/5 px-3 py-3 soft-border">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold">{file.name}</div>
                    <div className="mt-0.5 text-xs subtle">
                      {Math.max(1, Math.round(file.size / 1024))} KB
                    </div>
                  </div>
                  <button
                    type="button"
                    className="chip shrink-0 rounded-xl px-3 py-2 text-xs hover:bg-white/5 focus-ring soft-border"
                    onClick={() => setFile(null)}
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <div className="mt-3 rounded-2xl bg-white/5 px-3 py-3 text-sm subtle soft-border">
                  No file selected yet.
                </div>
              )}

              <div className="mt-3 text-xs subtle">
                Tip: If you’re unsure, start with “Auto” — we’ll guess the province from the text when possible.
              </div>
            </div>
          ) : (
            <div className="glass-strong rounded-2xl p-4 soft-border">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="font-semibold">Step 1: Paste your lease text</div>
                  <div className="mt-1 text-sm subtle">Include addendums for best results.</div>
                </div>

                <button
                  type="button"
                  onClick={() => setText("")}
                  className="chip w-full rounded-2xl px-3 py-2 text-sm hover:bg-white/5 focus-ring soft-border sm:w-auto"
                >
                  Clear
                </button>
              </div>

              <textarea
                className="mt-3 h-56 w-full rounded-2xl soft-border bg-transparent p-3 text-base focus-ring sm:text-sm"
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Paste the lease text here… (rent, deposits, entry rules, fees, addendums)"
              />

              <div className="mt-2 text-xs subtle">
                If your PDF is scanned, try copying the lease text from the landlord’s email or listing instead.
              </div>
            </div>
          )}

          {err ? (
            <div
              className="rounded-2xl soft-border p-4 text-sm"
              style={{
                background: "color-mix(in oklab, var(--sr-high) 10%, transparent)",
              }}
            >
              <div className="font-semibold">Fix this first</div>
              <div className="mt-1">{err}</div>
            </div>
          ) : null}

          {/* CTA + actions */}
          <div className="grid gap-3 sm:flex sm:items-center">
            <button
              type="button"
              onClick={run}
              disabled={busy}
              className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-900 px-5 py-3.5 text-sm font-semibold text-white shadow-sm disabled:opacity-60 focus-ring sm:w-auto"
            >
              {busy ? <Loader2 className="animate-spin" size={18} /> : null}
              Simplify lease
            </button>

            {result ? (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={download}
                  className="chip inline-flex items-center gap-2 rounded-2xl px-3 py-2.5 text-sm hover:bg-white/5 focus-ring soft-border"
                >
                  <Download size={16} />
                  Download PDF
                </button>
                <button
                  type="button"
                  onClick={copySummary}
                  className="chip inline-flex items-center gap-2 rounded-2xl px-3 py-2.5 text-sm hover:bg-white/5 focus-ring soft-border"
                >
                  <Clipboard size={16} />
                  Copy summary
                </button>
              </div>
            ) : (
              <div className="text-xs subtle">
                This is guidance, not legal advice. If anything looks serious, confirm with your provincial resources.
              </div>
            )}
          </div>

          {result ? (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              {highCount ? (
                <span className="inline-flex items-center gap-2 rounded-full bg-rose-50 px-3 py-1 border border-rose-100">
                  <AlertTriangle size={14} />
                  {highCount} high-risk clause{highCount === 1 ? "" : "s"} flagged
                </span>
              ) : (
                <span className="inline-flex items-center gap-2 rounded-full bg-slate-50 px-3 py-1 soft-border">
                  No high-risk flags matched
                </span>
              )}

              {result.provinceGuess ? (
                <span className="inline-flex items-center gap-2 rounded-full bg-white/5 px-3 py-1 soft-border">
                  Province: <span className="font-semibold">{result.provinceGuess}</span>
                </span>
              ) : null}

              {typeof result.extractedChars === "number" ? (
                <span className="inline-flex items-center gap-2 rounded-full bg-white/5 px-3 py-1 soft-border">
                  Extracted: <span className="font-semibold">{result.extractedChars.toLocaleString()}</span> chars
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
      </section>

      {/* RESULTS */}
      {result ? (
        <div className="space-y-4">
          {/* ✅ STACKED: Layman summary THEN Flagged clauses */}
          <section className="grid gap-4">
            {/* Layman summary */}
            <div className="glass-strong rounded-3xl p-5 soft-border">
              <div className="text-sm font-semibold">Layman summary</div>
              <ul className="mt-3 space-y-2 text-sm subtle">
                {(result.laymanSummary || []).map((b, i) => (
                  <li key={i}>• {b}</li>
                ))}
              </ul>

              {result.warnings?.length ? (
                <div
                  className="mt-4 rounded-2xl soft-border p-3 text-sm"
                  style={{ background: "color-mix(in oklab, var(--sr-med) 12%, transparent)" }}
                >
                  <div className="font-semibold">Extraction / quality notes</div>
                  <ul className="mt-2 space-y-1">
                    {result.warnings.map((w, i) => (
                      <li key={i}>• {w}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>

            {/* Flagged clauses BELOW */}
            <div className="glass-strong rounded-3xl p-5 soft-border">
              <div className="text-sm font-semibold">Flagged clauses</div>
              <div className="mt-3 space-y-3">
                {result.flags?.length ? (
                  result.flags.map((f) => {
                    const todo = todoForFlag(f);
                    return (
                      <div key={f.id} className="rounded-2xl soft-border p-4 bg-white/5">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="font-semibold">{f.title}</div>
                            <div className="mt-1 text-sm subtle">{f.why}</div>
                          </div>
                          <div
                            className={[
                              "shrink-0 rounded-full border px-3 py-1 text-xs font-semibold",
                              sevPill(f.severity),
                            ].join(" ")}
                          >
                            {f.severity.toUpperCase()}
                          </div>
                        </div>

                        {/* Existing suggestion */}
                        <div className="mt-3 rounded-2xl p-3 text-sm soft-border bg-white/5">
                          <div className="text-xs subtle">What to do (quick)</div>
                          <div className="mt-1">{f.suggestion}</div>
                        </div>

                        {/* ✅ New: To-do content */}
                        <div className="mt-3 rounded-2xl p-3 text-sm soft-border bg-white/5">
                          <div className="text-xs subtle">To-do (recommended)</div>
                          <ul className="mt-2 space-y-1 text-sm">
                            {todo.map((t, i) => (
                              <li key={i}>• {t}</li>
                            ))}
                          </ul>
                        </div>

                        {f.excerpt ? (
                          <div className="mt-3 text-xs subtle">
                            <span className="font-semibold">Excerpt:</span> {f.excerpt}
                          </div>
                        ) : null}
                      </div>
                    );
                  })
                ) : (
                  <div className="rounded-2xl soft-border p-4 text-sm subtle bg-white/5">
                    No obvious predatory patterns matched in the extracted text.
                    Still read the lease carefully, especially addendums.
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* Clause breakdown */}
          <section className="glass-strong rounded-3xl p-5 soft-border">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="min-w-0">
                <div className="text-sm font-semibold">Clause-by-clause breakdown</div>
                <div className="mt-1 text-sm subtle">
                  Every clause detected in your lease, with a plain-English translation. Use search to jump to a section.
                </div>
                <div className="mt-2 flex flex-wrap gap-2 text-xs subtle">
                  <span className="inline-flex items-center gap-2 rounded-full bg-white/5 px-3 py-1 soft-border">
                    {clauseStats.total} clauses
                  </span>
                  {clauseStats.any ? (
                    <span className="inline-flex items-center gap-2 rounded-full bg-white/5 px-3 py-1 soft-border">
                      {clauseStats.any} with matches ({clauseStats.high} high, {clauseStats.medium} medium, {clauseStats.low} low)
                    </span>
                  ) : null}
                </div>
              </div>

              <div className="sm:ml-auto">
                <input
                  value={clauseQuery}
                  onChange={(e) => setClauseQuery(e.target.value)}
                  placeholder="Search clauses (e.g., deposit, utilities, notice)..."
                  className="w-full sm:w-[360px] rounded-2xl soft-border bg-transparent px-4 py-2 text-sm focus-ring"
                />
              </div>
            </div>

            <div className="mt-4 space-y-2">
              {filteredClauses.length ? (
                filteredClauses.map((c) => {
                  const open = openClauseId === c.id;
                  const pe = normalizePlainEnglish(c.plainEnglish);

                  return (
                    <div key={c.id} className="rounded-2xl soft-border overflow-hidden bg-white/5">
                      <button
                        type="button"
                        onClick={() => setOpenClauseId((p) => (p === c.id ? null : c.id))}
                        className="w-full text-left px-4 py-3 hover:bg-white/5 focus-ring"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="font-semibold truncate">{c.title}</div>
                            <div className="mt-1 text-xs subtle truncate">
                              {pe.summary || c.plainEnglish || ""}
                            </div>
                          </div>
                          {c.severity ? (
                            <div
                              className={[
                                "shrink-0 rounded-full border px-3 py-1 text-xs font-semibold",
                                sevPill(c.severity),
                              ].join(" ")}
                            >
                              {c.severity.toUpperCase()}
                            </div>
                          ) : (
                            <div className="shrink-0 text-xs subtle">{open ? "Hide" : "Open"}</div>
                          )}
                        </div>
                      </button>

                      {open ? (
                        <div className="px-4 pb-4">
                          {/* ✅ Enhanced Plain English display */}
                          <div className="rounded-2xl p-3 text-sm soft-border bg-white/5">
                            <div className="text-xs subtle">Plain English (simplified)</div>
                            {pe.summary ? <div className="mt-1 font-medium">{pe.summary}</div> : null}
                            {pe.bullets.length > 1 ? (
                              <ul className="mt-2 space-y-1 text-sm">
                                {pe.bullets.slice(1).map((b, i) => (
                                  <li key={i}>• {b}</li>
                                ))}
                              </ul>
                            ) : null}
                          </div>

                          <div className="mt-3 text-xs subtle">Original clause</div>
                          <div className="mt-2 rounded-2xl soft-border bg-transparent p-3 text-xs whitespace-pre-wrap leading-relaxed">
                            {c.raw}
                          </div>

                          {c.matchedFlagIds?.length ? (
                            <div className="mt-3 text-xs subtle">
                              <span className="font-semibold">Matched patterns:</span>{" "}
                              {c.matchedFlagIds.join(", ")}
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  );
                })
              ) : (
                <div className="rounded-2xl soft-border p-4 text-sm subtle bg-white/5">
                  No clauses found{clauseQuery.trim() ? " for this search." : "."} If your lease is a scanned PDF, try Paste text mode.
                </div>
              )}
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
