"use strict";

const fs = require("node:fs");
const net = require("node:net");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { createHash } = require("node:crypto");
const httpProxy = require("http-proxy");

const { getDataDir, readStoreSync, withStoreLock } = require("./store.js");

const LOOPBACK = "127.0.0.1";
const PORT_BASE = parseInt(process.env.PREVIEW_HOST_RUNTIME_PORT_BASE ?? "4100", 10);
const PORT_COUNT = parseInt(process.env.PREVIEW_HOST_RUNTIME_PORT_COUNT ?? "200", 10);
const READINESS_MAX_MS = parseInt(process.env.PREVIEW_HOST_RUNTIME_READY_MAX_MS ?? "180000", 10);
const READINESS_INTERVAL_MS = 1200;
const READINESS_EMPTY_BODY_MIN_CHARS = 50;
const READINESS_MAX_EMPTY_BODY_RETRIES = 5;
const WORKSPACES_DIR = path.join(getDataDir(), "workspaces");

const runtimeChildren = new Map();
const inflightBootByProject = new Map();

const proxy = httpProxy.createProxyServer({
  xfwd: true,
  ws: true,
  changeOrigin: false,
});

function nowIso() {
  return new Date().toISOString();
}

function safeProjectKey(projectId) {
  return encodeURIComponent(projectId);
}

function workspaceDirForProject(projectId) {
  return path.join(WORKSPACES_DIR, safeProjectKey(projectId));
}

function manifestPathForWorkspace(workspaceDir) {
  return path.join(workspaceDir, ".preview-host-files.json");
}

function dependencyStatePathForWorkspace(workspaceDir) {
  return path.join(workspaceDir, ".preview-host-deps.json");
}

async function appendRuntimeLog(sandboxId, message) {
  await withStoreLock((data) => {
    const lines = data.logs[sandboxId] ?? [];
    lines.push({ ts: nowIso(), message });
    data.logs[sandboxId] = lines.slice(-300);
  });
}

async function updateSessionById(sessionId, mutate) {
  return withStoreLock((data) => {
    const session = data.sessions[sessionId];
    if (!session) return null;
    mutate(session, data);
    return session;
  });
}

function findSessionByProjectId(data, projectId) {
  for (const session of Object.values(data.sessions)) {
    if (session && session.projectId === projectId) {
      return session;
    }
  }
  return null;
}

function listSessions(data) {
  return Object.values(data.sessions).filter(Boolean);
}

function routeInfoFromPathname(pathname) {
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length === 0) return null;
  const projectId = decodeURIComponent(parts[0]);
  const restPath = `/${parts.slice(1).join("/")}`;
  return {
    projectId,
    restPath: restPath === "/" ? "/" : restPath,
  };
}

function hashString(input) {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function portLooksFree(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close(() => resolve(true));
    });
    server.listen(port, LOOPBACK);
  });
}

async function resolvePortForProject(projectId, preferredPort) {
  const sessions = listSessions(readStoreSync());
  const usedPorts = new Set(
    sessions
      .map((session) => Number(session.runtimePort))
      .filter((port) => Number.isFinite(port) && port > 0),
  );
  if (Number.isFinite(preferredPort) && preferredPort > 0 && !usedPorts.has(preferredPort)) {
    if (await portLooksFree(preferredPort)) {
      return preferredPort;
    }
  }
  const offset = hashString(projectId) % PORT_COUNT;
  for (let i = 0; i < PORT_COUNT; i += 1) {
    const port = PORT_BASE + ((offset + i) % PORT_COUNT);
    if (usedPorts.has(port)) continue;
    if (await portLooksFree(port)) {
      return port;
    }
  }
  throw new Error("No free runtime ports available for preview-host.");
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

async function removeDirWithRetries(dirPath) {
  let lastError = null;
  for (let i = 0; i < 5; i += 1) {
    try {
      fs.rmSync(dirPath, { recursive: true, force: true });
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 400 * (i + 1)));
    }
  }
  if (lastError) {
    throw lastError;
  }
}

