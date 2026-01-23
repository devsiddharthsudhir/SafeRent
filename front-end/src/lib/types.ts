export type Listing = {
  id?: string;
  source_url?: string;
  title: string;
  description: string;
  price: number;
  currency?: string;
  city?: string;
  neighborhood?: string;
  bedrooms?: number;
  bathrooms?: number;
  address_hint?: string;
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
  similarity: number;
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
  verdict: "likely_scam" | "likely_predatory" | "unclear" | "likely_legit";
  signals: Signal[];
  topReasons: string[];
  recommendedActions: string[];

  confidence?: number; // 0..1
  confidenceLabel?: "low" | "medium" | "high";
  dataQualityHints?: string[];
  redundancySteps?: string[];

  imageHashes?: string[];
  enrichmentStatus?: "skipped" | "queued" | "running" | "done" | "partial" | "failed";
  enrichmentMode?: "serper" | "both";
  enrichmentForced?: boolean;
  enrichmentReason?: string;
  crossposts?: CrosspostMatch[];
  providerDiagnostics?: ProviderDiagnostic[];
};

export type LeaseFlagSeverity = "low" | "medium" | "high";

export type LeaseFlag = {
  id: string;
  title: string;
  severity: LeaseFlagSeverity;
  why: string;
  suggestion: string;
  excerpt?: string;
};

export type LeaseClause = {
  id: string;
  title: string;
  raw: string;
  plainEnglish: string;
  severity?: LeaseFlagSeverity;
  matchedFlagIds?: string[];
};

export type LeaseSimplifyResult = {
  ok: true;
  disclaimer?: string;
  provinceGuess: string;
  extractedChars: number;
  warnings: string[];
  leaseRiskScore?: number; // 0..100
  leaseVerdict?: "low" | "medium" | "high" | "unclear";
  keyTerms: {
    rentMonthly?: number;
    deposit?: number;
    termType?: "fixed" | "month_to_month" | "unknown";
    termStart?: string;
    termEnd?: string;
    noticeToEndDays?: number;
    utilities?: string;
    occupants?: string;
  };
  laymanSummary: string[];
  flags: LeaseFlag[];
  clauses?: LeaseClause[];
  llmUsed?: boolean;
};
