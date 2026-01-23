// front-end/src/pages/SimilarListings.tsx
import {
  AlertTriangle,
  Bath,
  BedDouble,
  Copy,
  DollarSign,
  Expand,
  ExternalLink,
  Loader2,
  MapPin,
  RefreshCw,
  Search,
  Sparkles,
  X,
} from "lucide-react";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import L from "leaflet";
import "leaflet.markercluster";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import "leaflet/dist/leaflet.css";

import { MapContainer, TileLayer, ZoomControl, useMap } from "react-leaflet";

import { fetchAnalysis, fetchSimilarListings, verifyAnalysis } from "../lib/api";
import type { AnalysisResult, CrosspostMatch, Listing } from "../lib/types";

/* ----------------------------- small helpers ----------------------------- */

function safeJsonParse<T>(s: string | null): T | null {
  try {
    return s ? (JSON.parse(s) as T) : null;
  } catch {
    return null;
  }
}

const LS_LAST = ["saferent:lastAnalysis", "rentpulse:lastAnalysis"] as const;
const LS_IMPORT = ["saferent:importedListing", "rentpulse:importedListing"] as const;

type LSKey = readonly [string, string];

function lsGet<T>(keys: LSKey): T | null {
  const [primary, legacy] = keys;
  return safeJsonParse<T>(localStorage.getItem(primary)) || safeJsonParse<T>(localStorage.getItem(legacy));
}

function lsSet(keys: LSKey, value: any) {
  const [primary, legacy] = keys;
  try {
    localStorage.setItem(primary, JSON.stringify(value));
  } catch {}
  try {
    localStorage.setItem(legacy, JSON.stringify(value));
  } catch {}
}

function wait(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function hostOf(u: string) {
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function fmtMoney(n: number, currency = "CAD") {
  const v = Number(n || 0);
  if (!Number.isFinite(v) || v <= 0) return "—";
  try {
    return new Intl.NumberFormat("en-CA", { style: "currency", currency }).format(v);
  } catch {
    return `${currency} ${Math.round(v)}`;
  }
}

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n));
}

function tokenize(s: string) {
  return (s || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3 && !["the", "and", "for", "with", "from", "rent"].includes(t));
}

function jaccard(a: string[], b: string[]) {
  const A = new Set(a);
  const B = new Set(b);
  const inter = new Set([...A].filter((x) => B.has(x)));
  const uni = new Set([...A, ...B]);
  return uni.size ? inter.size / uni.size : 0;
}

function extractEmail(s: string) {
  const m = (s || "").match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return m ? m[0].toLowerCase() : "";
}

function extractPhone(s: string) {
  const m = (s || "").match(/(\+?\d[\d\s().-]{8,}\d)/);
  return m ? m[0].replace(/[^\d+]/g, "") : "";
}

function pct(sim: number) {
  const p = Math.round(clamp01(sim) * 100);
  return `${p}%`;
}

function priceDeltaLabel(basePrice: number, candPrice: number) {
  if (!basePrice || !candPrice) return null;
  const diff = candPrice - basePrice;
  const pct = Math.round((Math.abs(diff) / basePrice) * 100);
  if (!Number.isFinite(pct) || pct === 0) return "Same price as this listing";
  return diff < 0 ? `${pct}% lower than this listing` : `${pct}% higher than this listing`;
}

function mapQueryForListing(l: any) {
  const parts = [l?.address_hint, l?.neighborhood, l?.city, l?.province, l?.postal, "Canada"].filter(Boolean);
  const q = parts.join(", ");
  return q || l?.city || "Vancouver, BC";
}

/* ------------------------------- local types ------------------------------ */

type CrosspostView = {
  match: CrosspostMatch;
  host: string;
  priceDelta?: number;
  isSameUnit: boolean;
  reasons: string[];
};

type SimilarCandidate = {
  listing: Listing;
  score: number; // 0..1
  reasons: string[];
};

type SimilarMeta = {
  provider: string; // serper | ddg | brave | etc
  mode: string; // live | cache | failed | skipped
  reason?: string;
};

/* ------------------------- Similarity (section 2) ------------------------- */

function scoreSimilar(base: Listing, cand: Listing): SimilarCandidate {
  const baseAny: any = base;
  const candAny: any = cand;

  const basePrice = Number(baseAny.price || 0);
  const candPrice = Number(candAny.price || 0);

  const baseBeds = baseAny.bedrooms as number | undefined;
  const candBeds = candAny.bedrooms as number | undefined;

  const baseBath = baseAny.bathrooms as number | undefined;
  const candBath = candAny.bathrooms as number | undefined;

  const priceScore = (() => {
    if (!basePrice || !candPrice) return 0.45;
    const diff = Math.abs(basePrice - candPrice);
    const scale = Math.max(250, basePrice * 0.25);
    return Math.exp(-diff / scale);
  })();

  const bedScore = (() => {
    if (baseBeds == null || candBeds == null) return 0.55;
    const d = Math.abs(baseBeds - candBeds);
    if (d === 0) return 1;
    if (d === 1) return 0.78;
    if (d === 2) return 0.58;
    return 0.3;
  })();

  const bathScore = (() => {
    if (baseBath == null || candBath == null) return 0.55;
    const d = Math.abs(baseBath - candBath);
    if (d === 0) return 1;
    if (d === 1) return 0.78;
    return 0.45;
  })();

  const locA = tokenize([baseAny.city, baseAny.neighborhood, baseAny.address_hint].filter(Boolean).join(" "));
  const locB = tokenize([candAny.city, candAny.neighborhood, candAny.address_hint].filter(Boolean).join(" "));
  const locScore = jaccard(locA, locB);

  const titleScore = jaccard(tokenize(baseAny.title || ""), tokenize(candAny.title || ""));

  const score = clamp01(0.48 * priceScore + 0.22 * bedScore + 0.14 * bathScore + 0.12 * locScore + 0.04 * titleScore);

  const reasons: string[] = [];
  if (basePrice && candPrice) reasons.push(`Price close (${fmtMoney(candPrice, candAny.currency || "CAD")})`);
  if (candBeds != null) reasons.push(`${candBeds} bed${candBeds === 1 ? "" : "s"}`);
  if (candBath != null) reasons.push(`${candBath} bath${candBath === 1 ? "" : "s"}`);
  if (candAny.neighborhood || candAny.city) reasons.push([candAny.neighborhood, candAny.city].filter(Boolean).join(" • "));

  return { listing: cand, score, reasons };
}