function readJsonIfExists(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

const ENV_ALLOWLIST = new Set([
  "PATH", "HOME", "USER", "SHELL", "LANG", "TERM",
  "NODE_ENV", "NODE_OPTIONS", "NODE_PATH",
  "NPM_CONFIG_REGISTRY", "NPM_CONFIG_CACHE",
  "HOSTNAME", "PORT",
  "NEXT_TELEMETRY_DISABLED",
  "SAJTMASKIN_PREVIEW_BASE_PATH",
  "TMPDIR", "TMP", "TEMP",
]);
const ENV_ALLOWLIST_PREFIXES = ["NEXT_PUBLIC_"];

function sanitizedEnv(overrides = {}) {
  const out = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value !== "string") continue;
    if (
      ENV_ALLOWLIST.has(key) ||
      ENV_ALLOWLIST_PREFIXES.some((prefix) => key.startsWith(prefix))
    ) {
      out[key] = value;
    }
  }
  for (const [key, value] of Object.entries(overrides)) {
    if (typeof value === "string") {
      out[key] = value;
    }
  }
  return out;
}

function spawnNpm(args, options) {
  if (process.platform === "win32") {
    return spawn("cmd.exe", ["/d", "/s", "/c", `npm ${args.join(" ")}`], options);
  }
  return spawn("npm", args, options);
}

