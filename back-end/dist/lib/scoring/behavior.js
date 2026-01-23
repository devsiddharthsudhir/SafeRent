function min(a, b) {
    return a < b ? a : b;
}
export function extractBehaviorSignals(listing, weightMap) {
    const out = [];
    const title = String(listing.title || "");
    const desc = String(listing.description || "");
    const text = `${title}\n${desc}`;
    const age = listing.account_age_days ?? 365;
    if (age < 14) {
        const id = "behavior_new_account";
        const weight = weightMap[id] ?? 0;
        const value = min(1, (14 - age) / 14);
        out.push({
            id,
            category: "Behavior",
            label: "Account looks very new",
            why_it_matters: "New accounts can be a sign of throwaway identities used for scams.",
            evidence: `Account age: ${age} days`,
            value,
            weight,
            contribution: weight * value,
            severity: "medium",
        });
    }
    const posts = listing.posts_last_7d ?? 0;
    if (posts >= 8) {
        const id = "behavior_high_post_rate";
        const weight = weightMap[id] ?? 0;
        const value = min(1, (posts - 7) / 10);
        out.push({
            id,
            category: "Behavior",
            label: "High posting rate",
            why_it_matters: "High-volume posting can indicate spam or a scam campaign.",
            evidence: `Posts in last 7 days: ${posts}`,
            value,
            weight,
            contribution: weight * value,
            severity: "medium",
        });
    }
    const denials = listing.denied_inquiries_last_7d ?? 0;
    if (denials >= 6) {
        const id = "behavior_high_denials";
        const weight = weightMap[id] ?? 0;
        const value = min(1, (denials - 5) / 8);
        out.push({
            id,
            category: "Behavior",
            label: "Many people were denied or ignored",
            why_it_matters: "A pattern of rejected inquiries can suggest a bait-and-switch or fee harvesting.",
            evidence: `Denied/ignored inquiries in last 7 days: ${denials}`,
            value,
            weight,
            contribution: weight * value,
            severity: "low",
        });
    }
    // Short description / missing details
    const descLen = desc.trim().length;
    if (descLen > 0 && descLen < 80) {
        const id = "behavior_short_description";
        const weight = weightMap[id] ?? 0;
        const value = min(1, (80 - descLen) / 80);
        out.push({
            id,
            category: "Behavior",
            label: "Very short description",
            why_it_matters: "Thin details make it harder to verify legitimacy and can be a sign of low-effort scam postings.",
            evidence: `Description length: ${descLen} characters`,
            value,
            weight,
            contribution: weight * value,
            severity: "low",
        });
    }
    // Off-platform contact info (phone/email) embedded in listing
    const phoneRe = /(?:\+?1[\s-]?)?(?:\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}/;
    const emailRe = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
    if (phoneRe.test(text) || emailRe.test(text)) {
        const id = "behavior_contact_offplatform";
        const weight = weightMap[id] ?? 0;
        const value = 1;
        out.push({
            id,
            category: "Behavior",
            label: "Shares phone/email directly in the listing",
            why_it_matters: "Moving off-platform reduces accountability and moderation, and is often used in deposit scams.",
            evidence: phoneRe.test(text) ? "Phone-like pattern detected" : "Email detected",
            value,
            weight,
            contribution: weight * value,
            severity: "medium",
        });
    }
    // Many importers provide an address hint string even if city isn't parsed.
    const addrHint = listing.address_hint || listing.addressHint;
    if (!listing.city && !listing.neighborhood && !addrHint) {
        const id = "behavior_missing_location";
        const weight = weightMap[id] ?? 0;
        const value = 1;
        out.push({
            id,
            category: "Behavior",
            label: "Missing location details",
            why_it_matters: "Listings that hide city/neighborhood are harder to verify and sometimes used for bait pricing.",
            evidence: "No city, neighborhood, or address hint provided",
            value,
            weight,
            contribution: weight * value,
            severity: "low",
        });
    }
    return out;
}
