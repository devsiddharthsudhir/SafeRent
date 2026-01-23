import {
  AlertTriangle,
  FileSignature,
  FileText,
  Home,
  Layers,
  LayoutGrid,
  Moon,
  Sun,
} from "lucide-react";
import React, { useEffect, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import Footer from "./Footer";

import { applySeo, ROUTE_SEO } from "../lib/seo";

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

function getInitialTheme(): "dark" | "light" {
  const stored = localStorage.getItem("saferent:theme") as "dark" | "light" | null;
  return stored === "light" || stored === "dark" ? stored : "dark";
}

function applyTheme(theme: "dark" | "light") {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem("saferent:theme", theme);
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
        alt="SafeRent logo"
        className="h-7 w-7 object-contain"
        draggable={false}
      />
    </div>
  );
}

export default function Shell({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [theme, setTheme] = useState<"dark" | "light">(getInitialTheme());

  useEffect(() => applyTheme(theme), [theme]);

  // SEO + better refresh behavior: set stable titles/description/canonical per route.
  useEffect(() => {
    const cfg = ROUTE_SEO[pathname] || {
      title: "SafeRent",
      description: "SafeRent helps renters in Canada verify listings before they pay.",
    };
    applySeo({ ...cfg, path: pathname });
  }, [pathname]);

  return (
    <div className="app-grid min-h-screen">
      <header className="sticky top-0 z-50">
        <div className="mx-auto max-w-7xl px-4 py-4">
          <div className="glass-strong rounded-3xl px-5 py-3">
            <div className="grid grid-cols-3 items-center gap-3">
              <button
                type="button"
                onClick={() => navigate("/")}
                className="flex items-center gap-3 focus-ring rounded-2xl px-2 py-1 justify-self-start"
              >
                <BrandMark />
                <div className="leading-tight">
                  <div className="text-lg font-extrabold tracking-wide">
                    <span style={{ color: "var(--sr-text)" }}>SAFE</span>
                    <span style={{ color: "var(--sr-accent)" }}>RENT</span>
                  </div>
                  <div className="text-[11px] subtle tracking-[0.18em]">
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
                <button
                  type="button"
                  onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
                  className="grid h-10 w-10 place-items-center rounded-2xl hover:opacity-95 focus-ring"
                  style={{
                    background: "var(--sr-surface)",
                    border: "1px solid var(--sr-border)",
                  }}
                  aria-label="Toggle theme"
                >
                  {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
                </button>

                {/* ✅ Emergency button stays RED */}
                <button
                  type="button"
                  onClick={() => navigate("/emergency")}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-2 text-sm font-semibold soft-border focus-ring hover:opacity-95"
                  style={{
                    borderRadius: 999,
                    background: "rgba(239, 68, 68, 0.95)",
                    border: "1px solid rgba(239, 68, 68, 0.40)",
                    color: "#fff",
                  }}
                >
                  <AlertTriangle size={16} />
                  Emergency
                </button>
              </div>
            </div>

            {/* Mobile nav */}
            <div className="mt-3 grid grid-cols-5 gap-2 md:hidden">
              {NAV.map(({ to, label, Icon }) => (
                <NavLink
                  key={to}
                  to={to}
                  className={({ isActive }) =>
                    [
                      "chip rounded-2xl px-3 py-2 text-xs font-semibold flex items-center justify-center gap-2",
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
      </header>

      <main className="mx-auto w-full max-w-7xl px-4 pb-12">{children}</main>
      <Footer />
    </div>
  );
}
