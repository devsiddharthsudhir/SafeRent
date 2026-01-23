import {
  ArrowRight,
  BarChart3,
  CheckCircle2,
  FileSearch,
  FileText,
  Link2,
  Shield,
  Sparkles,
  Zap,
} from "lucide-react";
import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";

function Pill({ children }: { children: ReactNode }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full chip px-3 py-1 text-xs soft-border">
      {children}
    </div>
  );
}

function FeatureCard({
  title,
  desc,
  icon,
}: {
  title: string;
  desc: string;
  icon: ReactNode;
}) {
  return (
    <div className="glass rounded-3xl p-5">
      <div className="flex items-start gap-3">
        <div
          className="grid h-11 w-11 place-items-center rounded-2xl ring-soft"
          style={{ background: "var(--sr-surface)" }}
          aria-hidden="true"
        >
          {icon}
        </div>
        <div className="min-w-0">
          <div className="text-base font-semibold">{title}</div>
          <div className="mt-1 text-sm subtle">{desc}</div>
        </div>
      </div>
    </div>
  );
}

function Step({
  n,
  title,
  desc,
  icon,
}: {
  n: number;
  title: string;
  desc: string;
  icon: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center text-center">
      <div className="relative">
        <div
          className="grid h-12 w-12 place-items-center rounded-2xl ring-soft"
          style={{ background: "var(--sr-surface)" }}
          aria-hidden="true"
        >
          {icon}
        </div>

        <div
          className="absolute -top-2 -right-2 grid h-7 w-7 place-items-center rounded-xl soft-border"
          style={{
            background: "color-mix(in oklab, var(--sr-cta) 22%, transparent)",
            color: "var(--sr-text)",
          }}
          aria-hidden="true"
        >
          <span className="text-xs font-extrabold">{n}</span>
        </div>
      </div>

      <div className="mt-3 text-sm font-semibold">{title}</div>
      <div className="mt-1 text-xs subtle max-w-[220px]">{desc}</div>
    </div>
  );
}

function ExampleCard() {
  return (
    <div className="glass-strong rounded-3xl p-5 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs subtle">Example output</div>
          <div className="text-sm font-semibold truncate">Rental Listing Scan</div>
        </div>
        <span className="badge">
          <Sparkles size={14} /> Explainable
        </span>
      </div>

      <div className="mt-5 grid grid-cols-[auto_1fr] gap-4 items-start">
        <div
          className="grid h-20 w-20 place-items-center rounded-3xl ring-soft"
          style={{
            background: "color-mix(in oklab, var(--sr-cta) 14%, transparent)",
          }}
        >
          <div className="text-center leading-tight">
            <div className="text-2xl font-extrabold">78</div>
            <div className="text-[11px] subtle font-semibold">High</div>
          </div>
        </div>

        <div className="min-w-0">
          <div className="text-sm font-semibold">High risk indicators</div>
          <div className="mt-1 text-xs subtle">
            Clear verdict + evidence + what to do next.
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <span className="badge">Too-good-to-be-true price</span>
            <span className="badge">Off-platform payment push</span>
            <span className="badge">Identity mismatch</span>
          </div>
        </div>
      </div>

      <div className="mt-5 grid gap-2 text-sm">
        <div className="grid grid-cols-[auto_1fr] items-start gap-2">
          <span className="badge shrink-0 whitespace-nowrap">Evidence</span>
          <span className="subtle">
            Asking for deposit before viewing + urgency language.
          </span>
        </div>
        <div className="grid grid-cols-[auto_1fr] items-start gap-2">
          <span className="badge shrink-0 whitespace-nowrap">Next step</span>
          <span className="subtle">
            Request in-person viewing, verify ownership, and compare cross-posts.
          </span>
        </div>
      </div>

      <div className="mt-4 soft-divider" />

      <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
        <div className="chip rounded-2xl p-3 soft-border">
          <div className="font-semibold">Inputs</div>
          <div className="mt-1 subtle">Link, text, screenshots</div>
        </div>
        <div className="chip rounded-2xl p-3 soft-border">
          <div className="font-semibold">Output</div>
          <div className="mt-1 subtle">Score, evidence, report</div>
        </div>
      </div>
    </div>
  );
}

