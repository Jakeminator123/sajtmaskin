"use strict";

const http = require("node:http");
const { URL } = require("node:url");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const {
  getDataDir,
  getStoreFilePath,
  readStoreSync,
  withStoreLock,
} = require("./store.js");
const {
  applyRuntimePatch,
  buildPreviewUrl,
  cleanupPreviewHostStorage,
  destroyChatWorkspace,
  findSessionByChatId,
  getRuntimeStateForChat,
  getSessionChatId,
  hibernateChatRuntime,
  listSessions,
  proxyPreviewRequest,
  proxyPreviewUpgrade,
  queueRuntimeBoot,
  runQueuedVerifyJob,
  stopRuntimeForSession,
  sweepIdleRuntimes,
} = require("./runtime.js");
const {
  validateStartPayload,
  validateUpdatePayload,
  validatePatchPayload,
  validateSessionRefPayload,
  validateVerifyPayload,
} = require("./validate.js");
const {
  acquirePrewarmLease,
  MAX_PREWARM_LEASES,
  pruneExpiredPrewarmLeases,
  releasePrewarmLeaseForChat,
  resetPrewarmLeases,
} = require("./prewarm-leases.js");
const { sendRootPlaceholderSvg } = require("./placeholder-svg.js");

const PORT = Number.parseInt(process.env.PORT ?? "8080", 10);
const HOST = process.env.HOST ?? "0.0.0.0";
const PREVIEW_BASE_URL =
  process.env.PREVIEW_BASE_URL ?? "https://preview-placeholder.example.com";
const SESSION_TTL_MS =
  Number.parseInt(process.env.PREVIEW_SESSION_TTL_MS ?? `${60 * 60 * 1000}`, 10);
// Prewarm resource leases deliberately share the existing preview-session
// horizon: they bound cold starts before generation credits settle, without
// introducing a second billing or tenant state.
const PREWARM_LEASE_MS = SESSION_TTL_MS;
const OPPORTUNISTIC_CLEANUP_INTERVAL_MS =
  Number.parseInt(process.env.PREVIEW_HOST_OPPORTUNISTIC_CLEANUP_INTERVAL_MS ?? `${5 * 60 * 1000}`, 10);
const BACKGROUND_CLEANUP_INTERVAL_MS =
  Number.parseInt(process.env.PREVIEW_HOST_BACKGROUND_CLEANUP_INTERVAL_MS ?? `${10 * 60 * 1000}`, 10);
// Hur ofta idle-reapern letar efter runtimes utan trafik/öppna iframes.
// Själva idle-fönstret styrs av PREVIEW_HOST_RUNTIME_IDLE_STOP_MS (runtime.js).
const RUNTIME_IDLE_SWEEP_INTERVAL_MS =
  Number.parseInt(process.env.PREVIEW_HOST_RUNTIME_IDLE_SWEEP_INTERVAL_MS ?? `${60 * 1000}`, 10);
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

function getPathSizeBytes(targetPath) {
  try {
    const stats = fs.statSync(targetPath);
    if (stats.isFile()) return stats.size;
    if (!stats.isDirectory()) return 0;
    let total = 0;
    for (const entry of fs.readdirSync(targetPath)) {
      total += getPathSizeBytes(path.join(targetPath, entry));
    }
    return total;
  } catch {
    return 0;
  }
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

function describeStorageState() {
  const dataDir = getDataDir();
  const workspacesDir = path.join(dataDir, "workspaces");
  const verifyWorkspacesDir = path.join(dataDir, "verify-workspaces");
  const storeFilePath = getStoreFilePath();
  const rootFilesystem = readFilesystemUsage("/");
  const dataFilesystem = readFilesystemUsage(dataDir);
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
      dataDir: {
        exists: fs.existsSync(dataDir),
        bytes: getPathSizeBytes(dataDir),
        human: formatBytes(getPathSizeBytes(dataDir)),
      },
      storeFilePath: {
        exists: fs.existsSync(storeFilePath),
        bytes: getPathSizeBytes(storeFilePath),
        human: formatBytes(getPathSizeBytes(storeFilePath)),
      },
      workspacesDir: {
        exists: fs.existsSync(workspacesDir),
        bytes: getPathSizeBytes(workspacesDir),
        human: formatBytes(getPathSizeBytes(workspacesDir)),
      },
      verifyWorkspacesDir: {
        exists: fs.existsSync(verifyWorkspacesDir),
        bytes: getPathSizeBytes(verifyWorkspacesDir),
        human: formatBytes(getPathSizeBytes(verifyWorkspacesDir)),
      },
    },
  };
}

