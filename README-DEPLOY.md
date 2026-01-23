# RentPulse: Production-ready (Render + Netlify)

This version is set up for:
- **Backend on Render**
- **Frontend on Netlify**
- Minimal demo data (2 sample listings)

---

## 1) Deploy backend to Render

1. Push this repo to GitHub.
2. In Render, create a **Web Service**.
3. Select the repo.
4. Set:
   - **Root Directory:** `back-end`
   - **Build Command:** `npm install && npm run build`
   - **Start Command:** `npm run start`

5. Environment variables:
   - `NODE_ENV=production`
   - `CORS_ORIGIN=https://YOUR_NETLIFY_SITE.netlify.app`
   - Optional (cross-site verification): `SERPER_API_KEY` and/or `BRAVE_API_KEY` (or `BRAVE_SEARCH_API_KEY`)
   - Optional (admin): `ADMIN_TOKEN=<strong-random>`
   - Optional (retention): `RETENTION_DAYS=30` (defaults are safe)

6. Deploy.

When done, copy your Render backend URL, like:
`https://rentpulse-api.onrender.com`

---

## 2) Deploy frontend to Netlify

1. In Netlify, create a new site from Git.
2. Settings:
   - **Base directory:** `front-end`
   - **Build command:** `npm run build`
   - **Publish directory:** `dist`

3. Add environment variable:
   - `VITE_API_BASE=https://rentpulse-api.onrender.com`

4. Deploy.

---

## 3) Local run

Backend:
```bash
cd back-end
npm install
npm run dev
```

Frontend:
```bash
cd front-end
npm install
npm run dev
```

---

## Notes

- CORS is **restricted in production** via `CORS_ORIGIN` (comma-separated list).
- Rate limiting is enabled (120 requests/min per IP). Expensive endpoints also have a stricter limit via `RATE_LIMIT_HEAVY_PER_MIN`.
- The UI stores the last analysis in localStorage for the Report/Reputation pages.

### Browser extension
The extension opens your app's `/import?data=...` route.
- Default is `https://rentpulse.app/import`
- Users can override it in the extension Options page.
