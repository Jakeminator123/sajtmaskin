"use strict";

// Sajtmaskin preview guest agent. Runs INSIDE one customer project's own Fly
// Machine (SM-080). The control plane (preview-host) is the only client:
// every request must carry the per-machine bearer token that the control
// plane generated when it created the machine. The agent owns the project's
// workspaces, runs install/verify commands and the single `next dev`
// process, and proxies browser traffic to that process on loopback.
//
// Trust model:
//   - No host secret, API key or other project's data exists on this machine.
//   - The dev server binds 127.0.0.1 only; siblings on the private network
//     reach nothing without the token, and the token never leaves the control
//     plane's store and this machine's environment.
//   - Identity is proven, not assumed: `/health` reports the chatId this
//     machine was created for and the control plane refuses any mismatch.
//
// Fail-closed: without a token and chatId the agent refuses to start.

const http = require("node:http");
const path = require("node:path");
const { timingSafeEqual } = require("node:crypto");
const httpProxy = require("http-proxy");

const {
  copyDirectory,
  isSafeRelativePath,
  isValidWorkspaceName,
  patchWorkspace,
  readDependencyState,
  readWorkspaceFile,
  removeWorkspace,
  workspaceDirFor,
  writeDependencyState,
  writeWorkspaceSnapshot,
} = require("./lib/workspace.js");
const { childEnv, createDevProcessManager, runCommand } = require("./lib/process.js");

const AGENT_NAME = "sajtmaskin-preview-guest";
const AGENT_VERSION = "1";
const FILE_READ_MAX_BYTES = 4 * 1024 * 1024;
const BODY_MAX_BYTES = 48 * 1024 * 1024;
const EXEC_TIMEOUT_MAX_MS = 30 * 60 * 1000;
const WARM_STATE_NAME = ".sajtmaskin-warm.json";

function readIntEnv(name, fallback) {
  const parsed = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function loadConfig(env = process.env) {
  const token = typeof env.SAJTMASKIN_GUEST_TOKEN === "string" ? env.SAJTMASKIN_GUEST_TOKEN.trim() : "";
  const chatId = typeof env.SAJTMASKIN_GUEST_CHAT_ID === "string" ? env.SAJTMASKIN_GUEST_CHAT_ID.trim() : "";
  const problems = [];
  if (token.length < 16) problems.push("SAJTMASKIN_GUEST_TOKEN missing or shorter than 16 characters");
  if (!chatId) problems.push("SAJTMASKIN_GUEST_CHAT_ID missing");
  return {
    token,
    chatId,
    problems,
    port: readIntEnv("SAJTMASKIN_GUEST_PORT", 7070),
    bindHost: env.SAJTMASKIN_GUEST_BIND?.trim() || "0.0.0.0",
    root: path.resolve(env.SAJTMASKIN_GUEST_ROOT?.trim() || "/workspace"),
    devPort: readIntEnv("SAJTMASKIN_GUEST_DEV_PORT", 3000),
    warmDir: path.resolve(env.SAJTMASKIN_GUEST_WARM_DIR?.trim() || "/opt/sajtmaskin-warm"),
  };
}

function json(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(JSON.stringify(payload));
}

function tokenMatches(expected, presented) {
  if (typeof presented !== "string" || !presented) return false;
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(presented, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Either header may carry the token. Proxied browser traffic uses the
 * dedicated header so the browser's own `Authorization` passes through to
 * the project untouched; control calls use the bearer form.
 */
function requestHasToken(req, expected) {
  const alt = req.headers["x-sajtmaskin-guest-token"];
  if (typeof alt === "string" && tokenMatches(expected, alt.trim())) return true;
  const auth = req.headers.authorization ?? "";
  if (typeof auth === "string" && auth.startsWith("Bearer ")) {
    return tokenMatches(expected, auth.slice(7).trim());
  }
  return false;
}

/** Control routes are matched on the raw URL; dot segments are refused outright. */
function rawUrlHasDotSegment(rawUrl) {
  return /(^|\/)(\.|\.\.|%2e|%2e%2e|\.%2e|%2e\.)(\/|\?|$)/i.test(rawUrl);
}

async function readJsonBody(req) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > BODY_MAX_BYTES) throw new Error("Request body too large.");
    chunks.push(chunk);
  }
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new Error("Body must be valid JSON.");
  }
}