function json(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(JSON.stringify(payload, null, 2));
}

function notFound(res) {
  json(res, 404, {
    error: "not_found",
    message: "Route not found.",
  });
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  if (chunks.length === 0) {
    return {};
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error("Body must be valid JSON.");
  }
}

function nowIso() {
  return new Date().toISOString();
}

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

/** @param {ReturnType<typeof readStoreSync>} data */
function appendLog(data, previewSessionId, message) {
  const lines = data.logs[previewSessionId] ?? [];
  lines.push({
    ts: nowIso(),
    message,
  });
  data.logs[previewSessionId] = lines;
}

/**
 * @param {ReturnType<typeof readStoreSync>} data
 * @param {string} sessionId
 */
function findSessionById(data, sessionId) {
  const s = data.sessions[sessionId];
  return s ?? null;
}

/**
 * @param {ReturnType<typeof readStoreSync>} data
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

function isLocalEnvironment() {
  const host = process.env.HOST ?? "0.0.0.0";
  const flyApp = process.env.FLY_APP_NAME;
  return !flyApp && (host === "127.0.0.1" || host === "localhost");
}

function checkApiKey(req, res) {
  const expected = process.env.PREVIEW_HOST_API_KEY?.trim();
  if (!expected) {
    if (isLocalEnvironment()) return true;
    json(res, 503, {
      error: "configuration_error",
      message: "PREVIEW_HOST_API_KEY is required in non-local environments.",
    });
    return false;
  }
  const auth = req.headers.authorization ?? "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  const headerKey = req.headers["x-preview-host-key"];
  const alt =
    typeof headerKey === "string" ? headerKey.trim() : Array.isArray(headerKey) ? headerKey[0]?.trim() : "";
  const token = bearer || alt;
  if (token === expected) {
    return true;
  }
  json(res, 401, {
    error: "unauthorized",
    message: "Invalid or missing API key.",
  });
  return false;
}

async function routeRequest(req, res) {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

  if (req.method === "GET" && url.pathname === "/health") {
    const data = readStoreSync();
    return json(res, 200, {
      ok: true,
      service: "preview-host",
      ts: nowIso(),
      sessions: Object.keys(data.sessions).length,
    });
  }

  if (req.method === "GET" && url.pathname === "/placeholder.svg") {
    sendRootPlaceholderSvg(res, url);
    return undefined;
  }

  if (req.method === "GET" && url.pathname === "/") {
    return json(res, 200, {
      service: "preview-host",
      mode: "runtime",
      endpoints: [
        "GET /health",
        "POST /preview/session/start",
        "POST /preview/session/update",
        "POST /preview/session/patch",
        "POST /preview/session/hibernate",
        "POST /preview/session/destroy",
        "POST /preview/verify",
        "GET /preview/session/:id",
        "GET /preview/session/:previewSessionId/status",
        "GET /preview/sandbox/:previewSessionId/status (legacy path)",
        "GET /preview/logs/:previewSessionId",
        "GET /admin/sessions",
        "GET /admin/storage",
        "POST /admin/cleanup",
        "POST /admin/destroy-all",
        "GET /placeholder.svg",
        "GET /:chatId/*",
      ],
    });
  }

  if (
    !url.pathname.startsWith("/preview/") &&
    url.pathname !== "/" &&
    url.pathname !== "/health"
  ) {
    const proxied = await proxyPreviewRequest(req, res, url.pathname, url.search);
    if (proxied) {
      return undefined;
    }
  }

  const needsAuth = url.pathname.startsWith("/preview/");
  if (needsAuth && !checkApiKey(req, res)) {
    return undefined;
  }

  const previewStatusSessionId = getPreviewStatusSessionId(url.pathname);
  if (req.method === "GET" && previewStatusSessionId) {
    const previewSessionId = previewStatusSessionId;
    if (!previewSessionId) {
      return json(res, 400, { error: "bad_request", message: "Missing previewSessionId." });
    }
    const statusResult = await withStoreLock((data) => {
      const nowMs = Date.now();
      const session = findSessionByPreviewSessionId(data, previewSessionId);
      if (!session || !isSessionUsable(session, nowMs)) {
        return { type: "missing" };
      }
      return {
        type: "ok",
        session,
      };
    });
    if (statusResult.type === "missing") {
      return json(res, 404, {
        error: "session_not_found",
        message: "No active preview session for this previewSessionId.",
      });
    }
    const chatId = getSessionChatId(statusResult.session);
    const runtimeState = getRuntimeStateForChat(chatId);
    if (
      !runtimeState.running &&
      !runtimeState.booting &&
      statusResult.session.status !== "error" &&
      statusResult.session.status !== "hibernated"
    ) {
      queueRuntimeBoot(chatId);
    }
    const latest = findSessionByPreviewSessionId(readStoreSync(), previewSessionId) ?? statusResult.session;
    const publicRunning =
      runtimeState.running &&
      latest.prewarm !== true &&
      latest.prewarmReplacementPending !== true;
    return json(res, 200, {
      ok: true,
      running: publicRunning,
      previewSessionId: latest.previewSessionId,
      /** @legacy External alias for older Sajtmaskin app deployments. */
      sandboxId: latest.previewSessionId,
      previewUrl: latest.previewUrl,
      versionId: latest.versionId,
      status: latest.status,
      sessionExpiresAt: latest.sessionExpiresAt,
    });
  }

  if (req.method === "POST" && url.pathname === "/preview/session/start") {
    const raw = await readJsonBody(req);
    const validated = validateStartPayload(raw);
    await maybeRunOpportunisticCleanup();
    const created = await withStoreLock((data) => {
      const nowMs = Date.now();
      const existing = findSessionByChatId(data, validated.chatId);
      if (validated.prewarm) {
        // A delayed best-effort request must never take over a real finalized
        // session. This check and the mutation live under the host's persistent
        // store lock, so process-local app dedup is not relied on for safety.
        if (existing && existing.prewarm !== true) {
          return { type: "prewarm_superseded", session: existing };
        }
        if (existing) {
          // Re-establish the subject lease before recovering a persisted/dead
          // prewarm. Boot failure deliberately releases it, so idempotent
          // retries must not become an unmetered install loop.
          const reacquired = acquirePrewarmLease(data, {
            key: validated.prewarmLeaseKey,
            chatId: validated.chatId,
            nowMs,
            leaseMs: PREWARM_LEASE_MS,
          });
          if (reacquired.type === "rate_limited") {
            return { type: "prewarm_rate_limited", lease: reacquired.lease };
          }
          if (reacquired.type === "capacity") {
            return { type: "prewarm_capacity" };
          }
          // Keep exactly one active key for the chat if its canonical subject
          // changed (for example guest -> authenticated user).
          releasePrewarmLeaseForChat(data, validated.chatId);
          data.prewarmLeases[reacquired.key] = reacquired.lease;
          return { type: "prewarm_idempotent", session: existing };
        }
        const acquired = acquirePrewarmLease(data, {
          key: validated.prewarmLeaseKey,
          chatId: validated.chatId,
          nowMs,
          leaseMs: PREWARM_LEASE_MS,
        });
        if (acquired.type === "rate_limited") {
          return { type: "prewarm_rate_limited", lease: acquired.lease };
        }
        if (acquired.type === "capacity") {
          return { type: "prewarm_capacity" };
        }
      } else {
        pruneExpiredPrewarmLeases(data, nowMs);
        releasePrewarmLeaseForChat(data, validated.chatId);
      }
      const prewarmReplacementPending =
        !validated.prewarm &&
        (existing?.prewarm === true || existing?.prewarmReplacementPending === true);
      const createdAt = existing?.createdAt ?? nowIso();
      const updatedAt = nowIso();
      const sessionExpiresAt = sessionExpiresAtIso();
      const sessionId = existing?.sessionId ?? randomUUID();
      const previewSessionId = existing?.previewSessionId ?? `ps_${randomUUID()}`;
      const session = {
        sessionId,
        previewSessionId,
        chatId: validated.chatId,
        versionId: validated.versionId,
        previewUrl: buildPreviewUrl(PREVIEW_BASE_URL, validated.chatId),
        status: "starting",
        lastAction: "start",
        changeClass: validated.changeClass,
        startOutcome: existing ? "resumed" : "fresh",
        preferredBaseImage: validated.preferredBaseImage,
        dependencyFingerprint: validated.dependencyFingerprint,
        resumeStrategy: validated.resumeStrategy,
        filesJson: validated.filesJson,
        prewarm: validated.prewarm,
        prewarmReplacementPending,
        createdAt,
        updatedAt,
        sessionExpiresAt,
        runtimePort: existing?.runtimePort ?? null,
      };
      data.sessions[sessionId] = session;
      data.previewSessionToSession[previewSessionId] = sessionId;
      appendLog(
        data,
        previewSessionId,
        existing
          ? `Session reused for chat ${validated.chatId}; booting updated runtime.`
          : `Session created for chat ${validated.chatId}.`,
      );
      return { type: "created", session };
    });
    if (created.type === "prewarm_superseded") {
      return json(res, 409, {
        error: "prewarm_superseded",
        message: "A finalized preview version already owns this chat session.",
        versionId: created.session.versionId,
      });
    }
    if (created.type === "prewarm_rate_limited") {
      return json(res, 429, {
        error: "prewarm_rate_limited",
        message: "A prewarm lease is already active for this generation subject.",
        retryAt: created.lease.expiresAt,
      });
    }
    if (created.type === "prewarm_capacity") {
      return json(res, 429, {
        error: "prewarm_rate_limited",
        message: "Preview-host prewarm capacity is currently exhausted.",
      });
    }
    if (created.type === "prewarm_idempotent") {
      // A persisted prewarm may outlive the host process that started it.
      // Recover only a missing/dead runtime. A healthy prewarm (or one already
      // booting) must not be restarted by an idempotent app retry.
      const runtimeState = getRuntimeStateForChat(validated.chatId);
      if (!runtimeState.running && !runtimeState.booting) {
        queueRuntimeBoot(validated.chatId, { restart: true });
      }
      return json(res, 200, sessionResponse(created.session));
    }
    queueRuntimeBoot(validated.chatId, { restart: true });
    return json(
      res,
      201,
      sessionResponse(findSessionById(readStoreSync(), created.session.sessionId) ?? created.session),
    );
  }

  if (req.method === "POST" && url.pathname === "/preview/session/update") {
    const raw = await readJsonBody(req);
    const validated = validateUpdatePayload(raw);
    const updated = await withStoreLock((data) => {
      let session = null;
      if (validated.sessionId) {
        session = findSessionById(data, validated.sessionId);
      }
      if (!session && validated.previewSessionId) {
        session = findSessionByPreviewSessionId(data, validated.previewSessionId);
      }
      if (!session) {
        return null;
      }
      if (!isSessionUsable(session, Date.now())) {
        return null;
      }
      const replacingPrewarm =
        session.prewarm === true || session.prewarmReplacementPending === true;
      session.versionId = validated.versionId;
      session.prewarm = false;
      session.prewarmReplacementPending = replacingPrewarm;
      releasePrewarmLeaseForChat(data, getSessionChatId(session));
      session.changeClass = validated.changeClass;
      if (validated.filesJson !== undefined) {
        session.filesJson = validated.replaceFiles
          ? validated.filesJson
          : {
              ...(session.filesJson && typeof session.filesJson === "object" ? session.filesJson : {}),
              ...validated.filesJson,
            };
      }
      session.status = replacingPrewarm ? "starting" : "warm_project";
      session.lastAction = "update";
      session.startOutcome = "resumed";
      session.updatedAt = nowIso();
      session.sessionExpiresAt = sessionExpiresAtIso();
      appendLog(data, session.previewSessionId, `Session updated with changeClass=${session.changeClass}.`);
      return session;
    });
    if (!updated) {
      return json(res, 404, {
        error: "session_not_found",
        message: "No preview session matched the provided id.",
      });
    }
    queueRuntimeBoot(getSessionChatId(updated), { restart: true });
    return json(res, 200, sessionResponse(findSessionById(readStoreSync(), updated.sessionId) ?? updated));
  }

  if (req.method === "POST" && url.pathname === "/preview/session/patch") {
    const raw = await readJsonBody(req);
    const validated = validatePatchPayload(raw);
    const patchOutcome = await withStoreLock((data) => {
      let session = null;
      if (validated.sessionId) {
        session = findSessionById(data, validated.sessionId);
      }
      if (!session && validated.previewSessionId) {
        session = findSessionByPreviewSessionId(data, validated.previewSessionId);
      }
      if (!session) {
        return { type: "missing" };
      }
      if (!isSessionUsable(session, Date.now())) {
        return { type: "missing" };
      }
      // Finding #2 (FEL-3): re-check the expected base under the store lock.
      // The app does an optimistic precheck, but two near-simultaneous quick
      // edits derived from the same base can both pass it before the host
      // advances the session. Re-checking here — atomically with the mutation —
      // closes that TOCTOU window: if the live session no longer points at the
      // base the patch was derived from, refuse the merge (without mutating) so
      // the caller does a full (re)start instead of writing a hybrid file set.
      if (
        validated.expectedBaseVersionId &&
        typeof session.versionId === "string" &&
        session.versionId &&
        session.versionId !== validated.expectedBaseVersionId
      ) {
        return { type: "base_mismatch", currentVersionId: session.versionId };
      }
      // Finding #3 (FEL-5): snapshot the fields we are about to advance so a
      // failed workspace write (e.g. ENOSPC in the hot-patch path) can be rolled
      // back. Otherwise the session would advertise a new versionId/filesJson
      // that never actually landed on disk -> false-green stale preview.
      const rollback = {
        versionId: session.versionId,
        filesJson: session.filesJson,
        status: session.status,
        lastAction: session.lastAction,
        startOutcome: session.startOutcome,
        changeClass: session.changeClass,
        updatedAt: session.updatedAt,
        sessionExpiresAt: session.sessionExpiresAt,
      };
      const replacingPrewarm =
        session.prewarm === true || session.prewarmReplacementPending === true;
      session.versionId = validated.versionId;
      session.prewarm = false;
      session.prewarmReplacementPending = replacingPrewarm;
      releasePrewarmLeaseForChat(data, getSessionChatId(session));
      // Merge the changed files into the stored set and apply removals so a
      // later full boot reflects the patch. This mirrors update's
      // replaceFiles:false merge but only for the changed paths.
      const base =
        session.filesJson && typeof session.filesJson === "object"
          ? { ...session.filesJson }
          : {};
      for (const [relPath, content] of Object.entries(validated.files)) {
        base[relPath] = content;
      }
      for (const relPath of validated.removedPaths) {
        delete base[relPath];
      }
      session.filesJson = base;
      session.status = replacingPrewarm ? "starting" : "warm_project";
      session.lastAction = "patch";
      session.startOutcome = "resumed";
      session.changeClass = "light";
      session.updatedAt = nowIso();
      session.sessionExpiresAt = sessionExpiresAtIso();
      appendLog(
        data,
        session.previewSessionId,
        `Session patched (${Object.keys(validated.files).length} file(s), ${validated.removedPaths.length} removed).`,
      );
      return {
        type: "ok",
        sessionId: session.sessionId,
        chatId: getSessionChatId(session),
        replacingPrewarm,
        rollback,
      };
    });
    if (patchOutcome.type === "missing") {
      return json(res, 404, {
        error: "session_not_found",
        message: "No preview session matched the provided id.",
      });
    }
    if (patchOutcome.type === "base_mismatch") {
      return json(res, 409, {
        error: "base_mismatch",
        message:
          "Preview session has advanced past the expected base version; refusing partial patch.",
        versionId: patchOutcome.currentVersionId,
      });
    }
    const patchResult = patchOutcome.replacingPrewarm
      ? (() => {
          queueRuntimeBoot(patchOutcome.chatId, { restart: true });
          return { mode: "restarted", reason: "prewarm_replacement" };
        })()
      : applyRuntimePatch(patchOutcome.chatId, {
          files: validated.files,
          removedPaths: validated.removedPaths,
        });
    if (patchResult.mode === "error") {
      // Finding #3 (FEL-5): the workspace patch did not land. Roll the session
      // back to its pre-patch snapshot so /status (and a later resume) never
      // reports the new version as live while the dev process still serves the
      // old files. Skip the rollback if another patch advanced the session past
      // ours in the meantime (don't clobber a newer successful write).
      await withStoreLock((data) => {
        const session = data.sessions[patchOutcome.sessionId];
        if (!session || session.versionId !== validated.versionId) {
          return session ?? null;
        }
        Object.assign(session, patchOutcome.rollback);
        appendLog(
          data,
          session.previewSessionId,
          `Patch rolled back; workspace write failed: ${patchResult.reason ?? "unknown error"}.`,
        );
        return session;
      });
      return json(res, 500, {
        error: "patch_failed",
        message: patchResult.reason ?? "Preview-host failed to apply the patch.",
      });
    }
    const latest = findSessionById(readStoreSync(), patchOutcome.sessionId);
    if (!latest) {
      return json(res, 404, {
        error: "session_not_found",
        message: "No preview session matched the provided id.",
      });
    }
    return json(res, 200, {
      ...sessionResponse(latest),
      patchMode: patchResult.mode,
      patchReason: patchResult.reason ?? null,
    });
  }

  if (req.method === "POST" && url.pathname === "/preview/session/hibernate") {
    const raw = await readJsonBody(req);
    const validated = validateSessionRefPayload(raw);
    const out = await withStoreLock((data) => {
      let session = null;
      if (validated.sessionId) {
        session = findSessionById(data, validated.sessionId);
      }
      if (!session && validated.previewSessionId) {
        session = findSessionByPreviewSessionId(data, validated.previewSessionId);
      }
      if (!session || !isSessionUsable(session, Date.now())) {
        return null;
      }
      session.status = "hibernated";
      session.lastAction = "hibernate";
      session.updatedAt = nowIso();
      appendLog(data, session.previewSessionId, "Session hibernated.");
      return session;
    });
    if (!out) {
      return json(res, 404, {
        error: "session_not_found",
        message: "No preview session matched the provided id.",
      });
    }
    await hibernateChatRuntime(getSessionChatId(out));
    return json(res, 200, sessionResponse(out));
  }

  if (req.method === "POST" && url.pathname === "/preview/session/destroy") {
    const raw = await readJsonBody(req);
    const validated = validateSessionRefPayload(raw);
    const destroyed = await withStoreLock((data) => {
      let session = null;
      if (validated.sessionId) {
        session = findSessionById(data, validated.sessionId);
      }
      if (!session && validated.previewSessionId) {
        session = findSessionByPreviewSessionId(data, validated.previewSessionId);
      }
      if (!session) {
        return null;
      }
      const chatId = getSessionChatId(session);
      const { sessionId, previewSessionId } = session;
      session.status = "destroyed";
      session.lastAction = "destroy";
      session.updatedAt = nowIso();
      appendLog(data, previewSessionId, "Session destroyed.");
      releasePrewarmLeaseForChat(data, chatId);
      delete data.sessions[sessionId];
      delete data.previewSessionToSession[previewSessionId];
      return { sessionId, previewSessionId, chatId };
    });
    if (!destroyed) {
      return json(res, 404, {
        error: "session_not_found",
        message: "No preview session matched the provided id.",
      });
    }
    await stopRuntimeForSession(destroyed);
    try {
      await destroyChatWorkspace(destroyed.chatId);
    } catch {
      // Best-effort cleanup only; the session is already destroyed.
    }
    return json(res, 200, {
      destroyed: true,
      sessionId: destroyed.sessionId,
      previewSessionId: destroyed.previewSessionId,
      /** @legacy External alias for older Sajtmaskin app deployments. */
      sandboxId: destroyed.previewSessionId,
    });
  }

  if (req.method === "POST" && url.pathname === "/preview/verify") {
    const raw = await readJsonBody(req);
    const validated = validateVerifyPayload(raw);
    const verifyId = `verify_${randomUUID()}`;
    try {
      const result = await runQueuedVerifyJob({
        verifyId,
        chatId: validated.chatId,
        versionId: validated.versionId,
        filesJson: validated.filesJson,
        checks: validated.checks,
      });
      return json(res, 200, {
        ok: true,
        verifyId: result.verifyId,
        chatId: validated.chatId,
        versionId: validated.versionId,
        durationMs: result.durationMs,
        jobStartedAt: result.jobStartedAt ?? null,
        jobFinishedAt: result.jobFinishedAt ?? null,
        firstFailureCheck: result.firstFailureCheck ?? null,
        results: result.results,
      });
    } catch (error) {
      return json(res, 500, {
        error: "verify_failed",
        message: error instanceof Error ? error.message : "Preview-host verify failed.",
        verifyId,
      });
    }
  }

  if (req.method === "GET" && url.pathname.startsWith("/preview/session/")) {
    const sessionId = url.pathname.split("/").at(-1);
    if (!sessionId) {
      return notFound(res);
    }
    const data = readStoreSync();
    const session = findSessionById(data, sessionId);
    if (!session) {
      return json(res, 404, {
        error: "session_not_found",
        message: "No preview session matched the provided id.",
      });
    }
    return json(res, 200, sessionResponse(session));
  }

  if (req.method === "GET" && url.pathname.startsWith("/preview/logs/")) {
    const previewSessionId = url.pathname.split("/").at(-1);
    const data = readStoreSync();
    const logs = previewSessionId ? data.logs[previewSessionId] ?? [] : [];
    return json(res, 200, {
      previewSessionId: previewSessionId ?? "",
      /** @legacy External alias for older Sajtmaskin app deployments. */
      sandboxId: previewSessionId ?? "",
      lines: logs,
    });
  }

  if (req.method === "POST" && url.pathname === "/admin/cleanup") {
    if (!checkApiKey(req, res)) return;
    try {
      const result = await cleanupPreviewHostStorage();
      return json(res, 200, { cleaned: true, ...result });
    } catch (error) {
      return json(res, 500, {
        error: "cleanup_failed",
        message: error instanceof Error ? error.message : "Cleanup failed.",
      });
    }
  }

  if (req.method === "GET" && url.pathname === "/admin/sessions") {
    if (!checkApiKey(req, res)) return;
    const sessions = listSessions(readStoreSync()).map((session) => sessionResponse(session));
    return json(res, 200, {
      count: sessions.length,
      sessions,
    });
  }

  if (req.method === "GET" && url.pathname === "/admin/storage") {
    if (!checkApiKey(req, res)) return;
    return json(res, 200, {
      ok: true,
      storage: describeStorageState(),
    });
  }

  if (req.method === "POST" && url.pathname === "/admin/destroy-all") {
    if (!checkApiKey(req, res)) return;
    const activeSessions = listSessions(readStoreSync());
    const destroyed = await withStoreLock((data) => {
      const toDestroy = [];
      for (const session of activeSessions) {
        const chatId = getSessionChatId(session);
        const { sessionId, previewSessionId } = session;
        delete data.sessions[sessionId];
        delete data.previewSessionToSession[previewSessionId];
        delete data.logs[previewSessionId];
        toDestroy.push({ sessionId, previewSessionId, chatId });
      }
      const resetLeases = resetPrewarmLeases(data);
      return { sessions: toDestroy, resetLeases };
    });
    for (const session of destroyed.sessions) {
      try {
        await stopRuntimeForSession(session);
      } catch {
        // best effort
      }
      try {
        await destroyChatWorkspace(session.chatId);
      } catch {
        // best effort
      }
    }
    return json(res, 200, {
      destroyed: destroyed.sessions.length,
      resetPrewarmLeases: destroyed.resetLeases,
      sessions: destroyed.sessions,
    });
  }

  return notFound(res);
}

function createServer() {
  const server = http.createServer(async (req, res) => {
    try {
      await routeRequest(req, res);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unexpected preview-host error.";
      json(res, 400, {
        error: "bad_request",
        message,
      });
    }
  });
  server.on("upgrade", async (req, socket, head) => {
    try {
      const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
      const handled = await proxyPreviewUpgrade(req, socket, head, url.pathname, url.search);
      if (!handled) {
        socket.destroy();
      }
    } catch {
      socket.destroy();
    }
  });
  return server;
}

if (require.main === module) {
  const server = createServer();
  server.listen(PORT, HOST, () => {
    console.log(`preview-host listening on http://${HOST}:${PORT}`);
  });
  void cleanupPreviewHostStorage().catch(() => null);
  const cleanupTimer = setInterval(() => {
    void cleanupPreviewHostStorage().catch(() => null);
  }, BACKGROUND_CLEANUP_INTERVAL_MS);
  cleanupTimer.unref?.();
  const idleSweepTimer = setInterval(() => {
    void sweepIdleRuntimes().catch(() => null);
  }, RUNTIME_IDLE_SWEEP_INTERVAL_MS);
  idleSweepTimer.unref?.();
}

module.exports = {
  createServer,
};
