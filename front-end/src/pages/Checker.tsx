import {
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  FileText,
  Info,
  Layers,
  Link as LinkIcon,
  Loader2,
  Upload,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { analyzeManual, extractFromLink, fetchAnalysis, verifyAnalysis } from "../lib/api";
import type { AnalysisResult, Listing } from "../lib/types";

import ActionsPanel from "../components/ActionsPanel";
import EvidencePanel from "../components/EvidencePanel";
import RiskDial from "../components/RiskDial";

type Mode = "quick" | "deep";
type InputMode = "both" | "link" | "text";

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

function titleFromText(t: string) {
  const line =
    (t || "")
      .split(/\r?\n/)
      .map((x) => x.trim())
      .find(Boolean) || "";
  if (!line) return "Rental listing";
  return line.length > 90 ? line.slice(0, 87) + "..." : line;
}

// ✅ IMPORTANT: empty string should become undefined (not 0)
function numberOrUndefined(n: any): number | undefined {
  if (n === null || n === undefined) return undefined;
  if (typeof n === "string" && n.trim() === "") return undefined;
  const v = Number(n);
  return Number.isFinite(v) ? v : undefined;
}

function toNumString(v: any) {
  if (v === null || v === undefined) return "";
  const n = Number(v);
  return Number.isFinite(n) ? String(n) : "";
}

type ListingDetails = {
  title: string;
  rent: string;
  currency: string;
  city: string;
  neighborhood: string;
  addressHint: string;
  bedrooms: string;
  bathrooms: string;
  deposit: string;
  utilities: string;
  leaseTerm: string;
  availableFrom: string;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
};

function defaultDetails(): ListingDetails {
  return {
    title: "",
    rent: "",
    currency: "CAD",
    city: "",
    neighborhood: "",
    addressHint: "",
    bedrooms: "",
    bathrooms: "",
    deposit: "",
    utilities: "",
    leaseTerm: "",
    availableFrom: "",
    contactName: "",
    contactPhone: "",
    contactEmail: "",
  };
}

function buildDetailsBlock(d: ListingDetails) {
  const lines: string[] = [];

  if (d.rent) lines.push(`Rent: ${d.currency || "CAD"} ${d.rent}/month`);
  if (d.deposit) lines.push(`Deposit: ${d.currency || "CAD"} ${d.deposit}`);
  if (d.bedrooms !== "") lines.push(`Bedrooms: ${d.bedrooms}`);
  if (d.bathrooms !== "") lines.push(`Bathrooms: ${d.bathrooms}`);
  if (d.city || d.neighborhood) lines.push(`Location: ${[d.neighborhood, d.city].filter(Boolean).join(", ")}`);
  if (d.addressHint) lines.push(`Address hint: ${d.addressHint}`);
  if (d.utilities) lines.push(`Utilities: ${d.utilities}`);
  if (d.leaseTerm) lines.push(`Lease term: ${d.leaseTerm}`);
  if (d.availableFrom) lines.push(`Available from: ${d.availableFrom}`);
  if (d.contactName) lines.push(`Contact name: ${d.contactName}`);
  if (d.contactPhone) lines.push(`Contact phone: ${d.contactPhone}`);
  if (d.contactEmail) lines.push(`Contact email: ${d.contactEmail}`);

  if (!lines.length) return "";

  return `\n\n---\nListing details (user-provided):\n${lines.map((x) => `- ${x}`).join("\n")}\n`;
}

function stripDetailsBlock(desc: string) {
  if (!desc) return "";
  const marker = "\n\n---\nListing details (user-provided):";
  const idx = desc.indexOf(marker);
  return idx >= 0 ? desc.slice(0, idx).trim() : desc.trim();
}

function composeListing(
  details: ListingDetails,
  baseText: string,
  sourceUrl?: string,
  imageUrls?: string[],
  forAnalysis: boolean = false
): Listing {
  const title = details.title.trim() || titleFromText(baseText);
  const descBase = (baseText || "").trim();
  const desc = forAnalysis ? (descBase + buildDetailsBlock(details)).trim() : descBase;

  return {
    title,
    description: desc,
    price: numberOrUndefined(details.rent) || 0,
    currency: details.currency || "CAD",
    city: details.city || "",
    neighborhood: details.neighborhood || "",
    bedrooms: numberOrUndefined(details.bedrooms),
    bathrooms: numberOrUndefined(details.bathrooms),
    address_hint: details.addressHint || undefined,
    landlord_subject_id: "subj_manual",
    source_url: sourceUrl || undefined,
    image_urls: imageUrls || [],
  };
}

async function pollFinalAnalysis(analysisId: string, maxMs = 9000) {
  const start = Date.now();
  let wait = 450;

  while (Date.now() - start < maxMs) {
    const r = await fetchAnalysis(analysisId);

    if (!r.enrichmentStatus) return r;
    if (r.enrichmentStatus === "done") return r;
    if (r.enrichmentStatus === "partial") return r;
    if (r.enrichmentStatus === "failed") return r;

    await new Promise((res) => setTimeout(res, wait));
    wait = Math.min(1100, Math.floor(wait * 1.25));
  }

  return fetchAnalysis(analysisId);
}

export default function Checker() {
  const [mode, setMode] = useState<Mode>("quick");
  const [inputMode, setInputMode] = useState<InputMode>("both");

  const [listingUrl, setListingUrl] = useState<string>("");
  const [listingText, setListingText] = useState<string>("");
  const [images, setImages] = useState<File[]>([]);

  const [details, setDetails] = useState<ListingDetails>(defaultDetails());

  const [listing, setListing] = useState<Listing | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);

  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string>("");
  const [error, setError] = useState<string>("");

  const [fetchBusy, setFetchBusy] = useState(false);
  const [fetchStatus, setFetchStatus] = useState<string>("");

  const fileRef = useRef<HTMLInputElement | null>(null);

  // ✅ Lightbox
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [brokenImages, setBrokenImages] = useState<Record<string, true>>({});
  const markBrokenImage = (url: string) => {
    setBrokenImages((prev) => (prev[url] ? prev : { ...prev, [url]: true }));
  };


  const previewImages = useMemo(() => {
    const fromFiles = images.map((f) => URL.createObjectURL(f));
    const fromListing = (listing?.image_urls || []).filter(Boolean);
    // Show a healthy number of photos (8–10) without overwhelming the UI.
    const all = [...fromFiles, ...fromListing].filter((u) => !brokenImages[u]);
    const unique: string[] = [];
    const seen = new Set<string>();
    for (const u of all) {
      if (seen.has(u)) continue;
      seen.add(u);
      unique.push(u);
    }
    return unique.slice(0, 10);
  }, [images, listing, brokenImages]);


  // cleanup object URLs from local files
  useEffect(() => {
    return () => {
      images.forEach((f) => {
        try {
          URL.revokeObjectURL(f as any);
        } catch {}
      });
    };
  }, [images]);

  const isLightboxOpen = lightboxIndex !== null && previewImages.length > 0;
  const currentLightboxSrc =
    isLightboxOpen && lightboxIndex !== null ? previewImages[lightboxIndex] : null;

  function onPrev() {
    if (lightboxIndex === null) return;
    const n = previewImages.length;
    if (!n) return;
    setLightboxIndex((i) => {
      const cur = i ?? 0;
      return (cur - 1 + n) % n;
    });
  }

  function onNext() {
    if (lightboxIndex === null) return;
    const n = previewImages.length;
    if (!n) return;
    setLightboxIndex((i) => {
      const cur = i ?? 0;
      return (cur + 1) % n;
    });
  }

  // ESC + lock scroll
  useEffect(() => {
    if (!isLightboxOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightboxIndex(null);
      if (e.key === "ArrowRight") onNext();
      if (e.key === "ArrowLeft") onPrev();
    };

    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLightboxOpen, lightboxIndex, previewImages.length]);

  useEffect(() => {
    const last = lsGet<AnalysisResult>(LS_LAST);
    if (last) {
      setResult(last);
      setListing(last.listing);
      setListingText(stripDetailsBlock(last.listing.description || ""));
      setListingUrl(last.listing.source_url || "");

      setDetails((d) => ({
        ...d,
        title: last.listing.title || "",
        rent: toNumString(last.listing.price),
        currency: last.listing.currency || "CAD",
        city: last.listing.city || "",
        neighborhood: last.listing.neighborhood || "",
        addressHint: last.listing.address_hint || "",
        bedrooms: toNumString(last.listing.bedrooms),
        bathrooms: toNumString(last.listing.bathrooms),
      }));
    }

    const imported = lsGet<Listing>(LS_IMPORT);
    if (imported) {
      setListing(imported);
      setListingText(stripDetailsBlock(imported.description || ""));
      setListingUrl(imported.source_url || "");

      setDetails((d) => ({
        ...d,
        title: imported.title || "",
        rent: toNumString(imported.price),
        currency: imported.currency || "CAD",
        city: imported.city || "",
        neighborhood: imported.neighborhood || "",
        addressHint: imported.address_hint || "",
        bedrooms: toNumString(imported.bedrooms),
        bathrooms: toNumString(imported.bathrooms),
      }));
    }
  }, []);

  async function runAnalysis(nextListingForAnalysis: Listing, uploaded: File[] = []) {
    setBusy(true);
    setError("");
    setStatus(mode === "deep" ? "Analyze + Deep verification…" : "Analyzing…");

    try {
      const base = await analyzeManual(nextListingForAnalysis, uploaded);
      lsSet(LS_LAST, base);

      // update UI with listing WITHOUT showing details-block
      setResult(base);
      setListing({
        ...base.listing,
        description: stripDetailsBlock(base.listing.description || ""),
      });

      if (mode === "deep") {
        setStatus("Deep verification: cross-site checks & consistency…");
        const verify = await verifyAnalysis(base.analysisId);
        const final = await pollFinalAnalysis(verify.analysisId || base.analysisId);

        lsSet(LS_LAST, final);
        setResult(final);
        setListing({
          ...final.listing,
          description: stripDetailsBlock(final.listing.description || ""),
        });
      }

      setStatus("Done.");
      setTimeout(() => setStatus(""), 900);
    } catch (e: any) {
      setError(e?.message || String(e));
      setStatus("");
    } finally {
      setBusy(false);
    }
  }

  // ✅ This makes Quick/Deep actually do something *after* analysis exists
  async function runDeepVerificationOnly() {
    if (!result?.analysisId) return;
    setBusy(true);
    setError("");
    setStatus("Deep verification: cross-site checks & consistency…");

    try {
      const verify = await verifyAnalysis(result.analysisId);
      const final = await pollFinalAnalysis(verify.analysisId || result.analysisId);

      lsSet(LS_LAST, final);
      setResult(final);
      setListing({
        ...final.listing,
        description: stripDetailsBlock(final.listing.description || ""),
      });

      setStatus("Deep verification complete.");
      setTimeout(() => setStatus(""), 900);
    } catch (e: any) {
      setError(e?.message || String(e));
      setStatus("");
    } finally {
      setBusy(false);
    }
  }

  async function onFetchListing() {
    setError("");
    const url = listingUrl.trim();
    if (!url) {
      setError("Paste a listing URL first.");
      return;
    }

    setFetchBusy(true);
    setFetchStatus("Fetching listing details…");

    try {
      const extracted = await extractFromLink(url);

      if (extracted?.blocked) {
        setFetchStatus("");
        setError(
          extracted?.message
            ? `Link import was blocked by the site. ${extracted.message} Paste the listing text instead.`
            : "Link import was blocked by the site. Paste the listing text instead."
        );
        setInputMode("text");
        return;
      }

      const nextDetails: ListingDetails = {
        ...details,
        title: (extracted.title || details.title || "").toString(),
        rent: toNumString(extracted.price ?? details.rent),
        currency: (extracted.currency || details.currency || "CAD").toString(),
        city: (extracted.city || extracted.location?.city || details.city || "").toString(),
        neighborhood: (extracted.neighborhood || extracted.location?.neighborhood || details.neighborhood || "").toString(),
        addressHint: (extracted.address_hint || extracted.location?.address_hint || details.addressHint || "").toString(),
        bedrooms: toNumString(extracted.bedrooms ?? details.bedrooms),
        bathrooms: toNumString(extracted.bathrooms ?? details.bathrooms),
      };

      setDetails(nextDetails);

      const extractedDesc = (extracted.description || "").toString();
      if (extractedDesc) setListingText(stripDetailsBlock(extractedDesc));

      const displayListing = composeListing(nextDetails, extractedDesc, url, extracted.image_urls || [], false);

      // keep extra metadata if exists
      (displayListing as any).id = extracted.id || (displayListing as any).id;
      (displayListing as any).posted_at = extracted.posted_at;
      (displayListing as any).account_age_days = numberOrUndefined(extracted.account_age_days);
      (displayListing as any).posts_last_7d = numberOrUndefined(extracted.posts_last_7d);
      (displayListing as any).denied_inquiries_last_7d = numberOrUndefined(extracted.denied_inquiries_last_7d);
      displayListing.landlord_subject_id = extracted.landlord_subject_id || extracted.subjectId || "subj_manual";

      setListing(displayListing);
      setFetchStatus("Imported. Review fields and analyze.");
      setTimeout(() => setFetchStatus(""), 1800);
    } catch (e: any) {
      setFetchStatus("");
      setError(e?.message || "Could not fetch that listing. Paste the listing text instead.");
    } finally {
      setFetchBusy(false);
    }
  }

  async function onAnalyze() {
    setError("");

    const url = listingUrl.trim();
    const text = listingText.trim();

    const hasAnything =
      Boolean(url) ||
      Boolean(text) ||
      Boolean(details.title.trim()) ||
      Boolean(details.rent.trim());

    if (!hasAnything) {
      setError("Paste a listing URL or listing text (or fill basic fields).");
      return;
    }

    const baseText = inputMode === "link" ? (listing?.description || "") : text;

    // ✅ Display listing = clean text (no details block)
    const displayListing = composeListing(
      details,
      baseText,
      url || listing?.source_url,
      listing?.image_urls || [],
      false
    );

    // ✅ Analysis listing = includes details block for better model context
    const analysisListing = composeListing(
      details,
      baseText,
      url || listing?.source_url,
      listing?.image_urls || [],
      true
    );

    // keep extracted metadata
    analysisListing.landlord_subject_id = listing?.landlord_subject_id || analysisListing.landlord_subject_id;
    (analysisListing as any).posted_at = (listing as any)?.posted_at || (analysisListing as any).posted_at;
    (analysisListing as any).account_age_days = (listing as any)?.account_age_days || (analysisListing as any).account_age_days;
    (analysisListing as any).posts_last_7d = (listing as any)?.posts_last_7d || (analysisListing as any).posts_last_7d;
    (analysisListing as any).denied_inquiries_last_7d =
      (listing as any)?.denied_inquiries_last_7d || (analysisListing as any).denied_inquiries_last_7d;

    // keep UI listing clean
    setListing(displayListing);

    await runAnalysis(analysisListing, images);
  }

  function setD<K extends keyof ListingDetails>(k: K, v: ListingDetails[K]) {
    setDetails((prev) => ({ ...prev, [k]: v }));
  }

  const hasListing = Boolean(listing && (listing.title || listing.description));
  const hasAnalysis = Boolean(result?.analysisId);

  const showUrl = inputMode === "both" || inputMode === "link";
  const showText = inputMode === "both" || inputMode === "text";

  // ✅ Hide Upload Images in Link-only mode
  const showUploadImages = inputMode !== "link";

  // deep status heuristic
  const deepDone = Boolean(result?.enrichmentStatus && ["done", "partial"].includes(result.enrichmentStatus));

  return (
    <div className="space-y-6">
      {/* Lightbox */}
      {isLightboxOpen && currentLightboxSrc ? (
        <div
          className="fixed inset-0 z-[9999] grid place-items-center"
          style={{ background: "rgba(0,0,0,0.70)" }}
          onClick={() => setLightboxIndex(null)}
        >
          <div
            className="relative w-[min(92vw,980px)] max-h-[86vh] rounded-3xl overflow-hidden soft-border"
            style={{ background: "color-mix(in oklab, var(--sr-surface) 70%, transparent)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setLightboxIndex(null)}
              className="absolute top-3 right-3 z-10 grid h-10 w-10 place-items-center rounded-2xl chip hover:opacity-95 focus-ring"
            >
              <X size={18} />
            </button>

            {previewImages.length > 1 ? (
              <>
                <button
                  type="button"
                  onClick={onPrev}
                  className="absolute left-3 top-1/2 -translate-y-1/2 z-10 grid h-11 w-11 place-items-center rounded-2xl chip hover:opacity-95 focus-ring"
                >
                  <ChevronLeft size={18} />
                </button>
                <button
                  type="button"
                  onClick={onNext}
                  className="absolute right-3 top-1/2 -translate-y-1/2 z-10 grid h-11 w-11 place-items-center rounded-2xl chip hover:opacity-95 focus-ring"
                >
                  <ChevronRight size={18} />
                </button>
              </>
            ) : null}

            <img
              src={currentLightboxSrc}
              alt="Listing"
              className="w-full h-full object-contain"
              style={{ maxHeight: "86vh", background: "rgba(0,0,0,0.25)" }}
              onError={() => {
                if (!currentLightboxSrc) return;
                markBrokenImage(currentLightboxSrc);
                setLightboxIndex((i) => {
                  if (i == null) return null;
                  const next = Math.min(i, Math.max(0, previewImages.length - 2));
                  return previewImages.length > 1 ? next : null;
                });
              }}
            />

            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 text-xs subtle chip px-3 py-1 rounded-full">
              {lightboxIndex! + 1} / {previewImages.length} (ESC to close)
            </div>
          </div>
        </div>
      ) : null}

      {error ? (
        <div
          className="rounded-2xl p-4 soft-border"
          style={{
            background: "color-mix(in oklab, var(--sr-high) 10%, transparent)",
            borderColor: "color-mix(in oklab, var(--sr-high) 28%, var(--sr-border))",
          }}
        >
          <div className="text-sm" style={{ color: "var(--sr-text)" }}>
            {error}
          </div>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-12">
        {/* Left: Input */}
        <section className="glass rounded-2xl p-4 lg:col-span-4">
          <div className="flex items-center gap-2">
            <div className="grid h-9 w-9 place-items-center rounded-2xl chip">
              <Layers size={16} />
            </div>
            <div>
              <div className="font-semibold">Listing Input</div>
              <div className="text-xs subtle">URL, text, and optional photos.</div>
            </div>
          </div>

          <div className="mt-4 space-y-4">
            <div className="chip rounded-2xl p-1 flex items-center gap-1" aria-label="Input mode">
              {([
                { k: "link" as const, label: "Link" },
                { k: "text" as const, label: "Text" },
                { k: "both" as const, label: "Both" },
              ]).map((t) => (
                <button
                  key={t.k}
                  type="button"
                  onClick={() => setInputMode(t.k)}
                  className="flex-1 rounded-xl px-3 py-2 text-xs font-semibold focus-ring transition"
                  style={
                    inputMode === t.k
                      ? {
                          background: "color-mix(in oklab, var(--sr-cta) 18%, transparent)",
                          border: "1px solid color-mix(in oklab, var(--sr-cta) 30%, transparent)",
                          color: "var(--sr-text)",
                        }
                      : {
                          background: "transparent",
                          border: "1px solid transparent",
                          color: "var(--sr-muted)",
                        }
                  }
                >
                  {t.label}
                </button>
              ))}
            </div>

            {showUrl ? (
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <LinkIcon size={16} /> Listing URL
                  </div>
                  <span className="badge">
                    <Info size={14} /> Works best on public pages
                  </span>
                </div>

                <div className="flex gap-2">
                  <input
                    className="input flex-1"
                    placeholder="https://craigslist.org/..."
                    value={listingUrl}
                    onChange={(e) => setListingUrl(e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={onFetchListing}
                    disabled={fetchBusy || !listingUrl.trim()}
                    className="btn-secondary shrink-0 inline-flex items-center gap-2"
                    style={{ minWidth: 140, justifyContent: "center" }}
                  >
                    {fetchBusy ? (
                      <>
                        <Loader2 className="animate-spin" size={16} />
                        Fetching
                      </>
                    ) : (
                      <>
                        <Download size={16} />
                        Fetch
                      </>
                    )}
                  </button>
                </div>

                {fetchStatus ? <div className="mt-2 text-xs subtle">{fetchStatus}</div> : null}
              </div>
            ) : null}

            {/* details */}
            <div className="rounded-2xl chip p-4">
              <div className="text-sm font-semibold">Listing details</div>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="text-xs subtle">Title</label>
                  <input
                    className="input mt-1"
                    value={details.title}
                    onChange={(e) => setD("title", e.target.value)}
                    placeholder="e.g. Furnished room near SkyTrain"
                  />
                </div>

                <div>
                  <label className="text-xs subtle">Monthly rent</label>
                  <input
                    className="input mt-1"
                    type="number"
                    min="0"
                    value={details.rent}
                    onChange={(e) => setD("rent", e.target.value)}
                    placeholder="1500"
                  />
                </div>

                <div>
                  <label className="text-xs subtle">Currency</label>
                  <select className="input mt-1" value={details.currency} onChange={(e) => setD("currency", e.target.value)}>
                    <option value="CAD">CAD</option>
                    <option value="USD">USD</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs subtle">City</label>
                  <input className="input mt-1" value={details.city} onChange={(e) => setD("city", e.target.value)} placeholder="Vancouver" />
                </div>

                <div>
                  <label className="text-xs subtle">Neighborhood</label>
                  <input
                    className="input mt-1"
                    value={details.neighborhood}
                    onChange={(e) => setD("neighborhood", e.target.value)}
                    placeholder="Renfrew-Collingwood"
                  />
                </div>

                <div className="col-span-2">
                  <label className="text-xs subtle">Address hint (optional)</label>
                  <input
                    className="input mt-1"
                    value={details.addressHint}
                    onChange={(e) => setD("addressHint", e.target.value)}
                    placeholder="Near Renfrew St & ..."
                  />
                </div>

                <div>
                  <label className="text-xs subtle">Bedrooms</label>
                  <input className="input mt-1" type="number" min="0" value={details.bedrooms} onChange={(e) => setD("bedrooms", e.target.value)} placeholder="1" />
                </div>

                <div>
                  <label className="text-xs subtle">Bathrooms</label>
                  <input className="input mt-1" type="number" min="0" value={details.bathrooms} onChange={(e) => setD("bathrooms", e.target.value)} placeholder="1" />
                </div>

                <div>
                  <label className="text-xs subtle">Deposit (optional)</label>
                  <input className="input mt-1" type="number" min="0" value={details.deposit} onChange={(e) => setD("deposit", e.target.value)} placeholder="750" />
                </div>

                <div>
                  <label className="text-xs subtle">Utilities (optional)</label>
                  <input className="input mt-1" value={details.utilities} onChange={(e) => setD("utilities", e.target.value)} placeholder="Heat, water" />
                </div>
              </div>
            </div>

            {showText ? (
              <div>
                <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
                  <FileText size={16} /> Listing Text / Description
                </div>
                <textarea
                  className="textarea"
                  placeholder="Paste the full listing text here…"
                  value={listingText}
                  onChange={(e) => setListingText(e.target.value)}
                />
              </div>
            ) : null}

            {/* ✅ Hide upload images in Link mode */}
            {showUploadImages ? (
              <div>
                <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
                  <Upload size={16} /> Upload Images
                </div>
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="chip w-full rounded-2xl p-4 text-sm focus-ring transition hover:opacity-95"
                >
                  <div className="grid place-items-center gap-1 py-4">
                    <Upload size={18} />
                    <div className="text-sm">Drag & drop or click</div>
                    <div className="text-xs subtle">
                      {images.length ? `${images.length} file(s) selected` : "PNG/JPG supported"}
                    </div>
                  </div>
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => setImages(Array.from(e.target.files || []))}
                />
              </div>
            ) : null}

            {/* ✅ Make Analyze reflect mode */}
            <button type="button" disabled={busy} onClick={onAnalyze} className="btn">
              {busy ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="animate-spin" size={16} />
                  {status || "Working…"}
                </span>
              ) : mode === "deep" ? (
                "Analyze + Deep Verify"
              ) : (
                "Analyze (Quick)"
              )}
            </button>

            {status && !busy ? <div className="text-xs subtle">{status}</div> : null}
          </div>
        </section>

        {/* Middle: Preview + Evidence below images */}
        <section className="glass rounded-2xl p-4 lg:col-span-5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <div className="grid h-9 w-9 place-items-center rounded-2xl chip">
                <ExternalLink size={16} />
              </div>
              <div>
                <div className="font-semibold">Listing Preview</div>
                <div className="text-xs subtle">What we extracted / what you provided.</div>
              </div>
            </div>
          </div>

          {!hasListing ? (
            <div
              className="mt-8 grid place-items-center rounded-2xl soft-border"
              style={{ minHeight: 420, background: "color-mix(in oklab, var(--sr-surface) 55%, transparent)" }}
            >
              <div className="text-center">
                <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl chip">
                  <ExternalLink />
                </div>
                <div className="mt-4 text-lg font-semibold">No listing loaded</div>
                <div className="text-sm subtle">Fetch a link or fill details and analyze</div>
              </div>
            </div>
          ) : (
            <div className="mt-4 space-y-4">
              <div className="rounded-2xl chip p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-lg font-semibold break-words clamp-2">{listing?.title || "Listing"}</div>
                    <div className="mt-1 text-sm subtle">
                      {[listing?.neighborhood, listing?.city].filter(Boolean).join(", ") || "Location unknown"}
                      {listing?.price ? ` • ${listing.currency || "CAD"} ${listing.price}/mo` : ""}
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      {listing?.bedrooms !== undefined ? <span className="badge">{listing.bedrooms} bd</span> : null}
                      {listing?.bathrooms !== undefined ? <span className="badge">{listing.bathrooms} ba</span> : null}
                    </div>
                  </div>

                  {/* ✅ Better looking open link */}
                  {listing?.source_url ? (
                    <a
                      href={listing.source_url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-2 rounded-xl px-3 py-2 font-semibold soft-border focus-ring hover:opacity-95"
                      style={{
                        background: "color-mix(in oklab, var(--sr-surface) 75%, transparent)",
                        whiteSpace: "nowrap",
                      }}
                      title="Open listing in a new tab"
                    >
                      <ExternalLink size={16} />
                      Open
                    </a>
                  ) : null}
                </div>

                <div className="mt-4 text-sm subtle whitespace-pre-wrap break-words">
                  {/* ✅ Clean description only */}
                  {stripDetailsBlock(listing?.description || "")}
                </div>
              </div>

              {previewImages.length ? (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {previewImages.map((src, i) => (
                    <button
                      key={i}
                      type="button"
                      className="relative group rounded-2xl overflow-hidden soft-border focus-ring"
                      onClick={() => setLightboxIndex(i)}
                      title="Click to view"
                    >
                      <img
                        src={src}
                        alt=""
                        className="h-32 w-full object-cover transition group-hover:scale-[1.02]"
                        loading="lazy"
                        onError={() => markBrokenImage(src)}
                      />
                      <div
                        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition"
                        style={{ background: "rgba(0,0,0,0.18)" }}
                      />
                    </button>
                  ))}
                </div>
              ) : null}

              {hasAnalysis ? (
                <div className="space-y-4">
                  <div className="soft-divider" />
                  <EvidencePanel signals={result!.signals || []} />
                  <ActionsPanel actions={result!.recommendedActions || []} verdict={result!.verdict} />
                </div>
              ) : null}
            </div>
          )}
        </section>

        {/* Right: Risk + Mode that actually matters */}
        <section className="glass rounded-2xl p-4 lg:col-span-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="font-semibold">Risk Score</div>
              <div className="text-xs subtle">
                {mode === "deep" ? "Deep: cross-site checks + consistency." : "Quick: fast scan."}
              </div>
            </div>

            <div className="chip rounded-2xl p-1 flex items-center gap-1">
              {(["quick", "deep"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className="px-3 py-1.5 rounded-xl text-sm font-semibold focus-ring transition"
                  style={
                    mode === m
                      ? {
                          background: "color-mix(in oklab, var(--sr-cta) 20%, transparent)",
                          border: "1px solid color-mix(in oklab, var(--sr-cta) 30%, transparent)",
                          color: "var(--sr-text)",
                        }
                      : { background: "transparent", border: "1px solid transparent", color: "var(--sr-muted)" }
                  }
                >
                  {m === "quick" ? "Quick" : "Deep"}
                </button>
              ))}
            </div>
          </div>

          {!hasAnalysis ? (
            <div
              className="mt-8 grid place-items-center rounded-2xl soft-border"
              style={{ minHeight: 420, background: "color-mix(in oklab, var(--sr-surface) 55%, transparent)" }}
            >
              <div className="text-center">
                <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl chip">
                  <Layers />
                </div>
                <div className="mt-4 text-lg font-semibold">No analysis yet</div>
                <div className="text-sm subtle">Analyze a listing to see score</div>
              </div>
            </div>
          ) : (
            <div className="mt-4 space-y-4">
              <RiskDial score={result!.riskScore} verdict={result!.verdict} />

              {/* ✅ Make mode switch useful */}
              {mode === "deep" && !deepDone ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={runDeepVerificationOnly}
                  className="btn-secondary w-full inline-flex items-center justify-center gap-2"
                >
                  {busy ? <Loader2 className="animate-spin" size={16} /> : <Layers size={16} />}
                  Run Deep Verification
                </button>
              ) : mode === "deep" && deepDone ? (
                <div className="rounded-2xl chip p-3 text-sm subtle">
                  Deep verification already applied.
                </div>
              ) : (
                <div className="rounded-2xl chip p-3 text-sm subtle">
                  Quick mode is selected. Switch to Deep for stronger verification.
                </div>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