/** Older exports without codegen repair: inject basePath hook so Fly /{projectId} previews get CSS/JS. */
function patchNextConfigForPreviewBasePath(workspaceDir) {
  const cfgPath = path.join(workspaceDir, "next.config.ts");
  if (!fs.existsSync(cfgPath)) return;
  let s = fs.readFileSync(cfgPath, "utf8");
  if (s.includes("SAJTMASKIN_PREVIEW_BASE_PATH")) return;
  if (/\bbasePath\s*:/.test(s)) return;
  const re = /(const\s+nextConfig\s*(?::\s*NextConfig\s*)?=\s*\{)/;
  if (!re.test(s)) return;
  const insert =
    "\n  ...(process.env.SAJTMASKIN_PREVIEW_BASE_PATH?.trim()\n    ? { basePath: process.env.SAJTMASKIN_PREVIEW_BASE_PATH.trim() }\n    : {}),";
  s = s.replace(re, `$1${insert}`);
  fs.writeFileSync(cfgPath, s, "utf8");
}

function writeWorkspaceFiles(projectId, filesJson) {
  const workspaceDir = workspaceDirForProject(projectId);
  ensureDir(workspaceDir);
  const priorManifest = readJsonIfExists(manifestPathForWorkspace(workspaceDir));
  const previousFiles = Array.isArray(priorManifest?.files) ? priorManifest.files : [];
  const nextFiles = Object.keys(filesJson);
  const nextSet = new Set(nextFiles);
  for (const relPath of previousFiles) {
    if (!nextSet.has(relPath)) {
      fs.rmSync(path.join(workspaceDir, relPath), { recursive: true, force: true });
    }
  }
  for (const [relPath, content] of Object.entries(filesJson)) {
    const absPath = path.join(workspaceDir, relPath);
    ensureDir(path.dirname(absPath));
    fs.writeFileSync(absPath, content, "utf8");
  }
  fs.writeFileSync(
    manifestPathForWorkspace(workspaceDir),
    JSON.stringify({ files: nextFiles }, null, 2),
    "utf8",
  );
  return workspaceDir;
}

function responseHeadersLookLikeHtmlDocument(res) {
  if (!res.ok) return false;
  const ct = res.headers.get("content-type")?.toLowerCase() ?? "";
  if (!ct.trim()) return true;
  return (
    ct.includes("text/html") ||
    ct.includes("text/x-component") ||
    ct.includes("application/xhtml+xml")
  );
}

function htmlBodyHasMeaningfulVisibleText(html) {
  let snippet = html;
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  if (bodyMatch) {
    snippet = bodyMatch[1];
  }
  const withoutScripts = snippet.replace(/<script[\s\S]*?<\/script>/gi, "");
  const withoutStyles = withoutScripts.replace(/<style[\s\S]*?<\/style>/gi, "");
  const visible = withoutStyles.replace(/<[^>]+>/g, "");
  return visible.trim().length >= READINESS_EMPTY_BODY_MIN_CHARS;
}

async function waitForReady(url) {
  const deadline = Date.now() + READINESS_MAX_MS;
  let lastError = "";
  let emptyBodyStreak = 0;
  while (Date.now() < deadline) {
    try {
      const ctrl = new AbortController();
      const tid = setTimeout(() => ctrl.abort(), 90_000);
      const res = await fetch(url, {
        method: "GET",
        redirect: "follow",
        signal: ctrl.signal,
        headers: { Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8" },
      });
      clearTimeout(tid);
      if (!responseHeadersLookLikeHtmlDocument(res)) {
        emptyBodyStreak = 0;
        lastError = `HTTP ${res.status}`;
        await new Promise((resolve) => setTimeout(resolve, READINESS_INTERVAL_MS));
        continue;
      }
      const text = await res.text();
      if (htmlBodyHasMeaningfulVisibleText(text)) {
        return;
      }
      emptyBodyStreak += 1;
      lastError = "HTTP 200 HTML but body text still empty (compiling or blank page)";
      if (emptyBodyStreak >= READINESS_MAX_EMPTY_BODY_RETRIES) {
        console.warn(
          `[preview-host] Readiness: HTML body still looks empty after ${READINESS_MAX_EMPTY_BODY_RETRIES} attempts; accepting response.`,
        );
        return;
      }
    } catch (err) {
      emptyBodyStreak = 0;
      lastError = err instanceof Error ? err.message : String(err);
    }
    await new Promise((resolve) => setTimeout(resolve, READINESS_INTERVAL_MS));
  }
  throw new Error(`Runtime did not become ready within ${READINESS_MAX_MS}ms. Last error: ${lastError}`);
}

function trimSnippet(input) {
  if (input.length <= 4000) return input;
  return input.slice(input.length - 4000);
}

function dependencyFingerprint(filesJson) {
  const hash = createHash("sha256");
  for (const key of ["package.json", "package-lock.json", "pnpm-lock.yaml", "yarn.lock"]) {
    if (typeof filesJson[key] === "string") {
      hash.update(key);
      hash.update("\n");
      hash.update(filesJson[key]);
      hash.update("\n");
    }
  }
  return hash.digest("hex");
}

async function runInstallCommand(workspaceDir, sandboxId, filesJson) {
  const fingerprint = dependencyFingerprint(filesJson);
  const nodeModulesDir = path.join(workspaceDir, "node_modules");
  const priorDeps = readJsonIfExists(dependencyStatePathForWorkspace(workspaceDir));
  if (
    fingerprint &&
    priorDeps &&
    priorDeps.fingerprint === fingerprint &&
    fs.existsSync(nodeModulesDir)
  ) {
    await appendRuntimeLog(sandboxId, "Skipping npm install; dependency fingerprint unchanged.");
    return;
  }
  await appendRuntimeLog(sandboxId, "Installing workspace dependencies with npm install --prefer-offline.");
  await new Promise((resolve, reject) => {
    const child = spawnNpm(["install", "--prefer-offline"], {
      cwd: workspaceDir,
      stdio: ["ignore", "pipe", "pipe"],
      env: sanitizedEnv(),
    });
    let snippet = "";
    child.stdout.on("data", (chunk) => {
      snippet = trimSnippet(`${snippet}\n${String(chunk)}`);
    });
    child.stderr.on("data", (chunk) => {
      snippet = trimSnippet(`${snippet}\n${String(chunk)}`);
    });
    child.once("error", reject);
    child.once("close", async (code) => {
      if (code === 0) {
        fs.writeFileSync(
          dependencyStatePathForWorkspace(workspaceDir),
          JSON.stringify({ fingerprint }, null, 2),
          "utf8",
        );
        await appendRuntimeLog(sandboxId, "npm install completed.");
        resolve();
        return;
      }
      await appendRuntimeLog(sandboxId, `npm install failed.\n${trimSnippet(snippet)}`);
      reject(new Error(`npm install failed with exit code ${code ?? "unknown"}`));
    });
  });
}

function stopChildProcessTree(child) {
  return new Promise((resolve) => {
    if (!child || child.exitCode !== null) {
      resolve();
      return;
    }
    if (process.platform === "win32") {
      const killer = spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"], {
        stdio: "ignore",
      });
      killer.once("close", () => resolve());
      return;
    }
    child.kill("SIGTERM");
    const timeout = setTimeout(() => {
      if (child.exitCode === null) {
        child.kill("SIGKILL");
      }
    }, 5000);
    child.once("close", () => {
      clearTimeout(timeout);
      resolve();
    });
  });
}

