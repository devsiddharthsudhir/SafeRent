import { ArrowRight, BarChart3, CheckCircle2, FileSearch, FileSignature, FileText, Link2, Shield, Sparkles, Zap } from "lucide-react";
import { useNavigate } from "react-router-dom";

function Pill({ children }: { children: React.ReactNode }) {
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
  icon: React.ReactNode;
}) {
  return (
    <div className="glass rounded-3xl p-5">
      <div className="flex items-start gap-3">
        <div
          className="grid h-11 w-11 place-items-center rounded-2xl ring-soft"
          style={{ background: "var(--sr-surface)" }}
        >
          {icon}
        </div>
        <div>
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
  icon: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center text-center">
      <div className="relative">
        <div
          className="grid h-12 w-12 place-items-center rounded-2xl ring-soft"
          style={{ background: "var(--sr-surface)" }}
        >
          {icon}
        </div>

        {/* ✅ FIX: number bubble anchored to icon */}
        <div
          className="absolute -top-2 -right-2 grid h-7 w-7 place-items-center rounded-xl soft-border"
          style={{
            background: "color-mix(in oklab, var(--sr-cta) 22%, transparent)",
            color: "var(--sr-text)",
          }}
        >
          <span className="text-xs font-extrabold">{n}</span>
        </div>
      </div>

      <div className="mt-3 text-sm font-semibold">{title}</div>
      <div className="mt-1 text-xs subtle max-w-[200px]">{desc}</div>
    </div>
  );
}

function QuickAction({
  title,
  desc,
  cta,
  onClick,
  icon,
}: {
  title: string;
  desc: string;
  cta: string;
  onClick: () => void;
  icon: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-left glass rounded-3xl p-5 hover:opacity-95 focus-ring"
    >
      <div className="flex items-start gap-3">
        <div
          className="grid h-11 w-11 place-items-center rounded-2xl ring-soft"
          style={{ background: "var(--sr-surface)" }}
        >
          {icon}
        </div>
        <div className="min-w-0">
          <div className="text-base font-semibold">{title}</div>
          <div className="mt-1 text-sm subtle">{desc}</div>
          <div className="mt-4 inline-flex items-center gap-2 text-sm font-semibold" style={{ color: "var(--sr-accent)" }}>
            {cta} <ArrowRight size={16} />
          </div>
        </div>
      </div>
    </button>
  );
}

