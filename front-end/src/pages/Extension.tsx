import { ArrowRight, Chrome, Shield } from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function Extension() {
  const navigate = useNavigate();
  const chromeWebStoreUrl = (import.meta as any).env?.VITE_CHROME_EXTENSION_URL || "";

  return (
    <div className="mx-auto max-w-3xl">
      <div className="glass rounded-3xl p-6 sm:p-8">
        <div className="flex items-start gap-3">
          <div
            className="grid h-11 w-11 place-items-center rounded-2xl ring-soft"
            style={{ background: "var(--sr-surface)" }}
            aria-hidden="true"
          >
            <Chrome size={18} />
          </div>
          <div className="min-w-0">
            <div className="text-2xl font-semibold">SafeRent Browser Extension</div>
            <p className="mt-2 text-sm subtle">
              Some rental sites make copying difficult. The extension imports the listing you are viewing and opens it in
              SafeRent for a fast, explainable check.
            </p>
          </div>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <div className="chip rounded-2xl p-4 soft-border">
            <div className="text-sm font-semibold">Install (recommended)</div>
            <p className="mt-1 text-sm subtle">
              Install from the Chrome Web Store and pin it so it’s always one click away.
            </p>

            {chromeWebStoreUrl ? (
              <a
                href={chromeWebStoreUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-2 text-sm font-semibold btn-primary soft-border focus-ring"
              >
                Open Chrome Web Store <ArrowRight size={16} />
              </a>
            ) : (
              <div className="mt-4 rounded-2xl bg-white/40 p-3 text-xs subtle soft-border">
                Chrome Web Store link not configured yet. Set <b>VITE_CHROME_EXTENSION_URL</b> in Netlify when you publish
                the extension.
              </div>
            )}
          </div>

          <div className="chip rounded-2xl p-4 soft-border">
            <div className="text-sm font-semibold">How to use</div>
            <ol className="mt-2 text-sm space-y-2 list-decimal list-inside">
              <li>Open a rental listing in Chrome.</li>
              <li>Click the SafeRent extension icon.</li>
              <li>Choose <b>Import</b> (or <b>Scan this listing</b>).</li>
              <li>SafeRent opens the Checker with details filled in.</li>
            </ol>
            <button
              type="button"
              onClick={() => navigate("/checker")}
              className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-2 text-sm font-semibold chip soft-border hover:opacity-95 focus-ring"
            >
              Open the Checker <ArrowRight size={16} />
            </button>
          </div>
        </div>

        <div className="mt-4 flex items-start gap-2 rounded-2xl p-4 soft-border" style={{ background: "var(--sr-surface)" }}>
          <Shield size={16} className="mt-0.5" />
          <div className="text-xs subtle">
            Privacy note: the extension only imports the listing content you’re viewing so SafeRent can analyze it. Avoid
            importing personal messages or payment details.
          </div>
        </div>

        <details className="mt-5">
          <summary className="cursor-pointer text-sm font-semibold">Advanced: manual install</summary>
          <div className="mt-3 chip rounded-2xl p-4 soft-border">
            <p className="text-sm subtle">
              If you’re testing locally (or the Web Store isn’t available), you can install from the project folder.
            </p>
            <ol className="mt-2 text-sm space-y-2 list-decimal list-inside">
              <li>Open <span className="font-mono">chrome://extensions</span></li>
              <li>Turn on <b>Developer mode</b></li>
              <li>Click <b>Load unpacked</b> and select the <span className="font-mono">extension/</span> folder</li>
              <li>Pin the extension and use it on listing pages</li>
            </ol>
          </div>
        </details>
      </div>
    </div>
  );
}
