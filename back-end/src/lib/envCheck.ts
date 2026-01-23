export function runEnvChecks() {
  const isProd = String(process.env.NODE_ENV || "").toLowerCase() === "production";

  const originEnv = String(process.env.CORS_ORIGIN || "").trim();
  if (isProd && !originEnv) {
    // eslint-disable-next-line no-console
    console.warn(
      JSON.stringify({
        t: new Date().toISOString(),
        level: "warn",
        msg: "CORS_ORIGIN is empty in production. Consider setting it to your frontend domain(s).",
      })
    );
  }

  const webVerifyEnabled = String(process.env.WEB_VERIFY_ENABLED || "true").toLowerCase() !== "false";
  if (webVerifyEnabled && !process.env.SERPER_API_KEY && !process.env.BRAVE_SEARCH_API_KEY) {
    // eslint-disable-next-line no-console
    console.warn(
      JSON.stringify({
        t: new Date().toISOString(),
        level: "warn",
        msg: "WEB_VERIFY_ENABLED is true but no SERPER_API_KEY/BRAVE_SEARCH_API_KEY is set. Cross-site verification will be skipped.",
      })
    );
  }

  const leaseLlmEnabled = String(process.env.LEASE_LLM_ENABLED || "false").toLowerCase() === "true";
  if (leaseLlmEnabled && !process.env.OPENAI_API_KEY) {
    // eslint-disable-next-line no-console
    console.warn(
      JSON.stringify({
        t: new Date().toISOString(),
        level: "warn",
        msg: "LEASE_LLM_ENABLED is true but OPENAI_API_KEY is missing. Lease LLM pass will be skipped.",
      })
    );
  }

  if (!process.env.ADMIN_TOKEN) {
    // eslint-disable-next-line no-console
    console.warn(
      JSON.stringify({
        t: new Date().toISOString(),
        level: "info",
        msg: "ADMIN_TOKEN not set. Admin endpoints remain protected and will reject requests.",
      })
    );
  }
}
