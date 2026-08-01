"use strict";

// Workspace-/storage-cleanup: stale sessioner, verify-workspaces, package-
// cache-budgeten och ENOSPC-återhämtning. Ren extraktion ur runtime.js —
// ingen beteendeändring.

const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");

const { readStoreSync, withStoreLock } = require("./../store.js");
const {
  pruneExpiredPrewarmLeases,
  releasePrewarmLeaseForChat,
} = require("./../prewarm-leases.js");
const {
  NPM_CACHE_DIR,
  NPM_LOGS_MAX_FILES,
  PACKAGE_CACHE_DIR,
  PACKAGE_CACHE_MAX_BYTES,
  VERIFY_WORKSPACES_DIR,
  WORKSPACES_DIR,
  activeVerifyChatKeys,
  appendRuntimeLog,
  ensurePackageCacheDirs,
  getSessionChatId,
  isNoSpaceError,
  isSessionUsable,
  removeDirWithRetries,
  runInInstallSlot,
  runtimeChildren,
  safeChatKey,
  workspaceDirForChat,
} = require("./shared.js");

// OBS: process-lifecycle requiras LAZY (inuti stopStaleRuntimes) — den enda
// bakåtkanten i modulgrafen. process-lifecycle kräver denna modul vid load
// (withNoSpaceCleanupRetry), så en top-level require här skulle ge en
// CJS-cykel med partiella exports.

async function destroyChatWorkspace(chatId) {
  await removeDirWithRetries(workspaceDirForChat(chatId));
}

async function cleanupDirectoryEntries(dirPath, keepEntries = null) {
  if (!fs.existsSync(dirPath)) return { freedEntries: 0 };
  const entries = fs.readdirSync(dirPath);
  let freed = 0;
  for (const entry of entries) {
    if (keepEntries?.has(entry)) continue;
    const full = path.join(dirPath, entry);
    try {
      await removeDirWithRetries(full);
      freed++;
    } catch {
      // best-effort
    }
  }
  return { freedEntries: freed };
}

async function stopStaleRuntimes(nowMs) {
  const { stopTrackedRuntime } = require("./process-lifecycle.js");
  const snapshot = readStoreSync();
  const preservedSessionIds = new Set();
  const preservedWorkspaceEntries = new Set();
  const preservedPreviewSessionIds = new Set();
  let stoppedRuntimes = 0;

  for (const [sessionId, tracked] of runtimeChildren.entries()) {
    const session = snapshot.sessions[sessionId] ?? null;
    if (session && isSessionUsable(session, nowMs)) {
      continue;
    }

    const previewSessionId =
      (typeof session?.previewSessionId === "string" && session.previewSessionId.trim()) ||
      (typeof tracked.previewSessionId === "string" && tracked.previewSessionId.trim()) ||
      "";
    try {
      if (previewSessionId) {
        await appendRuntimeLog(
          previewSessionId,
          "Cleanup stopping stale runtime before removing session/workspace.",
        );
      }
      const stopped = await stopTrackedRuntime(sessionId, previewSessionId || null);
      if (stopped) {
        stoppedRuntimes += 1;
      }
    } catch (error) {
      preservedSessionIds.add(sessionId);
      if (typeof tracked.chatId === "string" && tracked.chatId.trim()) {
        preservedWorkspaceEntries.add(safeChatKey(tracked.chatId));
      }
      if (previewSessionId) {
        preservedPreviewSessionIds.add(previewSessionId);
        await appendRuntimeLog(
          previewSessionId,
          `Cleanup could not stop stale runtime: ${error instanceof Error ? error.message : "unknown error"}`,
        ).catch(() => {});
      }
    }
  }

  return {
    preservedSessionIds,
    preservedWorkspaceEntries,
    preservedPreviewSessionIds,
    stoppedRuntimes,
  };
}

