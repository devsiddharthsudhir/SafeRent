import React from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, RefreshCw } from "lucide-react";

type State = { hasError: boolean; message?: string };

export default class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  State
> {
  state: State = { hasError: false };

  static getDerivedStateFromError(err: unknown) {
    return { hasError: true, message: err instanceof Error ? err.message : "Unexpected error" };
  }

  componentDidCatch(err: unknown) {
    // Keep it simple: console only. Production deployments can wire this to Sentry.
    // eslint-disable-next-line no-console
    console.error("UI ErrorBoundary", err);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="min-h-[60vh] grid place-items-center px-4">
        <div className="glass-strong rounded-[2rem] p-6 sm:p-10 max-w-xl w-full">
          <div className="flex items-start gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-2xl bg-rose-50 border border-rose-100">
              <AlertTriangle size={18} />
            </div>
            <div className="min-w-0">
              <div className="text-lg font-semibold tracking-tight">Something went wrong</div>
              <div className="mt-1 text-sm subtle">
                {this.state.message || "Unexpected error"}. Try reloading, or go back home.
              </div>
            </div>
          </div>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <button
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white shadow-sm focus-ring"
              onClick={() => window.location.reload()}
            >
              <RefreshCw size={16} />
              Reload
            </button>
            <Link
              to="/"
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-white px-5 py-3 text-sm font-semibold soft-border hover:shadow-sm focus-ring"
            >
              Back to Home
            </Link>
          </div>

          <div className="mt-4 text-xs subtle">If this keeps happening, open the browser console and share the error log with support.</div>
        </div>
      </div>
    );
  }
}
