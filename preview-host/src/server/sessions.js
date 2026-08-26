"use strict";

const { createHash } = require("node:crypto");
const { SESSION_TTL_MS } = require("./config.js");
const { nowIso } = require("./http.js");
const { getSessionChatId } = require("../runtime.js");
const { readMutationRevision, withChatLifecycleLock } = require("../session-lifecycle.js");

/**
 * Sentinel for a stored entry that cannot be hashed (validation only ever
 * stores strings, so this is defensive). It is deliberately not a sha256 hex
 * digest: the app can never mistake it for "unchanged", so such a path is
 * always rewritten or removed by the patch instead of silently kept.
 */
const UNHASHABLE_FILE_MARKER = "unhashable";

function sessionExpiresAtIso() {
  return new Date(Date.now() + SESSION_TTL_MS).toISOString();
}

/**
 * @param {object} session
 */
function sessionResponse(session) {
  const previewSessionId = session.previewSessionId;
  return {
    sessionId: session.sessionId,
    previewSessionId,
    lifecycleToken:
      typeof session.lifecycleToken === "string" && session.lifecycleToken.trim()
        ? session.lifecycleToken
        : null,
    mutationRevision: readMutationRevision(session),
    /** @legacy External alias for older Sajtmaskin app deployments. */
    sandboxId: previewSessionId,
    chatId: getSessionChatId(session),
    versionId: session.versionId,
    previewUrl: session.previewUrl,
    status: session.status,
    lastAction: session.lastAction,
    changeClass: session.changeClass,
    startOutcome: session.startOutcome,
    sessionExpiresAt: session.sessionExpiresAt,
    updatedAt: session.updatedAt,
    createdAt: session.createdAt,
    runtimePort: Number.isFinite(Number(session.runtimePort)) ? Number(session.runtimePort) : null,
  };
}

/** @param {ReturnType<typeof import("../store.js").readStoreSync>} data */
function appendLog(data, previewSessionId, message) {
  const lines = data.logs[previewSessionId] ?? [];
  lines.push({
    ts: nowIso(),
    message,
  });
  data.logs[previewSessionId] = lines;
}

/**
 * @param {ReturnType<typeof import("../store.js").readStoreSync>} data
 * @param {string} sessionId
 */
function findSessionById(data, sessionId) {
  const s = data.sessions[sessionId];
  return s ?? null;
}

/**
 * @param {ReturnType<typeof import("../store.js").readStoreSync>} data
 * @param {string} previewSessionId
 */
function findSessionByPreviewSessionId(data, previewSessionId) {
  const sid = data.previewSessionToSession[previewSessionId];
  if (!sid) {
    return null;
  }
  return findSessionById(data, sid);
}

/**
 * @param {object} session
 * @param {number} nowMs
 */
function isSessionUsable(session, nowMs) {
  if (!session || session.status === "destroyed") {
    return false;
  }
  const exp = Date.parse(session.sessionExpiresAt);
  if (Number.isFinite(exp) && nowMs > exp) {
    return false;
  }
  return true;
}

function getPreviewStatusSessionId(pathname) {
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length !== 4 || parts[0] !== "preview" || parts[3] !== "status") {
    return "";
  }
  if (parts[1] !== "session" && parts[1] !== "sandbox") {
    return "";
  }
  return parts[2] ?? "";
}

function getPreviewFilesManifestSessionId(pathname) {
  const parts = pathname.split("/").filter(Boolean);
  if (
    parts.length !== 4 ||
    parts[0] !== "preview" ||
    parts[1] !== "session" ||
    parts[3] !== "files-manifest"
  ) {
    return "";
  }
  return parts[2] ?? "";
}

/**
 * Content-hash manifest of the file set the host currently holds for a session
 * (`session.filesJson` — the same set a boot writes into the workspace).
 *
 * Returned by the read-only `files-manifest` route so the app can diff a new
 * version against what is actually live and send only the changed paths to
 * `/preview/session/patch` instead of a full `/update` + restart. Hashes (not
 * contents) keep the response small; the app never needs the old bytes.
 */
function buildSessionFilesManifest(session) {
  const files = {};
  const source =
    session.filesJson && typeof session.filesJson === "object" ? session.filesJson : {};
  for (const [relPath, content] of Object.entries(source)) {
    files[relPath] =
      typeof content === "string"
        ? createHash("sha256").update(content, "utf8").digest("hex")
        : UNHASHABLE_FILE_MARKER;
  }
  return files;
}

module.exports = {
  UNHASHABLE_FILE_MARKER,
  sessionExpiresAtIso,
  sessionResponse,
  appendLog,
  findSessionById,
  findSessionByPreviewSessionId,
  isSessionUsable,
  getPreviewStatusSessionId,
  getPreviewFilesManifestSessionId,
  buildSessionFilesManifest,
  withChatLifecycleLock,
};
