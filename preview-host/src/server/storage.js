"use strict";

const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const {
  getDataDir,
  getStoreFilePath,
  readStoreSync,
} = require("../store.js");
const {
  cleanupPreviewHostStorage,
  describePackageCacheStorage,
  directorySizeBytes,
} = require("../runtime.js");
const { MAX_PREWARM_LEASES } = require("../prewarm-leases.js");
const {
  PACKAGE_CACHE_DIR_NAME,
  SESSION_TTL_MS,
  OPPORTUNISTIC_CLEANUP_INTERVAL_MS,
} = require("./config.js");

let lastOpportunisticCleanupAt = 0;

async function maybeRunOpportunisticCleanup() {
  const now = Date.now();
  if (now - lastOpportunisticCleanupAt < OPPORTUNISTIC_CLEANUP_INTERVAL_MS) {
    return;
  }
  lastOpportunisticCleanupAt = now;
  await cleanupPreviewHostStorage().catch(() => null);
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return null;
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(value >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

async function getPathSizeBytes(targetPath) {
  try {
    const stats = await fsp.lstat(targetPath);
    if (!stats.isDirectory()) return stats.size;
    return await directorySizeBytes(targetPath);
  } catch {
    return 0;
  }
}

function describeSize(bytes, exists) {
  return { exists, bytes, human: formatBytes(bytes) };
}

function readFilesystemUsage(targetPath) {
  try {
    const output = execFileSync("df", ["-kP", targetPath], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    const lines = output.split(/\r?\n/);
    const dataLine = lines[lines.length - 1] ?? "";
    const parts = dataLine.trim().split(/\s+/);
    if (parts.length < 6) return null;
    const totalKb = Number(parts[1]);
    const usedKb = Number(parts[2]);
    const freeKb = Number(parts[3]);
    const mountPath = parts[5];
    if (![totalKb, usedKb, freeKb].every(Number.isFinite)) {
      return null;
    }
    const totalBytes = totalKb * 1024;
    const usedBytes = usedKb * 1024;
    const freeBytes = freeKb * 1024;
    return {
      mountPath,
      totalBytes,
      usedBytes,
      freeBytes,
      totalHuman: formatBytes(totalBytes),
      usedHuman: formatBytes(usedBytes),
      freeHuman: formatBytes(freeBytes),
    };
  } catch {
    return null;
  }
}

/**
 * Snapshot of what occupies the host's disks.
 *
 * Async and single-pass by design. The volume is walked exactly ONCE — every
 * reported path is derived from that walk instead of re-traversing:
 * `/data`'s own total is the sum of its children, and the workspace / verify /
 * package-cache entries are those same children looked up by name. The earlier
 * version called a synchronous walker per path (twice per entry, since `bytes`
 * and `human` each invoked it) and then walked every child on top, so a
 * multi-GB cache meant traversing tens of GB of metadata, synchronously, while
 * the process was also proxying live previews.
 */
async function describeStorageState() {
  const dataDir = getDataDir();
  const workspacesDir = path.join(dataDir, "workspaces");
  const verifyWorkspacesDir = path.join(dataDir, "verify-workspaces");
  const storeFilePath = getStoreFilePath();
  const rootFilesystem = readFilesystemUsage("/");
  const dataFilesystem = readFilesystemUsage(dataDir);
  const children = await describeDataDirChildren(dataDir);
  const bytesByChild = new Map(children.map((child) => [child.name, child.bytes]));
  const childBytes = (dir) => bytesByChild.get(path.basename(dir)) ?? 0;
  const dataDirBytes = children.reduce((sum, child) => sum + child.bytes, 0);
  const store = readStoreSync();
  const nowMs = Date.now();
  const activeLeaseExpiries = Object.values(store.prewarmLeases)
    .map((lease) => Date.parse(lease?.expiresAt ?? ""))
    .filter((expiresAtMs) => Number.isFinite(expiresAtMs) && expiresAtMs > nowMs)
    .sort((a, b) => a - b);

  return {
    dataDir,
    storeFilePath,
    volumeMountPath: "/data",
    sessionTtlMs: SESSION_TTL_MS,
    rootFilesystem,
    dataFilesystem,
    prewarmLeases: {
      activeCount: activeLeaseExpiries.length,
      earliestExpiresAt:
        activeLeaseExpiries.length > 0
          ? new Date(activeLeaseExpiries[0]).toISOString()
          : null,
      maxEntries: MAX_PREWARM_LEASES,
    },
    paths: {
      dataDir: describeSize(dataDirBytes, fs.existsSync(dataDir)),
      storeFilePath: describeSize(
        childBytes(storeFilePath),
        fs.existsSync(storeFilePath),
      ),
      workspacesDir: describeSize(
        childBytes(workspacesDir),
        fs.existsSync(workspacesDir),
      ),
      verifyWorkspacesDir: describeSize(
        childBytes(verifyWorkspacesDir),
        fs.existsSync(verifyWorkspacesDir),
      ),
      packageCacheDir: await describePackageCacheStorageSafely(bytesByChild),
    },
    // Top-level breakdown of the volume. Without this, a full disk whose bytes
    // sit outside the three known paths (an orphaned dir, lost+found after a
    // crash) can only be diagnosed over `fly ssh`.
    dataDirChildren: children,
  };
}

async function describePackageCacheStorageSafely(bytesByChild) {
  try {
    // Reuse the size from the volume walk instead of walking the cache again;
    // it is by far the largest and most file-dense directory on the host.
    const cache = await describePackageCacheStorage({
      knownBytes: bytesByChild?.get(PACKAGE_CACHE_DIR_NAME),
    });
    return {
      ...cache,
      human: formatBytes(cache.bytes),
      maxHuman: cache.maxBytes === null ? null : formatBytes(cache.maxBytes),
    };
  } catch {
    return null;
  }
}

async function describeDataDirChildren(dataDir) {
  try {
    const entries = await fsp.readdir(dataDir, { withFileTypes: true });
    const children = [];
    for (const entry of entries) {
      const bytes = await getPathSizeBytes(path.join(dataDir, entry.name));
      children.push({
        name: entry.name,
        kind: entry.isDirectory() ? "dir" : "file",
        bytes,
        human: formatBytes(bytes),
      });
    }
    return children.sort((a, b) => b.bytes - a.bytes);
  } catch {
    return [];
  }
}

module.exports = {
  maybeRunOpportunisticCleanup,
  formatBytes,
  getPathSizeBytes,
  describeSize,
  readFilesystemUsage,
  describeStorageState,
  describePackageCacheStorageSafely,
  describeDataDirChildren,
};
