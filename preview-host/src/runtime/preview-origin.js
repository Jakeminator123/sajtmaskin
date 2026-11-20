"use strict";

// Webbläsar-origin för previews (SM-080, M03).
//
//   PREVIEW_HOST_ORIGIN_MODE=path       (default, oförändrat beteende) — alla
//       chattar delar hostens origin: `<PREVIEW_BASE_URL>/<chatId>`.
//   PREVIEW_HOST_ORIGIN_MODE=subdomain  — varje chatt får en egen origin:
//       `https://<slug>.<PREVIEW_HOST_PREVIEW_DOMAIN>/<chatId>`. localStorage,
//       service workers och host-only-cookies isoleras då per chatt.
//
// Fail-closed som isolation-config.js: allt utom tomt eller exakt `path`
// tolkas som en begäran om egen origin. Saknas eller är domänen ogiltig
// serveras ingen preview (503) i stället för att tyst falla tillbaka på den
// delade origin. Ren modul: bara env och node:crypto, inget store-beroende.

const { createHash } = require("node:crypto");

const DEFAULT_PREVIEW_BASE_URL = "https://preview-placeholder.example.com";
const PREVIEW_ORIGIN_SLUG_PREFIX = "p-";
const PREVIEW_ORIGIN_SLUG_HEX_LENGTH = 20;
const PREVIEW_ORIGIN_SLUG_RE = /^p-[0-9a-f]{20}$/;
const PREVIEW_ORIGIN_SLUG_SALT = "sajtmaskin-preview-origin:v1:";
const HOSTNAME_LABEL_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