export default function Landing() {
  const navigate = useNavigate();

  return (
    <div className="pb-10">
      {/* Hero */}
      <section className="pt-10 sm:pt-14">
        <div className="mx-auto max-w-4xl text-center">
          <Pill>
            <Sparkles size={14} /> Multimodal Scan (Explainable)
          </Pill>

          {/* Mobile typography: avoid lonely trailing words like "pay" on a new line */}
          <h1 className="mt-6 text-[38px] sm:text-6xl font-extrabold tracking-tight leading-[1.06]">
            <span className="block sm:inline">Check a listing</span>{" "}
            <span className="block sm:inline">
              <span style={{ color: "var(--sr-accent)" }}>before</span> you pay
            </span>
          </h1>

          <p className="mt-5 text-base sm:text-lg subtle">
            SAFERENT detects scam and predatory patterns using listing text, images, and behavior signals and shows you
            exactly why a listing was flagged.
          </p>

          <div className="mt-8 flex w-full max-w-xl flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3 mx-auto">
            <button
              type="button"
              onClick={() => navigate("/checker")}
              className="inline-flex w-full items-center justify-center gap-2 rounded-2xl px-5 py-3 text-sm font-semibold btn-primary soft-border focus-ring"
            >
              Paste Listing <ArrowRight size={16} />
            </button>
            <button
              type="button"
              onClick={() => navigate("/checker?demo=1")}
              className="inline-flex w-full items-center justify-center gap-2 rounded-2xl px-5 py-3 text-sm font-semibold chip soft-border hover:opacity-95 focus-ring"
            >
              Try Demo Listing
            </button>
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-4 text-xs subtle">
            <span className="inline-flex items-center gap-2">
              <CheckCircle2 size={14} /> Research-driven
            </span>
            <span className="inline-flex items-center gap-2">
              <Shield size={14} /> Privacy-safe
            </span>
            <span className="inline-flex items-center gap-2">
              <FileText size={14} /> Human-in-the-loop
            </span>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="mt-14 sm:mt-18">
        <div className="text-center">
          <div className="text-sm font-semibold" style={{ color: "var(--sr-accent)" }}>
            Transparent Protection
          </div>
          <h2 className="mt-2 text-2xl sm:text-3xl font-bold">Every flag comes with evidence</h2>
          <p className="mt-3 text-sm subtle">Understand exactly what was flagged and what to do next.</p>
        </div>

        <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4">
          <FeatureCard title="Calibrated Risk Score" desc="A 0–100 score with confidence bands and Canada-focused heuristics." icon={<Shield size={18} />} />
          <FeatureCard title="Explainable Evidence" desc="See which signals triggered: pricing, language, image checks, cross-posts." icon={<Sparkles size={18} />} />
          <FeatureCard title="Report Workflow" desc="Generate a privacy-safe report for platforms or authorities." icon={<FileText size={18} />} />
        </div>
      </section>

      {/* How it works */}
      <section className="mt-16">
        <div className="text-center">
          <h3 className="text-xl font-bold">How it Works</h3>
          <p className="mt-2 text-sm subtle">Four simple steps to protect yourself from rental scams.</p>
        </div>

        <div className="relative mt-10">
          {/* ✅ line works in both themes */}
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

      {/* Replace self-referential UX blocks with renter-facing value */}
      <section className="mt-16">
        <div className="grid gap-6 md:grid-cols-12 md:items-start">
          <div className="md:col-span-5">
            <div className="glass rounded-3xl p-6">
              <div className="text-sm font-semibold" style={{ color: "var(--sr-accent)" }}>
                Built for Canadian renters
              </div>
              <h3 className="mt-2 text-xl font-bold">Know the risk before you send money</h3>
              <p className="mt-3 text-sm subtle">
                SafeRent is designed around the moments renters actually get scammed: rushed deposits, missing proof of
                ownership, and listings copied across sites with different prices.
              </p>

              <div className="mt-5 grid gap-2">
                <div className="chip rounded-2xl px-4 py-3 soft-border">
                  <div className="text-sm font-semibold">Evidence-first verdict</div>
                  <div className="mt-1 text-xs subtle">See the exact signals that triggered the score.</div>
                </div>
                <div className="chip rounded-2xl px-4 py-3 soft-border">
                  <div className="text-sm font-semibold">Lease red-flag check</div>
                  <div className="mt-1 text-xs subtle">Plain-English summary + suspicious clause highlights.</div>
                </div>
                <div className="chip rounded-2xl px-4 py-3 soft-border">
                  <div className="text-sm font-semibold">Cross-post comparisons</div>
                  <div className="mt-1 text-xs subtle">Spot mismatched pricing and duplicated listings quickly.</div>
                </div>
              </div>
            </div>
          </div>

          <div className="md:col-span-7 grid gap-4">
            <QuickAction
              title="Check a listing"
              desc="Paste a link or text. Get a risk score, evidence, and next steps."
              cta="Open Checker"
              onClick={() => navigate("/checker")}
              icon={<Zap size={18} />}
            />
            <QuickAction
              title="Simplify a lease"
              desc="Upload a PDF or paste clauses to catch predatory terms before signing."
              cta="Open Lease Simplifier"
              onClick={() => navigate("/lease")}
              icon={<FileSignature size={18} />}
            />
            <QuickAction
              title="Find similar listings"
              desc="Compare against nearby listings and spot suspicious outliers."
              cta="Open Similar Listings"
              onClick={() => navigate("/similar-listings")}
              icon={<Link2 size={18} />}
            />
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="mt-16">
        <div className="glass-strong rounded-3xl p-8 text-center">
          <h3 className="text-2xl font-bold">Don’t get scammed on your next rental</h3>
          <p className="mt-2 subtle text-sm">Join thousands of renters who check listings before paying deposits.</p>
          <button
            type="button"
            onClick={() => navigate("/checker")}
            className="mt-6 inline-flex items-center justify-center gap-2 rounded-2xl px-6 py-3 text-sm font-semibold btn-primary soft-border focus-ring"
          >
            Start Checking Now <ArrowRight size={16} />
          </button>
          <div className="mt-6 text-xs subtle">Research-driven. Privacy-safe. Human-in-the-loop.</div>
        </div>
      </section>
    </div>
  );
}
