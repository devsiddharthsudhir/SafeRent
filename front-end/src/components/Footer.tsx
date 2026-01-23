import { ExternalLink, Github } from "lucide-react";
import React from "react";
import { NavLink, useNavigate } from "react-router-dom";

import logoPng from "../assets/saferent-logo.png";

function FooterLink({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <NavLink to={to} className="text-sm subtle hover:opacity-90 focus-ring rounded-xl px-2 py-1">
      {children}
    </NavLink>
  );
}

export default function Footer() {
  const navigate = useNavigate();
  const year = new Date().getFullYear();

  return (
    <footer className="mt-10">
      <div className="mx-auto max-w-7xl px-4 pb-10">
        <div className="glass rounded-3xl p-6 sm:p-8">
          <div className="grid gap-8 md:grid-cols-12 md:items-start">
            <div className="md:col-span-5">
              <div className="flex items-center gap-3">
                <div
                  className="grid h-11 w-11 place-items-center rounded-2xl ring-soft overflow-hidden"
                  style={{ background: "var(--sr-surface)" }}
                  aria-hidden="true"
                >
                  <img
                    src={logoPng}
                    alt=""
                    className="h-7 w-7 object-contain"
                    draggable={false}
                  />
                </div>
                <div>
                  <div className="text-lg font-extrabold tracking-wide">
                    <span style={{ color: "var(--sr-text)" }}>SAFE</span>
                    <span style={{ color: "var(--sr-accent)" }}>RENT</span>
                  </div>
                  <div className="text-[11px] subtle tracking-[0.18em]">VERIFY BEFORE YOU RENT</div>
                </div>
              </div>

              <p className="mt-4 text-sm subtle max-w-[52ch]">
                Explainable rental safety checks for Canada: scam patterns, predatory clauses, and cross-post signals.
              </p>

              <div className="mt-5 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => navigate("/checker")}
                  className="inline-flex items-center gap-2 rounded-2xl px-4 py-2 text-sm font-semibold btn-primary soft-border focus-ring"
                >
                  Check a listing <ExternalLink size={16} />
                </button>

                <a
                  href="#"
                  onClick={(e) => e.preventDefault()}
                  className="inline-flex items-center gap-2 rounded-2xl px-4 py-2 text-sm font-semibold chip soft-border hover:opacity-95 focus-ring"
                >
                  GitHub <Github size={16} />
                </a>
              </div>
            </div>

            <div className="md:col-span-7 grid gap-6 sm:grid-cols-3">
              <div>
                <div className="text-sm font-semibold">Product</div>
                <div className="mt-3 flex flex-col gap-1">
                  <FooterLink to="/checker">Listing Checker</FooterLink>
                  <FooterLink to="/lease">Lease Simplifier</FooterLink>
                  <FooterLink to="/report">Report Workflow</FooterLink>
                  <FooterLink to="/reputation">Reputation</FooterLink>
                </div>
              </div>

              <div>
                <div className="text-sm font-semibold">Learn</div>
                <div className="mt-3 flex flex-col gap-1">
                  <FooterLink to="/safety">Safety Tips</FooterLink>
                  <FooterLink to="/emergency">Emergency</FooterLink>
                  <FooterLink to="/similar-listings">Similar Listings</FooterLink>
                  <FooterLink to="/extension">Browser Extension</FooterLink>
                  <FooterLink to="/import">Import</FooterLink>
                </div>
              </div>

              <div>
                <div className="text-sm font-semibold">Legal</div>
                <div className="mt-3 flex flex-col gap-1">
                  <FooterLink to="/privacy">Privacy</FooterLink>
                  <FooterLink to="/terms">Terms</FooterLink>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-8 soft-divider" />

          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-xs subtle">© {year} SAFERENT. All rights reserved.</div>
            <div className="text-xs subtle max-w-[72ch]">
              SAFERENT provides signals and guidance, not legal advice. Always verify ownership and never pay deposits
              before viewing and signing.
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
