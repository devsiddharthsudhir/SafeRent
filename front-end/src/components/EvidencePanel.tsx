import React, { useMemo, useState } from "react";
import type { Signal } from "../lib/types";
import { Filter, Info } from "lucide-react";

const cats: Signal["category"][] = ["Words", "Price", "Behavior", "Images", "Web"];

function sevDot(sev: Signal["severity"]) {
  if (sev === "high") return "bg-red-600";
  if (sev === "medium") return "bg-amber-500";
  return "bg-slate-300";
}

export default function EvidencePanel({ signals }: { signals: Signal[] }) {
  const [active, setActive] = useState<Signal["category"] | "All">("All");

  const filtered = useMemo(() => {
    const s = signals || [];
    return active === "All" ? s : s.filter(x => x.category === active);
  }, [signals, active]);

  return (
    <div className="glass rounded-2xl p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-lg font-semibold">Why this looks risky</div>
          <div className="text-sm subtle">Clear reasons in plain language.</div>
        </div>

        <div className="flex items-center gap-2">
          <div className="inline-flex items-center gap-2 text-xs subtle">
            <Filter size={14} /> Filter:
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setActive("All")}
              className={
                "chip rounded-xl px-3 py-2 text-sm focus-ring transition hover:opacity-95 " +
                (active === "All" ? "ring-soft" : "")
              }
            >
              All
            </button>
            {cats.map((c) => (
              <button
                key={c}
                onClick={() => setActive(c)}
                className={
                  "chip rounded-xl px-3 py-2 text-sm focus-ring transition hover:opacity-95 " +
                  (active === c ? "ring-soft" : "")
                }
              >
                {c}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-3">
        {filtered.length === 0 ? (
          <div className="rounded-xl chip p-4 text-sm subtle">
            No signals in this category. That is usually a good sign.
          </div>
        ) : null}

        {filtered.map((s) => (
          <details key={s.id} className="rounded-2xl chip p-4">
            <summary className="cursor-pointer list-none">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                  <span className={"mt-1 h-2.5 w-2.5 rounded-full " + sevDot(s.severity)} />
                  <div className="min-w-0">
                    <div className="font-semibold">{s.label}</div>
                    <div className="text-xs subtle">Category: {s.category}</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-semibold">Impact</div>
                  <div className="text-xs subtle">{Math.round(Math.abs(s.contribution) * 100) / 100}</div>
                </div>
              </div>
            </summary>

            <div className="mt-3 rounded-xl glass p-4 soft-border">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Info size={16} /> Why it matters
              </div>
              <div className="mt-1 text-sm subtle">{s.why_it_matters}</div>
              {s.evidence ? (
                <>
                  <div className="mt-3 text-sm font-semibold">Evidence</div>
                  <div className="text-sm subtle">{s.evidence}</div>
                </>
              ) : null}
            </div>
          </details>
        ))}
      </div>
    </div>
  );
}
