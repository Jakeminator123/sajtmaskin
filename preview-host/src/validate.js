"use strict";

const { normalizePrewarmLeaseKey } = require("./prewarm-leases.js");
const { isSafeRelativePath, validateFilesJson } = require("./files-contract.js");

const CHANGE_CLASSES = new Set(["fresh", "light", "medium", "heavy"]);
const VERIFY_CHECKS = new Set(["typecheck", "build", "lint"]);

function requireTrimString(value, fieldName) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Missing or invalid field: ${fieldName}`);
  }
  return value.trim();
}

/**
 * `chatId` is the canonical preview-host route/session key.
 * Accept legacy `projectId` during rollout so older callers remain compatible.
 */
function requireChatId(payload) {
  if (typeof payload.chatId === "string" && payload.chatId.trim()) {
    return payload.chatId.trim();
  }
  if (typeof payload.projectId === "string" && payload.projectId.trim()) {
    return payload.projectId.trim();
  }
  throw new Error("Missing or invalid field: chatId");
}

function readPreviewSessionId(payload) {
  if (typeof payload.previewSessionId === "string" && payload.previewSessionId.trim()) {
    return payload.previewSessionId.trim();
  }
  // Legacy external aliases accepted during rollout. New callers should send
  // previewSessionId; preview-host writes only canonical store fields.
  if (typeof payload.sandboxId === "string" && payload.sandboxId.trim()) {
    return payload.sandboxId.trim();
  }
  return undefined;
}

function readLifecycleToken(payload) {
  return typeof payload.lifecycleToken === "string" && payload.lifecycleToken.trim()
    ? payload.lifecycleToken.trim()
    : undefined;
}

/**
 * @param {unknown} payload
 */
function validateStartPayload(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Body must be a JSON object");
  }
  const p = /** @type {Record<string, unknown>} */ (payload);
  const chatId = requireChatId(p);
  const versionId = requireTrimString(p.versionId, "versionId");
  let changeClass = "fresh";
  if (p.changeClass !== undefined && p.changeClass !== null) {
    const cc = String(p.changeClass).trim();
    if (!CHANGE_CLASSES.has(cc)) {
      throw new Error("Invalid changeClass");
    }
    changeClass = cc;
  }
  const filesJson = validateFilesJson(p.filesJson, "filesJson");
  if (!filesJson || Object.keys(filesJson).length === 0) {
    throw new Error("Invalid filesJson: start requires a non-empty preview file set");
  }
  const preferredBaseImage =
    typeof p.preferredBaseImage === "string" && p.preferredBaseImage.trim()
      ? p.preferredBaseImage.trim().slice(0, 128)
      : "nextjs-basic";
  const dependencyFingerprint =
    p.dependencyFingerprint === null || p.dependencyFingerprint === undefined
      ? null
      : typeof p.dependencyFingerprint === "string"
        ? p.dependencyFingerprint.trim().slice(0, 256) || null
        : null;
  let resumeStrategy = "reuse_if_healthy";
  if (typeof p.resumeStrategy === "string" && p.resumeStrategy.trim()) {
    const rs = p.resumeStrategy.trim();
    if (!/^[a-z0-9_-]{1,64}$/i.test(rs)) {
      throw new Error("Invalid resumeStrategy");
    }
    resumeStrategy = rs;
  }
  const prewarm = p.prewarm === true;
  const prewarmLeaseKey = normalizePrewarmLeaseKey(p.prewarmLeaseKey);
  // The app derives this as an API-keyed HMAC over its canonical rate-limit
  // subject (verified user or trusted guest IP), never a raw ID/IP or rotatable
  // guest cookie. Normal finalize starts omit both prewarm fields.
  if (prewarm && !prewarmLeaseKey) {
    throw new Error("Invalid prewarmLeaseKey");
  }
  return {
    chatId,
    versionId,
    changeClass,
    filesJson,
    preferredBaseImage,
    dependencyFingerprint,
    resumeStrategy,
    prewarm,
    prewarmLeaseKey,
  };
}

/**
 * @param {unknown} payload
 */
function validateUpdatePayload(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Body must be a JSON object");
  }
  const p = /** @type {Record<string, unknown>} */ (payload);
  const previewSessionId = readPreviewSessionId(p);
  if (!p.sessionId && !previewSessionId) {
    throw new Error("Provide previewSessionId or sessionId");
  }
  const versionId = requireTrimString(p.versionId, "versionId");
  let changeClass = "light";
  if (p.changeClass !== undefined && p.changeClass !== null) {
    const cc = String(p.changeClass).trim();
    if (!CHANGE_CLASSES.has(cc)) {
      throw new Error("Invalid changeClass");
    }
    changeClass = cc;
  }
  const filesJson =
    p.filesJson === undefined ? undefined : validateFilesJson(p.filesJson, "filesJson");
  const replaceFiles = p.replaceFiles === true;
  if (replaceFiles && (!filesJson || Object.keys(filesJson).length === 0)) {
    throw new Error("Invalid filesJson: replaceFiles update requires a non-empty preview file set");
  }
  return {
    sessionId: typeof p.sessionId === "string" ? p.sessionId.trim() : undefined,
    previewSessionId,
    lifecycleToken: readLifecycleToken(p),
    versionId,
    changeClass,
    filesJson,
    replaceFiles,
  };
}

/**
 * @param {unknown} payload
 */
function validateSessionRefPayload(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Body must be a JSON object");
  }
  const p = /** @type {Record<string, unknown>} */ (payload);
  const previewSessionId = readPreviewSessionId(p);
  if (!p.sessionId && !previewSessionId) {
    throw new Error("Provide previewSessionId or sessionId");
  }
  return {
    sessionId: typeof p.sessionId === "string" ? p.sessionId.trim() : undefined,
    previewSessionId,
    lifecycleToken: readLifecycleToken(p),
  };
}

/**
 * Fast Edit Lane patch payload. Unlike `update`, this carries only the
 * changed files (partial set) plus optional removals, and the host applies
 * them to the live workspace without a full file-set replacement.
 *
 * @param {unknown} payload
 */
function validatePatchPayload(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Body must be a JSON object");
  }
  const p = /** @type {Record<string, unknown>} */ (payload);
  const previewSessionId = readPreviewSessionId(p);
  if (!p.sessionId && !previewSessionId) {
    throw new Error("Provide previewSessionId or sessionId");
  }
  const versionId = requireTrimString(p.versionId, "versionId");
  // Optional base-version guard (Fast Edit Lane TOCTOU close): when the caller
  // supplies the version the patch was derived from, the patch route re-checks
  // it under the store lock before mutating, so two near-simultaneous quick
  // edits from the same base cannot both advance the session.
  const expectedBaseVersionId =
    typeof p.expectedBaseVersionId === "string" && p.expectedBaseVersionId.trim()
      ? p.expectedBaseVersionId.trim()
      : undefined;
  const files = validateFilesJson(p.files, "files");
  const removedPaths = [];
  if (p.removedPaths !== undefined && p.removedPaths !== null) {
    if (!Array.isArray(p.removedPaths)) {
      throw new Error("Invalid removedPaths: expected array");
    }
    for (const value of p.removedPaths) {
      const rel = String(value || "").trim();
      if (!rel) continue;
      if (rel.length > MAX_PATH_LEN) {
        throw new Error("Invalid removedPaths: path too long");
      }
      if (!isSafeRelativePath(rel)) {
        throw new Error(`Invalid removedPaths: unsafe path "${rel}"`);
      }
      removedPaths.push(rel);
    }
  }
  const fileCount = files ? Object.keys(files).length : 0;
  if (fileCount === 0 && removedPaths.length === 0) {
    throw new Error("Invalid patch: provide at least one file or removed path");
  }
  return {
    sessionId: typeof p.sessionId === "string" ? p.sessionId.trim() : undefined,
    previewSessionId,
    lifecycleToken: readLifecycleToken(p),
    versionId,
    expectedBaseVersionId,
    files: files ?? {},
    removedPaths,
  };
}

/**
 * @param {unknown} payload
 */
function validateVerifyPayload(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Body must be a JSON object");
  }
  const p = /** @type {Record<string, unknown>} */ (payload);
  const chatId = requireChatId(p);
  const versionId = requireTrimString(p.versionId, "versionId");
  const filesJson = validateFilesJson(p.filesJson, "filesJson");
  if (!filesJson || Object.keys(filesJson).length === 0) {
    throw new Error("Invalid filesJson: verify requires a non-empty file set");
  }

  let checks = ["typecheck"];
  if (p.checks !== undefined) {
    if (!Array.isArray(p.checks)) {
      throw new Error("Invalid checks: expected array");
    }
    const normalized = [];
    for (const value of p.checks) {
      const check = String(value || "").trim();
      if (!VERIFY_CHECKS.has(check)) {
        throw new Error(`Invalid check: ${check}`);
      }
      if (!normalized.includes(check)) {
        normalized.push(check);
      }
    }
    if (normalized.length === 0) {
      throw new Error("Invalid checks: at least one check is required");
    }
    checks = normalized;
  }

  return {
    chatId,
    versionId,
    filesJson,
    checks,
  };
}

module.exports = {
  validateStartPayload,
  validateUpdatePayload,
  validatePatchPayload,
  validateSessionRefPayload,
  validateVerifyPayload,
  isSafeRelativePath,
};
