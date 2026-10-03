"use strict";

const path = require("node:path");

const PREVIEW_HOST_FILE_BUDGET = Object.freeze({
  maxFiles: 500,
  maxPathLength: 512,
  maxFileBytes: 2 * 1024 * 1024,
  maxTotalBytes: 12 * 1024 * 1024,
});

/**
 * Reject paths that could escape the workspace via traversal, absolute refs,
 * or Windows drive letters. Only clean relative paths are allowed.
 * @param {unknown} filePath
 */
function isSafeRelativePath(filePath) {
  if (!filePath || typeof filePath !== "string") return false;
  if (path.isAbsolute(filePath)) return false;
  if (/^[a-zA-Z]:/.test(filePath)) return false;
  const normalized = path.posix.normalize(filePath.replace(/\\/g, "/"));
  if (normalized.startsWith("../") || normalized === "..") return false;
  if (normalized.startsWith("/")) return false;
  const segments = normalized.split("/");
  if (segments.some((segment) => segment === "..")) return false;
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
  for (const [key, val] of Object.entries(value)) {
    if (typeof key !== "string" || key.trim() === "") {
      throw new Error(`Invalid ${fieldName}: keys must be non-empty strings`);
    }
    const pathKey = key.trim();
    if (pathKey.length > PREVIEW_HOST_FILE_BUDGET.maxPathLength) {
      throw new Error(`Invalid ${fieldName}: path too long`);
    }
    if (!isSafeRelativePath(pathKey)) {
      throw new Error(`Invalid ${fieldName}: unsafe path "${pathKey}"`);
    }
    if (typeof val !== "string") {
      throw new Error(`Invalid ${fieldName}: values must be strings`);
    }
    const bytes = Buffer.byteLength(val, "utf8");
    if (bytes > PREVIEW_HOST_FILE_BUDGET.maxFileBytes) {
      throw new Error(`Invalid ${fieldName}: file too large (${pathKey})`);
    }
    totalBytes += bytes;
    if (totalBytes > PREVIEW_HOST_FILE_BUDGET.maxTotalBytes) {
      throw new Error(`Invalid ${fieldName}: total payload too large`);
    }
    count += 1;
    if (count > PREVIEW_HOST_FILE_BUDGET.maxFiles) {
      throw new Error(
        `Invalid ${fieldName}: too many files (max ${PREVIEW_HOST_FILE_BUDGET.maxFiles})`,
      );
    }
    out[pathKey] = val;
  }
  return out;
}

module.exports = {
  PREVIEW_HOST_FILE_BUDGET,
  isSafeRelativePath,
  validateFilesJson,
};