async function stopRuntimeForSession(session) {
  const tracked = runtimeChildren.get(session.sessionId);
  if (!tracked) return;
  runtimeChildren.delete(session.sessionId);
  tracked.ignoreExit = true;
  await stopChildProcessTree(tracked.child);
  await appendRuntimeLog(session.sandboxId, "Runtime stopped.");
}

async function spawnDevServer(session, workspaceDir, runtimePort) {
  const basePath = `/${session.projectId}`;
  const child = spawnNpm(
    ["run", "dev", "--", "--hostname", LOOPBACK, "--port", String(runtimePort)],
    {
      cwd: workspaceDir,
      stdio: ["ignore", "pipe", "pipe"],
      env: sanitizedEnv({
        PORT: String(runtimePort),
        HOSTNAME: LOOPBACK,
        SAJTMASKIN_PREVIEW_BASE_PATH: basePath,
      }),
    },
  );

  const tracked = {
    child,
    port: runtimePort,
    ignoreExit: false,
    workspaceDir,
  };
  runtimeChildren.set(session.sessionId, tracked);

  child.stdout.on("data", () => {
    // Avoid flooding the persistent log store with HMR/dev noise.
  });
  child.stderr.on("data", () => {
    // Avoid flooding the persistent log store with HMR/dev noise.
  });

  child.once("exit", async (code, signal) => {
    runtimeChildren.delete(session.sessionId);
    if (tracked.ignoreExit) return;
    await updateSessionById(session.sessionId, (stored) => {
      stored.status = "stopped";
      stored.updatedAt = nowIso();
    });
    await appendRuntimeLog(
      session.sandboxId,
      `Runtime exited (code=${code ?? "null"}, signal=${signal ?? "null"}).`,
    );
  });

  await appendRuntimeLog(
    session.sandboxId,
    `Starting dev runtime on port ${runtimePort} for project ${session.projectId}.`,
  );
}