export default function Landing() {
  const navigate = useNavigate();

  return (
    <div className="pb-10">
      {/* Hero */}
      <section className="pt-8 sm:pt-12">
        <div className="mx-auto max-w-6xl">
          <div className="grid gap-10 lg:grid-cols-2 lg:items-center">
            <div className="text-center lg:text-left">
              <Pill>
                <Sparkles size={14} /> Multimodal Scan (Explainable)
              </Pill>

              <h1 className="mt-6 text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight leading-[1.06]">
                Check a listing{" "}
                <span style={{ color: "var(--sr-accent)" }}>before</span> you pay
              </h1>

              <p className="mt-5 text-base sm:text-lg subtle max-w-2xl mx-auto lg:mx-0">
                Detect rental scams and predatory patterns using listing text,
                images, and behavioral signals. Get an evidence-backed verdict
                you can act on.
              </p>

              <div className="mt-8 flex flex-col sm:flex-row items-stretch sm:items-center justify-center lg:justify-start gap-3">
                <button
                  type="button"
                  onClick={() => navigate("/checker")}
                  className="inline-flex w-full sm:w-auto items-center justify-center gap-2 rounded-2xl px-5 py-3 text-sm font-semibold btn-primary soft-border focus-ring"
                >
                  Paste Listing <ArrowRight size={16} />
                </button>
                <button
                  type="button"
                  onClick={() => navigate("/checker?demo=1")}
                  className="inline-flex w-full sm:w-auto items-center justify-center gap-2 rounded-2xl px-5 py-3 text-sm font-semibold chip soft-border hover:opacity-95 focus-ring"
                >
                  Try Demo Listing
                </button>
              </div>

              <div className="mt-6 flex flex-wrap items-center justify-center lg:justify-start gap-4 text-xs subtle">
                <span className="inline-flex items-center gap-2">
                  <CheckCircle2 size={14} /> Evidence-first
                </span>
                <span className="inline-flex items-center gap-2">
                  <Shield size={14} /> Privacy-safe
                </span>
                <span className="inline-flex items-center gap-2">
                  <Zap size={14} /> Fast triage
                </span>
              </div>

              <div className="mt-6">
                <div className="text-xs subtle">
                  Import from common rental sites and shareable links
                </div>
                <div className="mt-2 flex flex-wrap justify-center lg:justify-start gap-2">
                  <span className="badge">Facebook Marketplace</span>
                  <span className="badge">Craigslist</span>
                  <span className="badge">Kijiji</span>
                  <span className="badge">Rentals.ca</span>
                  <span className="badge">Zumper</span>
                  <span className="badge">PadMapper</span>
                </div>
                <div className="mt-2 text-[11px] subtle">
                  SafeRent is not affiliated with these platforms.
                </div>
              </div>
            </div>

            {/* Visual / example (stacks under hero on mobile) */}
            <div className="max-w-xl mx-auto w-full">
              <ExampleCard />
            </div>
          </div>
        </div>
      </section>

      {/* Value props */}
      <section className="mt-14 sm:mt-18">
        <div className="text-center">
          <div className="text-sm font-semibold" style={{ color: "var(--sr-accent)" }}>
            Transparent Protection
          </div>
          <h2 className="mt-2 text-2xl sm:text-3xl font-bold">
            Every flag comes with evidence
          </h2>
          <p className="mt-3 text-sm subtle max-w-2xl mx-auto">
            Understand what was flagged, why it matters, and what to do next.
          </p>
        </div>

        <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4">
          <FeatureCard
            title="Calibrated Risk Score"
            desc="A 0–100 score with confidence hints and Canada-focused heuristics."
            icon={<Shield size={18} />}
          />
          <FeatureCard
            title="Explainable Evidence"
            desc="See which signals triggered: pricing, language, image checks, and cross-posts."
            icon={<Sparkles size={18} />}
          />
          <FeatureCard
            title="Actionable Next Steps"
            desc="Practical guidance: verify, document, and report safely if needed."
            icon={<FileText size={18} />}
          />
        </div>
      </section>

      {/* What you can do */}
      <section className="mt-16">
        <div className="grid gap-4 md:grid-cols-3">
          <div className="bento rounded-3xl p-6 md:col-span-2">
            <div className="text-sm font-semibold" style={{ color: "var(--sr-accent)" }}>
              Built for renters
            </div>
            <h3 className="mt-2 text-xl sm:text-2xl font-bold">
              Make safer decisions in minutes
            </h3>
            <p className="mt-2 text-sm subtle max-w-2xl">
              Use SafeRent before you send a deposit, share documents, or commit
              to a lease. It is designed to be clear on mobile and explain its
              reasoning.
            </p>

            <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="chip rounded-3xl p-4 soft-border">
                <div className="text-sm font-semibold">Listing Checker</div>
                <div className="mt-1 text-xs subtle">
                  Paste a link or text and get a verdict with evidence.
                </div>
              </div>
              <div className="chip rounded-3xl p-4 soft-border">
                <div className="text-sm font-semibold">Lease Simplifier</div>
                <div className="mt-1 text-xs subtle">
                  Upload lease text to spot risky clauses and plain-language summaries.
                </div>
              </div>
            </div>
          </div>

          <div className="glass rounded-3xl p-6">
            <div className="text-sm font-semibold">Good UX by default</div>
            <p className="mt-2 text-sm subtle">
              No clutter. Clear calls-to-action. Designed to stay readable in
              dark and light modes.
            </p>

            <div className="mt-4 space-y-2 text-xs subtle">
              <div className="flex items-center justify-between chip rounded-2xl p-3 soft-border">
                <span className="font-semibold" style={{ color: "var(--sr-text)" }}>
                  Mobile-first layout
                </span>
                <span>✓</span>
              </div>
              <div className="flex items-center justify-between chip rounded-2xl p-3 soft-border">
                <span className="font-semibold" style={{ color: "var(--sr-text)" }}>
                  Evidence UI
                </span>
                <span>✓</span>
              </div>
              <div className="flex items-center justify-between chip rounded-2xl p-3 soft-border">
                <span className="font-semibold" style={{ color: "var(--sr-text)" }}>
                  Privacy-safe reports
                </span>
                <span>✓</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="mt-16">
        <div className="text-center">
          <h3 className="text-xl font-bold">How it works</h3>
          <p className="mt-2 text-sm subtle">
            Four simple steps to protect yourself from rental scams.
          </p>
        </div>

        <div className="relative mt-10">
          <div
            className="hidden md:block absolute left-12 right-12"
            style={{
              top: 24,
              height: 1,
              background: "color-mix(in oklab, var(--sr-text) 14%, transparent)",
            }}
          />

          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            <Step n={1} title="Import" desc="Paste a URL or listing text." icon={<Link2 size={18} />} />
            <Step n={2} title="Analyze" desc="NLP + image forensics + behavior." icon={<FileSearch size={18} />} />
            <Step n={3} title="Score" desc="Calibrated risk score and verdict." icon={<BarChart3 size={18} />} />
            <Step n={4} title="Explain" desc="Evidence panel + next actions." icon={<FileText size={18} />} />
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="mt-16">
        <div className="glass-strong rounded-3xl p-7 sm:p-8 text-center">
          <h3 className="text-2xl font-bold">Check before you pay</h3>
          <p className="mt-2 subtle text-sm max-w-2xl mx-auto">
            A quick scan can help you avoid losing deposits, documents, and time.
          </p>

          <div className="mt-6 flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => navigate("/checker")}
              className="inline-flex w-full sm:w-auto items-center justify-center gap-2 rounded-2xl px-6 py-3 text-sm font-semibold btn-primary soft-border focus-ring"
            >
              Start Checking Now <ArrowRight size={16} />
            </button>
            <button
              type="button"
              onClick={() => navigate("/lease")}
              className="inline-flex w-full sm:w-auto items-center justify-center gap-2 rounded-2xl px-6 py-3 text-sm font-semibold chip soft-border hover:opacity-95 focus-ring"
            >
              Simplify a Lease
            </button>
          </div>

          <div className="mt-6 text-xs subtle">
            Evidence-first. Privacy-safe. Built for renters.
          </div>
        </div>
      </section>
    </div>
  );
}
