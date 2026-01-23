export type SeoConfig = {
  title: string;
  description: string;
  path?: string;
  noindex?: boolean;
};

const DEFAULT: SeoConfig = {
  title: "SafeRent | Verify Before You Rent",
  description:
    "SafeRent helps renters in Canada verify listings before they pay. Explainable scam signals, cross-post checks, and a plain-English lease simplifier.",
};

// Route-level SEO defaults. This improves titles/descriptions when users land directly on a route
// (and prevents "broken" feeling on refresh by ensuring a sensible, stable state).
export const ROUTE_SEO: Record<string, SeoConfig> = {
  "/": {
    title: "SafeRent | Verify Before You Rent",
    description:
      "Verify a rental listing before you pay. Explainable scam signals, cross-post checks, and safer next steps for renters in Canada.",
  },
  "/checker": {
    title: "Listing Checker | SafeRent",
    description:
      "Paste a listing to detect scam and predatory patterns using explainable signals. Get evidence and safer next steps.",
  },
  "/lease": {
    title: "Lease Simplifier | SafeRent",
    description:
      "Upload a lease PDF or paste text to get a plain-English summary and clause flags (Canada-focused).",
  },
  "/similar-listings": {
    title: "Similar Listings | SafeRent",
    description:
      "Find cross-posts and comparable listings, compare pricing, and spot duplicates before you send money.",
  },
  "/report": {
    title: "Generate a Report | SafeRent",
    description:
      "Create a clean, evidence-first report you can send to platforms or consumer protection.",
  },
  "/emergency": {
    title: "Emergency Resources | SafeRent",
    description:
      "If you paid a scammer or feel unsafe, use these next steps and Canada-focused resources.",
  },
  "/safety": {
    title: "Safety Guide | SafeRent",
    description:
      "Best practices for safe renting: viewing checklist, payment safety, and verification steps.",
  },
  "/privacy": {
    title: "Privacy Policy | SafeRent",
    description:
      "How SafeRent handles data and protects your privacy.",
  },
  "/terms": {
    title: "Terms of Service | SafeRent",
    description:
      "Terms and usage guidelines for SafeRent.",
  },
  "/extension": {
    title: "Browser Extension | SafeRent",
    description:
      "Install the SafeRent extension to import listings and run checks in one click.",
  },
  "/import": {
    title: "Import Listing | SafeRent",
    description:
      "Import a listing from the extension and run an explainable scam check.",
    noindex: true,
  },
};

function ensureMeta(nameOrProperty: { name?: string; property?: string }) {
  const selector = nameOrProperty.name
    ? `meta[name=\"${nameOrProperty.name}\"]`
    : `meta[property=\"${nameOrProperty.property}\"]`;
  let el = document.head.querySelector(selector) as HTMLMetaElement | null;
  if (!el) {
    el = document.createElement("meta");
    if (nameOrProperty.name) el.setAttribute("name", nameOrProperty.name);
    if (nameOrProperty.property) el.setAttribute("property", nameOrProperty.property);
    document.head.appendChild(el);
  }
  return el;
}

function ensureLink(rel: string) {
  let el = document.head.querySelector(`link[rel=\"${rel}\"]`) as HTMLLinkElement | null;
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", rel);
    document.head.appendChild(el);
  }
  return el;
}

export function applySeo(overrides: SeoConfig) {
  const cfg: SeoConfig = { ...DEFAULT, ...overrides };
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const canonicalUrl = origin && cfg.path ? `${origin}${cfg.path}` : origin;

  // Title + description
  document.title = cfg.title;
  ensureMeta({ name: "description" }).setAttribute("content", cfg.description);

  // Robots
  const robots = cfg.noindex ? "noindex,nofollow" : "index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1";
  ensureMeta({ name: "robots" }).setAttribute("content", robots);

  // Canonical
  const canonical = ensureLink("canonical");
  if (canonicalUrl) canonical.setAttribute("href", canonicalUrl);

  // OpenGraph
  ensureMeta({ property: "og:title" }).setAttribute("content", cfg.title);
  ensureMeta({ property: "og:description" }).setAttribute("content", cfg.description);
  if (canonicalUrl) ensureMeta({ property: "og:url" }).setAttribute("content", canonicalUrl);

  // Twitter
  ensureMeta({ name: "twitter:title" }).setAttribute("content", cfg.title);
  ensureMeta({ name: "twitter:description" }).setAttribute("content", cfg.description);

  // JSON-LD (SoftwareApplication)
  const id = "saferent-jsonld";
  let script = document.getElementById(id) as HTMLScriptElement | null;
  if (!script) {
    script = document.createElement("script");
    script.id = id;
    script.type = "application/ld+json";
    document.head.appendChild(script);
  }

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: "SafeRent",
    applicationCategory: "UtilitiesApplication",
    operatingSystem: "Web",
    description: cfg.description,
    url: canonicalUrl || undefined,
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "CAD",
    },
  };

  script.text = JSON.stringify(jsonLd);
}
