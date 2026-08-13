"use strict";

// Delade konstanter, delat muterbart runtime-state och tvärgående helpers för
// preview-hostens runtime-moduler. Ren extraktion ur runtime.js — ingen
// beteendeändring. Publika ytan re-exporteras oförändrad via ../runtime.js.

const fs = require("node:fs");
const fsp = require("node:fs/promises");
const net = require("node:net");
const path = require("node:path");
const { spawn } = require("node:child_process");

const { getDataDir, readStoreSync, withStoreLock } = require("./../store.js");

const LOOPBACK = "127.0.0.1";
const PORT_BASE = parseInt(process.env.PREVIEW_HOST_RUNTIME_PORT_BASE ?? "4100", 10);
const PORT_COUNT = parseInt(process.env.PREVIEW_HOST_RUNTIME_PORT_COUNT ?? "200", 10);
const WORKSPACES_DIR = path.join(getDataDir(), "workspaces");
const VERIFY_WORKSPACES_DIR = path.join(getDataDir(), "verify-workspaces");
// Package-manager caches live on the mounted volume, not the Fly rootfs.
//
// The rootfs is a small ephemeral layer (~8 GB) that nothing in this service
// ever reclaimed, while `/data` is the 20 GB volume the cleanup loop already
// owns. npm defaults its cache to `$HOME/.npm` (= `/root/.npm` on the VM), so
// every install of every generated project appended tarballs to the rootfs
// until it hit 0 bytes free — after which EVERY `npm install` died with
// `ENOSPC` (exit 228) and no preview could boot. `cleanupPreviewHostStorage()`
// could not help: it only reclaims `/data`, which still had 17 GB free.
// Pointing the caches at the volume puts them under the same budget and the
// same janitor. See `PACKAGE_CACHE_MAX_BYTES` for the size bound.
const PACKAGE_CACHE_DIR = path.join(getDataDir(), "package-caches");
const NPM_CACHE_DIR = path.join(PACKAGE_CACHE_DIR, "npm");
const PNPM_STORE_DIR = path.join(PACKAGE_CACHE_DIR, "pnpm");
const YARN_CACHE_DIR = path.join(PACKAGE_CACHE_DIR, "yarn");
// Yarn Berry (v2+) ignores `cacheFolder` whenever `enableGlobalCache` is on —
// which is the default in Yarn 4 — and writes to `globalFolder` instead
// (`~/.yarn/berry`). Redirecting only YARN_CACHE_FOLDER would therefore leave
// every Berry project's cache on the rootfs.
const YARN_GLOBAL_DIR = path.join(PACKAGE_CACHE_DIR, "yarn-berry");
// Corepack downloads the pinned package manager itself (`packageManager` in the
// generated project's package.json) and caches it under `$HOME/.cache/node/corepack`.
// The Dockerfile runs `corepack enable`, so this path is live on every install.
const COREPACK_HOME_DIR = path.join(PACKAGE_CACHE_DIR, "corepack");
// Belt and braces for anything that resolves its own default through the XDG
// spec rather than an explicit variable — notably pnpm's default store
// (`$XDG_DATA_HOME/pnpm/store`), which is what a pnpm build falls back to if
// its config key is ever wrong again.
const XDG_DATA_DIR = path.join(PACKAGE_CACHE_DIR, "xdg-data");
const XDG_CACHE_DIR = path.join(PACKAGE_CACHE_DIR, "xdg-cache");
// Upper bound for the whole package-cache tree. A warm cache makes installs
// much faster, so we keep it — but an unbounded one is what filled the rootfs.
// Exceeding this drops the cache wholesale on the next cleanup pass; npm
// simply refetches. 0 or negative disables the bound.
const PACKAGE_CACHE_MAX_BYTES = parseInt(
  process.env.PREVIEW_HOST_PACKAGE_CACHE_MAX_BYTES ?? `${6 * 1024 * 1024 * 1024}`,
  10,
);
// npm writes a debug log per failed run to `$npm_config_logs_dir` (default
// `<cache>/_logs`). Cap it so a crash-looping boot cannot spend the volume on
// logs of its own failures.
const NPM_LOGS_MAX_FILES = 20;

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
// Global install-kö (M#fly1): npm/pnpm/yarn install är den minnestyngsta fasen
// på VM:en. Verify-jobb är redan serialiserade sinsemellan (verifyQueue), men
// live-boot-installs för OLIKA chattar kunde köra parallellt med varandra och
// med verify-lanens install — Fly-loggarna 2026-07-02 visar `npm install`
// OOM-dödad två gånger under exakt det mönstret. Alla installs (boot + verify)
// går nu genom en gemensam kö med concurrency 1; fingerprint-oförändrade boots
// rör aldrig kön (de skippar install helt).
let installQueue = Promise.resolve();

