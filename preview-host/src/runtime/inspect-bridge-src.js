"use strict";

// Canonical inspect-script source vs allowed Inspector parents.
// Owner for the injection URL; preview-proxy.js injects the tag.

const PREVIEW_INSPECT_QUERY_PARAM = "inspect";

function configuredAppOrigins(rawValue) {
  const origins = new Set();
  for (const candidate of String(rawValue || "").split(",")) {
    try {
      const exact = candidate.trim();
      const parsed = new URL(exact);
      if (!/^https?:$/.test(parsed.protocol) || parsed.origin === "null") continue;
      if (exact !== parsed.origin) continue;
      origins.add(parsed.origin);
    } catch {
      // Invalid entries fail closed.
    }
  }
  return [...origins];
}

/**
 * Script-källan är origins[0]. Parent-listan är hela den validerade
 * allowlisten. Aldrig från användarens preview-query.
 */
function inspectInjectionScriptSrc(search, session, origins) {
  const list = Array.isArray(origins) ? origins : [];
  const scriptOrigin = list[0] || "";
  if (!scriptOrigin) return null;
  let qs = String(search || "");
  if (qs.startsWith("?")) qs = qs.slice(1);
  let on = false;
  try { on = new URLSearchParams(qs).get(PREVIEW_INSPECT_QUERY_PARAM) === "1"; } catch { on = false; }
  if (!on) return null;
  const params = new URLSearchParams();
  for (const origin of list) {
    params.append("parent", origin);
  }
  if (typeof session?.versionId === "string" && session.versionId.trim()) {
    params.set("versionId", session.versionId.trim());
  }
  if (typeof session?.previewSessionId === "string" && session.previewSessionId.trim()) {
    params.set("previewSessionId", session.previewSessionId.trim());
    // Empty is an explicit legacy lifecycle, while absence means the host did
    // not have a complete identity and parent must fail closed.
    params.set(
      "lifecycleToken",
      typeof session.lifecycleToken === "string" ? session.lifecycleToken.trim() : "",
    );
  }
  return `${scriptOrigin}/api/inspect-bridge?${params.toString()}`;
}

module.exports = {
  configuredAppOrigins,
  inspectInjectionScriptSrc,
};
