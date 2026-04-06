"use strict";

const path = require("node:path");

const CHANGE_CLASSES = new Set(["fresh", "light", "medium", "heavy"]);
const VERIFY_CHECKS = new Set(["typecheck", "build", "lint"]);
const MAX_FILES = 500;
const MAX_PATH_LEN = 512;
const MAX_FILE_BYTES = 2 * 1024 * 1024;
const MAX_TOTAL_BYTES = 12 * 1024 * 1024;

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

/**
 * Reject paths that could escape the workspace via traversal, absolute refs,
 * or Windows drive letters. Only clean relative paths are allowed.
 */
function isSafeRelativePath(filePath) {
  if (!filePath || typeof filePath !== "string") return false;
  if (path.isAbsolute(filePath)) return false;
  if (/^[a-zA-Z]:/.test(filePath)) return false;
  const normalized = path.posix.normalize(filePath.replace(/\\/g, "/"));
  if (normalized.startsWith("../") || normalized === "..") return false;
  if (normalized.startsWith("/")) return false;
  const segments = normalized.split("/");
  if (segments.some((s) => s === "..")) return false;
  return true;
}

/**
 * @param {unknown} value
 * @param {string} fieldName
 * @returns {Record<string, string> | null}
 */
function validateFilesJson(value, fieldName) {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Invalid ${fieldName}: expected object or null`);
  }
  /** @type {Record<string, string>} */
  const out = {};
  let count = 0;
  let totalBytes = 0;
  for (const [k, val] of Object.entries(value)) {
    if (typeof k !== "string" || k.trim() === "") {
      throw new Error(`Invalid ${fieldName}: keys must be non-empty strings`);
    }
    const pathKey = k.trim();
    if (pathKey.length > MAX_PATH_LEN) {
      throw new Error(`Invalid ${fieldName}: path too long`);
    }
    if (!isSafeRelativePath(pathKey)) {
      throw new Error(`Invalid ${fieldName}: unsafe path "${pathKey}"`);
    }
    if (typeof val !== "string") {
      throw new Error(`Invalid ${fieldName}: values must be strings`);
    }
    const bytes = Buffer.byteLength(val, "utf8");
    if (bytes > MAX_FILE_BYTES) {
      throw new Error(`Invalid ${fieldName}: file too large (${pathKey})`);
    }
    totalBytes += bytes;
    if (totalBytes > MAX_TOTAL_BYTES) {
      throw new Error(`Invalid ${fieldName}: total payload too large`);
    }
    count += 1;
    if (count > MAX_FILES) {
      throw new Error(`Invalid ${fieldName}: too many files (max ${MAX_FILES})`);
    }
    out[pathKey] = val;
  }
  return out;
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
  return {
    chatId,
    versionId,
    changeClass,
    filesJson,
    preferredBaseImage,
    dependencyFingerprint,
    resumeStrategy,
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
  if (!p.sessionId && !p.sandboxId) {
    throw new Error("Provide sessionId or sandboxId");
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
  return {
    sessionId: typeof p.sessionId === "string" ? p.sessionId.trim() : undefined,
    sandboxId: typeof p.sandboxId === "string" ? p.sandboxId.trim() : undefined,
    versionId,
    changeClass,
    filesJson,
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
  if (!p.sessionId && !p.sandboxId) {
    throw new Error("Provide sessionId or sandboxId");
  }
  return {
    sessionId: typeof p.sessionId === "string" ? p.sessionId.trim() : undefined,
    sandboxId: typeof p.sandboxId === "string" ? p.sandboxId.trim() : undefined,
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
  validateSessionRefPayload,
  validateVerifyPayload,
};
