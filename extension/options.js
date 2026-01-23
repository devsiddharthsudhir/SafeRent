const PROD_IMPORT_URL = "https://rentpulse.app/import";
const DEV_IMPORT_URL = "http://localhost:5173/import";
const DEFAULT_IMPORT_URL = DEV_IMPORT_URL;
const KEY = "appImportUrl";

function byId(id) {
  return document.getElementById(id);
}

async function load() {
  const { appImportUrl } = await chrome.storage.sync.get(KEY);
  byId("importUrl").value = appImportUrl || DEFAULT_IMPORT_URL;
}

function maybeShowBannerFromQuery() {
  try {
    const p = new URLSearchParams(location.search);
    const reason = p.get("reason");
    const target = p.get("target");
    if (reason !== "unreachable") return;

    const banner = byId("banner");
    const bannerText = byId("bannerText");
    if (!banner || !bannerText) return;
    banner.hidden = false;
    bannerText.textContent =
      `The extension could not reach your app import URL (${target || ""}). ` +
      `This usually means your deployed URL is wrong or your custom domain DNS is not configured yet. ` +
      `Set the correct deployed URL below, then click the extension again.`;
  } catch {
    // ignore
  }
}

async function save(url) {
  await chrome.storage.sync.set({ [KEY]: url });
}

function show(msg, ok = true) {
  const el = byId("status");
  el.textContent = msg;
  el.style.color = ok ? "var(--ok)" : "#fca5a5";
}

document.addEventListener("DOMContentLoaded", () => {
  maybeShowBannerFromQuery();
  load().catch(() => show("Could not load settings.", false));

  byId("save").addEventListener("click", async () => {
    const v = String(byId("importUrl").value || "").trim();
    if (!v) return show("Please enter an import URL.", false);
    try {
      const u = new URL(v);
      if (!u.protocol.startsWith("http")) return show("URL must start with http or https.", false);
      await save(u.toString());
      show("Saved. Next click will import to this URL.");
    } catch {
      show("That does not look like a valid URL.", false);
    }
  });

  byId("useLocal")?.addEventListener("click", async () => {
    byId("importUrl").value = DEV_IMPORT_URL;
    await save(DEV_IMPORT_URL);
    show("Set to localhost (dev).", true);
  });

  byId("useProd")?.addEventListener("click", async () => {
    byId("importUrl").value = PROD_IMPORT_URL;
    await save(PROD_IMPORT_URL);
    show("Set to rentpulse.app (prod).", true);
  });
});