/**
 * Runs `task` in the global install slot: it waits for the in-flight install
 * and holds off the next one.
 *
 * Package-cache purges have to take the same slot as installs. The cache is
 * shared mutable state, and an `rm -rf` landing between npm's "read tarball
 * from cache" and "unpack it" fails the install with a bogus ENOENT/EINTEGRITY
 * that looks like a broken project. The background sweep (every 10 min), the
 * opportunistic sweep and `POST /admin/cleanup` all run on timers or operator
 * whim, so without this they were free to fire mid-install.
 */
function runInInstallSlot(task) {
  const next = installQueue.catch(() => undefined).then(task);
  installQueue = next.catch(() => undefined);
  return next;
}
// Öppna preview-sockets (proxied HMR-WS eller host-hållna stubbar) per chat.
// En öppen socket ≈ en öppen iframe — idle-reapern stoppar aldrig en runtime
// som fortfarande har en betraktare, även om sidan inte genererar HTTP-trafik.
const activePreviewSocketsByChat = new Map();
// SM-044: när en live-runtime byts under en öppen iframe måste klienten göra
// en full document-reload. Preview-URL:en är stabil (hosten proxar /{chatId}/),
// så utan signal hydrerar gammal JS mot den nya processens HTML. Pending-flaggan
// fångar HMR-reconnects efter att proxade sockets dog med den gamla processen.
// Fail-safe: ingen socket / misslyckad write = samma beteende som före fixen.
// Pending måste överleva default install (10 min) + readiness (upp till 10 min
// på Fly). 20 min är en backstop; lyckad reloadPage rensar tidigare.
const pendingPreviewClientReloadByChat = new Map();
const PREVIEW_CLIENT_RELOAD_PENDING_MS = 20 * 60 * 1000;
const PREVIEW_CLIENT_RELOAD_PAYLOAD = JSON.stringify({
  type: "reloadPage",
  action: "reloadPage",
  data: "preview-runtime-swap",
});

function encodeUnmaskedWsTextFrame(payload) {
  const data = Buffer.from(payload, "utf8");
  const len = data.length;
  if (len >= 126) {
    throw new Error("preview reload payload too large for a 1-byte WS length");
  }
  const frame = Buffer.alloc(2 + len);
  frame[0] = 0x81;
  frame[1] = len;
  data.copy(frame, 2);
  return frame;
}

function clearPendingPreviewClientReload(chatId) {
  if (!chatId) return;
  const timeoutId = pendingPreviewClientReloadByChat.get(chatId);
  if (timeoutId) clearTimeout(timeoutId);
  pendingPreviewClientReloadByChat.delete(chatId);
}

function markPendingPreviewClientReload(chatId) {
  if (!chatId) return;
  clearPendingPreviewClientReload(chatId);
  const timeoutId = setTimeout(() => {
    pendingPreviewClientReloadByChat.delete(chatId);
  }, PREVIEW_CLIENT_RELOAD_PENDING_MS);
  if (typeof timeoutId.unref === "function") timeoutId.unref();
  pendingPreviewClientReloadByChat.set(chatId, timeoutId);
}

function hasPendingPreviewClientReload(chatId) {
  return Boolean(chatId) && pendingPreviewClientReloadByChat.has(chatId);
}

function requestPreviewClientReload(chatId) {
  if (!chatId) return { sent: 0 };
  const sockets = activePreviewSocketsByChat.get(chatId);
  if (!sockets || sockets.size === 0) return { sent: 0 };
  let frame;
  try {
    frame = encodeUnmaskedWsTextFrame(PREVIEW_CLIENT_RELOAD_PAYLOAD);
  } catch {
    return { sent: 0 };
  }
  let sent = 0;
  for (const socket of [...sockets]) {
    try {
      if (socket.destroyed === true) continue;
      if (socket.writable === false) continue;
      if (typeof socket.write !== "function") continue;
      socket.write(frame);
      sent += 1;
    } catch {
      // Fail-safe: missing the signal is the previous behavior.
    }
  }
  if (sent > 0) clearPendingPreviewClientReload(chatId);
  return { sent };
}