function readTrimmed(name) {
  const value = process.env[name];
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function validatePreviewDomain(raw) {
  if (!raw) return "PREVIEW_HOST_PREVIEW_DOMAIN is missing.";
  if (raw !== raw.toLowerCase()) return "PREVIEW_HOST_PREVIEW_DOMAIN must be lowercase.";
  if (/[*:/\s@?#]/.test(raw)) {
    return "PREVIEW_HOST_PREVIEW_DOMAIN must be a bare hostname (no wildcard, scheme, port or path).";
  }
  const labels = raw.split(".");
  if (labels.length < 2 || raw.length > 200 || !labels.every((label) => HOSTNAME_LABEL_RE.test(label))) {
    return "PREVIEW_HOST_PREVIEW_DOMAIN is not a valid hostname.";
  }
  if (/^[0-9]+$/.test(labels[labels.length - 1])) {
    return "PREVIEW_HOST_PREVIEW_DOMAIN must be a DNS name, not an IP address.";
  }
  return null;
}

/** Env läses per anrop så att tester och `fly secrets` slår igenom utan omstart av modulen. */
function previewOriginConfig() {
  const rawMode = readTrimmed("PREVIEW_HOST_ORIGIN_MODE").toLowerCase();
  const mode = !rawMode || rawMode === "path" ? "path" : "subdomain";
  const domain = readTrimmed("PREVIEW_HOST_PREVIEW_DOMAIN").replace(/\.$/, "");
  const problems = [];
  if (mode === "subdomain") {
    if (rawMode !== "subdomain") {
      problems.push(
        `PREVIEW_HOST_ORIGIN_MODE="${rawMode}" is not a known mode (use "path" or "subdomain"); treated as a request for per-chat origins and refused.`,
      );
    }
    const domainProblem = validatePreviewDomain(domain);
    if (domainProblem) problems.push(domainProblem);
  }
  return {
    mode,
    rawMode,
    domain: mode === "subdomain" && !validatePreviewDomain(domain) ? domain : "",
    baseUrl: readTrimmed("PREVIEW_BASE_URL") || DEFAULT_PREVIEW_BASE_URL,
    ok: problems.length === 0,
    problems,
  };
}

/** DNS-säker, stabil etikett per chatt. Alltid hash: chatId kan ha versaler och `_`. */
function previewOriginSlugForChat(chatId) {
  const digest = createHash("sha256")
    .update(`${PREVIEW_ORIGIN_SLUG_SALT}${String(chatId)}`, "utf8")
    .digest("hex");
  return `${PREVIEW_ORIGIN_SLUG_PREFIX}${digest.slice(0, PREVIEW_ORIGIN_SLUG_HEX_LENGTH)}`;
}

function isPreviewOriginSlug(value) {
  return typeof value === "string" && PREVIEW_ORIGIN_SLUG_RE.test(value);
}

/** Sessionens lagrade slug är auktoritet; annars härledd ur chatId. */
function sessionPreviewOriginSlug(session, chatId) {
  const stored = session?.previewOriginSlug;
  return isPreviewOriginSlug(stored) ? stored : previewOriginSlugForChat(chatId);
}

function originForSlug(baseUrl, slug, domain) {
  const base = new URL(baseUrl);
  return `${base.protocol}//${slug}.${domain}${base.port ? `:${base.port}` : ""}`;
}

/**
 * Publik preview-URL för en chatt. Path-läge (och felkonfigurerat läge, där
 * previews ändå svarar 503) ger samma URL som tidigare. Subdomän-läge behåller
 * `/<chatId>` som sökväg eftersom runtimen kör Next med `basePath=/<chatId>`.
 */
function buildPreviewUrl(baseUrl, chatId, slug, config = previewOriginConfig()) {
  const chatPath = `/${encodeURIComponent(chatId)}`;
  if (config.mode !== "subdomain" || !config.ok) {
    return `${String(baseUrl).replace(/\/$/, "")}${chatPath}`;
  }
  const effectiveSlug = isPreviewOriginSlug(slug) ? slug : previewOriginSlugForChat(chatId);
  return `${originForSlug(baseUrl, effectiveSlug, config.domain)}${chatPath}`;
}

/** Origin (schema + värd + ev. port) för en chatts egen preview-värd. */
function previewOriginForSlug(slug, config = previewOriginConfig()) {
  return originForSlug(config.baseUrl, slug, config.domain);
}

function hostnameFromHostHeader(rawHost) {
  const host = String(rawHost || "").trim().toLowerCase();
  if (!host) return "";
  if (host.startsWith("[")) return host.slice(0, host.indexOf("]") + 1);
  const colon = host.indexOf(":");
  return (colon === -1 ? host : host.slice(0, colon)).replace(/\.$/, "");
}

/**
 * Klassar en inkommande request på `Host`-headern (aldrig `x-forwarded-host`,
 * som klienten styr):
 *   - `disabled`    path-läge, exakt dagens routing
 *   - `unavailable` subdomän begärd men felkonfigurerad (fail-closed)
 *   - `preview`     `<slug>.<domän>`, med `slug`
 *   - `foreign`     annan värd under preview-domänen (alltid 404)
 *   - `control`     bas-värden eller intern adress (kontrollplanet)
 */
function classifyRequestHost(req, config = previewOriginConfig()) {
  if (config.mode === "path") return { kind: "disabled", config };
  if (!config.ok) return { kind: "unavailable", config };
  const hostname = hostnameFromHostHeader(req?.headers?.host);
  const suffix = `.${config.domain}`;
  if (hostname === config.domain) return { kind: "foreign", config };
  if (hostname.endsWith(suffix)) {
    const label = hostname.slice(0, -suffix.length);
    return isPreviewOriginSlug(label)
      ? { kind: "preview", slug: label, config }
      : { kind: "foreign", config };
  }
  return { kind: "control", config };
}

/** Hemlighetsfri beskrivning till `/health`. */
function describePreviewOrigin() {
  const config = previewOriginConfig();
  return {
    mode: config.mode,
    configured: config.ok,
    domain: config.domain || null,
    problems: config.problems,
  };
}

module.exports = {
  PREVIEW_ORIGIN_SLUG_RE,
  buildPreviewUrl,
  classifyRequestHost,
  describePreviewOrigin,
  hostnameFromHostHeader,
  isPreviewOriginSlug,
  previewOriginConfig,
  previewOriginForSlug,
  previewOriginSlugForChat,
  sessionPreviewOriginSlug,
};
