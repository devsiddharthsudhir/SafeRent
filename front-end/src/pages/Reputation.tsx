import React, { useEffect, useMemo, useState } from "react";
import {
  Users,
  ShieldCheck,
  ShieldAlert,
  TrendingDown,
  TrendingUp,
  Minus,
  Lock,
} from "lucide-react";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { fetchReputation } from "../lib/api";
import type { AnalysisResult } from "../lib/types";

function safeJsonParse<T>(s: string | null): T | null {
  try {
    return s ? (JSON.parse(s) as T) : null;
  } catch {
    return null;
  }
}

function pct(n: number) {
  const v = Math.max(0, Math.min(100, n));
  return `${v.toFixed(1)}%`;
}

function riskBand(r: number) {
  if (r >= 60) return "High Risk";
  if (r >= 30) return "Caution";
  return "Low Risk";
}

function riskFill(r: number) {
  if (r >= 60) return "rgba(239,68,68,0.90)";
  if (r >= 30) return "rgba(245,158,11,0.90)";
  return "rgba(34,197,94,0.90)";
}

export default function Reputation() {
  const last = useMemo(
    () => safeJsonParse<AnalysisResult>((localStorage.getItem("saferent:lastAnalysis") ?? localStorage.getItem("rentpulse:lastAnalysis"))),
    []
  );

  const [subjectId, setSubjectId] = useState<string>(last?.listing?.landlord_subject_id || "subj_demo");
  const [rep, setRep] = useState<any | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string>("");

  useEffect(() => {
    let ok = true;
    (async () => {
      setBusy(true);
      setErr("");
      try {
        const r = await fetchReputation(subjectId);
        if (ok) setRep(r);
      } catch (e: any) {
        if (ok) setErr(e?.message || "Could not load reputation.");
      } finally {
        if (ok) setBusy(false);
      }
    })();
    return () => {
      ok = false;
    };
  }, [subjectId]);

  const days = (rep?.days || []) as Array<{ day: string; avgRisk: number; count: number }>;
  const totalAnalyses = Number(rep?.totalAnalyses || 0);
  const flagged = days.reduce((sum, d) => sum + (d.avgRisk >= 60 ? d.count : 0), 0);
  const flagRate = totalAnalyses ? (flagged / totalAnalyses) * 100 : 0;

  const trend = (() => {
    if (days.length < 2) return "stable" as const;
    const a = Number(days.at(-2)?.avgRisk || 0);
    const b = Number(days.at(-1)?.avgRisk || 0);
    const delta = b - a;
    if (Math.abs(delta) < 2) return "stable" as const;
    return delta < 0 ? "improving" : "worsening";
  })();

  const redFlagCounts = useMemo(() => {
    const s = last?.signals || [];
    const by = (pred: (t: string) => boolean) =>
      s.filter((x) => pred(`${x.label} ${x.why_it_matters} ${x.evidence ?? ""}`.toLowerCase())).length;
    return {
      missingContact: by((t) => t.includes("missing contact") || t.includes("no phone") || t.includes("no email")),
      stockPhotos: by((t) => t.includes("stock") || t.includes("reverse image") || t.includes("stolen photo")),
      pricing: by((t) => t.includes("price") || t.includes("below market") || t.includes("market")),
    };
  }, [last]);

  const analysisText = useMemo(() => {
    if (!days.length) return "No timeline data yet.";
    const first = Number(days[0]?.avgRisk || 0);
    const lastRisk = Number(days.at(-1)?.avgRisk || 0);
    const t = trend === "improving" ? "positive" : trend === "worsening" ? "negative" : "flat";
    return `Analysis: This agent shows a ${t} trend with average risk moving from ${first.toFixed(0)} to ${lastRisk.toFixed(0)} over the last ${days.length} points. The estimated flag rate is ${pct(flagRate)}.`;
  }, [days, trend, flagRate]);

  return (
    <div className="space-y-6">
      <div className="text-center">
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl soft-border" style={{ background: "rgba(46,196,255,0.10)" }}>
          <Users />
        </div>
        <div className="mt-4 text-3xl font-semibold">Agent Reputation Timeline</div>
        <div className="mt-2 text-sm subtle">Privacy-safe reputation tracking. No personal data stored—only aggregated patterns.</div>
      </div>

      <div className="rounded-2xl p-4 soft-border" style={{ background: "rgba(46,196,255,0.06)" }}>
        <div className="flex items-center gap-2 text-sm" style={{ color: "rgba(255,255,255,0.92)" }}>
          <Lock size={16} />
          <span className="font-semibold">Privacy-safe:</span>
          No sensitive personal information is stored. All data is anonymized and aggregated.
        </div>
      </div>

      {err ? (
        <div className="rounded-2xl p-4" style={{ border: "1px solid rgba(239, 68, 68, 0.25)", background: "rgba(239, 68, 68, 0.08)" }}>
          <div className="text-sm" style={{ color: "rgba(255,255,255,0.92)" }}>{err}</div>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-12">
        {/* Left rail */}
        <div className="space-y-4 lg:col-span-4">
          <div className="glass rounded-2xl p-4">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold">Overview</div>
              <div className="inline-flex items-center gap-2 text-xs subtle">
                {trend === "improving" ? <TrendingDown size={14} /> : trend === "worsening" ? <TrendingUp size={14} /> : <Minus size={14} />}
                {trend === "improving" ? "Improving" : trend === "worsening" ? "Worsening" : "Stable"}
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-2xl chip p-3">
                <div className="text-xs subtle">Total Listings</div>
                <div className="mt-1 text-xl font-semibold">{busy ? "…" : totalAnalyses || 0}</div>
              </div>
              <div className="rounded-2xl chip p-3">
                <div className="text-xs subtle">Flagged</div>
                <div className="mt-1 text-xl font-semibold">{busy ? "…" : flagged}</div>
              </div>
              <div className="rounded-2xl chip p-3">
                <div className="text-xs subtle">Flag Rate</div>
                <div className="mt-1 text-xl font-semibold">{busy ? "…" : pct(flagRate)}</div>
              </div>
              <div className="rounded-2xl chip p-3">
                <div className="text-xs subtle">Subject</div>
                <div className="mt-1 text-sm" style={{ color: "rgba(255,255,255,0.92)" }}>{subjectId}</div>
              </div>
            </div>

            <div className="mt-4">
              <div className="text-xs subtle">Switch subject (optional)</div>
              <input
                value={subjectId}
                onChange={(e) => setSubjectId(e.target.value)}
                className="input mt-2"
                placeholder="subj_..."
              />
            </div>
          </div>

          <div className="glass rounded-2xl p-4">
            <div className="text-sm font-semibold">Verification Status</div>
            <div className="mt-3 space-y-2">
              <Row label="Email Verified" status="Verified" tone="good" icon={<ShieldCheck size={16} />} />
              <Row label="Phone Verified" status="Verified" tone="good" icon={<ShieldCheck size={16} />} />
              <Row label="ID Verified" status="Pending" tone="muted" icon={<ShieldAlert size={16} />} />
              <Row label="Business License" status="Pending" tone="muted" icon={<ShieldAlert size={16} />} />
            </div>
          </div>

          <div className="glass rounded-2xl p-4">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold">Common Red Flags</div>
              <div className="text-xs subtle">From last analysis</div>
            </div>
            <div className="mt-3 space-y-2">
              <FlagRow label="Missing contact details" n={redFlagCounts.missingContact} />
              <FlagRow label="Stock photos detected" n={redFlagCounts.stockPhotos} />
              <FlagRow label="Pricing inconsistencies" n={redFlagCounts.pricing} />
            </div>
          </div>
        </div>

        {/* Main */}
        <div className="space-y-4 lg:col-span-8">
          <div className="glass rounded-2xl p-4">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold">Risk Score Over Time</div>
              <div className="text-xs subtle">Aggregated daily averages</div>
            </div>
            <div className="mt-3" style={{ height: 320 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={days} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
                  <XAxis dataKey="day" stroke="rgba(255,255,255,0.35)" tickLine={false} axisLine={false} />
                  <YAxis stroke="rgba(255,255,255,0.35)" tickLine={false} axisLine={false} domain={[0, 100]} />
                  <Tooltip
                    cursor={{ fill: "rgba(255,255,255,0.05)" }}
                    contentStyle={{ background: "rgba(10,14,24,0.95)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 14 }}
                    labelStyle={{ color: "rgba(255,255,255,0.92)" }}
                    formatter={(v: any, _k: any, p: any) => {
                      const num = Number(v);
                      return [`${num.toFixed(0)} (${riskBand(num)})`, "Avg Risk"];
                    }}
                  />
                  <Legend wrapperStyle={{ color: "rgba(255,255,255,0.70)" }} />
                  <Bar dataKey="avgRisk" name="Avg Risk" radius={[12, 12, 6, 6]}>
                    {days.map((d, i) => (
                      <Cell key={i} fill={riskFill(Number(d.avgRisk || 0))} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-4 text-sm subtle">{analysisText}</div>
            <div className="mt-2 text-xs subtle">Legend: Low Risk (&lt;30), Caution (30–59), High Risk (60+).</div>
          </div>

          <div className="glass rounded-2xl p-4">
            <div className="text-sm font-semibold">Notes</div>
            <div className="mt-2 text-sm subtle">
              This dashboard is a prototype view. In production, verification signals can be backed by platform-level reporting and abuse tracking while preserving user privacy.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({
  label,
  status,
  tone,
  icon,
}: {
  label: string;
  status: string;
  tone: "good" | "muted";
  icon: React.ReactNode;
}) {
  const pillStyle =
    tone === "good"
      ? { border: "1px solid rgba(34,197,94,0.30)", background: "rgba(34,197,94,0.10)", color: "rgba(255,255,255,0.92)" }
      : { border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.78)" };

  return (
    <div className="flex items-center justify-between rounded-2xl chip p-3">
      <div className="flex items-center gap-2">
        <span className="grid h-8 w-8 place-items-center rounded-2xl soft-border" style={{ background: "rgba(255,255,255,0.04)" }}>
          {icon}
        </span>
        <div className="text-sm" style={{ color: "rgba(255,255,255,0.92)" }}>{label}</div>
      </div>
      <span className="px-3 py-1 rounded-xl text-xs" style={pillStyle}>{status}</span>
    </div>
  );
}

function FlagRow({ label, n }: { label: string; n: number }) {
  return (
    <div className="flex items-center justify-between rounded-2xl chip p-3">
      <div className="text-sm" style={{ color: "rgba(255,255,255,0.92)" }}>{label}</div>
      <div className="grid h-7 min-w-[34px] place-items-center rounded-xl text-xs font-semibold" style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)" }}>
        {Number.isFinite(n) ? n : 0}
      </div>
    </div>
  );
}