async function bootRuntimeForSession(session, options = {}) {
  const restart = options.restart === true;
  if (!session.filesJson || typeof session.filesJson !== "object") {
    throw new Error("Session is missing filesJson for runtime boot.");
  }
  if (restart) {
    await stopRuntimeForSession(session);
  } else {
    const existing = runtimeChildren.get(session.sessionId);
    if (existing && existing.child.exitCode === null) {
      return { runtimePort: existing.port };
    }
  }

  await updateSessionById(session.sessionId, (stored) => {
    stored.status = "starting";
    stored.updatedAt = nowIso();
  });

  try {
    const workspaceDir = writeWorkspaceFiles(session.projectId, session.filesJson);
    patchNextConfigForPreviewBasePath(workspaceDir);
    const runtimePort = await resolvePortForProject(session.projectId, Number(session.runtimePort));
    await runInstallCommand(workspaceDir, session.sandboxId, session.filesJson);
    await spawnDevServer(session, workspaceDir, runtimePort);

    await updateSessionById(session.sessionId, (stored) => {
      stored.status = "warm_project";
      stored.runtimePort = runtimePort;
      stored.updatedAt = nowIso();
    });

    waitForReady(`http://${LOOPBACK}:${runtimePort}/${encodeURIComponent(session.projectId)}/`)
      .then(() =>
        appendRuntimeLog(
          session.sandboxId,
          `Runtime ready on http://${LOOPBACK}:${runtimePort}. Preview available at ${session.previewUrl}.`,
        ),
      )
      .catch((err) =>
        appendRuntimeLog(
          session.sandboxId,
          `Readiness probe timed out but runtime is still running: ${err instanceof Error ? err.message : "unknown"}`,
        ),
      );

    return { runtimePort };
  } catch (error) {
    await updateSessionById(session.sessionId, (stored) => {
      stored.status = "error";
      stored.updatedAt = nowIso();
    });
    await appendRuntimeLog(
      session.sandboxId,
      `Runtime boot failed: ${error instanceof Error ? error.message : "unknown error"}`,
    );
    const tracked = runtimeChildren.get(session.sessionId);
    if (tracked) {
      await stopRuntimeForSession(session);
    }
    throw error;
  }
}

async function ensureRuntimeForProject(projectId, options = {}) {
  const existing = inflightBootByProject.get(projectId);
  if (existing) {
    return existing;
  }
  const run = (async () => {
    const data = readStoreSync();
    const session = findSessionByProjectId(data, projectId);
    if (!session) return null;
    const result = await bootRuntimeForSession(session, options);
    return { session, runtimePort: result.runtimePort };
  })();
  inflightBootByProject.set(projectId, run);
  try {
    return await run;
  } finally {
    inflightBootByProject.delete(projectId);
  }
}

function queueRuntimeBoot(projectId, options = {}) {
  void ensureRuntimeForProject(projectId, options).catch(() => {
    // Failure is already written into session/log state by bootRuntimeForSession.
  });
}

function getRuntimeStateForProject(projectId) {
  const session = findSessionByProjectId(readStoreSync(), projectId);
  if (!session) {
    return { session: null, running: false, booting: false, runtimePort: null };
  }
  const tracked = runtimeChildren.get(session.sessionId);
  const running = Boolean(tracked && tracked.child.exitCode === null);
  const booting = inflightBootByProject.has(projectId) || session.status === "starting";
  return {
    session,
    running,
    booting,
    runtimePort: tracked?.port ?? (Number.isFinite(Number(session.runtimePort)) ? Number(session.runtimePort) : null),
  };
}

/**
 * Next dev is started with SAJTMASKIN_PREVIEW_BASE_PATH=/{projectId}, so it expects
 * paths like /{projectId}/ and /{projectId}/_next/... — not stripped to / only.
 */
function rewriteRequestUrl(req, projectId, restPath, search) {
  const prefix = `/${encodeURIComponent(projectId)}`;
  const tail = !restPath || restPath === "/" ? "" : restPath;
  req.url = `${prefix}${tail}${search || ""}`;
}

function sendRuntimeStartingPage(res, session) {
  if (!res || res.headersSent || res.writableEnded) return;
  res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
  res.end(`<!doctype html>
<html lang="sv">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Startar preview</title>
    <meta http-equiv="refresh" content="4" />
    <style>
      body { font-family: system-ui, sans-serif; margin: 0; background: #0b0b0d; color: #f5f5f5; display: grid; place-items: center; min-height: 100vh; }
      main { max-width: 40rem; padding: 2rem; text-align: center; }
      .muted { color: #a3a3a3; }
      code { background: rgba(255,255,255,0.08); padding: 0.15rem 0.4rem; border-radius: 0.4rem; }
    </style>
  </head>
  <body>
    <main>
      <h1>Startar preview</h1>
      <p class="muted">Preview-host bygger projektet och startar Next.js i bakgrunden. Sidan laddar om automatiskt om några sekunder.</p>
      <p class="muted">Projekt: <code>${session.projectId}</code></p>
      <p class="muted">Status: <code>${session.status}</code></p>
    </main>
  </body>
</html>`);
}

