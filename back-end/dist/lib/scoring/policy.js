import { inferProvince } from "./canada.js";
function textOf(listing) {
    return `${listing.title || ""}\n${listing.description || ""}`;
}
function normalizeNumber(s) {
    const n = Number(String(s || "").replace(/[^0-9.]/g, ""));
    return Number.isFinite(n) ? n : NaN;
}
function findFirstAmountNear(text, keywordRe) {
    // Grab up to ~40 chars after the keyword and look for a $ amount.
    const m = text.match(new RegExp(`${keywordRe.source}[^\n]{0,40}`, "i"));
    if (!m)
        return null;
    const chunk = m[0];
    const amt = chunk.match(/(?:CAD|C\$|\$)\s*([0-9][0-9,]{1,6})(?:\.\d{1,2})?/i);
    if (!amt)
        return null;
    const n = normalizeNumber(amt[1]);
    return Number.isFinite(n) ? n : null;
}
function mentions(text, re) {
    return re.test(text);
}
export function extractPolicySignals(listing, weightMap) {
    const province = inferProvince(listing);
    const raw = textOf(listing);
    const text = raw.toLowerCase();
    const out = [];
    // --- BC policy heuristics (beta): keep conservative, explainable, and clearly scoped.
    // NOTE: This is *not* legal advice. It's a risk indicator based on common tenancy norms.
    if (province === "BC") {
        // 1) Application fee mention (often not allowed for standard residential tenancy in BC).
        if (mentions(text, /(application\s*fee|processing\s*fee|admin\s*fee)/i)) {
            const id = "policy_bc_application_fee_prohibited";
            const weight = weightMap[id] ?? 0;
            const value = 1;
            out.push({
                id,
                category: "Behavior",
                label: "BC: Mentions an application or processing fee",
                why_it_matters: "In BC, application or processing fees are a common predatory pattern and may violate standard tenancy expectations.",
                evidence: "Matched application/processing/admin fee wording (BC context)",
                value,
                weight,
                contribution: weight * value,
                severity: "high",
            });
        }
        // 2) Deposit cap heuristic: security/damage deposit should generally not exceed ~half month's rent.
        const deposit = findFirstAmountNear(raw, /(damage\s*deposit|security\s*deposit|deposit)/i) ?? null;
        if (deposit && listing.price && deposit > listing.price * 0.5 + 5) {
            const id = "policy_bc_deposit_over_cap";
            const weight = weightMap[id] ?? 0;
            const value = Math.min(1, (deposit / Math.max(1, listing.price) - 0.5) / 0.8);
            out.push({
                id,
                category: "Behavior",
                label: "BC: Deposit looks higher than typical cap",
                why_it_matters: "In BC, unusually high deposits are often a sign of a predatory listing or misinformation about tenancy rules.",
                evidence: `Detected deposit about $${Math.round(deposit)} vs rent $${Math.round(listing.price)} (BC context)`,
                value,
                weight,
                contribution: weight * value,
                severity: "high",
            });
        }
        // 3) Monthly pet fee (in BC, ongoing pet fees are a common predatory pattern).
        if (mentions(text, /(monthly\s*pet\s*fee|pet\s*fee\s*per\s*month|\$\s*\d+\s*pet\s*fee)/i)) {
            const id = "policy_bc_monthly_pet_fee";
            const weight = weightMap[id] ?? 0;
            const value = 1;
            out.push({
                id,
                category: "Behavior",
                label: "BC: Mentions a monthly pet fee",
                why_it_matters: "Ongoing pet fees are often used to inflate effective rent and can be a predatory term.",
                evidence: "Matched wording suggesting a monthly pet fee (BC context)",
                value,
                weight,
                contribution: weight * value,
                severity: "medium",
            });
        }
    }
    // --- Ontario heuristics (beta, conservative)
    if (province === "ON") {
        // Application / processing fee mention
        if (mentions(text, /(application\s*fee|processing\s*fee|admin\s*fee)/i)) {
            const id = "policy_on_application_fee";
            const weight = weightMap[id] ?? 0;
            out.push({
                id,
                category: "Behavior",
                label: "ON: Mentions an application or processing fee",
                why_it_matters: "In Ontario, upfront application or processing fees are a common predatory pattern.",
                evidence: "Matched application/processing/admin fee wording (ON context)",
                value: 1,
                weight,
                contribution: weight * 1,
                severity: "high",
            });
        }
        // Security/damage/pet deposit wording (often not permitted; LMR is typical)
        if (mentions(text, /(security\s*deposit|damage\s*deposit|pet\s*deposit)/i)) {
            const id = "policy_on_illegal_deposit_terms";
            const weight = weightMap[id] ?? 0;
            out.push({
                id,
                category: "Behavior",
                label: "ON: Mentions security/damage/pet deposit",
                why_it_matters: "Ontario leases usually use a last-month rent deposit. Extra deposit types can be a predatory sign.",
                evidence: "Matched security/damage/pet deposit wording (ON context)",
                value: 1,
                weight,
                contribution: weight * 1,
                severity: "medium",
            });
        }
    }
    // --- General predatory clause heuristics (all provinces)
    // These are not legal conclusions; they're risk indicators based on common abusive clauses.
    if (mentions(text, /(non\s*-?refundable|not\s*refundable|no\s*refund)/i)) {
        const id = "policy_non_refundable_fees";
        const weight = weightMap[id] ?? 0;
        out.push({
            id,
            category: "Behavior",
            label: "Non-refundable fees / deposits",
            why_it_matters: "Non-refundable deposits/fees are a common predatory term and reduce your ability to dispute abuse.",
            evidence: "Matched non-refundable / no-refund wording",
            value: 1,
            weight,
            contribution: weight * 1,
            severity: "high",
        });
    }
    if (mentions(text, /(enter|access)\s*(the\s*)?(unit|premises).*(any\s*time|at\s*any\s*time|without\s*notice)/i)) {
        const id = "policy_entry_without_notice";
        const weight = weightMap[id] ?? 0;
        out.push({
            id,
            category: "Behavior",
            label: "Landlord entry without notice",
            why_it_matters: "Clauses allowing entry at any time can be abusive and may conflict with provincial tenancy rules.",
            evidence: "Matched entry-without-notice wording",
            value: 1,
            weight,
            contribution: weight * 1,
            severity: "high",
        });
    }
    if (mentions(text, /(rent|rate).*(increase|raise).*(any\s*time|at\s*any\s*time|without\s*notice)/i)) {
        const id = "policy_unilateral_rent_increase";
        const weight = weightMap[id] ?? 0;
        out.push({
            id,
            category: "Behavior",
            label: "Unilateral rent increase clause",
            why_it_matters: "Rent increase rules are regulated. Clauses allowing 'any time' increases are often predatory.",
            evidence: "Matched unilateral rent increase wording",
            value: 1,
            weight,
            contribution: weight * 1,
            severity: "high",
        });
    }
    if (mentions(text, /(late\s*fee|penalty).*(per\s*day|daily)/i)) {
        const id = "policy_daily_late_fee";
        const weight = weightMap[id] ?? 0;
        out.push({
            id,
            category: "Behavior",
            label: "Daily late fees / penalties",
            why_it_matters: "Daily penalties can be used to trap tenants in debt and are a common abusive pattern.",
            evidence: "Matched daily late-fee wording",
            value: 1,
            weight,
            contribution: weight * 1,
            severity: "medium",
        });
    }
    if (mentions(text, /(waive|waiver)\s*(any\s*)?(rights|claims)|hold\s*harmless|release\s*(the\s*)?landlord|indemnify\s*(the\s*)?landlord/i)) {
        const id = "policy_waive_rights";
        const weight = weightMap[id] ?? 0;
        out.push({
            id,
            category: "Behavior",
            label: "Waiver of rights / hold-harmless",
            why_it_matters: "Broad waivers can remove important tenant protections and are often red flags.",
            evidence: "Matched waiver/indemnity wording",
            value: 1,
            weight,
            contribution: weight * 1,
            severity: "medium",
        });
    }
    return out;
}
