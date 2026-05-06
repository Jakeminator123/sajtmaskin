"use strict";

const fs = require("node:fs");
const path = require("node:path");

/** @typedef {{ sessions: Record<string, object>, logs: Record<string, object[]>, previewSessionToSession: Record<string, string> }} StoreRoot */

function getDataDir() {
  const raw = process.env.PREVIEW_HOST_DATA_DIR || process.env.DATA_DIR;
  if (raw && String(raw).trim()) {
    return path.resolve(String(raw).trim());
  }
  return path.join(process.cwd(), "data");
}

function getStoreFilePath() {
  return path.join(getDataDir(), "preview-host-store.json");
}

/** @returns {StoreRoot} */
function emptyStore() {
  return { sessions: {}, logs: {}, previewSessionToSession: {} };
}

function normalizeSession(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return raw;
  }
  const session = { ...raw };
  if (typeof session.previewSessionId !== "string" || !session.previewSessionId.trim()) {
    if (typeof session.sandboxId === "string" && session.sandboxId.trim()) {
      session.previewSessionId = session.sandboxId.trim();
    }
  }
  if (typeof session.previewUrl !== "string" && typeof session.sandboxUrl === "string") {
    session.previewUrl = session.sandboxUrl;
  }
  delete session.sandboxId;
  delete session.sandboxUrl;
  return session;
}

function normalizeSessions(rawSessions) {
  if (!rawSessions || typeof rawSessions !== "object" || Array.isArray(rawSessions)) {
    return {};
  }
  const sessions = {};
  for (const [sessionId, session] of Object.entries(rawSessions)) {
    sessions[sessionId] = normalizeSession(session);
  }
  return sessions;
}

function normalizePreviewSessionMap(parsed, sessions) {
  const next = {};
  const canonical =
    parsed &&
    typeof parsed.previewSessionToSession === "object" &&
    parsed.previewSessionToSession &&
    !Array.isArray(parsed.previewSessionToSession)
      ? parsed.previewSessionToSession
      : null;
  const legacy =
    parsed &&
    typeof parsed.sandboxToSession === "object" &&
    parsed.sandboxToSession &&
    !Array.isArray(parsed.sandboxToSession)
      ? parsed.sandboxToSession
      : null;
  for (const source of [legacy, canonical]) {
    if (!source) continue;
    for (const [previewSessionId, sessionId] of Object.entries(source)) {
      if (typeof previewSessionId === "string" && typeof sessionId === "string") {
        next[previewSessionId] = sessionId;
      }
    }
  }
  for (const [sessionId, session] of Object.entries(sessions)) {
    const previewSessionId =
      typeof session?.previewSessionId === "string" && session.previewSessionId.trim()
        ? session.previewSessionId.trim()
        : null;
    if (previewSessionId) {
      next[previewSessionId] = sessionId;
    }
  }
  return next;
}

function readStoreSync() {
  const fp = getStoreFilePath();
  try {
    const raw = fs.readFileSync(fp, "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return emptyStore();
    }
    const sessions = normalizeSessions(parsed.sessions);
    return {
      sessions,
      logs:
        typeof parsed.logs === "object" && parsed.logs && !Array.isArray(parsed.logs)
          ? parsed.logs
          : {},
      previewSessionToSession: normalizePreviewSessionMap(parsed, sessions),
    };
  } catch (e) {
    if (e && e.code === "ENOENT") {
      return emptyStore();
    }
    throw e;
  }
}

function writeStoreAtomicSync(data) {
  const dir = getDataDir();
  fs.mkdirSync(dir, { recursive: true });
  const fp = getStoreFilePath();
  const tmp = `${fp}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data), "utf8");
  fs.renameSync(tmp, fp);
}

let writeChain = Promise.resolve();

/**
 * Serialize read-modify-write. Mutator must synchronously edit `data` in place.
 * @param {(data: StoreRoot) => unknown} mutator
 * @returns {Promise<unknown>}
 */
function withStoreLock(mutator) {
  writeChain = writeChain.then(() => {
    const data = readStoreSync();
    const out = mutator(data);
    writeStoreAtomicSync(data);
    return out;
  });
  return writeChain;
}

module.exports = {
  getDataDir,
  getStoreFilePath,
  readStoreSync,
  writeStoreAtomicSync,
  withStoreLock,
  emptyStore,
};
