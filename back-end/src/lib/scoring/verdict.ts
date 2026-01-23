import type { Signal } from "./types.js";

export type Verdict = "likely_scam" | "likely_predatory" | "unclear" | "likely_legit";

// Canada-centric: require at least one strong scam trigger to label "likely_scam".
const STRONG_SCAM_SIGNAL_IDS = new Set<string>([
  "nlp_deposit_before_viewing",
  "nlp_no_viewing",
  "nlp_wire_transfer",
  "nlp_gift_cards",
  "nlp_crypto_payment",
  "nlp_etransfer",
  "nlp_out_of_country",
]);

const PREDATORY_SIGNAL_IDS = new Set<string>([
  "nlp_application_fee",
  "price_anomaly_high",
  "policy_bc_application_fee_prohibited",
  "policy_bc_deposit_over_cap",
  "policy_bc_monthly_pet_fee",
  "web_market_price_high",
]);

function hasAny(signals: Signal[], ids: Set<string>) {
  return signals.some((s) => ids.has(s.id));
}

export function verdictFromScore(score: number, signals: Signal[]): Verdict {
  const strong = hasAny(signals, STRONG_SCAM_SIGNAL_IDS);
  const predatory = hasAny(signals, PREDATORY_SIGNAL_IDS);

  // Conservative "scam" labeling: need high score AND strong trigger
  if (score >= 78 && strong) return "likely_scam";
  if (score >= 78 && !strong) return predatory ? "likely_predatory" : "unclear";

  if (score >= 55) return predatory ? "likely_predatory" : "unclear";
  if (score <= 20) return "likely_legit";
  return "unclear";
}

export function recommendedActions(verdict: Verdict): string[] {
  if (verdict === "likely_scam") return [
    "Do not send any deposit or e-Transfer before an in-person viewing.",
    "Insist on a verifiable landlord identity and proof of right-to-rent (matching name + ownership/management).",
    "If off-platform contact is pushed (WhatsApp/Telegram), keep everything on-platform or walk away.",
    "Reverse-image search the photos and check if the same listing appears elsewhere at a different price.",
  ];
  if (verdict === "likely_predatory") return [
    "Ask for a written breakdown of all fees (rent, deposits, utilities) and confirm what is legally allowed in your province.",
    "Request a standard lease agreement and read all clauses (fees, pet terms, penalties).",
    "Compare against similar listings in the same area before committing.",
  ];
  if (verdict === "likely_legit") return [
    "Still verify identity and paperwork before paying anything.",
    "Prefer payments after signing a proper lease and receiving keys.",
  ];
  return [
    "Gather more info: ask for a live video tour, exact address, and a standard lease.",
    "Compare the rent to similar listings in the neighborhood.",
  ];
}
