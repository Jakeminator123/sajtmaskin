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
const VERIFY_WORKSPACES_DIR = path.join(getDataDir(), "verify-workspaces");

const VERIFY_COMMANDS = {
  typecheck: "npx tsc --noEmit",
  build: "npx next build",
  lint: "npx eslint . --max-warnings=0",
};

const VERIFY_OUTPUT_CAP_BY_STAGE = {
  install: 16_000,
  typecheck: 12_000,
  build: 14_000,
  lint: 12_000,
  default: 12_000,
};

const runtimeChildren = new Map();
const inflightBootByChat = new Map();
const activeVerifyChatKeys = new Set();
const inflightVerifyByKey = new Map();
let verifyQueue = Promise.resolve();

const proxy = httpProxy.createProxyServer({
  xfwd: true,
  ws: true,
  changeOrigin: false,
});

function nowIso() {
  return new Date().toISOString();
}

function getSessionChatId(session) {
  if (!session || typeof session !== "object") return "";
  if (typeof session.chatId === "string" && session.chatId.trim()) {
    return session.chatId.trim();
  }
  if (typeof session.projectId === "string" && session.projectId.trim()) {
    return session.projectId.trim();
  }
  return "";
}

function safeChatKey(chatId) {
  return encodeURIComponent(chatId);
}

function workspaceDirForChat(chatId) {
  return path.join(WORKSPACES_DIR, safeChatKey(chatId));
}

function workspaceDirForVerifyJob(chatId, verifyId) {
  return path.join(VERIFY_WORKSPACES_DIR, safeChatKey(chatId), verifyId);
}

function manifestPathForWorkspace(workspaceDir) {
  return path.join(workspaceDir, ".preview-host-files.json");
}

function dependencyStatePathForWorkspace(workspaceDir) {
  return path.join(workspaceDir, ".preview-host-deps.json");
}

