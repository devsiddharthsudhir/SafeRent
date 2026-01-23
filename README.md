# RentPulse (Production-ready starter)

Rental scam + predatory listing detector (Canada-first) with explainable signals, a feedback loop, and a lightweight evaluation harness.

## Run locally

### Backend
```bash
cd back-end
npm install
npm run dev
```

### Frontend
```bash
cd front-end
npm install
npm run dev
```

Open: http://localhost:5173

## Demo data
- Demo listings: `back-end/data/listings.json`
- Sample images: `back-end/public/sample-images`

## Feedback loop (real accuracy requires labels)
Label a few analyses in the UI (legit / scam / predatory), then run:
```bash
cd back-end
npm run train
```
This updates the risk model weights (still explainable, not a black box).

### Evaluation harness (metrics report)
Run a metrics report (precision/recall + confusion + calibration bins):
```bash
cd back-end
npm run eval
```
Outputs:
- `back-end/data/metrics/latest.json`
- `back-end/data/metrics/latest.csv`

If you add `back-end/data/labeled_samples.jsonl` (JSONL with `{analysisId, label}`), it will be included. UI feedback labels are also used automatically.

## Lease simplifier (predatory clause flags)
- Upload PDF/text → layman's summary + flags.
- Province-specific clause libraries live in `back-end/src/services/lease/clauseLibrary.ts`.
- Optional LLM enhancement (redacted) can be enabled via `LEASE_LLM_ENABLED=true` + `OPENAI_API_KEY`.

## Cross-site verification (optional)
When risk is above threshold, the backend can do a TOS-safe background "verify" pass to find cross-posts and compare pricing (used by the Similar Listings tab).

Providers:
- DuckDuckGo (free fallback, no key). Controlled by WEB_VERIFY_DDG_ENABLED (default true).
- Serper (paid) and Brave Search (free/paid tiers) via API keys.

Setup:
- Set SERPER_API_KEY and/or BRAVE_SEARCH_API_KEY (or BRAVE_API_KEY).
- If no paid keys are configured, the backend automatically falls back to DuckDuckGo.

Controls:
- WEB_VERIFY_ENABLED (default true)
- CROSSPOST_THRESHOLD_LOW / CROSSPOST_THRESHOLD_HIGH
- WEB_VERIFY_SEARCH_TIMEOUT_MS / WEB_VERIFY_PAGE_TIMEOUT_MS
- CROSSPOST_FETCH_ALLOWLIST (optional; safe default is "same host only")


## Deployment
See `README-DEPLOY.md` for Render + Netlify steps.

## Production hardening knobs
- Heavy endpoint rate limit: `RATE_LIMIT_HEAVY_PER_MIN` (default 30/min per IP)
- Retention sweep: `RETENTION_ENABLED` (default true), `RETENTION_DAYS` (default 30), `CACHE_RETENTION_DAYS` (default 7), `UPLOADS_RETENTION_DAYS` (default 7)
- Admin endpoints (optional): set `ADMIN_TOKEN` and call `/api/admin/*` with `x-admin-token` or `Authorization: Bearer ...`
