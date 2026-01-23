import type { Listing } from "./types.js";

export type ListingType = "room" | "unit" | "sublet" | "short_term" | "homestay" | "unknown";

export type ProvinceCode =
  | "BC"
  | "ON"
  | "AB"
  | "QC"
  | "MB"
  | "SK"
  | "NS"
  | "NB"
  | "NL"
  | "PE"
  | "NT"
  | "NU"
  | "YT"
  | "";

const CITY_TO_PROVINCE: Record<string, ProvinceCode> = {
  // BC (Metro Vancouver + a few common)
  vancouver: "BC",
  burnaby: "BC",
  richmond: "BC",
  surrey: "BC",
  coquitlam: "BC",
  "port coquitlam": "BC",
  "port moody": "BC",
  "new westminster": "BC",
  "north vancouver": "BC",
  "west vancouver": "BC",
  langley: "BC",
  kelowna: "BC",
  victoria: "BC",
  nanaimo: "BC",

  // ON
  toronto: "ON",
  "north york": "ON",
  scarborough: "ON",
  etobicoke: "ON",
  ottawa: "ON",
  mississauga: "ON",
  brampton: "ON",
  hamilton: "ON",
  london: "ON",
  kitchener: "ON",
  waterloo: "ON",

  // AB
  calgary: "AB",
  edmonton: "AB",

  // QC
  montreal: "QC",
  "montréal": "QC",
  quebec: "QC",
  "québec": "QC",
};

function combinedText(listing: Listing): string {
  return [
    listing.title,
    listing.description,
    listing.city,
    listing.neighborhood,
    listing.address_hint,
    (listing as any).addressHint,
  ]
    .filter(Boolean)
    .join("\n")
    .toLowerCase();
}

export function hasRoomShareHint(text: string): boolean {
  const t = String(text || "").toLowerCase();
  // Strong room/share cues across major Canadian rental platforms
  return (
    /\b(roomies?\.ca)\b/.test(t) ||
    /\b(roommates?|roomies?)\b/.test(t) ||
    /\b(room\s*for\s*rent|rent\s*a\s*room|renting\s+a\s*room)\b/.test(t) ||
    /\b(shared\s*room|private\s*room)\b/.test(t) ||
    /\b(shared\s*(bath|bathroom|kitchen|living\s*room))\b/.test(t) ||
    /\b(price\s*(is\s*)?listed\s*(is\s*)?for\s*(one|1)\s*room)\b/.test(t) ||
    /\b(room\s*only)\b/.test(t)
  );
}

export function normalizeCity(raw: string | undefined | null): string {
  const s = String(raw || "")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\b(canada)\b/gi, "")
    .replace(/\b(british columbia|ontario|alberta|quebec|québec)\b/gi, "")
    .replace(/\b(BC|ON|AB|QC|MB|SK|NS|NB|NL|PE|NT|NU|YT)\b/g, "")
    .replace(/[0-9][A-Z][0-9]\s?[A-Z][0-9][A-Z]/gi, "") // postal code
    .replace(/[,\|]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

  // If it looks like "renfrew-collingwood", keep as-is; otherwise return last token group as city.
  return s;
}

export function inferProvince(listing: Listing): ProvinceCode {
  const t = combinedText(listing);

  // explicit province mentions
  if (/\b(british columbia|\bbc\b)\b/i.test(t)) return "BC";
  if (/\b(ontario|\bon\b)\b/i.test(t)) return "ON";
  if (/\b(alberta|\bab\b)\b/i.test(t)) return "AB";
  if (/\b(quebec|québec|\bqc\b)\b/i.test(t)) return "QC";

  // infer from city tokens
  const cityRaw = listing.city || listing.neighborhood || listing.address_hint || (listing as any).addressHint || "";
  const city = normalizeCity(cityRaw);

  // Try direct match (including multi-word keys)
  const keys = Object.keys(CITY_TO_PROVINCE).sort((a, b) => b.length - a.length);
  for (const k of keys) {
    if (city.includes(k)) return CITY_TO_PROVINCE[k];
  }

  return "";
}

export function inferBedrooms(listing: Listing): number | null {
  const t = combinedText(listing);

  // studio
  if (/\bstudio\b/.test(t)) return 0;

  // "2BR", "2 br", "2 bedroom", "2-bed"
  const m =
    t.match(/\b(\d{1,2})\s*(?:br|bed|beds|bedroom|bedrooms)\b/) ||
    t.match(/\b(\d{1,2})\s*-\s*bed\b/);

  if (m) {
    const n = Number(m[1]);
    if (Number.isFinite(n) && n >= 0 && n <= 10) return n;
  }

  return null;
}

export function classifyListingType(listing: Listing): ListingType {
  const t = combinedText(listing);

  // Room signals
  const roomish =
    hasRoomShareHint(t) ||
    /\b(room\s*in\s*(a\s*)?(house|condo|apartment))\b/i.test(t);

  // sublet / lease takeover
  const sublet =
    /\b(sublet|sub-?let|lease\s*takeover|lease\s*transfer|take\s*over\s*my\s*lease)\b/i.test(t);

  // short term
  const shortTerm =
    /\b(short\s*term|weekly|daily|airbnb|month\s*to\s*month\s*(only)?|furnished\s*short)\b/i.test(t);

  // homestay
  const homestay = /\b(homestay|host\s*family)\b/i.test(t);

  if (homestay) return "homestay";
  if (sublet) return "sublet";
  if (shortTerm && roomish) return "room";
  if (roomish) return "room";
  if (shortTerm) return "short_term";

  // Default
  return "unit";
}
