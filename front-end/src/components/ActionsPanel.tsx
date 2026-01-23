import { AlertTriangle, CheckCircle2, FileWarning, Shield } from "lucide-react";

export default function ActionsPanel({ actions, verdict }: { actions: string[]; verdict: string }) {
  const Icon = verdict === "likely_legit" ? CheckCircle2 : verdict === "likely_scam" ? AlertTriangle : Shield;

  return (
    <div className="glass rounded-2xl p-5">
      <div className="flex items-start gap-3">
        <div
          className="grid h-10 w-10 place-items-center rounded-2xl soft-border"
          style={{ background: "color-mix(in oklab, var(--sr-surface) 70%, transparent)" }}
        >
          <Icon size={18} />
        </div>
        <div>
          <div className="text-lg font-semibold">What to do next</div>
          <div className="text-sm subtle">Use this checklist before paying or sharing documents.</div>
        </div>
      </div>

      {/* ✅ readable in light mode */}
      <div
        className="mt-4 rounded-xl p-3 text-sm"
        style={{
          border: "1px solid color-mix(in oklab, var(--sr-med) 35%, var(--sr-border))",
          background: "color-mix(in oklab, var(--sr-med) 14%, transparent)",
          color: "var(--sr-text)",
        }}
      >
        <div className="flex items-center gap-2 font-semibold">
          <FileWarning size={16} /> Do not share sensitive documents
        </div>
        <div className="mt-1" style={{ color: "color-mix(in oklab, var(--sr-text) 92%, transparent)" }}>
          Do not upload or send a passport, driver’s licence, SIN, bank statement, or any identity documents to someone you have not verified.
        </div>
      </div>

      <ul className="mt-4 space-y-2">
        {(actions || []).map((a, i) => (
          <li key={i} className="chip rounded-xl p-3 text-sm" style={{ color: "var(--sr-text)" }}>
            <span className="font-semibold">{i + 1}.</span> {a}
          </li>
        ))}
      </ul>

      <div className="mt-4 text-xs subtle">
        If you believe a listing is fraudulent, report it on the platform and keep screenshots of messages, payment requests, and the listing page.
      </div>
    </div>
  );
}