function clipVerifyOutput(stage, rawOutput) {
  const normalized = String(rawOutput || "").trim();
  if (!normalized) return "";
  const cap = VERIFY_OUTPUT_CAP_BY_STAGE[stage] ?? VERIFY_OUTPUT_CAP_BY_STAGE.default;
  if (normalized.length <= cap) return normalized;
  const head = Math.floor(cap * 0.35);
  const tail = Math.max(0, cap - head - 64);
  const omitted = Math.max(0, normalized.length - head - tail);
  return [
    normalized.slice(0, head).trimEnd(),
    `...[${stage} output truncated: ${omitted} chars omitted]...`,
    normalized.slice(-tail).trimStart(),
  ]
    .filter(Boolean)
    .join("\n");
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

function isSessionUsable(session, nowMs = Date.now()) {
  if (!session || typeof session !== "object") return false;
  if (session.status === "destroyed") return false;
  const exp = Date.parse(session.sessionExpiresAt ?? "");
  if (Number.isFinite(exp) && nowMs > exp) {
    return false;
  }
  return true;
}

function findSessionByChatId(data, chatId) {
  const nowMs = Date.now();
  for (const session of Object.values(data.sessions)) {
    if (
      session &&
      getSessionChatId(session) === chatId &&
      isSessionUsable(session, nowMs)
    ) {
      return session;
    }
  }
  return null;
}

function listSessions(data) {
  const nowMs = Date.now();
  return Object.values(data.sessions).filter((session) => isSessionUsable(session, nowMs));
}

function routeInfoFromPathname(pathname) {
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length === 0) return null;
  const chatId = decodeURIComponent(parts[0]);
  const restPath = `/${parts.slice(1).join("/")}`;
  return {
    chatId,
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

async function resolvePortForChat(chatId, preferredPort) {
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
  const offset = hashString(chatId) % PORT_COUNT;
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

function isNoSpaceError(error) {
  if (!error) return false;
  if (error.code === "ENOSPC") return true;
  const msg = error instanceof Error ? error.message : String(error);
  return /ENOSPC|no space left on device/i.test(msg);
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

function runShellCommand(command, options) {
  return new Promise((resolve, reject) => {
    const child =
      process.platform === "win32"
        ? spawn("cmd.exe", ["/d", "/s", "/c", command], options)
        : spawn("sh", ["-lc", command], options);
    let output = "";
    child.stdout.on("data", (chunk) => {
      output += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      output += String(chunk);
    });
    child.once("error", reject);
    child.once("close", (code) => {
      resolve({
        exitCode: typeof code === "number" ? code : 1,
        output,
      });
    });
  });
}

function resolveInstallCommand(filesJson) {
  const hasPnpmLock = typeof filesJson?.["pnpm-lock.yaml"] === "string";
  if (hasPnpmLock) {
    return {
      command: "pnpm install --frozen-lockfile --no-optional",
      successLabel: "pnpm install passed.",
      logLabel: "pnpm install --frozen-lockfile",
    };
  }
  const hasPackageLock = typeof filesJson?.["package-lock.json"] === "string";
  if (hasPackageLock) {
    return {
      command: "npm ci --no-audit",
      successLabel: "npm ci passed.",
      logLabel: "npm ci --no-audit",
    };
  }
  return {
    command: "npm install --no-audit",
    successLabel: "npm install passed.",
    logLabel: "npm install --no-audit",
  };
}

/** Older exports without codegen repair: inject basePath hook so Fly /{chatId} previews get CSS/JS. */
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

function writeFilesIntoWorkspace(workspaceDir, filesJson) {
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

function writeWorkspaceFiles(chatId, filesJson) {
  return writeFilesIntoWorkspace(workspaceDirForChat(chatId), filesJson);
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

function projectOwnsLintSetup(filesJson) {
  const names = new Set(
    Object.keys(filesJson || {}).map((name) => name.replace(/\\/g, "/").toLowerCase()),
  );
  if (
    names.has("eslint.config.mjs") ||
    names.has("eslint.config.js") ||
    names.has("eslint.config.cjs") ||
    names.has(".eslintrc") ||
    names.has(".eslintrc.js") ||
    names.has(".eslintrc.cjs") ||
    names.has(".eslintrc.json")
  ) {
    return true;
  }

  const packageJson = typeof filesJson?.["package.json"] === "string" ? filesJson["package.json"] : null;
  if (!packageJson) return false;

  try {
    const parsed = JSON.parse(packageJson);
    const deps = {
      ...(parsed.dependencies || {}),
      ...(parsed.devDependencies || {}),
    };
    const depNames = Object.keys(deps);
    if (
      depNames.some(
        (name) =>
          name === "eslint" || name.startsWith("eslint-") || name.startsWith("@eslint/"),
      )
    ) {
      return true;
    }
    return typeof parsed.scripts?.lint === "string" && parsed.scripts.lint.trim().length > 0;
  } catch {
    return false;
  }
}

async function runInstallCommand(workspaceDir, sandboxId, filesJson) {
  const fingerprint = dependencyFingerprint(filesJson);
  const install = resolveInstallCommand(filesJson);
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
  await appendRuntimeLog(sandboxId, `Installing workspace dependencies with ${install.logLabel}.`);
  await new Promise((resolve, reject) => {
    const child = runShellCommand(install.command, {
      cwd: workspaceDir,
      stdio: ["ignore", "pipe", "pipe"],
      env: sanitizedEnv(),
    });
    child
      .then(async (result) => {
        if (result.exitCode === 0) {
          fs.writeFileSync(
            dependencyStatePathForWorkspace(workspaceDir),
            JSON.stringify({ fingerprint }, null, 2),
            "utf8",
          );
          await appendRuntimeLog(sandboxId, `${install.logLabel} completed.`);
          resolve();
          return;
        }
        await appendRuntimeLog(
          sandboxId,
          `${install.logLabel} failed.\n${trimSnippet(result.output || "")}`,
        );
        reject(new Error(`${install.logLabel} failed with exit code ${result.exitCode ?? "unknown"}`));
      })
      .catch(reject);
  });
}

async function runVerifyJob(params) {
  const { verifyId, chatId, versionId, filesJson, checks } = params;
  const workspaceDir = workspaceDirForVerifyJob(chatId, verifyId);
  const startedAt = Date.now();
  const jobStartedAtIso = new Date(startedAt).toISOString();
  let firstFailureCheck = null;

  function pushResult(entry) {
    const normalized = {
      durationMs: 0,
      ...entry,
    };
    if (firstFailureCheck === null && normalized.passed === false) {
      firstFailureCheck = normalized.check;
    }
    return normalized;
  }

  const runJob = async () => {
    try {
      writeFilesIntoWorkspace(workspaceDir, filesJson);
      const results = [];
      const install = resolveInstallCommand(filesJson);

      const installStartedAt = Date.now();
      const installResult = await runShellCommand(install.command, {
        cwd: workspaceDir,
        stdio: ["ignore", "pipe", "pipe"],
        env: sanitizedEnv(),
      });
      const installDurationMs = Date.now() - installStartedAt;
      const installOutput = clipVerifyOutput("install", installResult.output);
      results.push(
        pushResult({
          check: "install",
          passed: installResult.exitCode === 0,
          exitCode: installResult.exitCode,
          durationMs: installDurationMs,
          output:
            installResult.exitCode === 0
              ? install.successLabel
              : installOutput ||
                `(No install output captured; exit ${installResult.exitCode}).`,
        }),
      );
      if (installResult.exitCode !== 0) {
        const finishedAtIso = new Date().toISOString();
        return {
          verifyId,
          versionId,
          durationMs: Date.now() - startedAt,
          jobStartedAt: jobStartedAtIso,
          jobFinishedAt: finishedAtIso,
          firstFailureCheck,
          results,
        };
      }

      const ownsLintSetup = projectOwnsLintSetup(filesJson);
      for (const check of checks) {
        if (check === "lint" && !ownsLintSetup) {
          results.push(
            pushResult({
              check,
              passed: true,
              exitCode: 0,
              durationMs: 0,
              output:
                "Skipped lint: exported project does not include its own ESLint config or dependency set.",
            }),
          );
          continue;
        }
        const command = VERIFY_COMMANDS[check];
        if (!command) continue;
        const checkStartedAt = Date.now();
        const result = await runShellCommand(command, {
          cwd: workspaceDir,
          stdio: ["ignore", "pipe", "pipe"],
          env: sanitizedEnv(),
        });
        const durationMs = Date.now() - checkStartedAt;
        const output = clipVerifyOutput(check, result.output);
        const passed = result.exitCode === 0;
        results.push(
          pushResult({
            check,
            passed,
            exitCode: result.exitCode,
            durationMs,
            output:
              passed || output
                ? output
                : `(No ${check} output captured; exit ${result.exitCode}).`,
          }),
        );
      }

      const finishedAtIso = new Date().toISOString();
      return {
        verifyId,
        versionId,
        durationMs: Date.now() - startedAt,
        jobStartedAt: jobStartedAtIso,
        jobFinishedAt: finishedAtIso,
        firstFailureCheck,
        results,
      };
    } finally {
      await removeDirWithRetries(workspaceDir).catch(() => {});
    }
  };

  return withNoSpaceCleanupRetry(runJob);
}

function buildVerifyJobKey(params) {
  const checks = Array.isArray(params.checks) ? [...params.checks].sort().join(",") : "";
  return [
    params.chatId,
    params.versionId,
    checks,
    dependencyFingerprint(params.filesJson),
  ].join(":");
}

function runQueuedVerifyJob(params) {
  const jobKey = buildVerifyJobKey(params);
  const existing = inflightVerifyByKey.get(jobKey);
  if (existing) {
    return existing;
  }

  // Verify runs beside live previews on the same VM, so serialize jobs to avoid
  // duplicated installs/typechecks fighting for RAM and disk at the same time.
  const task = verifyQueue
    .catch(() => undefined)
    .then(async () => {
      const chatKey = safeChatKey(params.chatId);
      activeVerifyChatKeys.add(chatKey);
      try {
        return await runVerifyJob(params);
      } finally {
        activeVerifyChatKeys.delete(chatKey);
      }
    });

  inflightVerifyByKey.set(jobKey, task);
  verifyQueue = task.catch(() => undefined);

  return task.finally(() => {
    if (inflightVerifyByKey.get(jobKey) === task) {
      inflightVerifyByKey.delete(jobKey);
    }
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

async function stopTrackedRuntime(sessionId, sandboxId = null) {
  const tracked = runtimeChildren.get(sessionId);
  if (!tracked) return false;
  runtimeChildren.delete(sessionId);
  tracked.ignoreExit = true;
  await stopChildProcessTree(tracked.child);
  if (sandboxId) {
    await appendRuntimeLog(sandboxId, "Runtime stopped.");
  }
  return true;
}

async function stopRuntimeForSession(session) {
  await stopTrackedRuntime(session.sessionId, session.sandboxId);
}

async function spawnDevServer(session, workspaceDir, runtimePort) {
  const chatId = getSessionChatId(session);
  const basePath = `/${chatId}`;
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
    chatId,
    sandboxId: session.sandboxId,
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
    `Starting dev runtime on port ${runtimePort} for chat ${chatId}.`,
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
    const chatId = getSessionChatId(session);
    const runBoot = async () => {
      const workspaceDir = writeWorkspaceFiles(chatId, session.filesJson);
      patchNextConfigForPreviewBasePath(workspaceDir);
      const runtimePort = await resolvePortForChat(chatId, Number(session.runtimePort));
      await runInstallCommand(workspaceDir, session.sandboxId, session.filesJson);
      await spawnDevServer(session, workspaceDir, runtimePort);

      await updateSessionById(session.sessionId, (stored) => {
        stored.status = "warm_project";
        stored.runtimePort = runtimePort;
        stored.updatedAt = nowIso();
      });

      waitForReady(`http://${LOOPBACK}:${runtimePort}/${encodeURIComponent(chatId)}/`)
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
    };

    return await withNoSpaceCleanupRetry(runBoot, {
      onRetry: async () => {
        await appendRuntimeLog(
          session.sandboxId,
          "Preview-host disk full; cleaning stale workspaces and retrying runtime boot once.",
        );
        const tracked = runtimeChildren.get(session.sessionId);
        if (tracked) {
          await stopRuntimeForSession(session);
        }
      },
    });
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

async function ensureRuntimeForChat(chatId, options = {}) {
  const existing = inflightBootByChat.get(chatId);
  if (existing) {
    return existing;
  }
  const run = (async () => {
    const data = readStoreSync();
    const session = findSessionByChatId(data, chatId);
    if (!session) return null;
    const result = await bootRuntimeForSession(session, options);
    return { session, runtimePort: result.runtimePort };
  })();
  inflightBootByChat.set(chatId, run);
  try {
    return await run;
  } finally {
    inflightBootByChat.delete(chatId);
  }
}

function queueRuntimeBoot(chatId, options = {}) {
  void ensureRuntimeForChat(chatId, options).catch(() => {
    // Failure is already written into session/log state by bootRuntimeForSession.
  });
}

function getRuntimeStateForChat(chatId) {
  const session = findSessionByChatId(readStoreSync(), chatId);
  if (!session) {
    return { session: null, running: false, booting: false, runtimePort: null };
  }
  const tracked = runtimeChildren.get(session.sessionId);
  const running = Boolean(tracked && tracked.child.exitCode === null);
  const booting = inflightBootByChat.has(chatId) || session.status === "starting";
  return {
    session,
    running,
    booting,
    runtimePort: tracked?.port ?? (Number.isFinite(Number(session.runtimePort)) ? Number(session.runtimePort) : null),
  };
}

/**
 * Next dev is started with SAJTMASKIN_PREVIEW_BASE_PATH=/{chatId}, so it expects
 * paths like /{chatId}/ and /{chatId}/_next/... — not stripped to / only.
 */
function rewriteRequestUrl(req, chatId, restPath, search) {
  const prefix = `/${encodeURIComponent(chatId)}`;
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
      <p class="muted">Chat: <code>${getSessionChatId(session)}</code></p>
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
  const state = getRuntimeStateForChat(info.chatId);
  if (!state.session) return false;
  if (state.running && state.runtimePort) {
    rewriteRequestUrl(req, info.chatId, info.restPath, search);
    proxy.web(req, res, { target: `http://${LOOPBACK}:${state.runtimePort}` });
    return true;
  }
  queueRuntimeBoot(info.chatId);
  sendRuntimeStartingPage(res, state.session);
  return true;
}

async function proxyPreviewUpgrade(req, socket, head, pathname, search = "") {
  const info = routeInfoFromPathname(pathname);
  if (!info) return false;
  const runtime = await ensureRuntimeForChat(info.chatId);
  if (!runtime) return false;
  rewriteRequestUrl(req, info.chatId, info.restPath, search);
  proxy.ws(req, socket, head, { target: `ws://${LOOPBACK}:${runtime.runtimePort}` });
  return true;
}

async function hibernateChatRuntime(chatId) {
  const data = readStoreSync();
  const session = findSessionByChatId(data, chatId);
  if (!session) return null;
  await stopRuntimeForSession(session);
  return session;
}

async function destroyChatWorkspace(chatId) {
  await removeDirWithRetries(workspaceDirForChat(chatId));
}

proxy.on("error", (err, req, res) => {
  const isHttpResponse = res && typeof res.writeHead === "function";

  if (isConnRefusedError(err) && isHttpResponse) {
    const rawUrl = req?.url || "/";
    const pathname = String(rawUrl).split("?")[0] || "/";
    const info = routeInfoFromPathname(pathname);
    if (info) {
      const session = findSessionByChatId(readStoreSync(), info.chatId);
      if (session) {
        void (async () => {
          try {
            await stopRuntimeForSession(session);
          } catch {
            // ignore; boot will attempt recovery
          } finally {
            queueRuntimeBoot(info.chatId, { restart: true });
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
  const snapshot = readStoreSync();
  const preservedSessionIds = new Set();
  const preservedWorkspaceEntries = new Set();
  const preservedSandboxIds = new Set();
  let stoppedRuntimes = 0;

  for (const [sessionId, tracked] of runtimeChildren.entries()) {
    const session = snapshot.sessions[sessionId] ?? null;
    if (session && isSessionUsable(session, nowMs)) {
      continue;
    }

    const sandboxId =
      (typeof session?.sandboxId === "string" && session.sandboxId.trim()) ||
      (typeof tracked.sandboxId === "string" && tracked.sandboxId.trim()) ||
      "";
    try {
      if (sandboxId) {
        await appendRuntimeLog(
          sandboxId,
          "Cleanup stopping stale runtime before removing session/workspace.",
        );
      }
      const stopped = await stopTrackedRuntime(sessionId, sandboxId || null);
      if (stopped) {
        stoppedRuntimes += 1;
      }
    } catch (error) {
      preservedSessionIds.add(sessionId);
      if (typeof tracked.chatId === "string" && tracked.chatId.trim()) {
        preservedWorkspaceEntries.add(safeChatKey(tracked.chatId));
      }
      if (sandboxId) {
        preservedSandboxIds.add(sandboxId);
        await appendRuntimeLog(
          sandboxId,
          `Cleanup could not stop stale runtime: ${error instanceof Error ? error.message : "unknown error"}`,
        ).catch(() => {});
      }
    }
  }

  return {
    preservedSessionIds,
    preservedWorkspaceEntries,
    preservedSandboxIds,
    stoppedRuntimes,
  };
}

async function cleanupPreviewHostStorage() {
  const nowMs = Date.now();
  const staleRuntimeCleanup = await stopStaleRuntimes(nowMs);
  const activeWorkspaceEntries = new Set(staleRuntimeCleanup.preservedWorkspaceEntries);
  const activeSandboxIds = new Set(staleRuntimeCleanup.preservedSandboxIds);
  let removedSessions = 0;
  let removedLogs = 0;
  let removedMappings = 0;

  await withStoreLock((data) => {
    for (const [sessionId, session] of Object.entries(data.sessions)) {
      if (
        isSessionUsable(session, nowMs) ||
        staleRuntimeCleanup.preservedSessionIds.has(sessionId)
      ) {
        const chatId = getSessionChatId(session);
        if (chatId) {
          activeWorkspaceEntries.add(safeChatKey(chatId));
        }
        if (typeof session.sandboxId === "string" && session.sandboxId.trim()) {
          activeSandboxIds.add(session.sandboxId.trim());
        }
        continue;
      }

      removedSessions++;
      delete data.sessions[sessionId];

      const sandboxId =
        typeof session?.sandboxId === "string" && session.sandboxId.trim()
          ? session.sandboxId.trim()
          : "";
      if (sandboxId && data.sandboxToSession[sandboxId] === sessionId) {
        delete data.sandboxToSession[sandboxId];
        removedMappings++;
      }
    }

    for (const [sandboxId, sessionId] of Object.entries(data.sandboxToSession)) {
      if (!data.sessions[sessionId]) {
        delete data.sandboxToSession[sandboxId];
        removedMappings++;
      }
    }

    for (const sandboxId of Object.keys(data.logs)) {
      if (!activeSandboxIds.has(sandboxId)) {
        delete data.logs[sandboxId];
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

  return {
    freedVerifyEntries: verifyResult.freedEntries,
    freedWorkspaceEntries: workspaceResult.freedEntries,
    removedSessions,
    removedLogs,
    removedMappings,
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
    await cleanupPreviewHostStorage();
    return run();
  }
}

module.exports = {
  buildPreviewUrl(baseUrl, chatId) {
    return `${baseUrl.replace(/\/$/, "")}/${encodeURIComponent(chatId)}`;
  },
  ensureRuntimeForChat,
  getRuntimeStateForChat,
  getSessionChatId,
  queueRuntimeBoot,
  proxyPreviewRequest,
  proxyPreviewUpgrade,
  findSessionByChatId,
  listSessions,
  hibernateChatRuntime,
  destroyChatWorkspace,
  runQueuedVerifyJob,
  runVerifyJob,
  stopRuntimeForSession,
  cleanupPreviewHostStorage,
};