/**
 * Recursive byte count for a directory tree — asynchronous on purpose.
 *
 * This process is also the HTTP proxy that serves every live preview, so a
 * synchronous walk stalls all of them. The package cache is allowed to reach
 * several GB spread over hundreds of thousands of small files (npm's `_cacache`
 * writes one file per tarball plus index shards), which made the old
 * `readdirSync`/`statSync` version a multi-second event-loop block on the very
 * code path that reports "is the disk full?".
 *
 * Directories are read one at a time: the goal is to yield often, not to
 * saturate the disk queue with a metadata scan that nothing is waiting on.
 */
async function directorySizeBytes(targetPath) {
  let total = 0;
  const stack = [targetPath];
  while (stack.length > 0) {
    const current = stack.pop();
    let entries;
    try {
      entries = await fsp.readdir(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
        continue;
      }
      try {
        // lstat: a symlink must count as the link, never as its target — the
        // target may live outside the tree (or be counted again inside it).
        total += (await fsp.lstat(full)).size;
      } catch {
        // best-effort
      }
    }
  }
  return total;
}

/**
 * Keeps the package-cache tree inside its budget and trims npm's debug logs.
 *
 * `force` drops the whole cache regardless of size — used by the ENOSPC retry
 * path, where reclaiming space matters more than a warm cache.
 */
async function cleanupPackageCaches(options = {}) {
  return runInInstallSlot(() => cleanupPackageCachesUnqueued(options));
}

/**
 * Cache cleanup for callers that ALREADY hold the install slot.
 *
 * The ENOSPC retry inside `runInstallCommandWithFallbackUnqueued` is the only
 * such caller: it runs between two install attempts of its own install, so
 * going through `runInInstallSlot` there would wait on a slot it is itself
 * holding — a deadlock that would hang the queue for every later boot.
 */
async function cleanupPackageCachesUnqueued({ force = false } = {}) {
  const result = { purgedCache: false, cacheBytesBefore: 0, removedNpmLogs: 0 };
  if (!fs.existsSync(PACKAGE_CACHE_DIR)) return result;

  result.cacheBytesBefore = await directorySizeBytes(PACKAGE_CACHE_DIR);
  const overBudget =
    PACKAGE_CACHE_MAX_BYTES > 0 && result.cacheBytesBefore > PACKAGE_CACHE_MAX_BYTES;
  if (force || overBudget) {
    try {
      await removeDirWithRetries(PACKAGE_CACHE_DIR);
      result.purgedCache = true;
    } catch {
      // best-effort
    }
    ensurePackageCacheDirs();
    return result;
  }

  // Under budget: still trim npm's `_logs` so a crash-loop cannot grow it
  // without bound (one debug log per failed install).
  const logsDir = path.join(NPM_CACHE_DIR, "_logs");
  try {
    const files = (await fsp.readdir(logsDir))
      .map((name) => ({ name, full: path.join(logsDir, name) }))
      .sort((a, b) => (a.name < b.name ? 1 : -1));
    for (const file of files.slice(NPM_LOGS_MAX_FILES)) {
      try {
        await fsp.rm(file.full, { force: true });
        result.removedNpmLogs += 1;
      } catch {
        // best-effort
      }
    }
  } catch {
    // no logs dir yet
  }
  return result;
}

