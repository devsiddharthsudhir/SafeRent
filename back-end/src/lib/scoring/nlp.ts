import type { Listing, Signal } from "./types.js";

type MatchRule = {
  id: string;
  category: Signal["category"];
  label: string;
  patterns: RegExp[];
  why: string;
  severity: Signal["severity"];
  value?: number;
  // If true, we try to ignore matches that appear in safety/disclaimer language like
  // "no e-transfer", "do not pay via crypto", etc.
  negationSensitive?: boolean;
};

function combinedText(listing: Listing) {
  return `${listing.title || ""}\n${listing.description || ""}`;
}

function findFirstMatch(text: string, patterns: RegExp[]): { pattern: RegExp; index: number; matchText: string } | null {
  for (const p of patterns) {
    const flags = p.flags.includes("g") ? p.flags : p.flags + "g";
    const re = new RegExp(p.source, flags);
    const m = re.exec(text);
    if (m && typeof m.index === "number") return { pattern: p, index: m.index, matchText: String(m[0] || "") };
  }
  return null;
}

function hasNegationNear(text: string, index: number): boolean {
  // Look back ~80 chars until a punctuation boundary.
  const start = Math.max(0, index - 80);
  const window = text.slice(start, index).toLowerCase();
  // If a negation appears close to the match without a sentence break, treat it as a safety cue.
  return /(no|not|never|without|avoid|do\s+not|don'?t)\b[^.!?\n]{0,25}$/.test(window);
}

const rules: MatchRule[] = [
  { id:"nlp_whatsapp_only", category:"Words", label:"Pushes WhatsApp-only communication",
    why:"Scammers often move conversations off-platform to avoid moderation and tracking.",
    patterns:[/whatsapp/i,/wa(?:\s|:)?\+?\d/i], severity:"high", negationSensitive: true },

  { id:"nlp_telegram_or_signal", category:"Words", label:"Pushes Telegram/Signal communication",
    why:"Off-platform apps reduce accountability and make it easier to run deposit scams.",
    patterns:[/\btelegram\b/i,/\bt\.me\//i,/\bsignal\b/i,/\btg\b/i], severity:"high", negationSensitive: true },

  { id:"nlp_etransfer", category:"Words", label:"Asks for Interac e-Transfer / eTransfer",
    why:"In Canada, e-Transfer deposit scams are one of the most common rental fraud patterns.",
    patterns:[/\be-?transfer\b/i,/\binterac\b/i,/\betransfer\b/i], severity:"high", negationSensitive: true },

  { id:"nlp_crypto_payment", category:"Words", label:"Requests crypto payment",
    why:"Crypto payments are hard to reverse and are frequently used in scams.",
    patterns:[/\bcrypto\b/i,/\bbitcoin\b/i,/\beth\b/i,/\busdt\b/i], severity:"high", negationSensitive: true },

  { id:"nlp_wire_transfer", category:"Words", label:"Requests wire transfer",
    why:"Wire transfers are hard to reverse and frequently used in scams.",
    patterns:[/wire transfer/i,/swift/i,/western union/i], severity:"high", negationSensitive: true },

  { id:"nlp_gift_cards", category:"Words", label:"Requests gift cards",
    why:"Gift card requests are a classic scam payment method.",
    patterns:[/gift\s*card/i,/itunes/i,/steam\s*card/i], severity:"high", negationSensitive: true },

  { id:"nlp_out_of_country", category:"Words", label:"Claims to be out of country",
    why:"A common scam script: landlord is away so you can't verify the unit in person.",
    patterns:[/out of (the )?country/i,/overseas/i,/working abroad/i,/currently abroad/i], severity:"high" },

  { id:"nlp_no_viewing", category:"Behavior", label:"Refuses an in-person viewing",
    why:"Refusing a viewing is a strong scam indicator, especially when paired with deposit requests.",
    patterns:[/(?:no\s+(?:in-?person\s+)?viewing\s+(?:available|possible)|viewing\s+not\s+available|can'?t\s+show|cannot\s+show|unable\s+to\s+show)/i,/move\s*in\s*(today|tomorrow)\b/i], severity:"high", negationSensitive: true },

  { id:"nlp_urgent", category:"Behavior", label:"High pressure / urgency language",
    why:"Scammers pressure victims into paying quickly.",
    patterns:[/urgent/i,/asap/i,/today only/i,/many interested/i], severity:"medium" },

  { id:"nlp_deposit_before_viewing", category:"Behavior", label:"Requests deposit to reserve before viewing",
    why:"Paying before verifying identity and seeing the unit is the key failure mode in most rental scams.",
    patterns:[/deposit.*(reserve|hold|secure)/i,/(reserve|hold|secure).*(deposit|etransfer|e-?transfer)/i,/pay.*deposit.*before/i], severity:"high", negationSensitive: true },

  { id:"nlp_application_fee", category:"Behavior", label:"Mentions an application fee",
    why:"Extra fees may indicate predatory terms or policy violations depending on the province.",
    patterns:[/application fee/i,/processing fee/i,/admin fee/i], severity:"medium", negationSensitive: true },

  { id:"nlp_id_docs_early", category:"Words", label:"Asks for ID documents early (passport/SIN)",
    why:"Requesting sensitive documents before a viewing or lease is a common identity-theft pattern.",
    patterns:[/\bpassport\b/i,/\bSIN\b/i,/social insurance/i,/\bdriver'?s license\b/i], severity:"medium", negationSensitive: true },

  { id:"nlp_monthly_pet_fee", category:"Behavior", label:"Mentions ongoing pet fee",
    why:"Ongoing add-on fees can be used to inflate effective rent and are often predatory.",
    patterns:[/monthly pet fee/i,/pet fee per month/i], severity:"low" },

  // --- Scam scripts frequently seen in Canada
  { id:"nlp_keys_by_courier", category:"Words", label:"Keys will be shipped / couriered",
    why:"A common scam script: you pay first, then the keys are supposedly mailed or couriered.",
    patterns:[/keys?.*(mailed|mail|shipped|ship|courier|fedex|ups|dhl|canada\s*post)/i,/(courier|fedex|ups|dhl).*(keys?)/i], severity:"high", negationSensitive: true },

  { id:"nlp_airbnb_booking_payment", category:"Words", label:"Mentions paying via Airbnb/Booking-style reservation",
    why:"Scammers often redirect victims to fake reservation or payment flows.",
    patterns:[/\bairbnb\b/i,/booking\.com/i,/\bvrbo\b/i,/\bexpedia\b/i,/reservation.*(pay|payment|deposit)/i], severity:"high", negationSensitive: true },

  { id:"nlp_cash_only", category:"Words", label:"Requests cash-only payment",
    why:"Cash payments are hard to trace and reduce your ability to dispute fraud.",
    patterns:[/cash\s*only/i,/cash\s*deposit\s*only/i,/pay\s*cash/i], severity:"high", negationSensitive: true },

  { id:"nlp_refundable_deposit_guarantee", category:"Words", label:"Refundable deposit / money-back guarantee",
    why:"A persuasion pattern used to lower suspicion before taking a deposit.",
    patterns:[/refundable\s*deposit/i,/money\s*back\s*guarantee/i,/100%\s*refund/i], severity:"medium" },

  // --- Legit / safety cues (negative weights reduce false positives)
  { id:"nlp_open_house_viewing", category:"Behavior", label:"Offers an open house or in-person viewing",
    why:"A real viewing before payment is a strong legitimacy signal.",
    patterns:[/open\s*house/i,/(in\s*-?person|in person)\s*viewing/i,/schedule\s*(a\s*)?viewing/i], severity:"low" },

  { id:"nlp_no_deposit_until_signed", category:"Behavior", label:"Says no deposit until lease is signed",
    why:"This is a safety cue that lowers the probability of a deposit scam.",
    patterns:[/no\s*deposit.*(until|before)\s*(the\s*)?(lease|agreement)\s*(is\s*)?(signed|signing)/i,/deposit\s*(after|only\s*after)\s*(signing|signed)/i], severity:"low" },

  { id:"nlp_stay_on_platform", category:"Behavior", label:"Encourages staying on-platform for payments/messages",
    why:"Staying on-platform improves traceability and reduces common scam pathways.",
    patterns:[/stay\s*on\s*(the\s*)?platform/i,/do\s*not\s*pay\s*outside/i,/pay\s*through\s*(the\s*)?(platform|site)/i], severity:"low" },
];

export function extractNlpSignals(listing: Listing, weightMap: Record<string, number>): Signal[] {
  const txt = combinedText(listing);
  const out: Signal[] = [];

  for (const r of rules) {
    const hit = findFirstMatch(txt, r.patterns);
    if (hit && (!r.negationSensitive || !hasNegationNear(txt, hit.index))) {
      const weight = weightMap[r.id] ?? 0;
      const value = r.value ?? 1;
      out.push({
        id: r.id,
        category: r.category,
        label: r.label,
        why_it_matters: r.why,
        evidence: `Matched: "${hit.matchText.slice(0, 64)}"`,
        value,
        weight,
        contribution: weight * value,
        severity: r.severity,
      });
    }
  }
  return out;
}
