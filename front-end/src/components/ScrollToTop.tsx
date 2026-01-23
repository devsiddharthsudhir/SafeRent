import { useEffect } from "react";
import { useLocation } from "react-router-dom";

/**
 * Scrolls the viewport to top on every route change.
 * Keeps navigation feeling "native" on mobile and prevents mid-page landings.
 */
export default function ScrollToTop() {
  const { pathname, search, hash } = useLocation();

  useEffect(() => {
    // Allow anchor links to work naturally.
    if (hash) return;
    // Instant is best here; smooth can feel laggy on repeated nav taps.
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [pathname, search, hash]);

  return null;
}
