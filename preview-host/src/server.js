"use strict";

const http = require("node:http");
const { URL } = require("node:url");
const { randomUUID } = require("node:crypto");
const { readStoreSync, withStoreLock } = require("./store.js");
const {
  validateStartPayload,
  validateUpdatePayload,
  validateSessionRefPayload,
} = require("./validate.js");

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
    projectId: session.projectId,
    versionId: session.versionId,
    previewUrl: session.previewUrl,
    status: session.status,
    lastAction: session.lastAction,
    changeClass: session.changeClass,
    startOutcome: session.startOutcome,
    sessionExpiresAt: session.sessionExpiresAt,
    updatedAt: session.updatedAt,
    createdAt: session.createdAt,
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

function checkApiKey(req, res) {
  const expected = process.env.PREVIEW_HOST_API_KEY?.trim();
  if (!expected) {
    return true;
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

  if (req.method === "GET" && url.pathname === "/") {
    return json(res, 200, {
      service: "preview-host",
      mode: "persistent",
      endpoints: [
        "GET /health",
        "POST /preview/session/start",
        "POST /preview/session/update",
        "POST /preview/session/hibernate",
        "POST /preview/session/destroy",
        "GET /preview/session/:id",
        "GET /preview/sandbox/:sandboxId/status",
        "GET /preview/logs/:sandboxId",
      ],
    });
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
      const running = session.status !== "hibernated" && session.status !== "destroyed";
      if (running) {
        session.sessionExpiresAt = sessionExpiresAtIso();
        session.updatedAt = nowIso();
      }
      return {
        type: "ok",
        running,
        sandboxId: session.sandboxId,
        previewUrl: session.previewUrl,
        versionId: session.versionId,
        status: session.status,
        sessionExpiresAt: session.sessionExpiresAt,
      };
    });
    if (statusResult.type === "missing") {
      return json(res, 404, {
        error: "session_not_found",
        message: "No active preview session for this sandbox id.",
      });
    }
    return json(res, 200, {
      ok: true,
      running: statusResult.running,
      sandboxId: statusResult.sandboxId,
      previewUrl: statusResult.previewUrl,
      versionId: statusResult.versionId,
      status: statusResult.status,
      sessionExpiresAt: statusResult.sessionExpiresAt,
    });
  }

  if (req.method === "POST" && url.pathname === "/preview/session/start") {
    const raw = await readJsonBody(req);
    const validated = validateStartPayload(raw);
    const created = await withStoreLock((data) => {
      const sessionId = randomUUID();
      const sandboxId = `sbx_${randomUUID()}`;
      const createdAt = nowIso();
      const sessionExpiresAt = sessionExpiresAtIso();
      const previewUrl = `${PREVIEW_BASE_URL.replace(/\/$/, "")}/${validated.projectId}`;

      const session = {
        sessionId,
        sandboxId,
        projectId: validated.projectId,
        versionId: validated.versionId,
        previewUrl,
        status: "warm_project",
        lastAction: "start",
        changeClass: validated.changeClass,
        startOutcome: "fresh",
        preferredBaseImage: validated.preferredBaseImage,
        dependencyFingerprint: validated.dependencyFingerprint,
        resumeStrategy: validated.resumeStrategy,
        filesJson: validated.filesJson,
        createdAt,
        updatedAt: createdAt,
        sessionExpiresAt,
      };

      data.sessions[sessionId] = session;
      data.sandboxToSession[sandboxId] = sessionId;
      appendLog(data, sandboxId, `Session created for project ${validated.projectId}.`);
      return session;
    });
    return json(res, 201, sessionResponse(created));
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
        session.filesJson = validated.filesJson;
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
    return json(res, 200, sessionResponse(updated));
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
      const { sessionId, sandboxId } = session;
      session.status = "destroyed";
      session.lastAction = "destroy";
      session.updatedAt = nowIso();
      appendLog(data, sandboxId, "Session destroyed.");
      delete data.sessions[sessionId];
      delete data.sandboxToSession[sandboxId];
      return { sessionId, sandboxId };
    });
    if (!destroyed) {
      return json(res, 404, {
        error: "session_not_found",
        message: "No preview session matched the provided id.",
      });
    }
    return json(res, 200, {
      destroyed: true,
      sessionId: destroyed.sessionId,
      sandboxId: destroyed.sandboxId,
    });
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

  return notFound(res);
}

function createServer() {
  return http.createServer(async (req, res) => {
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
