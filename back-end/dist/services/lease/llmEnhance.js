function envBool(key, dflt = false) {
    const v = String(process.env[key] || "").trim().toLowerCase();
    if (!v)
        return dflt;
    return v === "1" || v === "true" || v === "yes";
}
function redactLeaseText(text) {
    // Light redaction: remove common PII patterns. This is not perfect, but reduces risk.
    let t = String(text || "");
    // Emails
    t = t.replace(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi, "[REDACTED_EMAIL]");
    // Phone-like patterns (naive)
    t = t.replace(/(?:\+?\d{1,3}[\s-]?)?(?:\(\d{3}\)|\d{3})[\s-]?\d{3}[\s-]?\d{4}/g, "[REDACTED_PHONE]");
    // Postal codes (Canada)
    t = t.replace(/\b[ABCEGHJ-NPRSTVXY]\d[ABCEGHJ-NPRSTV-Z][\s-]?\d[ABCEGHJ-NPRSTV-Z]\d\b/gi, "[REDACTED_POSTAL]");
    // Very rough street address lines
    t = t.replace(/\b\d{1,6}\s+[A-Za-z0-9.\- ]{2,40}\s+(Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Crescent|Cres|Way|Place|Pl)\b/gi, "[REDACTED_ADDRESS]");
    return t;
}
function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
}
/**
 * Local scoring helpers so this file does NOT depend on runtime exports
 * from simplifyLease.ts.
 * (Matches the same scoring shape used by simplifyLeaseText.)
 */
function computeLeaseRiskScoreFromFlags(flags, extractedChars = 0) {
    const counts = { high: 0, medium: 0, low: 0 };
    for (const f of flags || []) {
        if (f?.severity === "high")
            counts.high++;
        else if (f?.severity === "medium")
            counts.medium++;
        else if (f?.severity === "low")
            counts.low++;
    }
    // Weighted sum with gentle saturation so many low flags doesn't instantly max out.
    const raw = counts.high * 20 + counts.medium * 10 + counts.low * 4;
    const score = Math.round(100 * (1 - Math.exp(-raw / 55)));
    // Keep score in range
    return clamp(score, 0, 100);
}
function leaseVerdictFromScore(score, extractedChars = 0) {
    const lowText = extractedChars < 700;
    if (lowText)
        return "unclear";
    if (score >= 70)
        return "high";
    if (score >= 35)
        return "medium";
    return "low";
}
function safeJsonExtract(input) {
    // Try to find first {...} block.
    const s = String(input || "");
    const start = s.indexOf("{");
    const end = s.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start)
        return null;
    const block = s.slice(start, end + 1);
    try {
        return JSON.parse(block);
    }
    catch {
        return null;
    }
}
export async function maybeEnhanceLeaseWithLLM(base, fullText) {
    const enabled = envBool("LEASE_LLM_ENABLED", false);
    const apiKey = String(process.env.OPENAI_API_KEY || process.env.LEASE_LLM_API_KEY || "").trim();
    if (!enabled || !apiKey)
        return base;
    const baseUrl = String(process.env.OPENAI_BASE_URL || process.env.LEASE_LLM_BASE_URL || "https://api.openai.com/v1")
        .trim()
        .replace(/\/$/, "");
    const model = String(process.env.LEASE_LLM_MODEL || "gpt-4o-mini").trim();
    const redacted = redactLeaseText(fullText);
    const province = String(base.provinceGuess || "").trim().toUpperCase();
    const system = `You are a careful assistant helping a tenant understand a Canadian residential lease.\n\n` +
        `Rules:\n- Output STRICT JSON ONLY (no markdown, no extra text).\n` +
        `- Do not provide legal advice. Use cautious language.\n` +
        `- Focus on: predatory clauses, unclear fees, repairs responsibility, entry/inspection, renewal traps, utility ambiguity.\n` +
        `- If province is unknown, say so in the content.`;
    const user = {
        province,
        disclaimer: base.disclaimer,
        currentSummary: base.laymanSummary,
        currentFlags: base.flags.map((f) => ({
            title: f.title,
            severity: f.severity,
            why: f.why,
            suggestion: f.suggestion,
        })),
        leaseText: redacted.slice(0, 12000),
        want: {
            laymanSummaryExtra: "Add up to 6 extra bullets that are practical and easy to understand.",
            flagsExtra: "Add up to 6 extra flags for missed edge cases. Use severity low/medium/high. Include an excerpt if you can find it in the text.",
        },
    };
    const body = {
        model,
        temperature: 0.2,
        messages: [
            { role: "system", content: system },
            { role: "user", content: JSON.stringify(user) },
        ],
        response_format: { type: "json_object" },
    };
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 12000);
    try {
        const res = await fetch(`${baseUrl}/chat/completions`, {
            method: "POST",
            headers: {
                "content-type": "application/json",
                authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify(body),
            signal: ctrl.signal,
        });
        if (!res.ok)
            return base;
        const json = await res.json();
        const content = json?.choices?.[0]?.message?.content;
        const parsed = safeJsonExtract(content);
        if (!parsed)
            return base;
        const out = parsed;
        const laymanExtra = Array.isArray(out.laymanSummaryExtra)
            ? out.laymanSummaryExtra.map((x) => String(x)).filter(Boolean).slice(0, 6)
            : [];
        const flagsExtraRaw = Array.isArray(out.flagsExtra) ? out.flagsExtra.slice(0, 6) : [];
        const flagsExtra = [];
        for (const f of flagsExtraRaw) {
            if (!f)
                continue;
            const sev = String(f.severity || "").toLowerCase();
            if (!["low", "medium", "high"].includes(sev))
                continue;
            const title = String(f.title || "").trim();
            const why = String(f.why || "").trim();
            const suggestion = String(f.suggestion || "").trim();
            if (!title || !why || !suggestion)
                continue;
            const excerpt = String(f.excerpt || "").trim() || undefined;
            flagsExtra.push({
                id: `llm_${title.toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 40)}`,
                title,
                severity: sev,
                why,
                suggestion,
                excerpt,
            });
        }
        const merged = {
            ...base,
            laymanSummary: [...base.laymanSummary, ...laymanExtra].slice(0, 18),
            flags: dedupeFlags([...(base.flags || []), ...flagsExtra]),
            llmUsed: true,
        };
        const updatedScore = computeLeaseRiskScoreFromFlags(merged.flags, merged.extractedChars);
        merged.leaseRiskScore = updatedScore;
        merged.leaseVerdict = leaseVerdictFromScore(updatedScore, merged.extractedChars);
        return merged;
    }
    catch {
        return base;
    }
    finally {
        clearTimeout(t);
    }
}
function dedupeFlags(flags) {
    const sevRank = { high: 3, medium: 2, low: 1 };
    const byKey = new Map();
    for (const f of flags) {
        const k = String(f.id || f.title).toLowerCase();
        const prev = byKey.get(k);
        if (!prev) {
            byKey.set(k, f);
            continue;
        }
        if ((sevRank[f.severity] || 0) > (sevRank[prev.severity] || 0))
            byKey.set(k, f);
    }
    const out = Array.from(byKey.values());
    return out.sort((a, b) => (sevRank[b.severity] || 0) - (sevRank[a.severity] || 0));
}