async function cleanupPreviewHostStorage() {
  const nowMs = Date.now();
  const staleRuntimeCleanup = await stopStaleRuntimes(nowMs);
  const activeWorkspaceEntries = new Set(staleRuntimeCleanup.preservedWorkspaceEntries);
  const activePreviewSessionIds = new Set(staleRuntimeCleanup.preservedPreviewSessionIds);
  let removedSessions = 0;
  let removedLogs = 0;
  let removedMappings = 0;
  let removedPrewarmLeases = 0;

  await withStoreLock((data) => {
    removedPrewarmLeases += pruneExpiredPrewarmLeases(data, nowMs);
    for (const [sessionId, session] of Object.entries(data.sessions)) {
      if (
        isSessionUsable(session, nowMs) ||
        staleRuntimeCleanup.preservedSessionIds.has(sessionId)
      ) {
        const chatId = getSessionChatId(session);
        if (chatId) {
          activeWorkspaceEntries.add(safeChatKey(chatId));
        }
        if (typeof session.previewSessionId === "string" && session.previewSessionId.trim()) {
          activePreviewSessionIds.add(session.previewSessionId.trim());
        }
        continue;
      }

      removedSessions++;
      removedPrewarmLeases += releasePrewarmLeaseForChat(
        data,
        getSessionChatId(session),
      );
      delete data.sessions[sessionId];

      const previewSessionId =
        typeof session?.previewSessionId === "string" && session.previewSessionId.trim()
          ? session.previewSessionId.trim()
          : "";
      if (previewSessionId && data.previewSessionToSession[previewSessionId] === sessionId) {
        delete data.previewSessionToSession[previewSessionId];
        removedMappings++;
      }
    }

    for (const [previewSessionId, sessionId] of Object.entries(data.previewSessionToSession)) {
      if (!data.sessions[sessionId]) {
        delete data.previewSessionToSession[previewSessionId];
        removedMappings++;
      }
    }

    for (const previewSessionId of Object.keys(data.logs)) {
      if (!activePreviewSessionIds.has(previewSessionId)) {
        delete data.logs[previewSessionId];
        removedLogs++;
      }
    }
  });

  const verifyResult = await cleanupDirectoryEntries(
    VERIFY_WORKSPACES_DIR,
    activeVerifyChatKeys,
  );
  const workspaceResult = await cleanupDirectoryEntries(
    WORKSPACES_DIR,
    activeWorkspaceEntries,
  );
  const cacheResult = await cleanupPackageCaches();

  return {
    freedVerifyEntries: verifyResult.freedEntries,
    freedWorkspaceEntries: workspaceResult.freedEntries,
    purgedPackageCache: cacheResult.purgedCache,
    packageCacheBytesBefore: cacheResult.cacheBytesBefore,
    removedNpmLogs: cacheResult.removedNpmLogs,
    removedSessions,
    removedLogs,
    removedMappings,
    removedPrewarmLeases,
    stoppedStaleRuntimes: staleRuntimeCleanup.stoppedRuntimes,
    preservedStaleRuntimes: staleRuntimeCleanup.preservedSessionIds.size,
    preservedWorkspaceEntries: activeWorkspaceEntries.size,
  };
}

async function withNoSpaceCleanupRetry(run, options = {}) {
  try {
    return await run();
  } catch (error) {
    if (!isNoSpaceError(error)) {
      throw error;
    }
    if (typeof options.onRetry === "function") {
      await options.onRetry(error);
    }
    // Drop the package cache outright before retrying. The ordinary cleanup
    // only reclaims stale sessions/workspaces, which is useless when the cache
    // itself is what filled the disk.
    await cleanupPackageCaches({ force: true });
    await cleanupPreviewHostStorage();
    return run();
  }
}

/**
 * `knownBytes` lets a caller that has already measured the tree (the storage
 * report walks the whole volume once) skip the walk. The cache is the most
 * file-dense directory on the host, so measuring it twice per request is the
 * difference between one traversal and two.
 */
async function describePackageCacheStorage({ knownBytes } = {}) {
  return {
    dir: PACKAGE_CACHE_DIR,
    exists: fs.existsSync(PACKAGE_CACHE_DIR),
    bytes: Number.isFinite(knownBytes)
      ? knownBytes
      : await directorySizeBytes(PACKAGE_CACHE_DIR),
    maxBytes: PACKAGE_CACHE_MAX_BYTES > 0 ? PACKAGE_CACHE_MAX_BYTES : null,
  };
}

module.exports = {
  destroyChatWorkspace,
  directorySizeBytes,
  cleanupPackageCaches,
  cleanupPackageCachesUnqueued,
  cleanupPreviewHostStorage,
  withNoSpaceCleanupRetry,
  describePackageCacheStorage,
};
