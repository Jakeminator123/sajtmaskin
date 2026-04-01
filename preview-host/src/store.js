"use strict";

const fs = require("node:fs");
const path = require("node:path");

/** @typedef {{ sessions: Record<string, object>, logs: Record<string, object[]>, sandboxToSession: Record<string, string> }} StoreRoot */

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
  return { sessions: {}, logs: {}, sandboxToSession: {} };
}

function readStoreSync() {
  const fp = getStoreFilePath();
  try {
    const raw = fs.readFileSync(fp, "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return emptyStore();
    }
    return {
      sessions:
        typeof parsed.sessions === "object" && parsed.sessions && !Array.isArray(parsed.sessions)
          ? parsed.sessions
          : {},
      logs:
        typeof parsed.logs === "object" && parsed.logs && !Array.isArray(parsed.logs)
          ? parsed.logs
          : {},
      sandboxToSession:
        typeof parsed.sandboxToSession === "object" &&
        parsed.sandboxToSession &&
        !Array.isArray(parsed.sandboxToSession)
          ? parsed.sandboxToSession
          : {},
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