function isConnRefusedError(err) {
  if (!err) return false;
  if (err.code === "ECONNREFUSED") return true;
  const msg = err instanceof Error ? err.message : String(err);
  return /ECONNREFUSED/i.test(msg);
}

async function proxyPreviewRequest(req, res, pathname, search = "") {
  const info = routeInfoFromPathname(pathname);
  if (!info) return false;
  const state = getRuntimeStateForProject(info.projectId);
  if (!state.session) return false;
  if (state.running && state.runtimePort) {
    rewriteRequestUrl(req, info.projectId, info.restPath, search);
    proxy.web(req, res, { target: `http://${LOOPBACK}:${state.runtimePort}` });
    return true;
  }
  queueRuntimeBoot(info.projectId);
  sendRuntimeStartingPage(res, state.session);
  return true;
}

async function proxyPreviewUpgrade(req, socket, head, pathname, search = "") {
  const info = routeInfoFromPathname(pathname);
  if (!info) return false;
  const runtime = await ensureRuntimeForProject(info.projectId);
  if (!runtime) return false;
  rewriteRequestUrl(req, info.projectId, info.restPath, search);
  proxy.ws(req, socket, head, { target: `ws://${LOOPBACK}:${runtime.runtimePort}` });
  return true;
}

async function hibernateProject(projectId) {
  const data = readStoreSync();
  const session = findSessionByProjectId(data, projectId);
  if (!session) return null;
  await stopRuntimeForSession(session);
  return session;
}

async function destroyProjectWorkspace(projectId) {
  await removeDirWithRetries(workspaceDirForProject(projectId));
}

proxy.on("error", (err, req, res) => {
  const isHttpResponse = res && typeof res.writeHead === "function";

  if (isConnRefusedError(err) && isHttpResponse) {
    const rawUrl = req?.url || "/";
    const pathname = String(rawUrl).split("?")[0] || "/";
    const info = routeInfoFromPathname(pathname);
    if (info) {
      const session = findSessionByProjectId(readStoreSync(), info.projectId);
      if (session) {
        void (async () => {
          try {
            await stopRuntimeForSession(session);
          } catch {
            // ignore; boot will attempt recovery
          } finally {
            queueRuntimeBoot(info.projectId, { restart: true });
          }
        })();
        sendRuntimeStartingPage(res, session);
        return;
      }
    }
  }

  if (!isHttpResponse) {
    // WebSocket upgrade errors pass a Socket, not an HTTP response — just destroy it.
    if (res && typeof res.destroy === "function") res.destroy();
    return;
  }

  if (!res.headersSent) {
    res.writeHead(502, { "content-type": "application/json; charset=utf-8" });
  }
  if (!res.writableEnded) {
    res.end(
      JSON.stringify({
        error: "proxy_failed",
        message: err instanceof Error ? err.message : "Runtime proxy failed.",
      }),
    );
  }
});

module.exports = {
  buildPreviewUrl(baseUrl, projectId) {
    return `${baseUrl.replace(/\/$/, "")}/${encodeURIComponent(projectId)}`;
  },
  ensureRuntimeForProject,
  getRuntimeStateForProject,
  queueRuntimeBoot,
  proxyPreviewRequest,
  proxyPreviewUpgrade,
  findSessionByProjectId,
  hibernateProject,
  destroyProjectWorkspace,
  stopRuntimeForSession,
};
