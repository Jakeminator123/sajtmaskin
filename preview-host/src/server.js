"use strict";

const http = require("node:http");
const { URL } = require("node:url");
const { randomUUID } = require("node:crypto");
const { readStoreSync, withStoreLock } = require("./store.js");
const {
  buildPreviewUrl,
  cleanupPreviewHostStorage,
  destroyChatWorkspace,
  findSessionByChatId,
  getRuntimeStateForChat,
  getSessionChatId,
  hibernateChatRuntime,
  proxyPreviewRequest,
  proxyPreviewUpgrade,
  queueRuntimeBoot,
  runVerifyJob,
  stopRuntimeForSession,
} = require("./runtime.js");
const {
  validateStartPayload,
  validateUpdatePayload,
  validateSessionRefPayload,
  validateVerifyPayload,
} = require("./validate.js");
const { sendRootPlaceholderSvg } = require("./placeholder-svg.js");

const PORT = Number.parseInt(process.env.PORT ?? "8080", 10);
const HOST = process.env.HOST ?? "0.0.0.0";
const PREVIEW_BASE_URL =
  process.env.PREVIEW_BASE_URL ?? "https://preview-placeholder.example.com";
const SESSION_TTL_MS =
  Number.parseInt(process.env.PREVIEW_SESSION_TTL_MS ?? `${30 * 60 * 1000}`, 10);

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
  return {
    sessionId: session.sessionId,
    sandboxId: session.sandboxId,
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
function appendLog(data, sandboxId, message) {
  const lines = data.logs[sandboxId] ?? [];
  lines.push({
    ts: nowIso(),
    message,
  });
  data.logs[sandboxId] = lines;
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
 * @param {string} sandboxId
 */
function findSessionBySandboxId(data, sandboxId) {
  const sid = data.sandboxToSession[sandboxId];
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
        "POST /preview/session/hibernate",
        "POST /preview/session/destroy",
        "POST /preview/verify",
        "GET /preview/session/:id",
        "GET /preview/sandbox/:sandboxId/status",
        "GET /preview/logs/:sandboxId",
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

  if (req.method === "GET" && url.pathname.startsWith("/preview/sandbox/") && url.pathname.endsWith("/status")) {
    const parts = url.pathname.split("/").filter(Boolean);
    const sandboxId = parts.length >= 3 ? parts[2] : "";
    if (!sandboxId) {
      return json(res, 400, { error: "bad_request", message: "Missing sandboxId." });
    }
    const statusResult = await withStoreLock((data) => {
      const nowMs = Date.now();
      const session = findSessionBySandboxId(data, sandboxId);
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
        message: "No active preview session for this sandbox id.",
      });
    }
    const chatId = getSessionChatId(statusResult.session);
    const runtimeState = getRuntimeStateForChat(chatId);
    if (!runtimeState.running && statusResult.session.status !== "error" && statusResult.session.status !== "hibernated") {
      queueRuntimeBoot(chatId);
    }
    if (runtimeState.running) {
      await withStoreLock((data) => {
        const session = findSessionBySandboxId(data, sandboxId);
        if (session) {
          session.sessionExpiresAt = sessionExpiresAtIso();
          session.updatedAt = nowIso();
        }
      });
    }
    const latest = findSessionBySandboxId(readStoreSync(), sandboxId) ?? statusResult.session;
    return json(res, 200, {
      ok: true,
      running: runtimeState.running,
      sandboxId: latest.sandboxId,
      previewUrl: latest.previewUrl,
      versionId: latest.versionId,
      status: latest.status,
      sessionExpiresAt: latest.sessionExpiresAt,
    });
  }

  if (req.method === "POST" && url.pathname === "/preview/session/start") {
    const raw = await readJsonBody(req);
    const validated = validateStartPayload(raw);
    await cleanupPreviewHostStorage().catch(() => null);
    const created = await withStoreLock((data) => {
      const existing = findSessionByChatId(data, validated.chatId);
      const createdAt = existing?.createdAt ?? nowIso();
      const updatedAt = nowIso();
      const sessionExpiresAt = sessionExpiresAtIso();
      const sessionId = existing?.sessionId ?? randomUUID();
      const sandboxId = existing?.sandboxId ?? `sbx_${randomUUID()}`;
      const session = {
        sessionId,
        sandboxId,
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
        createdAt,
        updatedAt,
        sessionExpiresAt,
        runtimePort: existing?.runtimePort ?? null,
      };
      data.sessions[sessionId] = session;
      data.sandboxToSession[sandboxId] = sessionId;
      appendLog(
        data,
        sandboxId,
        existing
          ? `Session reused for chat ${validated.chatId}; booting updated runtime.`
          : `Session created for chat ${validated.chatId}.`,
      );
      return session;
    });
    queueRuntimeBoot(validated.chatId, { restart: true });
    return json(res, 201, sessionResponse(findSessionById(readStoreSync(), created.sessionId) ?? created));
  }

  if (req.method === "POST" && url.pathname === "/preview/session/update") {
    const raw = await readJsonBody(req);
    const validated = validateUpdatePayload(raw);
    const updated = await withStoreLock((data) => {
      let session = null;
      if (validated.sessionId) {
        session = findSessionById(data, validated.sessionId);
      }
      if (!session && validated.sandboxId) {
        session = findSessionBySandboxId(data, validated.sandboxId);
      }
      if (!session) {
        return null;
      }
      if (!isSessionUsable(session, Date.now())) {
        return null;
      }
      session.versionId = validated.versionId;
      session.changeClass = validated.changeClass;
      if (validated.filesJson !== undefined) {
        session.filesJson = {
          ...(session.filesJson && typeof session.filesJson === "object" ? session.filesJson : {}),
          ...validated.filesJson,
        };
      }
      session.status = "warm_project";
      session.lastAction = "update";
      session.startOutcome = "resumed";
      session.updatedAt = nowIso();
      session.sessionExpiresAt = sessionExpiresAtIso();
      appendLog(data, session.sandboxId, `Session updated with changeClass=${session.changeClass}.`);
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

  if (req.method === "POST" && url.pathname === "/preview/session/hibernate") {
    const raw = await readJsonBody(req);
    const validated = validateSessionRefPayload(raw);
    const out = await withStoreLock((data) => {
      let session = null;
      if (validated.sessionId) {
        session = findSessionById(data, validated.sessionId);
      }
      if (!session && validated.sandboxId) {
        session = findSessionBySandboxId(data, validated.sandboxId);
      }
      if (!session || !isSessionUsable(session, Date.now())) {
        return null;
      }
      session.status = "hibernated";
      session.lastAction = "hibernate";
      session.updatedAt = nowIso();
      appendLog(data, session.sandboxId, "Session hibernated.");
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
      if (!session && validated.sandboxId) {
        session = findSessionBySandboxId(data, validated.sandboxId);
      }
      if (!session) {
        return null;
      }
      const chatId = getSessionChatId(session);
      const { sessionId, sandboxId } = session;
      session.status = "destroyed";
      session.lastAction = "destroy";
      session.updatedAt = nowIso();
      appendLog(data, sandboxId, "Session destroyed.");
      delete data.sessions[sessionId];
      delete data.sandboxToSession[sandboxId];
      return { sessionId, sandboxId, chatId };
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
      sandboxId: destroyed.sandboxId,
    });
  }

  if (req.method === "POST" && url.pathname === "/preview/verify") {
    const raw = await readJsonBody(req);
    const validated = validateVerifyPayload(raw);
    const verifyId = `verify_${randomUUID()}`;
    try {
      const result = await runVerifyJob({
        verifyId,
        chatId: validated.chatId,
        versionId: validated.versionId,
        filesJson: validated.filesJson,
        checks: validated.checks,
      });
      return json(res, 200, {
        ok: true,
        verifyId,
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
    const sandboxId = url.pathname.split("/").at(-1);
    const data = readStoreSync();
    const logs = sandboxId ? data.logs[sandboxId] ?? [] : [];
    return json(res, 200, {
      sandboxId: sandboxId ?? "",
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
}

module.exports = {
  createServer,
};