function registerPreviewSocket(chatId, socket, options = {}) {
  if (!chatId || !socket) return;
  let set = activePreviewSocketsByChat.get(chatId);
  if (!set) {
    set = new Set();
    activePreviewSocketsByChat.set(chatId, set);
  }
  set.add(socket);
  socket.once("close", () => {
    const current = activePreviewSocketsByChat.get(chatId);
    if (!current) return;
    current.delete(socket);
    if (current.size === 0) {
      activePreviewSocketsByChat.delete(chatId);
    }
  });
  // Only emit reloadPage once this socket has completed a WebSocket
  // handshake we own (the HMR stub). The proxied path calls this BEFORE
  // `proxy.ws` — writing a frame there would corrupt the upgrade.
  if (options.handshakeComplete === true && hasPendingPreviewClientReload(chatId)) {
    requestPreviewClientReload(chatId);
  }
}

function activePreviewSocketCount(chatId) {
  return activePreviewSocketsByChat.get(chatId)?.size ?? 0;
}

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

async function appendRuntimeLog(previewSessionId, message) {
  await withStoreLock((data) => {
    const lines = data.logs[previewSessionId] ?? [];
    lines.push({ ts: nowIso(), message });
    data.logs[previewSessionId] = lines.slice(-300);
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

// Asynchronous on purpose: this process also proxies every live preview, and
// the biggest tree it deletes is the package cache (several GB across hundreds
// of thousands of _cacache shards). A recursive `rmSync` there blocks the event
// loop for seconds, freezing every in-flight preview request — on the very code
// path that runs when the disk is already full.
async function removeDirWithRetries(dirPath) {
  let lastError = null;
  for (let i = 0; i < 5; i += 1) {
    try {
      await fsp.rm(dirPath, { recursive: true, force: true });
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
  "NPM_CONFIG_REGISTRY",
  // Cache locations: defaults come from packageCacheEnv(); listing them here
  // lets fly.toml / the host env redirect a cache without a code change.
  "NPM_CONFIG_CACHE", "PNPM_CONFIG_STORE_DIR",
  "YARN_CACHE_FOLDER", "YARN_GLOBAL_FOLDER",
  "COREPACK_HOME", "XDG_DATA_HOME", "XDG_CACHE_HOME",
  "HOSTNAME", "PORT",
  "NEXT_TELEMETRY_DISABLED",
  "SAJTMASKIN_PREVIEW_BASE_PATH",
  "SAJTMASKIN_PREVIEW_DISABLE_HMR",
  "SAJTMASKIN_PREVIEW_RUN_ID",
  "TMPDIR", "TMP", "TEMP",
]);
const ENV_ALLOWLIST_PREFIXES = ["NEXT_PUBLIC_"];

/**
 * Creates the package-cache directories on the volume. Best-effort: if the
 * volume is unavailable the install still runs, it just falls back to the
 * package manager's own default location.
 */
function ensurePackageCacheDirs() {
  for (const dir of [
    NPM_CACHE_DIR,
    PNPM_STORE_DIR,
    YARN_CACHE_DIR,
    YARN_GLOBAL_DIR,
    COREPACK_HOME_DIR,
    XDG_DATA_DIR,
    XDG_CACHE_DIR,
  ]) {
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch {
      // best-effort
    }
  }
}

/**
 * Every environment variable that moves a package manager's on-disk cache off
 * the rootfs and onto the volume.
 *
 * Each key here is the one the tool actually reads — verified against upstream
 * docs, because guessing costs a wedged VM:
 *   - npm      → `NPM_CONFIG_CACHE`
 *   - pnpm 11+ → `PNPM_CONFIG_STORE_DIR` (pnpm dropped `npm_config_*`, and
 *                plain `PNPM_STORE_DIR` was never a thing)
 *   - pnpm <11 → falls back to `$XDG_DATA_HOME/pnpm/store`
 *   - Yarn 1   → `YARN_CACHE_FOLDER`
 *   - Yarn 2+  → `YARN_GLOBAL_FOLDER` (global cache is the default and wins
 *                over `cacheFolder`)
 *   - Corepack → `COREPACK_HOME`
 */
function packageCacheEnv() {
  return {
    NPM_CONFIG_CACHE: NPM_CACHE_DIR,
    PNPM_CONFIG_STORE_DIR: PNPM_STORE_DIR,
    YARN_CACHE_FOLDER: YARN_CACHE_DIR,
    YARN_GLOBAL_FOLDER: YARN_GLOBAL_DIR,
    COREPACK_HOME: COREPACK_HOME_DIR,
    XDG_DATA_HOME: XDG_DATA_DIR,
    XDG_CACHE_HOME: XDG_CACHE_DIR,
  };
}

/**
 * Cache-pekande variabler som MÅSTE landa på volymen.
 *
 * Vilket värde som helst utanför datakatalogen återskapar exakt den bugg
 * `PACKAGE_CACHE_DIR` finns för att stänga.
 */
const CACHE_ENV_KEYS = new Set(Object.keys(packageCacheEnv()));

/** Ligger `value` inuti datakatalogen (och inte bara i en syskonmapp med samma prefix)? */
function isInsideDataDir(value) {
  if (typeof value !== "string" || !value.trim()) return false;
  const dataDir = path.resolve(getDataDir());
  const resolved = path.resolve(value.trim());
  return resolved === dataDir || resolved.startsWith(dataDir + path.sep);
}

function sanitizedEnv(overrides = {}) {
  const out = {};
  // Keep every package manager's cache on the mounted volume (see
  // PACKAGE_CACHE_DIR).
  Object.assign(out, packageCacheEnv());
  // pnpm 10+/11 blocks dependency build scripts by default (strictDepBuilds),
  // so `pnpm install` exits non-zero with ERR_PNPM_IGNORED_BUILDS for any
  // package that ships an install script — including @tailwindcss/oxide,
  // esbuild and sharp. These preview VMs are ephemeral and already run the
  // generated project's own code via `next dev`, so approving dependency
  // builds adds no meaningful attack surface here. Allow them so native deps
  // actually build/resolve instead of crash-looping the boot.
  out.PNPM_CONFIG_DANGEROUSLY_ALLOW_ALL_BUILDS = "true";
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value !== "string") continue;
    if (
      ENV_ALLOWLIST.has(key) ||
      ENV_ALLOWLIST_PREFIXES.some((prefix) => key.startsWith(prefix))
    ) {
      // En ärvd cache-variabel får inte flytta cachen av volymen. Den var
      // tidigare tillåten att vinna över `packageCacheEnv()`, vilket gör hela
      // fixen ovan verkningslös: `NPM_CONFIG_CACHE=/root/.npm` i host-miljön
      // (npm:s egen default, lätt att ärva från en basbild eller ett
      // `fly secrets`-misstag) lägger tillbaka varje tarball på den efemära
      // rootfs:en. Janitorn städar bara datakatalogen, så disken fylls tyst
      // tills varje `npm install` dör med ENOSPC — medan volymen har gott om
      // plats. Ett värde inuti volymen respekteras fortfarande; allt annat
      // ignoreras till förmån för den beräknade sökvägen.
      if (CACHE_ENV_KEYS.has(key) && !isInsideDataDir(value)) {
        console.warn(
          `[runtime] Ignoring ${key}=${value} — cache must live under ${getDataDir()}; using ${out[key]}`,
        );
        continue;
      }
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

function killShellCommandTree(child, useProcessGroup) {
  try {
    if (process.platform === "win32") {
      spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"], { stdio: "ignore" });
      return;
    }
    if (useProcessGroup) {
      // Negative pid = kill the whole process group (sh + npm + its children).
      // Killing only the sh wrapper would orphan the actual npm process.
      process.kill(-child.pid, "SIGKILL");
      return;
    }
    child.kill("SIGKILL");
  } catch {
    /* already exited */
  }
}

/**
 * Run a shell command. `options.timeoutMs` (opt-in) hard-kills the whole
 * process tree after the deadline and resolves with `timedOut: true` and a
 * non-zero exit code — the promise ALWAYS settles. Without it, a hung child
 * (e.g. a generated `preinstall` script that never exits) would hold its
 * caller forever; with the global install queue that would wedge every later
 * boot/verify install VM-wide (VADE/Codex P1 on PR #357).
 */
function runShellCommand(command, options) {
  const { timeoutMs, timeoutLabel, ...spawnOptions } = options ?? {};
  const hasTimeout = Number.isFinite(timeoutMs) && timeoutMs > 0;
  // A process group lets the timeout kill sh AND its descendants on unix.
  const useProcessGroup = hasTimeout && process.platform !== "win32";
  return new Promise((resolve, reject) => {
    const child =
      process.platform === "win32"
        ? spawn("cmd.exe", ["/d", "/s", "/c", command], spawnOptions)
        : spawn("sh", ["-lc", command], {
            ...spawnOptions,
            ...(useProcessGroup ? { detached: true } : {}),
          });
    let output = "";
    let timedOut = false;
    let timer = null;
    if (hasTimeout) {
      timer = setTimeout(() => {
        timedOut = true;
        killShellCommandTree(child, useProcessGroup);
      }, timeoutMs);
      timer.unref?.();
    }
    child.stdout.on("data", (chunk) => {
      output += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      output += String(chunk);
    });
    child.once("error", (err) => {
      if (timer) clearTimeout(timer);
      reject(err);
    });
    child.once("close", (code) => {
      if (timer) clearTimeout(timer);
      if (timedOut) {
        resolve({
          exitCode: 124,
          output:
            `${output}\n[preview-host] ${timeoutLabel ?? "Command"} timed out after ` +
            `${Math.round(timeoutMs / 1000)}s and was killed (fail-fast so the install queue advances).`,
          timedOut: true,
        });
        return;
      }
      resolve({
        exitCode: typeof code === "number" ? code : 1,
        output,
        timedOut: false,
      });
    });
  });
}

/**
 * Resolves the optional run id captured during /preview/session/{start,update}.
 * Returns the trimmed run id or `null`. Used to tag spawned-runtime env and
 * (per P26) to thread observability ids through preview-host logs.
 */
function runIdResolverFromSession(session) {
  if (!session || typeof session !== "object") return null;
  const raw = typeof session.runId === "string" ? session.runId.trim() : "";
  return raw || null;
}

/**
 * Fast Edit Lane Fas 4: when `SAJTMASKIN_PREVIEW_HMR_PROXY=true` the host proxies
 * the `_next/(webpack|turbopack)-hmr` WebSocket through to the live Next dev
 * server (true hot reload, no iframe refresh) instead of the no-op stub. Default
 * OFF — unset/`false` keeps today's behaviour exactly (HMR silenced + stubbed).
 * Reversible by toggling this single env var; no redeploy required to turn off.
 */
function isHmrProxyEnabled() {
  return (process.env.SAJTMASKIN_PREVIEW_HMR_PROXY ?? "").trim() === "true";
}

module.exports = {
  LOOPBACK,
  WORKSPACES_DIR,
  VERIFY_WORKSPACES_DIR,
  PACKAGE_CACHE_DIR,
  NPM_CACHE_DIR,
  PACKAGE_CACHE_MAX_BYTES,
  NPM_LOGS_MAX_FILES,
  runtimeChildren,
  inflightBootByChat,
  activeVerifyChatKeys,
  runInInstallSlot,
  registerPreviewSocket,
  activePreviewSocketCount,
  markPendingPreviewClientReload,
  clearPendingPreviewClientReload,
  requestPreviewClientReload,
  hasPendingPreviewClientReload,
  PREVIEW_CLIENT_RELOAD_PENDING_MS,
  nowIso,
  getSessionChatId,
  safeChatKey,
  workspaceDirForChat,
  workspaceDirForVerifyJob,
  manifestPathForWorkspace,
  dependencyStatePathForWorkspace,
  clipVerifyOutput,
  appendRuntimeLog,
  updateSessionById,
  isSessionUsable,
  findSessionByChatId,
  listSessions,
  routeInfoFromPathname,
  resolvePortForChat,
  ensureDir,
  removeDirWithRetries,
  readJsonIfExists,
  isNoSpaceError,
  ensurePackageCacheDirs,
  sanitizedEnv,
  spawnNpm,
  runShellCommand,
  runIdResolverFromSession,
  isHmrProxyEnabled,
};
