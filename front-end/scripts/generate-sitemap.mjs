import fs from "fs";
import path from "path";

// Generates sitemap.xml and robots.txt into /public.
// URL resolution order:
// 1) SITE_URL (recommended)
// 2) VITE_SITE_URL
// 3) URL / DEPLOY_PRIME_URL (Netlify)

function normalizeBase(url) {
  const s = String(url || "").trim();
  if (!s) return "";

  try {
    const u = new URL(s);
    return u.origin;
  } catch {
    // allow supplying a host without scheme
    try {
      const u = new URL("https://" + s.replace(/^https?:\/\//, ""));
      return u.origin;
    } catch {
      return "";
    }
  }
}

const base =
  normalizeBase(process.env.SITE_URL) ||
  normalizeBase(process.env.VITE_SITE_URL) ||
  normalizeBase(process.env.URL) ||
  normalizeBase(process.env.DEPLOY_PRIME_URL);

const fallback = "https://saferent.app";
const site = base || fallback;

const routes = [
  { path: "/", priority: 1.0, changefreq: "weekly" },
  { path: "/checker", priority: 0.9, changefreq: "weekly" },
  { path: "/lease", priority: 0.9, changefreq: "weekly" },
  { path: "/similar-listings", priority: 0.8, changefreq: "weekly" },
  { path: "/report", priority: 0.6, changefreq: "monthly" },
  { path: "/emergency", priority: 0.5, changefreq: "monthly" },
  { path: "/safety", priority: 0.5, changefreq: "monthly" },
  { path: "/privacy", priority: 0.3, changefreq: "yearly" },
  { path: "/terms", priority: 0.3, changefreq: "yearly" },
  { path: "/extension", priority: 0.2, changefreq: "monthly" }
];

const now = new Date().toISOString();

const urlset = routes
  .map(
    (r) =>
      `  <url>\n` +
      `    <loc>${site}${r.path}</loc>\n` +
      `    <lastmod>${now}</lastmod>\n` +
      `    <changefreq>${r.changefreq}</changefreq>\n` +
      `    <priority>${r.priority.toFixed(1)}</priority>\n` +
      `  </url>`
  )
  .join("\n");

const xml =
  `<?xml version="1.0" encoding="UTF-8"?>\n` +
  `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
  `${urlset}\n` +
  `</urlset>\n`;

const robots =
  `User-agent: *\n` +
  `Allow: /\n` +
  `Sitemap: ${site}/sitemap.xml\n`;

const pubDir = path.join(process.cwd(), "public");
fs.mkdirSync(pubDir, { recursive: true });

fs.writeFileSync(path.join(pubDir, "sitemap.xml"), xml, "utf8");
fs.writeFileSync(path.join(pubDir, "robots.txt"), robots, "utf8");

if (!base) {
  // eslint-disable-next-line no-console
  console.warn(
    `[SEO] SITE_URL not set. Using fallback ${fallback}. Set SITE_URL to your production domain for an accurate sitemap.`
  );
}