/* ---------------------- Cross-posts (section 1) logic --------------------- */

function buildCrosspostViews(a: AnalysisResult | null): CrosspostView[] {
  const listing = (a?.listing as any) || {};
  const baseUrl = String(listing?.url || listing?.source_url || "");
  const baseHost = baseUrl ? hostOf(baseUrl) : "";

  const baseTitleT = tokenize(listing?.title || "");
  const baseAddrT = tokenize(String(listing?.address_hint || ""));

  const baseEmail = extractEmail(listing?.description || "");
  const basePhone = extractPhone(listing?.description || "");

  const matches = Array.isArray((a as any)?.crossposts) ? ((a as any).crossposts as CrosspostMatch[]) : [];

  return matches
    .map((m) => {
      const host = hostOf((m as any).url);

      const titleT = tokenize((m as any).title || "");
      const snipT = tokenize((m as any).snippet || "");

      const titleOverlap = jaccard(baseTitleT, titleT);
      const addrOverlap = jaccard(baseAddrT, [...titleT, ...snipT]);

      const mEmail = extractEmail(`${(m as any).title || ""} ${(m as any).snippet || ""}`);
      const mPhone = extractPhone(`${(m as any).title || ""} ${(m as any).snippet || ""}`);

      const reasons: string[] = [];
      if (titleOverlap >= 0.18) reasons.push("Keyword match");
      if (addrOverlap >= 0.18) reasons.push("Address/location match");
      if (baseEmail && mEmail && baseEmail === mEmail) reasons.push("Agent email match");
      if (basePhone && mPhone && basePhone === mPhone) reasons.push("Agent phone match");
      if (!reasons.length) reasons.push("Similarity match");

      const sim = Number((m as any).similarity || 0);
      const strongSame = sim >= 0.72 || (sim >= 0.62 && addrOverlap >= 0.18);

      const isOtherSite: boolean = !baseHost || (host.length > 0 && host !== baseHost);
      const finalIsSame: boolean = Boolean(strongSame && isOtherSite);

      const priceDelta = (() => {
        const basePrice = Number(listing?.price || 0);
        const p = Number((m as any)?.price || 0);
        if (!basePrice || !p) return undefined;
        return p - basePrice;
      })();

      return {
        match: m,
        host,
        priceDelta,
        isSameUnit: finalIsSame,
        reasons,
      };
    })
    .sort((x, y) => Number((y.match as any)?.similarity || 0) - Number((x.match as any)?.similarity || 0));
}

/* ------------------------------ UI primitives ----------------------------- */

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold soft-border"
      style={{ background: "color-mix(in oklab, var(--sr-surface) 82%, transparent)" }}
    >
      {children}
    </span>
  );
}

type ActionBtnCommon = { icon?: React.ReactNode; className?: string; children?: React.ReactNode };

type ActionBtnAsButton = ActionBtnCommon &
  React.ButtonHTMLAttributes<HTMLButtonElement> & { href?: never };

type ActionBtnAsLink = ActionBtnCommon &
  React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string };

function ActionBtn(props: ActionBtnAsButton | ActionBtnAsLink) {
  const { icon, className, children, ...rest } = props as any;
  const classes = [
    "inline-flex items-center justify-center gap-2 rounded-2xl px-3 py-2 text-sm font-semibold focus-ring hover:opacity-95 soft-border",
    className || "",
  ].join(" ");

  const style = { background: "var(--sr-surface)" } as React.CSSProperties;

  if ("href" in props && props.href) {
    const aProps = rest as React.AnchorHTMLAttributes<HTMLAnchorElement>;
    return (
      <a {...aProps} href={props.href} className={classes} style={style}>
        {icon}
        {children}
      </a>
    );
  }

  const bProps = rest as React.ButtonHTMLAttributes<HTMLButtonElement>;
  return (
    <button {...bProps} type={bProps.type || "button"} className={classes} style={style}>
      {icon}
      {children}
    </button>
  );
}

function ImgTop({ src, alt }: { src?: string; alt: string }) {
  if (!src) {
    return (
      <div
        className="h-full w-full"
        style={{
          background:
            "linear-gradient(135deg, color-mix(in oklab, var(--sr-cta) 22%, transparent), color-mix(in oklab, var(--sr-primary) 22%, transparent))",
        }}
      />
    );
  }
  return <img src={src} alt={alt} className="h-full w-full object-cover" loading="lazy" />;
}

function useInfiniteCount(total: number, step = 6) {
  const [count, setCount] = useState(step);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setCount(step);
  }, [total, step]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const obs = new IntersectionObserver(
      (entries) => {
        const e = entries[0];
        if (!e?.isIntersecting) return;
        setCount((c) => Math.min(total, c + step));
      },
      { root: null, rootMargin: "360px", threshold: 0.01 }
    );

    obs.observe(el);
    return () => obs.disconnect();
  }, [total, step]);

  return { count, sentinelRef: ref };
}

/* ------------------------------- Map Modal -------------------------------- */

