import React from "react";

function clamp(n: number) {
  return Math.max(0, Math.min(100, n));
}

function verdictCopy(v: string, score: number) {
  // Keep language non-defamatory and non-absolute.
  if (v === "likely_scam") {
    return {
      title: "High risk indicators",
      subtitle: "Multiple signals match common scam patterns. Verify before you pay.",
      color: "var(--rp-high)",
    };
  }
  if (v === "likely_predatory") {
    return {
      title: "Higher risk indicators",
      subtitle: "Some signals suggest unfair or pressuring terms. Ask for everything in writing.",
      color: "var(--rp-med)",
    };
  }
  if (v === "likely_legit") {
    return {
      title: "Fewer risk indicators",
      subtitle: "No major red flags found. Still verify the unit, lease, and identity.",
      color: "var(--rp-low)",
    };
  }
  // Unclear
  return {
    title: "Needs verification",
    subtitle: "The signals are mixed. Follow the safety checklist before paying.",
    color: score >= 50 ? "var(--rp-med)" : "var(--rp-low)",
  };
}

export default function RiskDial({ score, verdict }: { score: number; verdict: string }) {
  const s = clamp(Number(score) || 0);
  const copy = verdictCopy(verdict, s);

  return (
    <div className="glass rounded-2xl p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-sm subtle">Risk score</div>
          <div className="text-xl font-semibold">{copy.title}</div>
          <div className="text-sm subtle mt-1">{copy.subtitle}</div>
        </div>

        <div className="text-right">
          <div className="text-3xl font-semibold">
            {s}
            <span className="text-sm subtle font-semibold"> / 100</span>
          </div>
          <div className="text-xs subtle">Signals only. Not legal advice.</div>
        </div>
      </div>

      <div className="mt-4">
        <div
          className="h-2.5 w-full rounded-full"
          style={{ background: "rgba(255,255,255,0.08)" }}
        >
          <div
            className="h-2.5 rounded-full"
            style={{ width: `${s}%`, background: copy.color }}
          />
        </div>
        <div className="mt-2 flex justify-between text-xs subtle">
          <span>0</span>
          <span>50</span>
          <span>100</span>
        </div>
      </div>
    </div>
  );
}
