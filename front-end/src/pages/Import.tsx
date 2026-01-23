import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { extractFromLink } from "../lib/api";
import type { Listing } from "../lib/types";

const LS_KEY_PRIMARY = "rentpulse:importedListing";
const LS_KEY_FALLBACK = "saferent:importedListing";

function safeJsonParse<T>(s: string | null): T | null {
  if (!s) return null;
  try {
    return JSON.parse(s) as T;
  } catch {
    return null;
  }
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timeout")), ms);
    p.then((v) => {
      clearTimeout(t);
      resolve(v);
    }).catch((e) => {
      clearTimeout(t);
      reject(e);
    });
  });
}

function normalizeImported(raw: any, urlParam: string | null): Partial<Listing> {
  const obj = raw && typeof raw === "object" ? raw : {};

  const source_url: string | undefined =
    obj.source_url || obj.sourceUrl || obj.url || (urlParam ? decodeURIComponent(urlParam) : undefined);

  const title: string | undefined = obj.title || obj.name;
  const description: string | undefined = obj.description || obj.body || obj.text;

  const price: number | undefined =
    typeof obj.price === "number" ? obj.price : typeof obj.rent === "number" ? obj.rent : undefined;

  const currency: string | undefined = obj.currency;
  const city: string | undefined = obj.city;
  const neighborhood: string | undefined = obj.neighborhood;

  const address_hint: string | undefined = obj.address_hint || obj.addressHint || obj.address || obj.location;

  const bedrooms: number | undefined = typeof obj.bedrooms === "number" ? obj.bedrooms : undefined;
  const bathrooms: number | undefined = typeof obj.bathrooms === "number" ? obj.bathrooms : undefined;

  const image_urls_raw: any = obj.image_urls || obj.imageUrls || obj.images || obj.photos || [];
  const image_urls: string[] = Array.isArray(image_urls_raw)
    ? image_urls_raw.filter((u) => typeof u === "string")
    : [];

  return {
    source_url,
    title,
    description,
    price,
    currency,
    city,
    neighborhood,
    address_hint,
    bedrooms,
    bathrooms,
    image_urls,
  };
}

export default function Import() {
  const nav = useNavigate();
  const [sp] = useSearchParams();

  const [status, setStatus] = useState<string>("Importing listing…");

  const initial = useMemo(() => {
    const dataParam = sp.get("data");
    const urlParam = sp.get("url");

    // Backwards/forwards compatible:
    // - Older extension: ?data={ url, addressHint, ... }
    // - New extension:   ?data={ source_url, address_hint, ... }
    // - Minimal:         ?url=https://...
    const raw = safeJsonParse<any>(dataParam);
    const normalized = normalizeImported(raw, urlParam);

    // Ensure we always at least keep the URL for backend extraction.
    if (!normalized.source_url) return null;
    return normalized;
  }, [sp]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!initial?.source_url) {
        nav("/checker", { replace: true });
        return;
      }

      let listing: any = { ...initial };

      // If the payload is minimal (or looks incomplete), enrich from backend extraction.
      const looksIncomplete =
        !listing.title ||
        !listing.description ||
        !Array.isArray(listing.image_urls) ||
        (listing.image_urls?.length ?? 0) < 2 ||
        !listing.address_hint;

      if (looksIncomplete) {
        setStatus("Extracting listing details…");
        try {
          const extracted: any = await withTimeout(extractFromLink(listing.source_url), 9000);
          if (extracted && !extracted.blocked) {
            // Backend extract is more reliable; keep URL stable.
            listing = { ...listing, ...extracted, source_url: listing.source_url };
          }
        } catch {
          // keep whatever the extension provided
        }
      }

      if (cancelled) return;

      try {
        localStorage.setItem(LS_KEY_PRIMARY, JSON.stringify(listing));
        localStorage.setItem(LS_KEY_FALLBACK, JSON.stringify(listing));
      } catch {
        // ignore
      }

      nav("/checker", { replace: true });
    })();

    return () => {
      cancelled = true;
    };
  }, [initial, nav]);

  return (
    <div className="min-h-screen grid place-items-center p-6">
      <div className="max-w-md w-full rounded-2xl border soft-border bg-[var(--sr-surface)] shadow-xl p-6">
        <div className="text-lg font-semibold">Importing</div>
        <div className="mt-1 text-sm text-[var(--sr-muted)]">{status}</div>
        <div className="mt-4 h-2 w-full rounded-full bg-black/10 overflow-hidden">
          <div className="h-full w-1/2 bg-white/40" />
        </div>
      </div>
    </div>
  );
}