function escapeHtml(s: string) {
  return (s || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function fmtMoneyCompact(n: number, currency = "CAD") {
  const v = Number(n || 0);
  if (!Number.isFinite(v) || v <= 0) return "—";
  try {
    return new Intl.NumberFormat("en-CA", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
      minimumFractionDigits: 0,
    }).format(v);
  } catch {
    return `${currency} ${Math.round(v)}`;
  }
}

function getLatLng(l: any): { lat: number; lng: number } | null {
  const lat = Number(
    l?.lat ?? l?.latitude ?? l?.geo?.lat ?? l?.location?.lat ?? l?.coords?.lat ?? l?.position?.lat
  );
  const lng = Number(
    l?.lng ?? l?.lon ?? l?.longitude ?? l?.geo?.lng ?? l?.geo?.lon ?? l?.location?.lng ?? l?.location?.lon ?? l?.coords?.lng ?? l?.position?.lng
  );
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}

function priceIcon(label: string, active: boolean) {
  const safe = escapeHtml(label);
  const cls = `sr-price-marker${active ? " sr-price-marker--active" : ""}`;
  return L.divIcon({
    className: "",
    html: `<div class=\"${cls}\">${safe}</div>`,
    iconSize: [1, 1],
    iconAnchor: [0, 0],
  });
}

function FitBounds({ points }: { points: Array<{ lat: number; lng: number }> }) {
  const map = useMap();

  useEffect(() => {
    if (!points.length) return;

    const ll = points.map((p) => L.latLng(p.lat, p.lng));
    const b = L.latLngBounds(ll);

    // if all points are same, set a reasonable zoom
    if (b.isValid() && b.getNorthEast().equals(b.getSouthWest())) {
      map.setView(b.getCenter(), Math.max(12, map.getZoom() || 12), { animate: false });
      return;
    }

    map.fitBounds(b.pad(0.18), { animate: false });
  }, [map, points]);

  return null;
}

function PanTo({ target }: { target: { lat: number; lng: number } | null }) {
  const map = useMap();

  useEffect(() => {
    if (!target) return;
    const z = Math.max(13, map.getZoom() || 13);
    map.flyTo([target.lat, target.lng], z, { duration: 0.55 });
  }, [map, target?.lat, target?.lng]);

  return null;
}

type ClusterMarkerItem = {
  key: string;
  cand: SimilarCandidate;
  ll: { lat: number; lng: number };
  badge: string;
  title: string;
  href: string | null;
  subline: string;
};


function stableCandKey(c: SimilarCandidate): string {
  const l: any = (c as any)?.listing ?? (c as any);
  return String(l?.id ?? l?.source_url ?? l?.url ?? l?.title ?? JSON.stringify(l ?? c));
}

// If many listings share the same coordinates, their markers overlap and look like "one pin".
// This spreads duplicates in a small spiral so multiple price pills are visible.
function spreadDuplicateCoords<T extends { ll: { lat: number; lng: number } }>(items: T[]): T[] {
  const seen = new Map<string, number>();
  return items.map((it) => {
    const lat = it.ll.lat;
    const lng = it.ll.lng;
    const key = `${lat.toFixed(5)},${lng.toFixed(5)}`;
    const idx = seen.get(key) ?? 0;
    seen.set(key, idx + 1);
    if (idx === 0) return it;

    // ~15–60m offsets depending on duplicate index (keeps it readable without drifting far away)
    const angle = (idx * 137.5) * (Math.PI / 180);
    const r = 0.00015 * Math.sqrt(idx); // degrees latitude
    const dLat = r * Math.cos(angle);
    const dLng = (r * Math.sin(angle)) / Math.max(0.25, Math.cos((lat * Math.PI) / 180));

    return {
      ...it,
      ll: { lat: lat + dLat, lng: lng + dLng },
    };
  });
}

function ClusteredPriceMarkers({
  cands,
  pickedAny,
  onPick,
}: {
  cands: SimilarCandidate[];
  pickedAny: SimilarCandidate | null;
  onPick: (cand: SimilarCandidate) => void;
}) {
  const map = useMap();
  const clusterRef = React.useRef<any>(null);
  const markersByKeyRef = React.useRef<Map<string, any>>(new Map());
  const pickedKey = React.useMemo(() => (pickedAny ? stableCandKey(pickedAny) : null), [pickedAny]);

  const items = React.useMemo(() => {
    const raw: ClusterMarkerItem[] = [];
    for (const cand of cands) {
      const listing: any = (cand as any)?.listing ?? (cand as any);
      const ll = getLatLng(listing);
      if (!ll) continue;

      const price =
        typeof listing?.price === "number"
          ? listing.price
          : typeof listing?.price_cad === "number"
            ? listing.price_cad
            : null;

      const badge = price != null ? fmtMoneyCompact(price, "CAD") : "—";
      const title = String(listing?.title ?? listing?.headline ?? "Listing");
      const href = (listing?.source_url ?? listing?.url ?? null) as string | null;
      const subline = String(listing?.locality ?? listing?.neighborhood ?? listing?.city ?? "");

      raw.push({
        key: stableCandKey(cand),
        cand,
        ll,
        badge,
        title,
        href,
        subline,
      });
    }
    return spreadDuplicateCoords(raw);
  }, [cands]);

  // init cluster layer once
  React.useEffect(() => {
    if (!map) return;

    const cluster = (L as any).markerClusterGroup?.({
      showCoverageOnHover: false,
      spiderfyOnMaxZoom: true,
      removeOutsideVisibleBounds: true,
      maxClusterRadius: 42,
      disableClusteringAtZoom: 16,
      iconCreateFunction: (cl: any) => {
        const count = cl.getChildCount?.() ?? 0;
        return L.divIcon({
          className: "sr-cluster-icon",
          html: `<div class="sr-cluster-bubble">${count}</div>`,
          iconSize: [42, 42],
          iconAnchor: [21, 21],
        });
      },
    });

    clusterRef.current = cluster;
    map.addLayer(cluster);

    return () => {
      try {
        map.removeLayer(cluster);
      } catch {}
      clusterRef.current = null;
      markersByKeyRef.current.clear();
    };
  }, [map]);

  // rebuild markers when items change
  React.useEffect(() => {
    const cluster = clusterRef.current;
    if (!cluster) return;

    cluster.clearLayers();
    markersByKeyRef.current.clear();

    for (const it of items) {
      const isActive = pickedKey != null && it.key === pickedKey;
      const marker = L.marker([it.ll.lat, it.ll.lng], { icon: priceIcon(it.badge, isActive) });

      const popupHtml = `
        <div class="sr-map-popup">
          <div class="sr-map-popup-price">${escapeHtml(it.badge)}</div>
          <div class="sr-map-popup-title">${escapeHtml(it.title)}</div>
          ${it.subline ? `<div class="sr-map-popup-sub">${escapeHtml(it.subline)}</div>` : ""}
          ${
            it.href
              ? `<a class="sr-map-popup-link" href="${escapeHtml(it.href)}" target="_blank" rel="noopener noreferrer">Open listing</a>`
              : ""
          }
        </div>
      `;
      marker.bindPopup(popupHtml, { closeButton: true, autoPan: true });

      marker.on("click", () => onPick(it.cand));

      cluster.addLayer(marker);
      markersByKeyRef.current.set(it.key, marker);
    }
  }, [items, onPick, pickedKey]);

  // keep selected marker highlighted + open its popup
  React.useEffect(() => {
    const cluster = clusterRef.current;
    if (!cluster) return;

    for (const [key, marker] of markersByKeyRef.current.entries()) {
      const active = pickedKey != null && key === pickedKey;
      const it = items.find((x) => x.key === key);
      if (!it) continue;
      marker.setIcon(priceIcon(it.badge, active));
    }

    if (pickedKey) {
      const m = markersByKeyRef.current.get(pickedKey);
      if (m) {
        const ll = m.getLatLng?.();
        if (ll) {
          map.panTo(ll, { animate: true, duration: 0.4 });
        }
        m.openPopup?.();
      }
    }
  }, [pickedKey, items, map]);

  return null;
}

function MapModal({
  open,
  onClose,
  items,
  baseListing,
  onPick,
  picked,
}: {
  open: boolean;
  onClose: () => void;
  items: SimilarCandidate[];
  baseListing: any;
  onPick: (c: SimilarCandidate) => void;
  picked: SimilarCandidate | null;
}) {
  // Prevent background scroll + close on Escape for a smoother mobile modal.
  useEffect(() => {
    if (!open) return;

    const prevOverflow = document.body.style.overflow;
    const prevPadRight = document.body.style.paddingRight;

    // Avoid layout shift when removing the scrollbar.
    const scrollbarW = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = "hidden";
    if (scrollbarW > 0) document.body.style.paddingRight = `${scrollbarW}px`;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);

    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      document.body.style.paddingRight = prevPadRight;
    };
  }, [open, onClose]);

  const basePrice = Number(baseListing?.price || 0);

  const pickedAny: any = picked?.listing || null;

  const points = useMemo(() => {
    return items
      .map((c) => ({ c, ll: getLatLng(c.listing as any) }))
      .filter((x) => !!x.ll)
      .map((x) => x.ll!) as Array<{ lat: number; lng: number }>;
  }, [items]);

  const pickedLL = useMemo(() => getLatLng(pickedAny), [pickedAny]);

  const defaultCenter = useMemo(() => {
    if (pickedLL) return pickedLL;
    const baseLL = getLatLng(baseListing);
    if (baseLL) return baseLL;
    if (points.length) return points[0];
    return { lat: 49.2827, lng: -123.1207 };
  }, [pickedLL, baseListing, points]);

  if (!open) return null;

  // If we have no coordinates at all, keep UX usable.
  const showFallback = points.length === 0;
  const q = mapQueryForListing(pickedAny || baseListing);
  const googleLink = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;

  return (
    <div className="fixed inset-0 z-[999]" role="dialog" aria-modal="true">
      <div className="absolute inset-0" style={{ background: "rgba(0,0,0,0.45)" }} onClick={onClose} />

      <div className="absolute inset-0 p-3 sm:p-5">
        <div className="mx-auto h-full max-w-7xl overflow-hidden rounded-3xl glass-strong soft-border">
          <div
            className="flex items-center justify-between gap-3 px-4 py-3 soft-border"
            style={{ background: "var(--sr-surface)" }}
          >
            <div className="min-w-0">
              <div className="text-sm font-semibold">Map view</div>
              <div className="text-xs subtle clamp-2">
                {items.length} results • Click a card (or a price marker) to focus • Similarity shown per listing
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <ActionBtn
                icon={<ExternalLink size={16} />}
                href={googleLink}
                rel="noreferrer"
                className="whitespace-nowrap"
                aria-label="Open in Google Maps"
                title="Open in Google Maps"
              >
                <span className="hidden sm:inline">Open in Maps</span>
              </ActionBtn>
              <ActionBtn
                icon={<X size={16} />}
                onClick={onClose}
                className="whitespace-nowrap"
                aria-label="Close map"
                title="Close"
              >
                <span className="hidden sm:inline">Close</span>
              </ActionBtn>
            </div>
          </div>

          {/*
            Mobile: map on top + scrollable list below (fixed heights)
            Desktop: list on left + map on right
          */}
          <div className="grid h-[calc(100%-56px)] grid-cols-1 grid-rows-[minmax(260px,42vh)_1fr] lg:grid-cols-[420px_1fr] lg:grid-rows-1">
            <div className="relative h-full order-1 lg:order-2">
              {showFallback ? (
                <div className="h-full w-full flex items-center justify-center p-6">
                  <div
                    className="max-w-md rounded-3xl soft-border p-5"
                    style={{ background: "var(--sr-surface)", borderColor: "var(--sr-border)" }}
                  >
                    <div className="text-sm font-semibold">Map pins unavailable</div>
                    <div className="mt-1 text-xs subtle">
                      These results did not include coordinates. You can still open the area in Maps.
                    </div>
                    <div className="mt-4">
                      <ActionBtn icon={<ExternalLink size={16} />} href={googleLink} rel="noreferrer">
                        Open in Google Maps
                      </ActionBtn>
                    </div>
                  </div>
                </div>
              ) : (
                <MapContainer
                  center={[defaultCenter.lat, defaultCenter.lng]}
                  zoom={13}
                  scrollWheelZoom
                  zoomControl={false}
                  className="h-full w-full"
                >
                  <TileLayer
                    attribution="&copy; OpenStreetMap contributors, &copy; OpenTopoMap"
                    url="https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png"
                  />
                  <ZoomControl position="bottomright" />
                  <FitBounds points={points} />
                  <PanTo target={pickedLL} />
                  <ClusteredPriceMarkers cands={items} pickedAny={pickedAny} onPick={onPick} />
                  <InvalidateSizeOnMount />
                </MapContainer>
              )}
            </div>

            <div
              className="h-full order-2 overflow-y-auto border-t lg:order-1 lg:border-t-0 lg:border-r"
              style={{ borderColor: "var(--sr-border)", WebkitOverflowScrolling: "touch" as any, overscrollBehavior: "contain" as any }}
            >
              <div className="p-3 space-y-2">
                {items.map((c) => {
                  const cand: any = c.listing;
                  const isPicked =
                    pickedAny?.id && cand?.id
                      ? pickedAny.id === cand.id
                      : pickedAny?.source_url && cand?.source_url
                      ? pickedAny.source_url === cand.source_url
                      : false;

                  const price = Number(cand?.price || 0);
                  const deltaText = priceDeltaLabel(basePrice, price);
                  const loc = [cand?.neighborhood, cand?.city].filter(Boolean).join(" • ");

                  return (
                    <button
                      key={String(cand?.id || cand?.source_url || cand?.title) + String(c.score)}
                      type="button"
                      onClick={() => onPick(c)}
                      className="w-full text-left rounded-3xl overflow-hidden soft-border focus-ring hover:opacity-95"
                      style={{
                        background: "var(--sr-surface)",
                        borderColor: isPicked
                          ? "color-mix(in oklab, var(--sr-cta) 55%, var(--sr-border))"
                          : "var(--sr-border)",
                      }}
                    >
                      <div className="flex gap-3 p-3">
                        <div
                          className="h-16 w-16 overflow-hidden rounded-2xl soft-border"
                          style={{ background: "var(--sr-surface)" }}
                        >
                          <ImgTop src={cand?.image_urls?.[0]} alt={cand?.title || "Listing"} />
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="text-sm font-semibold clamp-1">{cand?.title || "Listing"}</div>
                              <div className="text-xs subtle clamp-1">{loc || cand?.address_hint || "—"}</div>
                            </div>
                            <span
                              className="shrink-0 inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold soft-border"
                              style={{ background: "color-mix(in oklab, var(--sr-cta) 14%, var(--sr-surface))" }}
                            >
                              <Sparkles size={14} />
                              {pct(c.score)}
                            </span>
                          </div>

                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <span className="text-sm font-extrabold" style={{ color: "var(--sr-text)" }}>
                              {fmtMoney(price, cand?.currency || "CAD")}
                            </span>
                            {deltaText ? (
                              <span
                                className="rounded-full px-2 py-1 text-[11px] font-semibold soft-border"
                                style={{
                                  background:
                                    price && basePrice && price < basePrice
                                      ? "rgba(16, 185, 129, 0.10)"
                                      : "rgba(245, 158, 11, 0.10)",
                                }}
                              >
                                {deltaText}
                              </span>
                            ) : null}

                            {!getLatLng(cand) ? (
                              <span
                                className="rounded-full px-2 py-1 text-[11px] font-semibold soft-border"
                                style={{ background: "rgba(255,255,255,0.05)" }}
                                title="This listing is missing coordinates. It may still open in Maps."
                              >
                                No map pin
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function InvalidateSizeOnMount() {
  const map = useMap();
  useEffect(() => {
    // Leaflet sometimes mounts before its container has a final size (common on mobile modals).
    // Invalidate once shortly after mount to avoid a blank/partial map.
    const t = window.setTimeout(() => {
      try {
        map.invalidateSize();
      } catch {}
    }, 120);
    return () => window.clearTimeout(t);
  }, [map]);
  return null;
}

/* --------------------------------- page --------------------------------- */


export default function SimilarListings() {
  const navigate = useNavigate();

  const [analysis, setAnalysis] = useState<AnalysisResult | null>(() => lsGet<AnalysisResult>(LS_LAST));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string>("");

  const [similar, setSimilar] = useState<SimilarCandidate[]>([]);
  const [simBusy, setSimBusy] = useState(false);
  const [simErr, setSimErr] = useState<string>("");
  const [simMeta, setSimMeta] = useState<SimilarMeta | null>(null);
  const [simNonce, setSimNonce] = useState(0);

  const [mapOpen, setMapOpen] = useState(false);
  const [autoOpened, setAutoOpened] = useState(false);
  const [picked, setPicked] = useState<SimilarCandidate | null>(null);

  const listing: any = analysis?.listing as any;

  const analysisId = String((analysis as any)?.analysisId || "");

  const crossViews = useMemo(() => buildCrosspostViews(analysis), [analysis]);
  const sameUnit = useMemo(() => crossViews.filter((x) => x.isSameUnit), [crossViews]);

  const baseForSimilarity = useMemo(() => (listing ? (listing as Listing) : null), [listing]);

  const { count: sameCount, sentinelRef: sameSentinel } = useInfiniteCount(sameUnit.length, 4);
  const { count: simCount, sentinelRef: simSentinel } = useInfiniteCount(similar.length, 9);

  const mapTriggerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const last = lsGet<AnalysisResult>(LS_LAST);
    if (last?.analysisId && last.analysisId !== analysis?.analysisId) setAnalysis(last);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ✅ Section 2: fetch real web candidates from backend
  useEffect(() => {
    let ok = true;

    (async () => {
      setSimErr("");
      if (!baseForSimilarity || !analysisId) {
        setSimilar([]);
        setSimMeta(null);
        return;
      }

      setSimBusy(true);
      try {
        // NOTE: your api signature is fetchSimilarListings(analysisId: string)
        const resp: any = await fetchSimilarListings(analysisId);
        if (!ok) return;

        const items: Listing[] = Array.isArray(resp) ? resp : Array.isArray(resp?.items) ? resp.items : [];

        const meta: SimilarMeta = {
          provider: String((Array.isArray(resp) ? "web" : resp?.provider) || "web"),
          mode: String((Array.isArray(resp) ? "live" : resp?.mode) || "live"),
          reason: String((Array.isArray(resp) ? "" : resp?.reason) || ""),
        };
        setSimMeta(meta);

        const ranked = items
          .filter((d) => {
            const base: any = baseForSimilarity;
            const cand: any = d;
            if (base?.id && cand?.id && base.id === cand.id) return false;
            if (base?.source_url && cand?.source_url && base.source_url === cand.source_url) return false;
            if (base?.source_url && cand?.source_url && String(base.source_url) === String(cand.source_url)) return false;
            return true;
          })
          .map((d) => scoreSimilar(baseForSimilarity, d))
          .sort((a, b) => b.score - a.score)
          .slice(0, 60);

        setSimilar(ranked);

        if (ranked.length) setPicked((p) => p || ranked[0]);
      } catch (e: any) {
        if (!ok) return;
        setSimilar([]);
        setSimMeta({ provider: "web", mode: "failed", reason: e?.message || "Failed to load similar listings" });
        setSimErr(e?.message || "Could not load similar listings.");
      } finally {
        if (ok) setSimBusy(false);
      }
    })();

    return () => {
      ok = false;
    };
  }, [baseForSimilarity, analysisId, simNonce]);

  useEffect(() => {
    const el = mapTriggerRef.current;
    if (!el) return;

    const obs = new IntersectionObserver(
      (entries) => {
        const e = entries[0];
        if (!e?.isIntersecting) return;
        if (autoOpened) return;
        if (!similar.length) return;

        setAutoOpened(true);
        setMapOpen(true);
      },
      { root: null, rootMargin: "120px", threshold: 0.01 }
    );

    obs.observe(el);
    return () => obs.disconnect();
  }, [autoOpened, similar.length]);

  async function copyText(t: string) {
    try {
      await navigator.clipboard.writeText(t);
    } catch {}
  }

  async function refreshFromBackend() {
    if (!(analysis as any)?.analysisId) return;
    setBusy(true);
    setErr("");
    try {
      const a = await fetchAnalysis((analysis as any).analysisId);
      setAnalysis(a);
      lsSet(LS_LAST, a);

      // ✅ refresh similar too
      setSimNonce((n) => n + 1);
    } catch (e: any) {
      setErr(e?.message || "Could not refresh.");
    } finally {
      setBusy(false);
    }
  }

  async function searchOtherSites() {
    if (!(analysis as any)?.analysisId) return;
    setBusy(true);
    setErr("");
    try {
      const patched = await verifyAnalysis((analysis as any).analysisId);
      setAnalysis(patched);
      lsSet(LS_LAST, patched);

      const t0 = Date.now();
      let cur = patched;
      while (Date.now() - t0 < 25000) {
        const st = (cur as any).enrichmentStatus || "skipped";
        if (["done", "partial", "failed", "skipped"].includes(st)) break;
        await wait(1600);
        cur = await fetchAnalysis((patched as any).analysisId);
        setAnalysis(cur);
        lsSet(LS_LAST, cur);
      }

      // ✅ refresh similar too
      setSimNonce((n) => n + 1);
    } catch (e: any) {
      setErr(e?.message || "Could not start cross-site search.");
    } finally {
      setBusy(false);
    }
  }

  function openUrl(u: string) {
    try {
      window.open(u, "_blank", "noopener,noreferrer");
    } catch {}
  }

  function toChecker(prefill: Listing) {
    lsSet(LS_IMPORT, prefill);
    navigate("/checker");
  }

  const headerStats = useMemo(() => {
    const price = Number(listing?.price || 0);
    const beds = listing?.bedrooms as number | undefined;
    const baths = listing?.bathrooms as number | undefined;
    const loc = [listing?.neighborhood, listing?.city].filter(Boolean).join(" • ");

    return {
      price: price ? fmtMoney(price, listing?.currency || "CAD") : "—",
      beds: beds == null ? "—" : `${beds} bd`,
      baths: baths == null ? "—" : `${baths} ba`,
      loc: loc || "—",
    };
  }, [listing]);

  if (!analysis?.listing) {
    return (
      <div className="space-y-4">
        <div className="glass rounded-3xl p-6">
          <div className="text-2xl font-semibold">Similar listings</div>
          <div className="mt-2 subtle">
            Run a check first. This page uses your last analyzed listing to find cross-posts and similar options.
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            <ActionBtn icon={<Search size={16} />} onClick={() => navigate("/checker")}>
              Check a listing
            </ActionBtn>
            <ActionBtn icon={<AlertTriangle size={16} />} onClick={() => navigate("/emergency")}>
              Emergency help
            </ActionBtn>
          </div>
        </div>
      </div>
    );
  }

  const status = (analysis as any).enrichmentStatus || "skipped";
  const reason = (analysis as any).enrichmentReason || "";

  const basePrice = Number(listing?.price || 0);

  const sourceText = (() => {
    const p = simMeta?.provider ? `Web (${simMeta.provider})` : "Web";
    const m = simMeta?.mode ? simMeta.mode : simBusy ? "loading" : "—";
    return `${p} • ${m}`;
  })();

  return (
    <div className="space-y-5">
      <div className="glass rounded-3xl p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-3xl font-semibold">Similar listings</div>
            <div className="mt-1 subtle">
              1) Same unit posted elsewhere (cross-site) • 2) Similar options near your configuration
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Pill>
              <DollarSign size={14} />
              {headerStats.price}
            </Pill>
            <Pill>
              <BedDouble size={14} />
              {headerStats.beds}
            </Pill>
            <Pill>
              <Bath size={14} />
              {headerStats.baths}
            </Pill>
            <Pill>
              <MapPin size={14} />
              {headerStats.loc}
            </Pill>
          </div>
        </div>

        <div className="mt-4 soft-divider" />

        <div className="mt-4 grid gap-4 lg:grid-cols-12">
          <div className="space-y-4 lg:col-span-8">
            {/* ------------------ Section 1: cross-posts ------------------ */}
            <div className="glass rounded-3xl p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <div className="text-lg font-semibold">1) Same unit posted elsewhere</div>
                    <span className="text-xs subtle">(cross-site)</span>
                  </div>
                  <div className="mt-1 text-sm subtle">
                    Focus: keywords, address/location hints, and agent contact overlaps. (Photo matching is backend-dependent.)
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Pill>
                    <span className="subtle">Status:</span>{" "}
                    <span style={{ color: "var(--sr-text)" }}>{status === "queued" || status === "running" ? "Running" : status}</span>
                  </Pill>

                  <ActionBtn
                    icon={busy ? <Loader2 className="animate-spin" size={16} /> : <Search size={16} />}
                    onClick={searchOtherSites}
                    disabled={busy}
                  >
                    Search other sites
                  </ActionBtn>

                  <ActionBtn
                    icon={busy ? <Loader2 className="animate-spin" size={16} /> : <RefreshCw size={16} />}
                    onClick={refreshFromBackend}
                    disabled={busy}
                  >
                    Refresh
                  </ActionBtn>
                </div>
              </div>

              {reason ? (
                <div
                  className="mt-4 rounded-2xl p-3 soft-border"
                  style={{ background: "color-mix(in oklab, var(--sr-surface) 86%, transparent)" }}
                >
                  <div className="text-sm">
                    <span className="subtle">Reason:</span> <span style={{ color: "var(--sr-text)" }}>{reason}</span>
                  </div>
                </div>
              ) : null}

              {err ? (
                <div
                  className="mt-4 rounded-2xl p-3"
                  style={{ border: "1px solid rgba(239,68,68,0.28)", background: "rgba(239,68,68,0.10)" }}
                >
                  <div className="text-sm" style={{ color: "var(--sr-text)" }}>
                    {err}
                  </div>
                </div>
              ) : null}

              <div className="mt-4 rounded-3xl p-4 soft-border" style={{ background: "var(--sr-surface)" }}>
                <div className="min-w-0">
                  <div className="font-semibold clamp-2">{listing?.title || "Listing"}</div>
                  <div className="mt-1 text-sm subtle clamp-2">
                    {listing?.address_hint ||
                      [listing?.neighborhood, listing?.city].filter(Boolean).join(", ") ||
                      "Location not provided"}
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <Pill>{fmtMoney(Number(listing?.price || 0), listing?.currency || "CAD")}</Pill>
                    {listing?.neighborhood ? <Pill>{listing.neighborhood}</Pill> : null}
                    {listing?.source_url ? <Pill>{hostOf(listing.source_url)}</Pill> : null}
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    {listing?.source_url ? (
                      <>
                        <ActionBtn icon={<ExternalLink size={16} />} onClick={() => openUrl(listing.source_url)}>
                          Open
                        </ActionBtn>
                        <ActionBtn icon={<Copy size={16} />} onClick={() => copyText(listing.source_url)}>
                          Copy URL
                        </ActionBtn>
                      </>
                    ) : null}

                    <ActionBtn icon={<AlertTriangle size={16} />} onClick={() => navigate("/report")}>
                      Open report workflow
                    </ActionBtn>
                  </div>
                </div>
              </div>

              <div className="mt-5">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold">Matches on other sites</div>
                  <div className="text-xs subtle">{sameUnit.length ? `${sameUnit.length} found` : "No strong matches yet"}</div>
                </div>

                <div className="mt-3 space-y-3">
                  {sameUnit.slice(0, sameCount).map((x) => (
                    <div key={String((x.match as any).url)} className="glass rounded-3xl overflow-hidden">
                      <div className="grid gap-0 md:grid-cols-[1fr_190px]">
                        <div className="p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="font-semibold clamp-2">{(x.match as any).title || "Listing match"}</div>
                              <div className="mt-1 text-sm subtle clamp-2">{(x.match as any).snippet || "—"}</div>
                            </div>

                            <Pill>
                              <Sparkles size={14} />
                              {pct(Number((x.match as any).similarity || 0))}
                            </Pill>
                          </div>

                          <div className="mt-3 flex flex-wrap gap-2">
                            <Pill>{x.host || "Other site"}</Pill>
                            <Pill>{String((x.match as any).provider || "web")}</Pill>
                            {typeof (x.match as any).price === "number" && (x.match as any).price ? (
                              <Pill>{fmtMoney(Number((x.match as any).price), String((x.match as any).currency || "CAD"))}</Pill>
                            ) : null}
                          </div>

                          <div className="mt-3 flex flex-wrap gap-2">
                            {x.reasons.slice(0, 4).map((r) => (
                              <span
                                key={r}
                                className="rounded-full px-3 py-1 text-xs font-semibold soft-border"
                                style={{ background: "color-mix(in oklab, var(--sr-surface) 82%, transparent)" }}
                              >
                                {r}
                              </span>
                            ))}
                          </div>

                          <div className="mt-4 flex flex-wrap gap-2">
                            <ActionBtn icon={<ExternalLink size={16} />} onClick={() => openUrl(String((x.match as any).url))}>
                              Open
                            </ActionBtn>
                            <ActionBtn icon={<Copy size={16} />} onClick={() => copyText(String((x.match as any).url))}>
                              Copy URL
                            </ActionBtn>
                          </div>
                        </div>

                        <div className="p-4 md:border-l md:border-[color:var(--sr-border)]">
                          <div className="text-xs subtle">Why this is likely the same unit</div>
                          <div className="mt-2 text-sm" style={{ color: "var(--sr-text)" }}>
                            Strong similarity plus location/keyword/contact overlap.
                          </div>
                          <div className="mt-3 text-xs subtle">
                            If the price differs across sites, ask the landlord to explain and verify ownership before paying.
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}

                  <div ref={sameSentinel} />
                </div>

                {!sameUnit.length ? (
                  <div className="mt-3 rounded-2xl p-3 soft-border" style={{ background: "var(--sr-surface)" }}>
                    <div className="text-sm subtle">
                      Click <span style={{ color: "var(--sr-text)" }}>"Search other sites"</span>. Matches appear here once enrichment completes.
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          {/* Right rail */}
          <div className="space-y-4 lg:col-span-4">
            <div className="glass rounded-3xl p-4">
              <div className="text-sm font-semibold">How this helps</div>
              <div className="mt-3 space-y-2">
                <div className="rounded-2xl p-3 soft-border" style={{ background: "var(--sr-surface)" }}>
                  Find the same unit posted elsewhere at a different price.
                </div>
                <div className="rounded-2xl p-3 soft-border" style={{ background: "var(--sr-surface)" }}>
                  Compare nearby alternatives before you pay deposits or share documents.
                </div>
                <div className="rounded-2xl p-3 soft-border" style={{ background: "var(--sr-surface)" }}>
                  Similarity percent tells you how close the option is to your current listing.
                </div>
              </div>
            </div>

            <div className="glass rounded-3xl p-4">
              <div className="text-sm font-semibold">If you’re in a rush</div>
              <div className="mt-2 text-sm subtle">If you’ve already paid or you think you’re being pressured, go to Emergency.</div>
              <button
                type="button"
                className="mt-4 w-full rounded-2xl px-4 py-3 text-sm font-semibold focus-ring hover:opacity-95"
                style={{
                  background: "rgba(239, 68, 68, 0.95)",
                  border: "1px solid rgba(239, 68, 68, 0.40)",
                  color: "#fff",
                }}
                onClick={() => navigate("/emergency")}
              >
                Emergency help
              </button>
            </div>
          </div>

          {/* ------------------ Section 2: full width ------------------ */}
          <div className="lg:col-span-12">
            <div className="glass rounded-3xl p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="text-lg font-semibold">2) Similar listings (near your configuration)</div>
                  <div className="mt-1 text-sm subtle">Real web candidates fetched from the backend, then scored against your listing.</div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Pill>
                    <span className="subtle">Source:</span> {sourceText}
                  </Pill>

                  {simBusy ? (
                    <Pill>
                      <Loader2 className="animate-spin" size={14} /> Loading
                    </Pill>
                  ) : (
                    <Pill>{similar.length ? `${similar.length} candidates` : "No candidates"}</Pill>
                  )}

                  <ActionBtn
                    icon={simBusy ? <Loader2 className="animate-spin" size={16} /> : <RefreshCw size={16} />}
                    onClick={() => setSimNonce((n) => n + 1)}
                    disabled={simBusy}
                  >
                    Refresh similar
                  </ActionBtn>

                  <button
                    type="button"
                    onClick={() => {
                      if (!similar.length) return;
                      setMapOpen(true);
                      setAutoOpened(true);
                    }}
                    className="inline-flex items-center justify-center gap-2 rounded-2xl px-3 py-2 text-sm font-semibold focus-ring hover:opacity-95 soft-border"
                    style={{ background: "var(--sr-surface)" }}
                  >
                    <Expand size={16} />
                    Map view
                  </button>
                </div>
              </div>

              {simMeta?.reason && !similar.length ? (
                <div
                  className="mt-4 rounded-2xl p-3 soft-border"
                  style={{ background: "color-mix(in oklab, var(--sr-surface) 86%, transparent)" }}
                >
                  <div className="text-sm">
                    <span className="subtle">Note:</span> <span style={{ color: "var(--sr-text)" }}>{simMeta.reason}</span>
                  </div>
                </div>
              ) : null}

              {simErr ? (
                <div
                  className="mt-4 rounded-2xl p-3"
                  style={{ border: "1px solid rgba(239,68,68,0.28)", background: "rgba(239,68,68,0.10)" }}
                >
                  <div className="text-sm" style={{ color: "var(--sr-text)" }}>
                    {simErr}
                  </div>
                </div>
              ) : null}

              <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {similar.slice(0, simCount).map((c) => {
                  const cand: any = c.listing;
                  const img = cand?.image_urls?.[0] as string | undefined;

                  const candPrice = Number(cand?.price || 0);
                  const deltaText = priceDeltaLabel(basePrice, candPrice);

                  const loc = [cand?.neighborhood, cand?.city].filter(Boolean).join(" • ");
                  const title = cand?.title || "Listing";
                  const currency = String(cand?.currency || "CAD");

                  return (
                    <div key={String(cand?.id || cand?.source_url || title) + String(c.score)} className="glass rounded-3xl overflow-hidden">
                      <div className="h-40">
                        <ImgTop src={img} alt={title} />
                      </div>

                      <div className="p-4">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="text-base font-semibold clamp-2">{title}</div>
                            <div className="mt-1 text-sm subtle clamp-1">{loc || cand?.address_hint || "—"}</div>
                          </div>

                          <span
                            className="shrink-0 inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold soft-border"
                            style={{ background: "color-mix(in oklab, var(--sr-cta) 14%, var(--sr-surface))" }}
                            title="Similarity to current listing"
                          >
                            <Sparkles size={14} />
                            {pct(c.score)}
                          </span>
                        </div>

                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <span className="text-xl font-extrabold" style={{ color: "var(--sr-text)" }}>
                            {fmtMoney(candPrice, currency)}
                          </span>
                          <span className="text-xs subtle">per month</span>
                        </div>

                        {deltaText ? (
                          <div className="mt-2">
                            <span
                              className="inline-flex rounded-full px-3 py-1 text-xs font-semibold soft-border"
                              style={{
                                background:
                                  candPrice && basePrice && candPrice < basePrice
                                    ? "rgba(16, 185, 129, 0.12)"
                                    : "rgba(245, 158, 11, 0.12)",
                              }}
                            >
                              {deltaText}
                            </span>
                          </div>
                        ) : null}

                        <div className="mt-3 flex flex-wrap gap-2">
                          {cand?.bedrooms != null ? (
                            <Pill>
                              <BedDouble size={14} />
                              {cand.bedrooms} bd
                            </Pill>
                          ) : null}
                          {cand?.bathrooms != null ? (
                            <Pill>
                              <Bath size={14} />
                              {cand.bathrooms} ba
                            </Pill>
                          ) : null}
                          {cand?.source_url ? <Pill>{hostOf(String(cand.source_url))}</Pill> : null}
                        </div>

                        <div className="mt-3 flex flex-wrap gap-2">
                          {c.reasons.slice(0, 2).map((r) => (
                            <span
                              key={r}
                              className="rounded-full px-3 py-1 text-[11px] font-semibold soft-border"
                              style={{ background: "color-mix(in oklab, var(--sr-surface) 88%, transparent)" }}
                            >
                              {r}
                            </span>
                          ))}
                        </div>

                        <div className="mt-4 grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            className="col-span-2 rounded-2xl px-4 py-2 text-sm font-semibold focus-ring hover:opacity-95"
                            style={{
                              background: "linear-gradient(135deg, var(--sr-cta), var(--sr-accent))",
                              color: "#fff",
                            }}
                            onClick={() => toChecker(c.listing)}
                          >
                            Check this listing
                          </button>

                          {cand?.source_url ? (
                            <ActionBtn icon={<ExternalLink size={16} />} onClick={() => openUrl(String(cand.source_url))}>
                              Open
                            </ActionBtn>
                          ) : (
                            <ActionBtn icon={<ExternalLink size={16} />} onClick={() => setMapOpen(true)}>
                              Map
                            </ActionBtn>
                          )}

                          <ActionBtn icon={<Copy size={16} />} onClick={() => copyText(JSON.stringify(c.listing, null, 2))}>
                            Copy
                          </ActionBtn>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {!simBusy && !similar.length ? (
                <div className="mt-4 rounded-2xl p-3 soft-border" style={{ background: "var(--sr-surface)" }}>
                  <div className="text-sm subtle">
                    No similar listings yet. Click <span style={{ color: "var(--sr-text)" }}>“Refresh similar”</span>. If it still shows none,
                    your backend may be returning zero items (query too narrow or extraction blocked).
                  </div>
                </div>
              ) : null}

              <div ref={simSentinel} />

              <div ref={mapTriggerRef} className="mt-6 rounded-2xl p-3 soft-border" style={{ background: "var(--sr-surface)" }}>
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm subtle">
                    Scroll past this to open <span style={{ color: "var(--sr-text)" }}>Map view</span> automatically.
                  </div>
                  <button
                    type="button"
                    className="inline-flex items-center justify-center gap-2 rounded-2xl px-3 py-2 text-sm font-semibold focus-ring hover:opacity-95 soft-border"
                    style={{ background: "var(--sr-surface)" }}
                    onClick={() => {
                      if (!similar.length) return;
                      setMapOpen(true);
                      setAutoOpened(true);
                    }}
                  >
                    <Expand size={16} />
                    Open map
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <MapModal
        open={mapOpen}
        onClose={() => setMapOpen(false)}
        items={similar.slice(0, Math.max(simCount, 18))}
        baseListing={listing}
        picked={picked}
        onPick={(c) => setPicked(c)}
      />
    </div>
  );
}
