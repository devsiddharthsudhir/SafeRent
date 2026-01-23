export type Listing = {
  id?: string;

  /** Original listing URL (extension/extractor may use different keys) */
  source_url?: string;
  /** Normalized URL used internally (set by /api/analyze normalizeListingInput) */
  url?: string;

  title: string;
  description: string;
  price: number;
  currency?: string;

  city?: string;
  neighborhood?: string;

  /** Some callers use camelCase, some use snake_case. We accept both. */
  addressHint?: string;
  address_hint?: string;

  bedrooms?: number;
  bathrooms?: number;

  posted_at?: string;
  account_age_days?: number;
  posts_last_7d?: number;
  denied_inquiries_last_7d?: number;

  landlord_subject_id?: string;
  image_urls?: string[];
};

export type Signal = {
  id: string;
  category: "Words" | "Price" | "Behavior" | "Images" | "Web";
  label: string;
  why_it_matters: string;
  evidence?: string;
  value: number;
  weight: number;
  contribution: number;
  severity: "low" | "medium" | "high";
};

export type CrosspostMatch = {
  url: string;
  provider: "serper" | "brave" | "duckduckgo";
  title?: string;
  snippet?: string;
  price?: number;
  currency?: string;
  similarity: number; // 0..1
};

export type ProviderDiagnostic = {
  provider: "serper" | "brave" | "duckduckgo";
  mode: "live" | "cache" | "skipped";
  ms?: number;
  reason?: string;
};

export type AnalysisResult = {
  analysisId: string;
  createdAt: string;
  subjectId: string;
  listing: Listing;
  riskScore: number;
  riskProbability: number;
  rawLogit?: number; // uncalibrated logit (bias + sum(contributions)); useful for eval/calibration
  verdict: "likely_scam" | "likely_predatory" | "unclear" | "likely_legit";
  signals: Signal[];
  topReasons: string[];
  recommendedActions: string[];

  // Confidence / redundancy (helps users get best result when input data is thin)
  confidence?: number; // 0..1
  confidenceLabel?: "low" | "medium" | "high";
  dataQualityHints?: string[];
  redundancySteps?: string[];

  // Optional enrichments
  imageHashes?: string[];
  enrichmentStatus?: "skipped" | "queued" | "running" | "done" | "partial" | "failed";
  /**
   * Controls which providers we use during cross-site verification.
   * - "serper": prefer Serper only (fallback to Brave/DDG if Serper is unavailable)
   * - "both": run Serper + Brave in parallel for higher correctness
   */
  enrichmentMode?: "serper" | "both";
  enrichmentForced?: boolean;
  enrichmentReason?: string;
  crossposts?: CrosspostMatch[];
  providerDiagnostics?: ProviderDiagnostic[];
};
