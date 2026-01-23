import type { AnalysisResult, LeaseSimplifyResult, Listing } from "./types";

const rawBase = (import.meta as any).env?.VITE_API_BASE as string | undefined;

/**
 * If VITE_API_BASE is set (e.g. https://saferent-api.onrender.com),
 * calls go to that backend. Otherwise it uses relative paths (works with Vite proxy in dev).
 */
function apiUrl(path: string) {
  const base = (rawBase || "").replace(/\/$/, "");
  if (!base) return path;
  return base + path;
}

async function j<T>(r: Response): Promise<T> {
  if (!r.ok) {
    const txt = await r.text().catch(() => "Request failed");
    throw new Error(txt || "Request failed");
  }
  return r.json() as Promise<T>;
}

export async function fetchDemoListings() {
  return j<Listing[]>(await fetch(apiUrl("/api/demo/listings")));
}

export type SimilarListingsResponse = {
  provider: "serper" | "brave" | "web";
  mode: "live" | "cache" | "skipped";
  reason?: string;
  items: Listing[];
};

/**
 * Real-world similar listings (uses SERPER_API_KEY on the backend).
 * Note: This does NOT scrape marketplaces at scale; it uses web search + a light extractor.
 */
export async function fetchSimilarListings(analysisId: string, limit = 24): Promise<SimilarListingsResponse> {
  const r = await fetch(apiUrl("/api/similar"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ analysisId, limit }),
  });
  return j<SimilarListingsResponse>(r);
}

export async function extractFromLink(url: string) {
  const r = await fetch(apiUrl(`/api/extract?url=${encodeURIComponent(url)}`));
  // backend returns 200 with {blocked:true,...} on some cases
  if (!r.ok) throw new Error(await r.text().catch(() => "Could not import from link"));
  return r.json() as Promise<any>;
}

export async function analyzeDemo(listingId: string): Promise<AnalysisResult> {
  const r = await fetch(apiUrl("/api/analyze"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ listingId }),
  });
  return j<AnalysisResult>(r);
}

export async function analyzeManual(listing: Listing, images?: File[]): Promise<AnalysisResult> {
  if (images && images.length) {
    const fd = new FormData();
    fd.append("listing", JSON.stringify(listing));
    images.forEach((img) => fd.append("images", img));
    return j<AnalysisResult>(await fetch(apiUrl("/api/analyze"), { method: "POST", body: fd }));
  }

  return j<AnalysisResult>(
    await fetch(apiUrl("/api/analyze"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ listing }),
    })
  );
}

export async function verifyAnalysis(analysisId: string): Promise<AnalysisResult> {
  const r = await fetch(apiUrl("/api/verify"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ analysisId }),
  });
  return j<AnalysisResult>(r);
}

export async function fetchAnalysis(analysisId: string): Promise<AnalysisResult> {
  return j<AnalysisResult>(await fetch(apiUrl(`/api/analysis/${encodeURIComponent(analysisId)}`)));
}

export async function sendFeedback(
  analysisId: string,
  label: "legit" | "scam" | "predatory" | "unknown"
) {
  return j(
    await fetch(apiUrl("/api/feedback"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ analysisId, label }),
    })
  );
}

/** Lease: upload a PDF/text file */
export async function simplifyLeaseFile(file: File, province?: string): Promise<LeaseSimplifyResult> {
  const fd = new FormData();
  fd.append("lease", file);
  if (province) fd.append("province", province);

  const r = await fetch(apiUrl("/api/lease/simplify"), { method: "POST", body: fd });
  if (!r.ok) throw new Error(await r.text());
  return (await r.json()) as LeaseSimplifyResult;
}

/** Lease: paste text */
export async function simplifyLeaseText(text: string, province?: string): Promise<LeaseSimplifyResult> {
  const r = await fetch(apiUrl("/api/lease/simplify-text"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, province }),
  });
  if (!r.ok) throw new Error(await r.text());
  return (await r.json()) as LeaseSimplifyResult;
}

export async function fetchReport(analysisId: string) {
  const payload: any = await j(await fetch(apiUrl(`/api/report/${encodeURIComponent(analysisId)}`)));
  // Back-end returns { markdown, analysisId, analysis }. Older versions may return plain text.
  if (typeof payload === "string") return payload;
  if (payload?.markdown && typeof payload.markdown === "string") return payload.markdown as string;
  if (payload?.md && typeof payload.md === "string") return payload.md as string;
  if (payload?.report && typeof payload.report === "string") return payload.report as string;
  // Safety fallback: avoid [object Object]
  try {
    return JSON.stringify(payload, null, 2);
  } catch {
    return String(payload);
  }
}

export async function fetchReputation(subjectId: string) {
  return j(await fetch(apiUrl(`/api/reputation/${encodeURIComponent(subjectId)}`)));
}
