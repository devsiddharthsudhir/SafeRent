import {
  AlertTriangle,
  FileSignature,
  FileText,
  Home,
  Layers,
  LayoutGrid,
} from "lucide-react";
import React, { useEffect } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import Footer from "./Footer";

import logoPng from "../assets/saferent-logo.png";

type NavItem = {
  to: string;
  label: string;
  Icon: React.ComponentType<{ size?: number | string; className?: string }>;
};

// ✅ Reputation removed
// ✅ Similar Listings added
// ✅ Emergency is NOT in nav (only red button)
const NAV: NavItem[] = [
  { to: "/", label: "Home", Icon: Home },
  { to: "/checker", label: "Checker", Icon: LayoutGrid },
  { to: "/lease", label: "Lease", Icon: FileSignature },
  { to: "/similar-listings", label: "Similar", Icon: Layers },
  { to: "/report", label: "Report", Icon: FileText },
];

function applyLightTheme() {
  // Keep the experience consistent for consumers (no theme toggle).
  document.documentElement.dataset.theme = "light";
  try {
    localStorage.setItem("saferent:theme", "light");
  } catch {
    // ignore
  }
}

function BrandMark() {
  return (
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
  );
}

export default function Shell({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();

  useEffect(() => {
    applyLightTheme();
  }, []);

  return (
    <div className="app-grid min-h-screen">
      <header className="sticky top-0 z-50">
        <div className="mx-auto max-w-7xl px-4 py-4">
          <div className="glass-strong rounded-3xl px-5 py-3">
            {/*
              Mobile-first header layout.
              - Prevents brand/tagline from getting squeezed (no 1/3 columns).
              - Keeps controls readable and tap-friendly.
            */}
            <div className="grid grid-cols-[auto_1fr_auto] items-center gap-3">
              <button
                type="button"
                onClick={() => navigate("/")}
                className="flex min-w-0 items-center gap-3 focus-ring rounded-2xl px-2 py-1 justify-self-start"
              >
                <BrandMark />
                <div className="min-w-0 leading-tight">
                  <div className="text-lg font-extrabold tracking-wide">
                    <span style={{ color: "var(--sr-text)" }}>SAFE</span>
                    <span style={{ color: "var(--sr-accent)" }}>RENT</span>
                  </div>
                  {/* Hide tagline on very small screens to avoid wrap/overlap */}
                  <div className="hidden sm:block text-[11px] subtle tracking-[0.18em] truncate">
                    VERIFY BEFORE YOU RENT
                  </div>
                </div>
              </button>

              <nav className="hidden md:flex items-center justify-center gap-8 justify-self-center">
                {NAV.map(({ to, label, Icon }) => (
                  <NavLink
                    key={to}
                    to={to}
                    className={({ isActive }) =>
                      ["navlink", isActive ? "navlink-active" : ""].join(" ")
                    }
                  >
                    <Icon size={16} />
                    <span>{label}</span>
                  </NavLink>
                ))}
              </nav>

              <div className="flex items-center justify-end gap-2 justify-self-end">
                {/* ✅ Emergency button stays RED */}
                <button
                  type="button"
                  onClick={() => navigate("/emergency")}
                  className="inline-flex items-center justify-center gap-2 rounded-full px-3 py-2 sm:px-4 text-sm font-semibold soft-border focus-ring hover:opacity-95"
                  style={{
                    borderRadius: 999,
                    background: "rgba(239, 68, 68, 0.95)",
                    border: "1px solid rgba(239, 68, 68, 0.40)",
                    color: "#fff",
                  }}
                >
                  <AlertTriangle size={16} />
                  <span className="hidden sm:inline">Emergency</span>
                </button>
              </div>
            </div>

            {/* Mobile nav */}
            <div className="mt-3 md:hidden overflow-x-auto no-scrollbar">
              <div className="flex min-w-max items-center gap-2">
                {NAV.map(({ to, label, Icon }) => (
                  <NavLink
                    key={to}
                    to={to}
                    className={({ isActive }) =>
                      [
                        "chip rounded-2xl px-3 py-2 text-xs font-semibold flex items-center justify-center gap-2 whitespace-nowrap",
                        isActive ? "ring-soft" : "hover:opacity-95",
                      ].join(" ")
                    }
                  >
                    <Icon size={14} />
                    {label}
                  </NavLink>
                ))}
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl px-4 pb-12">{children}</main>
      <Footer />
    </div>
  );
}
