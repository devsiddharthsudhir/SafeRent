const STOP = new Set([
  "the","a","an","and","or","for","to","of","in","on","at","with","from",
  "this","that","these","those","is","are","was","were","be","been","being",
  "apt","apartment","unit","suite","condo","condominium","house","home","room","bed","beds","br","bath","baths",
]);

const ABBREV: Record<string, string> = {
  st: "street",
  street: "street",
  ave: "avenue",
  avenue: "avenue",
  rd: "road",
  road: "road",
  blvd: "boulevard",
  boulevard: "boulevard",
  dr: "drive",
  drive: "drive",
  ln: "lane",
  lane: "lane",
  cres: "crescent",
  crescent: "crescent",
  ct: "court",
  court: "court",
  pl: "place",
  place: "place",
  way: "way",
  hwy: "highway",
  highway: "highway",
};

function clean(s: string) {
  return String(s || "")
    .toLowerCase()
    .replace(/[#.,;:()\[\]{}]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function tokenize(s: string): string[] {
  const t = clean(s);
  if (!t) return [];
  const toks = t.split(" ").map((x) => x.trim()).filter(Boolean);
  const norm = toks.map((x) => ABBREV[x] || x).filter((x) => !STOP.has(x));
  return norm;
}

export function jaccard(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0;
  const A = new Set(a);
  const B = new Set(b);
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  const union = A.size + B.size - inter;
  return union ? inter / union : 0;
}

export function normalizeAddress(raw: string): string {
  const t = clean(raw);
  if (!t) return "";
  // remove unit markers
  const noUnit = t.replace(/\b(apt|apartment|unit|suite|#)\s*\w+\b/g, " ");
  const toks = noUnit.split(" ").map((x) => ABBREV[x] || x).filter(Boolean);
  return toks.join(" ").trim();
}

export function addressSimilarity(a: string, b: string): number {
  const na = normalizeAddress(a);
  const nb = normalizeAddress(b);
  if (!na || !nb) return 0;
  return jaccard(tokenize(na), tokenize(nb));
}

export function titleSimilarity(a: string, b: string): number {
  return jaccard(tokenize(a), tokenize(b));
}

export function hamming(a: string, b: string): number {
  const n = Math.min(a.length, b.length);
  let d = 0;
  for (let i = 0; i < n; i++) if (a[i] !== b[i]) d++;
  return d + Math.abs(a.length - b.length);
}

export function hashSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  const d = hamming(a, b);
  // 64-bit hash (8x8) => max 64
  const s = 1 - Math.min(64, d) / 64;
  return Math.max(0, Math.min(1, s));
}
