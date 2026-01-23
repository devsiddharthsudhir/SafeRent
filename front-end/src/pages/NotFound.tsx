import { ArrowLeft, FileText, Home, Search, ShieldAlert } from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function NotFound() {
  const navigate = useNavigate();

  return (
    <div className="mx-auto grid min-h-[60vh] max-w-3xl place-items-center px-4 py-10">
      <div className="glass-strong w-full rounded-3xl p-6 shadow-soft md:p-10">
        <div className="flex flex-col gap-6 md:flex-row md:items-start md:gap-8">
          {/* icon */}
          <div
            className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl ring-soft"
            style={{ background: "var(--sr-surface)" }}
            aria-hidden="true"
          >
            <ShieldAlert size={22} />
          </div>

          {/* content */}
          <div className="min-w-0">
            <div className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ring-soft" style={{ background: "var(--sr-surface)" }}>
              <span className="opacity-80">Error</span>
              <span className="opacity-80">•</span>
              <span className="tracking-widest">404</span>
            </div>

            <h1 className="mt-3 text-2xl font-extrabold leading-tight md:text-3xl">
              We couldn’t find that page
            </h1>

            <p className="mt-2 subtle max-w-prose">
              The link may be outdated, or the page might have moved. Try one of these safe routes:
            </p>

            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => navigate("/")}
                className="btn-primary w-full justify-center inline-flex items-center gap-2"
              >
                <Home size={16} />
                Go to Home
              </button>

              <button
                type="button"
                onClick={() => navigate("/checker")}
                className="btn-secondary w-full justify-center inline-flex items-center gap-2"
              >
                <Search size={16} />
                Open Checker
              </button>

              <button
                type="button"
                onClick={() => navigate("/lease")}
                className="btn-secondary w-full justify-center inline-flex items-center gap-2"
              >
                <FileText size={16} />
                Lease Simplifier
              </button>

              <button
                type="button"
                onClick={() => navigate("/report")}
                className="btn-secondary w-full justify-center inline-flex items-center gap-2"
              >
                <ShieldAlert size={16} />
                Report an issue
              </button>
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-2 text-sm">
              <button
                type="button"
                onClick={() => window.history.back()}
                className="inline-flex items-center gap-2 rounded-full px-3 py-1 ring-soft hover:opacity-90"
                style={{ background: "var(--sr-surface)" }}
              >
                <ArrowLeft size={16} />
                Go back
              </button>

              <span className="subtle">or paste a listing into the Checker to continue.</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
