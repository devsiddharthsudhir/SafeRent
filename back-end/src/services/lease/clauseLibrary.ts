import type { LeaseFlagSeverity } from "./simplifyLease.js";

export type ClausePattern = {
  id: string;
  title: string;
  severity: LeaseFlagSeverity;
  why: string;
  suggestion: string;
  re: RegExp;
  provinces?: string[]; // if omitted -> all
};

const GENERAL: ClausePattern[] = [
  {
    id: "lease_non_refundable",
    title: "Non-refundable fee or deposit",
    severity: "high",
    why: "Non-refundable deposits or fees reduce your ability to dispute abuse and are a common predatory term.",
    suggestion: "Ask to remove this clause or convert it to a refundable deposit with clear conditions.",
    re: /(non\s*-?refundable|not\s*refundable|no\s*refund|non\s*remboursable|sans\s*remboursement)/i,
  },
  {
    id: "lease_entry_anytime",
    title: "Landlord entry without notice",
    severity: "high",
    why: "Clauses allowing entry 'at any time' can be abusive and may conflict with provincial tenancy rules.",
    suggestion: "Require written notice and a minimum notice period except emergencies.",
    re: /(enter|access)\s+(the\s+)?(unit|premises|logement|appartement).{0,80}(any\s*time|at\s*any\s*time|without\s*notice|sans\s*pr\u00e9avis)/i,
  },
  {
    id: "lease_rent_increase_anytime",
    title: "Rent can be increased at any time",
    severity: "high",
    why: "Rent increases are regulated. 'Any time' clauses remove predictability and can be abusive.",
    suggestion: "Ask for rent increase terms to follow provincial rules with notice.",
    re: /(rent|rate|loyer).{0,80}(increase|raise|augmentation).{0,80}(any\s*time|at\s*any\s*time|without\s*notice|sans\s*pr\u00e9avis)/i,
  },
  {
    id: "lease_daily_late_fee",
    title: "Daily late fees or compounding penalties",
    severity: "medium",
    why: "Daily penalties can trap tenants in debt and are a common abusive pattern.",
    suggestion: "Negotiate a reasonable one-time late fee cap and a grace period.",
    re: /(late\s*fee|penalty|int\u00e9r\u00eats).{0,80}(per\s*day|daily|par\s*jour)/i,
  },
  {
    id: "lease_waiver",
    title: "Waiver of rights / hold-harmless clause",
    severity: "medium",
    why: "Broad waivers can remove important tenant protections and shift liability unfairly.",
    suggestion: "Ask to limit indemnity to your own negligence, and remove blanket waivers.",
    re: /(waive|waiver)\s*(any\s*)?(rights|claims)|hold\s*harmless|release\s*(the\s*)?landlord|indemnify\s*(the\s*)?landlord|renonce\s*\u00e0\s*(mes\s*)?(droits|recours)|d\u00e9gage\s*le\s*propri\u00e9taire/i,
  },
  {
    id: "lease_application_fee",
    title: "Application / processing / admin fee",
    severity: "high",
    why: "Upfront application or admin fees are a very common predatory pattern.",
    suggestion: "Ask for a breakdown and whether the fee is refundable. If they insist, treat as high risk.",
    re: /(application\s*fee|processing\s*fee|admin\s*fee|administration\s*fee|background\s*check\s*fee|credit\s*check\s*fee|frais\s*d\'?application|frais\s*d\'?administration)/i,
  },
  {
    id: "lease_key_deposit_nonrefundable",
    title: "Key deposit marked as non-refundable",
    severity: "medium",
    why: "Key deposits are commonly refundable when keys are returned. Non-refundable key charges can be abusive.",
    suggestion: "Ask for a refundable key deposit and a written return process.",
    re: /(key\s*deposit|keys\s*deposit|deposit\s*for\s*keys|d\u00e9p\u00f4t\s*de\s*cl\u00e9).{0,60}(non\s*-?refundable|not\s*refundable|no\s*refund|non\s*remboursable)/i,
  },
  {
    id: "lease_mandatory_cleaning_fee",
    title: "Mandatory professional cleaning / move-out cleaning fee",
    severity: "medium",
    why: "Blanket cleaning fees can be used to retain deposits regardless of condition.",
    suggestion: "Ask for condition-based cleaning only, with receipts and reasonable standards.",
    re: /(professional\s*cleaning|move\s*-?out\s*cleaning|carpet\s*cleaning|nettoyage\s*professionnel).{0,80}(fee|charge|frais)/i,
  },
  {
    id: "lease_repairs_shifted_to_tenant",
    title: "Repairs or maintenance shifted to tenant",
    severity: "high",
    why: "Clauses making the tenant responsible for all repairs can conflict with statutory maintenance duties.",
    suggestion: "Limit tenant responsibility to damage they cause; keep landlord duty for normal wear and core systems.",
    re: /(tenant\s*(is\s*)?responsible\s*for\s*(all\s*)?(repairs|maintenance)|responsible\s*for\s*(all\s*)?(repairs|maintenance)|locataire\s*responsable\s*de\s*(toutes\s*)?(r\u00e9parations|entretien))/i,
  },
  {
    id: "lease_utilities_ambiguous",
    title: "Utilities unclear or open-ended",
    severity: "low",
    why: "Unclear utility responsibility can lead to surprise charges.",
    suggestion: "Ask for a written list of included utilities and who pays what (heat, hydro, water, internet).",
    re: /(utilities|hydro|electricity|water|heat|gas|internet|t\u00e9l\u00e9communication|charges).{0,80}(tbd|to\s*be\s*determined|as\s*billed|variable|selon\s*facturation)/i,
  },
  {
    id: "lease_auto_renewal_trap",
    title: "Auto-renewal or renewal trap",
    severity: "medium",
    why: "Auto-renewal with penalties can trap tenants into unwanted extensions.",
    suggestion: "Ask for clear end-of-term options and remove renewal penalties beyond lawful notice requirements.",
    re: /(automatically\s*renew|auto\s*renew|renouvellement\s*automatique).{0,120}(penalty|fee|frais|charge|must\s*give\s*notice)/i,
  },
  {
    id: "lease_inspection_fee",
    title: "Inspection fee / move-in fee",
    severity: "medium",
    why: "Inspection or move-in fees are often questionable and can be used as hidden charges.",
    suggestion: "Ask to remove or justify with a lawful basis. Prefer a standard condition inspection report without extra fees.",
    re: /(inspection\s*fee|move\s*-?in\s*fee|walkthrough\s*fee|frais\s*d\'?inspection|frais\s*d\'?entr\u00e9e)/i,
  },
  {
    id: "lease_guest_restrictions_extreme",
    title: "Extreme guest or overnight restrictions",
    severity: "low",
    why: "Some guest restrictions are normal, but overly strict limits can be used to harass tenants.",
    suggestion: "Clarify reasonable guest rules and ensure they comply with local tenancy guidance.",
    re: /(no\s*guests|no\s*overnight\s*guests|guest\s*fee|overnight\s*fee|aucun\s*invit\u00e9)/i,
  },
];

const BC: ClausePattern[] = [
  {
    id: "lease_bc_application_fee_prohibited",
    title: "BC: application fee mentioned",
    severity: "high",
    why: "BC tenancy guidance generally treats application fees as high-risk and often not allowed in standard tenancies.",
    suggestion: "Treat as a red flag. Ask to remove the fee and use standard BC tenancy forms.",
    re: /(application\s*fee|processing\s*fee|admin\s*fee|credit\s*check\s*fee)/i,
    provinces: ["BC"],
  },
  {
    id: "lease_bc_deposit_over_cap",
    title: "BC: security deposit over typical cap",
    severity: "high",
    why: "In BC, deposits are commonly capped relative to monthly rent. A higher deposit can be unlawful or predatory.",
    suggestion: "Compare against BC tenancy guidance and ask to adjust to allowable limits.",
    re: /(security\s*deposit|damage\s*deposit).{0,40}(two\s*months|2\s*months|\b\$\s*\d{4,6}\b)/i,
    provinces: ["BC"],
  },
  {
    id: "lease_bc_monthly_pet_fee",
    title: "BC: monthly pet fee",
    severity: "medium",
    why: "Ongoing monthly pet fees can be abusive if not clearly justified and disclosed.",
    suggestion: "Ask to replace with a one-time refundable pet deposit (if lawful) and clear pet terms.",
    re: /(pet\s*fee|pet\s*rent).{0,40}(per\s*month|monthly|\/\s*mo)/i,
    provinces: ["BC"],
  },
];

const ON: ClausePattern[] = [
  {
    id: "lease_on_extra_deposit_types",
    title: "ON: extra deposit types mentioned",
    severity: "medium",
    why: "Ontario typically uses a last-month rent deposit. Extra deposit types can be predatory depending on context.",
    suggestion: "Ask what the deposit is for, whether it is refundable, and compare against Ontario tenancy guidance.",
    re: /(security\s*deposit|damage\s*deposit|pet\s*deposit)/i,
    provinces: ["ON"],
  },
  {
    id: "lease_on_application_fee",
    title: "ON: application or admin fee",
    severity: "high",
    why: "Upfront processing fees are a common predatory pattern.",
    suggestion: "Ask to remove the fee and use the standard Ontario lease.",
    re: /(application\s*fee|processing\s*fee|admin\s*fee|background\s*check\s*fee|credit\s*check\s*fee)/i,
    provinces: ["ON"],
  },
];

const AB: ClausePattern[] = [
  {
    id: "lease_ab_move_in_fee",
    title: "AB: move-in fee / admin fee",
    severity: "medium",
    why: "Move-in and admin fees can be used as hidden charges.",
    suggestion: "Ask for a clear breakdown and confirm whether fees are refundable and lawful under Alberta rules.",
    re: /(move\s*-?in\s*fee|admin\s*fee|processing\s*fee|fob\s*fee)/i,
    provinces: ["AB"],
  },
];

const QC: ClausePattern[] = [
  {
    id: "lease_qc_prohibited_deposits",
    title: "QC: security deposit / damage deposit mentioned",
    severity: "high",
    why: "Quebec has stricter limits on deposits in many tenancies. Deposit clauses can be high risk.",
    suggestion: "Verify against Quebec tenancy guidance (TAL) and ask to remove or justify any deposit.",
    re: /(security\s*deposit|damage\s*deposit|d\u00e9p\u00f4t\s*de\s*s\u00e9curit\u00e9|d\u00e9p\u00f4t\s*de\s*dommages)/i,
    provinces: ["QC"],
  },
  {
    id: "lease_qc_penalty_interest",
    title: "QC: high penalty interest",
    severity: "medium",
    why: "High interest or penalties can be abusive.",
    suggestion: "Ask to cap penalties and follow Quebec requirements.",
    re: /(int\u00e9r\u00eat\s*de\s*retard|penalty\s*interest).{0,40}(\b\d{2,3}%\b)/i,
    provinces: ["QC"],
  },
];

export function getClauseLibrary(province: string): ClausePattern[] {
  const p = String(province || "").trim().toUpperCase();
  const specific = p === "BC" ? BC : p === "ON" ? ON : p === "AB" ? AB : p === "QC" ? QC : [];
  return [...GENERAL, ...specific];
}