function createAgent(config) {
  const devProcess = createDevProcessManager();
  const proxy = httpProxy.createProxyServer({
    target: `http://127.0.0.1:${config.devPort}`,
    ws: true,
    xfwd: false,
  });
  proxy.on("error", (error, req, resOrSocket) => {
    const message = error instanceof Error ? error.message : "proxy error";
    if (resOrSocket && typeof resOrSocket.writeHead === "function") {
      if (!resOrSocket.headersSent) {
        json(resOrSocket, 502, { error: "guest_proxy_error", message });
      } else {
        try { resOrSocket.end(); } catch { /* closed */ }
      }
      return;
    }
    try { resOrSocket?.destroy?.(); } catch { /* closed */ }
  });

  function warmState() {
    try {
      const raw = require("node:fs").readFileSync(path.join(config.warmDir, WARM_STATE_NAME), "utf8");
      const parsed = JSON.parse(raw);
      return typeof parsed?.fingerprint === "string" ? parsed : null;
    } catch {
      return null;
    }
  }

  function workspaceDir(name) {
    if (!isValidWorkspaceName(name)) {
      const error = new Error(`Invalid workspace name: "${name}"`);
      error.statusCode = 400;
      throw error;
    }
    return workspaceDirFor(config.root, name);
  }

  function stripProxyPrefix(url) {
    const rest = url.slice("/proxy".length);
    return rest.startsWith("/") ? rest : `/${rest}`;
  }

  async function handle(req, res) {
    const rawUrl = req.url ?? "/";
    if (!requestHasToken(req, config.token)) {
      return json(res, 401, { error: "unauthorized" });
    }
    const method = String(req.method || "GET").toUpperCase();

    // Decide proxy vs control on the RAW url (same as the upgrade handler):
    // the project's own URLs may contain anything, while a control route must
    // be a clean path and never be reachable through a dot-segment rewrite.
    if (rawUrl === "/proxy" || rawUrl.startsWith("/proxy/")) {
      const status = devProcess.status();
      if (!status.running) {
        return json(res, 503, { error: "dev_not_running" });
      }
      delete req.headers["x-sajtmaskin-guest-token"];
      req.url = stripProxyPrefix(rawUrl);
      proxy.web(req, res);
      return undefined;
    }
    if (rawUrlHasDotSegment(rawUrl)) {
      return json(res, 400, { error: "bad_request", message: "Dot segments are not allowed." });
    }
    const url = new URL(rawUrl, "http://guest.invalid");
    const pathname = url.pathname;

    if (method === "GET" && pathname === "/health") {
      return json(res, 200, {
        ok: true,
        agent: AGENT_NAME,
        agentVersion: AGENT_VERSION,
        chatId: config.chatId,
        devPort: config.devPort,
        warm: warmState() ? { fingerprint: warmState().fingerprint } : null,
        dev: devProcess.status(),
        platform: process.platform,
        node: process.version,
      });
    }

    const wsMatch = pathname.match(/^\/workspaces\/([^/]+)(?:\/(.*))?$/);
    if (wsMatch) {
      const name = decodeURIComponent(wsMatch[1]);
      const sub = wsMatch[2] ?? "";
      const dir = workspaceDir(name);
      if (sub === "" && method === "PUT") {
        const body = await readJsonBody(req);
        const result = writeWorkspaceSnapshot(dir, body.files);
        return json(res, 200, { ok: true, workspace: name, ...result });
      }
      if (sub === "" && method === "PATCH") {
        const body = await readJsonBody(req);
        const result = patchWorkspace(dir, body.files ?? {}, body.removedPaths ?? []);
        return json(res, 200, { ok: true, workspace: name, ...result });
      }
      if (sub === "" && method === "DELETE") {
        if (name === "live") await devProcess.stop({ drainMs: 2000 });
        removeWorkspace(dir);
        return json(res, 200, { ok: true, workspace: name, removed: true });
      }
      if (sub === "file" && method === "GET") {
        const relPath = url.searchParams.get("path") ?? "";
        if (!isSafeRelativePath(relPath)) {
          return json(res, 400, { error: "unsafe_path" });
        }
        return json(res, 200, { ok: true, ...readWorkspaceFile(dir, relPath, FILE_READ_MAX_BYTES) });
      }
      if (sub === "state" && method === "GET") {
        const fs = require("node:fs");
        const probes = {};
        for (const probe of (url.searchParams.get("probe") ?? "").split(",").map((v) => v.trim()).filter(Boolean)) {
          if (!isSafeRelativePath(probe)) continue;
          probes[probe] = fs.existsSync(path.join(dir, ...probe.split("/")));
        }
        return json(res, 200, {
          ok: true,
          exists: fs.existsSync(dir),
          dependencyState: readDependencyState(dir),
          hasNodeModules: fs.existsSync(path.join(dir, "node_modules")),
          probes,
        });
      }
      if (sub === "deps-state" && method === "POST") {
        const body = await readJsonBody(req);
        if (typeof body.fingerprint !== "string" || !/^[a-f0-9]{64}$/i.test(body.fingerprint)) {
          return json(res, 400, { error: "invalid_fingerprint" });
        }
        writeDependencyState(dir, body.fingerprint.toLowerCase());
        return json(res, 200, { ok: true });
      }
      if (sub === "seed-node-modules" && method === "POST") {
        const body = await readJsonBody(req);
        const fingerprint = typeof body.fingerprint === "string" ? body.fingerprint.toLowerCase() : "";
        const from = body.from === "live" ? "live" : "warm";
        if (!fingerprint) return json(res, 200, { ok: true, seeded: false, reason: "missing_fingerprint" });
        const fs = require("node:fs");
        let sourceDir = null;
        if (from === "warm") {
          const warm = warmState();
          if (!warm || warm.fingerprint.toLowerCase() !== fingerprint) {
            return json(res, 200, { ok: true, seeded: false, reason: "fingerprint_mismatch" });
          }
          sourceDir = path.join(config.warmDir, "project", "node_modules");
        } else {
          const liveDir = workspaceDir("live");
          const liveState = readDependencyState(liveDir);
          if (!liveState || liveState.fingerprint.toLowerCase() !== fingerprint) {
            return json(res, 200, { ok: true, seeded: false, reason: "fingerprint_mismatch" });
          }
          sourceDir = path.join(liveDir, "node_modules");
        }
        if (!fs.existsSync(sourceDir)) {
          return json(res, 200, { ok: true, seeded: false, reason: "source_node_modules_missing" });
        }
        try {
          copyDirectory(sourceDir, path.join(dir, "node_modules"));
        } catch (error) {
          return json(res, 200, {
            ok: true,
            seeded: false,
            reason: `share_failed:${error instanceof Error ? error.message : "unknown"}`,
          });
        }
        writeDependencyState(dir, fingerprint);
        return json(res, 200, { ok: true, seeded: true, method: "copy", from });
      }
      if (sub === "exec" && method === "POST") {
        const body = await readJsonBody(req);
        if (typeof body.command !== "string" || !body.command.trim()) {
          return json(res, 400, { error: "missing_command" });
        }
        const timeoutMs = Math.min(
          Number.isFinite(body.timeoutMs) && body.timeoutMs > 0 ? body.timeoutMs : EXEC_TIMEOUT_MAX_MS,
          EXEC_TIMEOUT_MAX_MS,
        );
        require("node:fs").mkdirSync(dir, { recursive: true });
        const result = await runCommand(body.command, {
          cwd: dir,
          env: childEnv(body.env),
          timeoutMs,
        });
        return json(res, 200, { ok: true, ...result });
      }
      return json(res, 404, { error: "not_found" });
    }

    if (pathname === "/dev/start" && method === "POST") {
      const body = await readJsonBody(req);
      const dir = workspaceDir("live");
      require("node:fs").mkdirSync(dir, { recursive: true });
      const started = await devProcess.start({
        args: Array.isArray(body.args) ? body.args : ["run", "dev"],
        cwd: dir,
        env: childEnv({
          ...(body.env && typeof body.env === "object" ? body.env : {}),
          PORT: String(config.devPort),
          HOSTNAME: "127.0.0.1",
        }),
      });
      return json(res, 200, { ok: true, ...started });
    }
    if (pathname === "/dev/stop" && method === "POST") {
      const body = await readJsonBody(req);
      const result = await devProcess.stop({
        generation: Number.isSafeInteger(body.generation) ? body.generation : undefined,
        drainMs: Number.isFinite(body.drainMs) ? body.drainMs : undefined,
      });
      return json(res, 200, { ok: true, ...result });
    }
    if (pathname === "/dev/status" && method === "GET") {
      const since = Number.parseInt(url.searchParams.get("since") ?? "0", 10);
      return json(res, 200, { ok: true, ...devProcess.status({ since }) });
    }
    return json(res, 404, { error: "not_found" });
  }

  const server = http.createServer((req, res) => {
    handle(req, res).catch((error) => {
      const statusCode = Number.isInteger(error?.statusCode) ? error.statusCode : 400;
      if (!res.headersSent) {
        json(res, statusCode, {
          error: error?.code === "UNSAFE_WORKSPACE_PATH" ? "unsafe_path" : "bad_request",
          message: error instanceof Error ? error.message : "Unexpected guest error.",
        });
      } else {
        try { res.end(); } catch { /* closed */ }
      }
    });
  });
  server.on("upgrade", (req, socket, head) => {
    try {
      if (!requestHasToken(req, config.token)) {
        socket.write("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n");
        socket.destroy();
        return;
      }
      const url = req.url ?? "/";
      if (!(url === "/proxy" || url.startsWith("/proxy/"))) {
        socket.destroy();
        return;
      }
      if (!devProcess.status().running) {
        socket.write("HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\n\r\n");
        socket.destroy();
        return;
      }
      delete req.headers["x-sajtmaskin-guest-token"];
      req.url = stripProxyPrefix(url);
      proxy.ws(req, socket, head);
    } catch {
      try { socket.destroy(); } catch { /* closed */ }
    }
  });

  return { server, devProcess, config };
}

async function main() {
  const config = loadConfig();
  if (config.problems.length > 0) {
    console.error(`[preview-guest] refusing to start: ${config.problems.join("; ")}`);
    process.exit(2);
  }
  const { server, devProcess } = createAgent(config);
  server.listen(config.port, config.bindHost, () => {
    console.log(
      `[preview-guest] listening on http://${config.bindHost}:${config.port} for chat ${config.chatId} (root ${config.root})`,
    );
  });
  const shutdown = () => {
    devProcess.shutdown().finally(() => process.exit(0));
  };
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`[preview-guest] fatal: ${error instanceof Error ? error.stack : error}`);
    process.exit(1);
  });
}

module.exports = {
  AGENT_NAME,
  AGENT_VERSION,
  WARM_STATE_NAME,
  createAgent,
  loadConfig,
  tokenMatches,
};
