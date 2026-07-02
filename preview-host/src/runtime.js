"use strict";

const fs = require("node:fs");
const net = require("node:net");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { createHash } = require("node:crypto");
const httpProxy = require("http-proxy");
const acorn = require("acorn");

const { getDataDir, readStoreSync, withStoreLock } = require("./store.js");

const LOOPBACK = "127.0.0.1";
const PORT_BASE = parseInt(process.env.PREVIEW_HOST_RUNTIME_PORT_BASE ?? "4100", 10);
const PORT_COUNT = parseInt(process.env.PREVIEW_HOST_RUNTIME_PORT_COUNT ?? "200", 10);
const READINESS_MAX_MS = parseInt(process.env.PREVIEW_HOST_RUNTIME_READY_MAX_MS ?? "180000", 10);
const READINESS_INTERVAL_MS = 1200;
const READINESS_EMPTY_BODY_MIN_CHARS = 50;
const READINESS_MAX_EMPTY_BODY_RETRIES = 5;
// Drain-fönster mellan SIGTERM och SIGKILL när en runtime stoppas (t.ex. vid
// avsiktlig restart). Default 5000 ms = oförändrat beteende; höj för att låta
// pågående HTTP-svar hinna klart innan processen tvångsdödas (mildrar
// "socket hang up"/PU02 vid restart). Reversibelt via env.
const RUNTIME_DRAIN_MS = parseInt(process.env.PREVIEW_HOST_RUNTIME_DRAIN_MS ?? "5000", 10);
// Observability (README handoff #5): behåll en liten ringbuffert av senaste
// stdout/stderr-rader per runtime så att en tail kan ytliggöras i runtime-loggen
// vid onormal exit (i stället för att tystas helt).
const RUNTIME_OUTPUT_RING_MAX = 60;
const RUNTIME_OUTPUT_LINE_MAX = 500;
const RUNTIME_OUTPUT_EXIT_TAIL = 30;
const WORKSPACES_DIR = path.join(getDataDir(), "workspaces");
const VERIFY_WORKSPACES_DIR = path.join(getDataDir(), "verify-workspaces");

// Inspector-bridge (opt-in): injicera bridge-scriptet i HTML-svar BARA när
// klienten ber om det via `?inspect=1` OCH app-origin är konfigurerad. App-origin
// tas medvetet från EGEN env (inte query) för att undvika injektionshål. Utan
// env är injektionen helt inert → ingen beteendeförändring för dagens previews.
const INSPECT_APP_ORIGIN = (process.env.SAJTMASKIN_APP_ORIGIN || "").trim().replace(/\/+$/, "");
const INSPECT_BRIDGE_MAX_HTML_BYTES = 5 * 1024 * 1024;

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
  "SAJTMASKIN_PREVIEW_DISABLE_HMR",
  "SAJTMASKIN_PREVIEW_RUN_ID",
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
  const hasPnpmLock =
    typeof filesJson?.["pnpm-lock.yaml"] === "string" ||
    typeof filesJson?.["pnpm-lock.yml"] === "string";
  if (hasPnpmLock) {
    return {
      command: "pnpm install --frozen-lockfile --no-optional",
      successLabel: "pnpm install passed.",
      logLabel: "pnpm install --frozen-lockfile",
      fallbackCommand: "pnpm install --no-frozen-lockfile --no-optional",
      fallbackLogLabel: "pnpm install --no-frozen-lockfile",
      alwaysAllowFallback: true,
    };
  }
  const hasYarnLock = typeof filesJson?.["yarn.lock"] === "string";
  if (hasYarnLock) {
    return {
      command: "yarn install --frozen-lockfile --ignore-optional",
      successLabel: "yarn install passed.",
      logLabel: "yarn install --frozen-lockfile",
      fallbackCommand: "yarn install --ignore-optional",
      fallbackLogLabel: "yarn install",
      alwaysAllowFallback: true,
    };
  }
  const hasPackageLock = typeof filesJson?.["package-lock.json"] === "string";
  if (hasPackageLock) {
    return {
      command: "npm ci --no-audit",
      successLabel: "npm ci passed.",
      logLabel: "npm ci --no-audit",
      fallbackCommand: "npm ci --no-audit --legacy-peer-deps",
      fallbackLogLabel: "npm ci --no-audit --legacy-peer-deps",
    };
  }
  return {
    command: "npm install --no-audit",
    successLabel: "npm install passed.",
    logLabel: "npm install --no-audit",
    fallbackCommand: "npm install --no-audit --legacy-peer-deps",
    fallbackLogLabel: "npm install --no-audit --legacy-peer-deps",
  };
}

function isPeerDependencyInstallFailure(output) {
  const text = String(output || "");
  if (!text.trim()) return false;
  return (
    /ERESOLVE/i.test(text) ||
    /unable to resolve dependency tree/i.test(text) ||
    /peer dependency/i.test(text) ||
    /Conflicting peer dependency/i.test(text)
  );
}

async function runInstallCommandWithFallback(workspaceDir, install) {
  const env = sanitizedEnv();
  const runAttempt = async (command) => {
    const startedAt = Date.now();
    const result = await runShellCommand(command, {
      cwd: workspaceDir,
      stdio: ["ignore", "pipe", "pipe"],
      env,
    });
    return {
      ...result,
      durationMs: Date.now() - startedAt,
      clippedOutput: clipVerifyOutput("install", result.output),
    };
  };

  const primary = await runAttempt(install.command);
  if (primary.exitCode === 0) {
    return {
      passed: true,
      exitCode: 0,
      durationMs: primary.durationMs,
      output: install.successLabel,
      usedFallback: false,
      peerConflictDetected: false,
    };
  }

  const peerConflictDetected = isPeerDependencyInstallFailure(primary.output);
  if ((peerConflictDetected || install.alwaysAllowFallback) && install.fallbackCommand) {
    const fallback = await runAttempt(install.fallbackCommand);
    if (fallback.exitCode === 0) {
      const warning =
        peerConflictDetected
          ? `[quality-warning] Peer dependency conflict detected. Compatibility fallback used: ${install.fallbackLogLabel}.`
          : `[quality-warning] Primary install failed. Compatibility fallback used: ${install.fallbackLogLabel}.`;
      return {
        passed: true,
        exitCode: 0,
        durationMs: primary.durationMs + fallback.durationMs,
        output: [
          install.successLabel,
          warning,
        ].join("\n"),
        usedFallback: true,
        peerConflictDetected,
      };
    }

    return {
      passed: false,
      exitCode: fallback.exitCode,
      durationMs: primary.durationMs + fallback.durationMs,
      output: [
        `[primary] ${install.logLabel} failed:`,
        primary.clippedOutput || `(No install output captured; exit ${primary.exitCode}).`,
        "",
        `[fallback] ${install.fallbackLogLabel} failed:`,
        fallback.clippedOutput || `(No install output captured; exit ${fallback.exitCode}).`,
      ].join("\n"),
      usedFallback: true,
      peerConflictDetected,
    };
  }

  return {
    passed: false,
    exitCode: primary.exitCode,
    durationMs: primary.durationMs,
    output:
      primary.clippedOutput ||
      `(No install output captured; exit ${primary.exitCode}).`,
    usedFallback: false,
    peerConflictDetected,
  };
}

/** Inject basePath env hook so Fly /{chatId} previews get CSS/JS. Handles .ts/.mjs/.js and common export patterns.
 *
 * Injicerar även (när `SAJTMASKIN_PREVIEW_DISABLE_HMR === "true"`) en
 * `webpack`-mutator som filtrerar bort `HotModuleReplacementPlugin`.
 * Resultat: Next dev's webpack-HMR-klient genereras inte alls och försöker
 * inte upprätta `wss://vm-fly-jakem.fly.dev/<chatId>/_next/webpack-hmr`.
 * Det tystar console-spammet som annars dyker upp några ggr per sekund
 * eftersom Fly's edge-proxy inte alltid lyckas med WS-handshakes genom
 * chatId-prefix. Hot-reload tappas men preview-host gör full iframe-
 * reload via refreshToken vid varje generation ändå. */
// TODO(#4): Geist (and likely other recently-added Google Fonts) sometimes
// 404 in preview at `/<chatId>/_next/static/media/<hash>-s.p.woff2`. Suspected
// causes (timebox lapsed before reproducing live):
//   1. Next dev's font loader fetches the woff2 from Google Fonts at compile
//      time and caches it under `.next/static/media`. If the Fly machine has
//      restricted egress to fonts.gstatic.com / fonts.googleapis.com the
//      compiled `_next/static/media/*` references are stale/missing and 404.
//   2. The font loader's hashed asset path may not pick up the basePath we
//      inject via `SAJTMASKIN_PREVIEW_BASE_PATH`, so the <link rel="preload">
//      points at `/{chatId}/_next/static/media/...` but the asset only exists
//      at `/_next/static/media/...` (or vice versa).
// Bandage in place: `font-import-fixer.ts` rewrites `Geist`/`Geist_Mono` to
// `Inter`/`JetBrains_Mono` for generated layouts. Remove that bandage once the
// root cause here is fixed.
// En självkörande funktion bygger ett patch-objekt vid require-tid.
// Innehåller: basePath (när env satt) + webpack-mutator som tar bort
// HMR-plugin (när SAJTMASKIN_PREVIEW_DISABLE_HMR=true). Spread:as in
// i Next config med `...EXPRESSION`. Funkar för .js/.mjs/.ts.
const NEXT_CONFIG_ENV_SNIPPET =
  "(()=>{const o={};if(process.env.SAJTMASKIN_PREVIEW_BASE_PATH?.trim())o.basePath=process.env.SAJTMASKIN_PREVIEW_BASE_PATH.trim();if(process.env.SAJTMASKIN_PREVIEW_DISABLE_HMR===\"true\"){o.webpack=(c)=>{c.plugins=(c.plugins||[]).filter((p)=>!(p&&p.constructor&&p.constructor.name===\"HotModuleReplacementPlugin\"));return c;};}return o;})()";

function findNextConfigPath(workspaceDir) {
  const candidates = ["next.config.ts", "next.config.mjs", "next.config.js"];
  for (const name of candidates) {
    const p = path.join(workspaceDir, name);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

// Replaces TypeScript-only syntax with same-length whitespace so acorn (JS-only)
// can parse the result while AST node positions still map 1:1 onto the original
// source — letting us slice insertions back into the original file safely.
function stripTsToWhitespace(source) {
  function blank(match) {
    return match.replace(/[^\n]/g, " ");
  }
  let out = source;
  out = out.replace(/import\s+type\s+[^;]*;/g, blank);
  out = out.replace(/export\s+type\s+[^;]*;/g, blank);
  out = out.replace(/^\s*type\s+\w+\s*=\s*[^;]+;/gm, blank);
  out = out.replace(/^\s*interface\s+\w+[^{]*\{[\s\S]*?\n\}/gm, blank);
  out = out.replace(
    /(\b(?:const|let|var)\s+\w+)(\s*:\s*[\w.<>,\s|&[\]'"`]+?)(\s*=)/g,
    (_m, decl, ann, eq) => decl + ann.replace(/[^\n]/g, " ") + eq,
  );
  out = out.replace(/\bsatisfies\s+[\w.<>,\s|&[\]'"`]+/g, blank);
  out = out.replace(/\bas\s+[A-Z][\w.]*(?:<[^>]+>)?/g, blank);
  return out;
}

function findReturnedObjectExpression(node) {
  if (!node) return null;
  if (node.type === "ObjectExpression") return node;
  if (node.type !== "BlockStatement") return null;
  for (const stmt of node.body) {
    if (stmt.type === "ReturnStatement" && stmt.argument?.type === "ObjectExpression") {
      return stmt.argument;
    }
  }
  return null;
}

function findConfigObjectExpression(program) {
  const body = program.body || [];
  const varInits = new Map();
  for (const node of body) {
    if (node.type === "VariableDeclaration") {
      for (const decl of node.declarations) {
        if (
          decl.id?.type === "Identifier" &&
          decl.init?.type === "ObjectExpression"
        ) {
          varInits.set(decl.id.name, decl.init);
        }
      }
    }
  }
  for (const node of body) {
    if (node.type !== "ExportDefaultDeclaration") continue;
    const d = node.declaration;
    if (d.type === "ObjectExpression") return d;
    if (d.type === "Identifier" && varInits.has(d.name)) return varInits.get(d.name);
    if (
      d.type === "FunctionDeclaration" ||
      d.type === "FunctionExpression" ||
      d.type === "ArrowFunctionExpression"
    ) {
      const found = findReturnedObjectExpression(d.body);
      if (found) return found;
    }
  }
  for (const node of body) {
    if (node.type !== "ExpressionStatement") continue;
    const expr = node.expression;
    if (expr?.type !== "AssignmentExpression") continue;
    const { left, right } = expr;
    const isModuleExports =
      left.type === "MemberExpression" &&
      left.object?.type === "Identifier" &&
      left.object.name === "module" &&
      left.property?.type === "Identifier" &&
      left.property.name === "exports";
    if (!isModuleExports) continue;
    if (right.type === "ObjectExpression") return right;
    if (right.type === "Identifier" && varInits.has(right.name)) return varInits.get(right.name);
  }
  if (varInits.size > 0) {
    return varInits.values().next().value;
  }
  return null;
}

/**
 * AST-based next.config patcher. Handles five shapes:
 *   - `const cfg = { … }`
 *   - `const cfg: NextConfig = { … }`
 *   - `module.exports = { … }`
 *   - `export default { … }`
 *   - `export default function() { return { … } }`
 *
 * Returns `{ applied, reason?, file?, method? }` for inspection (used by the
 * snapshot test in scripts/test-patch.mjs). Callers that don't care about the
 * outcome can ignore the return value.
 */
function patchNextConfigViaAst(workspaceDir) {
  const cfgPath = findNextConfigPath(workspaceDir);
  if (!cfgPath) return { applied: false, reason: "no_config_file" };
  const original = fs.readFileSync(cfgPath, "utf8");
  if (original.includes("SAJTMASKIN_PREVIEW_BASE_PATH")) {
    return { applied: false, reason: "already_patched" };
  }
  if (/\bbasePath\s*:/.test(original)) {
    return { applied: false, reason: "basePath_already_present" };
  }

  const isTypeScript = cfgPath.endsWith(".ts");
  const parseable = isTypeScript ? stripTsToWhitespace(original) : original;
  let program;
  try {
    program = acorn.parse(parseable, {
      sourceType: "module",
      ecmaVersion: "latest",
      allowReturnOutsideFunction: true,
    });
  } catch (error) {
    return {
      applied: false,
      reason: `ast_parse_failed:${error instanceof Error ? error.message : "unknown"}`,
    };
  }

  const target = findConfigObjectExpression(program);
  if (!target) {
    return { applied: false, reason: "no_target_object" };
  }

  // target.start points at the opening `{` in the (preprocessed) source. Since
  // stripTsToWhitespace preserves byte offsets, the same offset is the `{` in
  // the original source — we slice in `\n  ...envSnippet,` right after it.
  const insertAt = target.start + 1;
  const patched =
    original.slice(0, insertAt) +
    `\n  ...${NEXT_CONFIG_ENV_SNIPPET},` +
    original.slice(insertAt);
  fs.writeFileSync(cfgPath, patched, "utf8");
  return { applied: true, method: "ast", file: path.basename(cfgPath) };
}

// Regex fallback retained for shapes the AST walker doesn't recognise (e.g.
// `withSentryConfig({...})`, `withMDX({...})` wrappers we haven't taught the
// AST walker about yet). Same skip rules as the AST patcher.
function patchNextConfigViaRegex(workspaceDir) {
  const cfgPath = findNextConfigPath(workspaceDir);
  if (!cfgPath) return { applied: false, reason: "no_config_file" };
  let s = fs.readFileSync(cfgPath, "utf8");
  if (s.includes("SAJTMASKIN_PREVIEW_BASE_PATH")) {
    return { applied: false, reason: "already_patched" };
  }
  if (/\bbasePath\s*:/.test(s)) {
    return { applied: false, reason: "basePath_already_present" };
  }
  const tries = [
    /(const\s+\w+\s*(?::\s*\w+\s*)?=\s*\{)/,
    /(export\s+default\s*\{)/,
    /(module\.exports\s*=\s*\{)/,
  ];
  for (const pattern of tries) {
    if (pattern.test(s)) {
      s = s.replace(pattern, `$1\n  ...${NEXT_CONFIG_ENV_SNIPPET},`);
      fs.writeFileSync(cfgPath, s, "utf8");
      return { applied: true, method: "regex", file: path.basename(cfgPath) };
    }
  }
  return { applied: false, reason: "no_pattern_matched" };
}

function patchNextConfigForPreviewBasePath(workspaceDir) {
  const astResult = patchNextConfigViaAst(workspaceDir);
  if (astResult.applied) return astResult;
  // Skip-reasons (already patched, basePath present, no config file) are
  // terminal — falling back to regex would either be a no-op or risk corrupting
  // an already-patched file. Only retry on parse/walker failure.
  const fallbackable =
    astResult.reason &&
    (astResult.reason.startsWith("ast_parse_failed") ||
      astResult.reason === "no_target_object");
  if (!fallbackable) return astResult;
  return patchNextConfigViaRegex(workspaceDir);
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

const BINARY_BASE64_PREFIX = "base64:";

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
    if (typeof content === "string" && content.startsWith(BINARY_BASE64_PREFIX)) {
      fs.writeFileSync(absPath, Buffer.from(content.slice(BINARY_BASE64_PREFIX.length), "base64"));
    } else {
      fs.writeFileSync(absPath, content, "utf8");
    }
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

/**
 * Fast Edit Lane: write ONLY the changed files into an existing workspace and
 * remove `removedPaths`, without deleting any other files. The manifest is
 * updated to the union of prior + changed minus removed so a later full boot
 * stays consistent. Does not touch the running dev process — Next dev's file
 * watcher lazily recompiles the changed route on the next request.
 */
function patchWorkspaceFiles(chatId, files, removedPaths = []) {
  const workspaceDir = workspaceDirForChat(chatId);
  ensureDir(workspaceDir);
  const priorManifest = readJsonIfExists(manifestPathForWorkspace(workspaceDir));
  const manifestSet = new Set(Array.isArray(priorManifest?.files) ? priorManifest.files : []);
  for (const relPath of removedPaths) {
    if (typeof relPath !== "string" || !relPath) continue;
    fs.rmSync(path.join(workspaceDir, relPath), { recursive: true, force: true });
    manifestSet.delete(relPath);
  }
  for (const [relPath, content] of Object.entries(files || {})) {
    const absPath = path.join(workspaceDir, relPath);
    ensureDir(path.dirname(absPath));
    if (typeof content === "string" && content.startsWith(BINARY_BASE64_PREFIX)) {
      fs.writeFileSync(absPath, Buffer.from(content.slice(BINARY_BASE64_PREFIX.length), "base64"));
    } else {
      fs.writeFileSync(absPath, content, "utf8");
    }
    manifestSet.add(relPath);
  }
  fs.writeFileSync(
    manifestPathForWorkspace(workspaceDir),
    JSON.stringify({ files: Array.from(manifestSet) }, null, 2),
    "utf8",
  );
  return workspaceDir;
}

const PATCH_DEP_CRITICAL_PATHS = new Set([
  "package.json",
  "package-lock.json",
  "pnpm-lock.yaml",
  "pnpm-lock.yml",
  "yarn.lock",
]);

/**
 * Returns true when any of the supplied paths is dependency/config-critical and
 * therefore requires a full runtime restart (npm install and/or Next config
 * reload) rather than a hot file patch. `.env*` is included because Next reads
 * env only at boot.
 */
function patchTouchesStructuralPath(paths) {
  for (const relPath of paths) {
    const p = String(relPath || "").replace(/\\/g, "/").trim().toLowerCase();
    if (!p) continue;
    if (PATCH_DEP_CRITICAL_PATHS.has(p)) return true;
    if (/^next\.config\.(?:js|cjs|mjs|ts)$/.test(p)) return true;
    if (/^tsconfig(?:\.[\w.-]+)?\.json$/.test(p)) return true;
    if (p === ".env" || p.startsWith(".env.")) return true;
    if (/^(?:postcss|tailwind)\.config\.[\w.-]+$/.test(p)) return true;
  }
  return false;
}

/**
 * Apply a Fast Edit Lane patch to the live runtime for a chat.
 * - Structural/config change -> full restart (npm install / config reload).
 * - Runtime not running, OR a (re)boot already in flight -> force a restart boot
 *   from the merged session filesJson (caller merges before invoking this).
 * - Otherwise -> write only the changed files; leave the dev process alive.
 * - On a synchronous workspace-write failure (e.g. ENOSPC) -> return
 *   `{ mode: "error" }` so the caller can roll the session back instead of
 *   advertising a version that never actually landed on disk.
 */
function applyRuntimePatch(chatId, { files, removedPaths } = {}) {
  const changed = files && typeof files === "object" ? files : {};
  const removed = Array.isArray(removedPaths) ? removedPaths : [];
  const allPaths = [...Object.keys(changed), ...removed];
  if (patchTouchesStructuralPath(allPaths)) {
    queueRuntimeBoot(chatId, { restart: true });
    return { mode: "restarted", reason: "structural_change" };
  }
  const runtimeState = getRuntimeStateForChat(chatId);
  if (!runtimeState.running || runtimeState.booting) {
    // Not running / still cold-booting -> a plain non-restart boot would dedupe
    // to an in-flight boot that may have already snapshotted the pre-patch
    // filesJson, so the VM could come up serving stale files even though the
    // session was advanced.
    //
    // FEL-4: even when the OLD dev process is still alive (`running === true`)
    // but a restart boot is already in flight (`booting === true`), a hot file
    // write races that boot — the boot may rewrite the whole workspace from a
    // pre-patch snapshot and clobber the patched files. In both cases force a
    // restart boot: ensureRuntimeForChat waits for any in-flight boot to finish,
    // then re-boots from the merged filesJson the caller already committed.
    queueRuntimeBoot(chatId, { restart: true });
    return {
      mode: "booted",
      reason: runtimeState.running ? "runtime_booting" : "runtime_not_running",
    };
  }
  try {
    patchWorkspaceFiles(chatId, changed, removed);
  } catch (error) {
    // Surface the failure so the patch route can roll the session back (the
    // dev process is still serving the pre-patch files). ENOSPC messages flow
    // back to the app client, which triggers /admin/cleanup + one retry.
    return {
      mode: "error",
      reason: error instanceof Error ? error.message : "Workspace patch write failed.",
    };
  }
  return { mode: "patched", reason: null };
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
  for (const key of ["package.json", "package-lock.json", "pnpm-lock.yaml", "pnpm-lock.yml", "yarn.lock"]) {
    if (typeof filesJson[key] === "string") {
      hash.update(key);
      hash.update("\n");
      hash.update(filesJson[key]);
      hash.update("\n");
    }
  }
  return hash.digest("hex");
}

function readDependencyFingerprintForWorkspace(workspaceDir) {
  const state = readJsonIfExists(dependencyStatePathForWorkspace(workspaceDir));
  if (!state || typeof state !== "object") return null;
  const fingerprint =
    typeof state.fingerprint === "string" && state.fingerprint.trim().length > 0
      ? state.fingerprint.trim()
      : null;
  return fingerprint;
}

function tryShareNodeModules(params) {
  const {
    sourceWorkspaceDir,
    targetWorkspaceDir,
    expectedFingerprint,
  } = params;
  if (!expectedFingerprint) {
    return { reused: false, reason: "missing_fingerprint" };
  }
  const sourceFingerprint = readDependencyFingerprintForWorkspace(sourceWorkspaceDir);
  if (!sourceFingerprint || sourceFingerprint !== expectedFingerprint) {
    return { reused: false, reason: "fingerprint_mismatch" };
  }

  const sourceNodeModules = path.join(sourceWorkspaceDir, "node_modules");
  const targetNodeModules = path.join(targetWorkspaceDir, "node_modules");
  if (!fs.existsSync(sourceNodeModules)) {
    return { reused: false, reason: "source_node_modules_missing" };
  }

  fs.rmSync(targetNodeModules, { recursive: true, force: true });

  try {
    fs.symlinkSync(
      sourceNodeModules,
      targetNodeModules,
      process.platform === "win32" ? "junction" : "dir",
    );
    return { reused: true, method: "symlink" };
  } catch {
    // fallback to copy below
  }

  try {
    fs.cpSync(sourceNodeModules, targetNodeModules, { recursive: true });
    return { reused: true, method: "copy" };
  } catch (error) {
    return {
      reused: false,
      reason: `share_failed:${error instanceof Error ? error.message : "unknown"}`,
    };
  }
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

async function runInstallCommand(workspaceDir, previewSessionId, filesJson) {
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
    await appendRuntimeLog(
      previewSessionId,
      `Skipping npm install; dependency fingerprint unchanged (${fingerprint.slice(0, 12)}).`,
    );
    return;
  }
  const priorFingerprint =
    priorDeps && typeof priorDeps.fingerprint === "string"
      ? priorDeps.fingerprint.slice(0, 12)
      : "none";
  await appendRuntimeLog(
    previewSessionId,
    `Dependency fingerprint changed (prior=${priorFingerprint}, next=${fingerprint.slice(0, 12)}); installing with ${install.logLabel}.`,
  );
  const installResult = await runInstallCommandWithFallback(workspaceDir, install);
  if (installResult.passed) {
    fs.writeFileSync(
      dependencyStatePathForWorkspace(workspaceDir),
      JSON.stringify({ fingerprint }, null, 2),
      "utf8",
    );
    if (installResult.usedFallback) {
      const fallbackReason = installResult.peerConflictDetected
        ? "encountered peer dependency conflicts"
        : "primary install failed";
      await appendRuntimeLog(
        previewSessionId,
        `${install.logLabel} ${fallbackReason}; fallback ${install.fallbackLogLabel} succeeded.`,
      );
      await appendRuntimeLog(
        previewSessionId,
        trimSnippet(installResult.output || install.successLabel),
      );
    } else {
      await appendRuntimeLog(previewSessionId, `${install.logLabel} completed.`);
    }
    return;
  }

  await appendRuntimeLog(
    previewSessionId,
    `${install.logLabel} failed.\n${trimSnippet(installResult.output || "")}`,
  );
  throw new Error(
    `${install.logLabel} failed with exit code ${installResult.exitCode ?? "unknown"}`,
  );
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
      const fingerprint = dependencyFingerprint(filesJson);
      const shareNodeModulesResult = tryShareNodeModules({
        sourceWorkspaceDir: workspaceDirForChat(chatId),
        targetWorkspaceDir: workspaceDir,
        expectedFingerprint: fingerprint,
      });
      if (shareNodeModulesResult.reused) {
        results.push(
          pushResult({
            check: "install-cache-share",
            passed: true,
            exitCode: 0,
            durationMs: 0,
            output: `Reused node_modules from live workspace via ${shareNodeModulesResult.method}.`,
          }),
        );
      } else if (shareNodeModulesResult.reason !== "missing_fingerprint") {
        results.push(
          pushResult({
            check: "install-cache-share",
            passed: true,
            exitCode: 0,
            durationMs: 0,
            output: `Skipped node_modules reuse: ${shareNodeModulesResult.reason}.`,
          }),
        );
      }
      const installResult = await runInstallCommandWithFallback(workspaceDir, install);
      results.push(
        pushResult({
          check: "install",
          passed: installResult.passed,
          exitCode: installResult.exitCode,
          durationMs: installResult.durationMs,
          output:
            installResult.passed
              ? install.successLabel
              : installResult.output ||
                `(No install output captured; exit ${installResult.exitCode ?? "unknown"}).`,
        }),
      );
      if (!installResult.passed) {
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
      if (shareNodeModulesResult.reused) {
        fs.writeFileSync(
          dependencyStatePathForWorkspace(workspaceDir),
          JSON.stringify({ fingerprint }, null, 2),
          "utf8",
        );
      }
      if (installResult.usedFallback && installResult.peerConflictDetected) {
        results.push(
          pushResult({
            check: "install-peer-fallback",
            passed: true,
            exitCode: 0,
            durationMs: 0,
            output: `Peer dependency conflict detected; fallback used: ${install.fallbackLogLabel}.`,
          }),
        );
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
    const drainMs =
      Number.isFinite(RUNTIME_DRAIN_MS) && RUNTIME_DRAIN_MS >= 0 ? RUNTIME_DRAIN_MS : 5000;
    const timeout = setTimeout(() => {
      if (child.exitCode === null) {
        child.kill("SIGKILL");
      }
    }, drainMs);
    child.once("close", () => {
      clearTimeout(timeout);
      resolve();
    });
  });
}

async function stopTrackedRuntime(sessionId, previewSessionId = null) {
  const tracked = runtimeChildren.get(sessionId);
  if (!tracked) return false;
  runtimeChildren.delete(sessionId);
  tracked.ignoreExit = true;
  await stopChildProcessTree(tracked.child);
  if (previewSessionId) {
    await appendRuntimeLog(previewSessionId, "Runtime stopped.");
  }
  return true;
}

async function stopRuntimeForSession(session) {
  await stopTrackedRuntime(session.sessionId, session.previewSessionId);
}

async function spawnDevServer(session, workspaceDir, runtimePort) {
  const chatId = getSessionChatId(session);
  const basePath = `/${chatId}`;
  const runId = runIdResolverFromSession(session);
  const child = spawnNpm(
    ["run", "dev", "--", "--hostname", LOOPBACK, "--port", String(runtimePort)],
    {
      cwd: workspaceDir,
      stdio: ["ignore", "pipe", "pipe"],
      env: sanitizedEnv({
        PORT: String(runtimePort),
        HOSTNAME: LOOPBACK,
        SAJTMASKIN_PREVIEW_BASE_PATH: basePath,
        // Default-on: tystar webpack-HMR-WS i preview-VM så Chrome-konsolen
        // inte spammas med "WebSocket connection ... failed". Hot-reload
        // tappas men sajten reload:as ändå vid varje generation. Sätt till
        // "false" för att återaktivera HMR (t.ex. när man debuggar VM:en
        // direkt). Fast Edit Lane Fas 4: när HMR-proxyn är på tvingar vi
        // DISABLE_HMR=false så Next behåller HMR-pluginen och emitterar events
        // som proxyn vidarebefordrar (true hot reload utan iframe-reload).
        SAJTMASKIN_PREVIEW_DISABLE_HMR: isHmrProxyEnabled()
          ? "false"
          : (process.env.SAJTMASKIN_PREVIEW_DISABLE_HMR ?? "true"),
        ...(runId ? { SAJTMASKIN_PREVIEW_RUN_ID: runId } : {}),
      }),
    },
  );

  const tracked = {
    child,
    port: runtimePort,
    ignoreExit: false,
    workspaceDir,
    chatId,
    previewSessionId: session.previewSessionId,
    // (D) Ringbuffert av senaste Next.js-output. Live-loggning av allt dev-brus
    // (HMR m.m.) skulle flooda store:n; vi behåller bara en tail i minnet och
    // flushar den vid onormal exit så boot-/runtime-fel blir synliga.
    recentOutput: [],
  };
  runtimeChildren.set(session.sessionId, tracked);

  const captureRuntimeOutput = (chunk) => {
    const text = String(chunk);
    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.trimEnd();
      if (!line) continue;
      tracked.recentOutput.push(
        line.length > RUNTIME_OUTPUT_LINE_MAX ? `${line.slice(0, RUNTIME_OUTPUT_LINE_MAX)}…` : line,
      );
    }
    if (tracked.recentOutput.length > RUNTIME_OUTPUT_RING_MAX) {
      tracked.recentOutput.splice(0, tracked.recentOutput.length - RUNTIME_OUTPUT_RING_MAX);
    }
  };
  child.stdout.on("data", captureRuntimeOutput);
  child.stderr.on("data", captureRuntimeOutput);

  child.once("exit", async (code, signal) => {
    runtimeChildren.delete(session.sessionId);
    if (tracked.ignoreExit) return;
    await updateSessionById(session.sessionId, (stored) => {
      stored.status = "stopped";
      stored.stoppedAt = nowIso();
      stored.updatedAt = nowIso();
    });
    await appendRuntimeLog(
      session.previewSessionId,
      `Runtime exited (code=${code ?? "null"}, signal=${signal ?? "null"}).`,
    );
    // (D) Endast vid onormal exit (krasch/boot-fel) — rena stopp sätter
    // `ignoreExit` och returnerar ovan, så hibernate/destroy/restart dumpar inget.
    if (tracked.recentOutput.length > 0) {
      const tail = tracked.recentOutput.slice(-RUNTIME_OUTPUT_EXIT_TAIL).join("\n");
      await appendRuntimeLog(
        session.previewSessionId,
        `Last Next.js output before exit (tail):\n${tail}`,
      );
    }
  });

  await appendRuntimeLog(
    session.previewSessionId,
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
    const stoppedAt = Date.parse(session.stoppedAt ?? "");
    if (Number.isFinite(stoppedAt) && Date.now() - stoppedAt < 5000) {
      throw new Error("Runtime stopped recently; waiting before retry.");
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
      await runInstallCommand(workspaceDir, session.previewSessionId, session.filesJson);
      await spawnDevServer(session, workspaceDir, runtimePort);

      await updateSessionById(session.sessionId, (stored) => {
        stored.status = "warm_project";
        stored.runtimePort = runtimePort;
        stored.updatedAt = nowIso();
      });

      waitForReady(`http://${LOOPBACK}:${runtimePort}/${encodeURIComponent(chatId)}/`)
        .then(() =>
          appendRuntimeLog(
            session.previewSessionId,
            `Runtime ready on http://${LOOPBACK}:${runtimePort}. Preview available at ${session.previewUrl}.`,
          ),
        )
        .catch((err) =>
          appendRuntimeLog(
            session.previewSessionId,
            `Readiness probe timed out but runtime is still running: ${err instanceof Error ? err.message : "unknown"}`,
          ),
        );

      return { runtimePort };
    };

    return await withNoSpaceCleanupRetry(runBoot, {
      onRetry: async () => {
        await appendRuntimeLog(
          session.previewSessionId,
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
      session.previewSessionId,
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
  // When a `restart: true` boot is requested while a non-restart boot is
  // already in flight (e.g. /preview/session/update arriving while the
  // initial /preview/session/start boot is still running), we MUST NOT
  // dedupe to the existing one — the restart flag would silently be
  // dropped and the new files would never trigger `npm install`.
  // Instead, wait for the existing boot to finish (best-effort) and then
  // run a fresh boot with the restart flag applied.
  if (existing && options.restart !== true) {
    return existing;
  }
  if (existing && options.restart === true) {
    await existing.catch(() => undefined);
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
    if (inflightBootByChat.get(chatId) === run) {
      inflightBootByChat.delete(chatId);
    }
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

function sendRuntimeStartingPage(res, session, options = {}) {
  // Returnerar `true` om sidan faktiskt skrevs, annars `false` så att
  // anroparen (proxy.on("error")) kan avsluta/förstöra svaret i stället för
  // att lämna iframen hängande när headers/body redan delvis skickats.
  if (!res || res.headersSent || res.writableEnded) return false;
  const recovering = options.recovering === true;
  const heading = recovering ? "Startar om preview" : "Startar preview";
  const intro = recovering
    ? "Preview-runtimen startar om i bakgrunden. Sidan laddar om automatiskt om några sekunder."
    : "Preview-host bygger projektet och startar Next.js i bakgrunden. Sidan laddar om automatiskt om några sekunder.";
  res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
  res.end(`<!doctype html>
<html lang="sv">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${heading}</title>
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
      <h1>${heading}</h1>
      <p class="muted">${intro}</p>
      <p class="muted">Chat: <code>${getSessionChatId(session)}</code></p>
      <p class="muted">Status: <code>${session.status}</code></p>
    </main>
  </body>
</html>`);
  return true;
}

// Proxy-fel som indikerar att runtimen är nere ELLER har blivit en zombie som
// resettar mitt i ett svar. `socket hang up`/`ECONNRESET` är just det fall som
// gav rå `{"error":"proxy_failed"}` i iframen + Fly PU02 — vi vill recycla
// runtimen och servera den vänliga vänte-/omstartssidan i stället.
function isRecoverableProxyError(err) {
  if (!err) return false;
  const code = typeof err.code === "string" ? err.code : "";
  if (["ECONNREFUSED", "ECONNRESET", "ECONNABORTED", "EPIPE", "ETIMEDOUT"].includes(code)) {
    return true;
  }
  const msg = err instanceof Error ? err.message : String(err);
  return /ECONNREFUSED|ECONNRESET|ECONNABORTED|EPIPE|ETIMEDOUT|socket hang up|connection closed|aborted/i.test(
    msg,
  );
}

/**
 * P26: even when SAJTMASKIN_PREVIEW_DISABLE_HMR=true silences webpack's
 * HMR plugin, Next 15's app-router Fast Refresh ships its OWN client
 * (`next/dist/client/dev/hot-reloader/app/web-socket.js`) that attempts
 * `wss://vm-fly-jakem.fly.dev/<chatId>/_next/webpack-hmr` (or
 * `/_next/turbopack-hmr`). The client is bundled independently of
 * `HotModuleReplacementPlugin`, so removing that plugin does not silence
 * it. Previously we stubbed these paths with a 404 on upgrade, but the
 * browser's HMR client treats that as a connection failure and retries
 * every 2–5 seconds, spamming the console.
 *
 * Fix (2026-04-23): complete the WebSocket handshake (RFC 6455 101
 * Switching Protocols) ourselves and then hold the socket open as a
 * no-op — never send HMR events, silently drop any incoming frames.
 * Browser considers itself connected and stops retrying. Hot-reload
 * inside the preview VM is still disabled (Next's full reload on
 * every new generation via `refreshToken` takes care of that instead).
 *
 * We do the handshake inline rather than pulling in `ws` as a dep so
 * preview-host stays lean on Fly. Handshake = sha1(key + MAGIC) → base64.
 */
const HMR_PATH_RE = /\/_next\/(?:webpack|turbopack)-hmr(?:\/|$|\?)/;
const WS_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

function isHmrPath(pathname) {
  if (!pathname) return false;
  return HMR_PATH_RE.test(pathname);
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

function hmrSilencedForRequest() {
  // When the HMR proxy is enabled we must NOT silence/stub — let HMR paths flow
  // through the normal proxy to the runtime so Fast Refresh works end to end.
  if (isHmrProxyEnabled()) return false;
  return (process.env.SAJTMASKIN_PREVIEW_DISABLE_HMR ?? "true") === "true";
}

/**
 * Complete a WebSocket upgrade handshake ourselves and hold the socket
 * open without sending any frames. Returns `true` on success, `false` if
 * the request didn't look like a valid WebSocket upgrade (caller should
 * fall back to whatever 404/destroy path it would normally take).
 */
function acceptAndHoldWebSocket(req, socket) {
  const key = req.headers["sec-websocket-key"];
  if (typeof key !== "string" || key.length === 0) {
    return false;
  }
  const accept = createHash("sha1").update(key + WS_GUID).digest("base64");
  try {
    socket.write(
      "HTTP/1.1 101 Switching Protocols\r\n" +
      "Upgrade: websocket\r\n" +
      "Connection: Upgrade\r\n" +
      `Sec-WebSocket-Accept: ${accept}\r\n` +
      "\r\n",
    );
  } catch {
    return false;
  }
  try {
    socket.setNoDelay(true);
    socket.setKeepAlive(true, 30_000);
  } catch {
    // Non-fatal — socket options are best-effort.
  }
  const drop = () => { /* silently discard any incoming data */ };
  socket.on("data", drop);
  socket.on("error", () => {
    try { socket.destroy(); } catch { /* already closed */ }
  });
  return true;
}

/**
 * Returnerar `<script>`-taggen att injicera om requesten är ett opt-in
 * inspektera-anrop (`?inspect=1`) och app-origin är satt; annars `null`.
 * Script-källan kommer från preview-hostens EGEN env (`SAJTMASKIN_APP_ORIGIN`),
 * aldrig från query — så ingen kan be oss injicera en godtycklig origin.
 */
function inspectInjectionTag(search) {
  if (!INSPECT_APP_ORIGIN) return null;
  let qs = String(search || "");
  if (qs.startsWith("?")) qs = qs.slice(1);
  let on = false;
  try { on = new URLSearchParams(qs).get("inspect") === "1"; } catch { on = false; }
  if (!on) return null;
  return `<script src="${INSPECT_APP_ORIGIN}/api/inspect-bridge?parent=${encodeURIComponent(INSPECT_APP_ORIGIN)}"><\/script>`;
}

async function proxyPreviewRequest(req, res, pathname, search = "") {
  const info = routeInfoFromPathname(pathname);
  if (!info) return false;
  if (hmrSilencedForRequest() && isHmrPath(info.restPath)) {
    res.writeHead(404, { "Content-Type": "text/plain", "Connection": "close" });
    res.end("HMR disabled in tunneled preview");
    return true;
  }
  const state = getRuntimeStateForChat(info.chatId);
  if (!state.session) return false;
  if (state.running && state.runtimePort) {
    rewriteRequestUrl(req, info.chatId, info.restPath, search);
    const inspectTag = inspectInjectionTag(search);
    if (inspectTag) {
      // Buffra svaret själva (proxyRes-handlern injicerar scriptet före </body>).
      req.__inspectInjectTag = inspectTag;
      // Be uppströms-runtimen om OKOMPRIMERAD HTML — annars kan svaret komma
      // gzip:at (content-encoding) och proxyRes-handlern hoppar då injektionen
      // (icke-injicerbart), så inspektorn blir inert trots ?inspect=1.
      req.headers["accept-encoding"] = "identity";
      proxy.web(req, res, {
        target: `http://${LOOPBACK}:${state.runtimePort}`,
        selfHandleResponse: true,
      });
    } else {
      proxy.web(req, res, { target: `http://${LOOPBACK}:${state.runtimePort}` });
    }
    return true;
  }
  queueRuntimeBoot(info.chatId);
  sendRuntimeStartingPage(res, state.session);
  return true;
}

async function proxyPreviewUpgrade(req, socket, head, pathname, search = "") {
  const info = routeInfoFromPathname(pathname);
  if (!info) return false;
  if (hmrSilencedForRequest() && isHmrPath(info.restPath)) {
    // Complete the handshake and hold the socket open silently. Browser
    // sees a "connected" WebSocket and stops retry-spamming the console.
    // See `acceptAndHoldWebSocket` JSDoc for the full rationale (replaces
    // the earlier 404-stub which triggered the HMR client's retry loop).
    if (acceptAndHoldWebSocket(req, socket)) {
      return true;
    }
    // Malformed upgrade request (no Sec-WebSocket-Key); close the socket.
    try { socket.destroy(); } catch { /* already closed */ }
    return true;
  }
  // (B) HMR-WS under (re)boot: när HMR-proxyn är på men runtimen inte kör skulle
  // ett `proxy.ws` mot en ej-lyssnande port ge ECONNREFUSED → destroy →
  // klientens HMR-reconnect-storm (syns som Fly `[PU02] connection closed`-spam
  // under hela reboot-fönstret). Vänta i stället en boot (om ingen redan pågår)
  // och håll socketen tyst tills runtimen är uppe; nästa full-reload via
  // refreshToken plockar upp det nya innehållet.
  if (isHmrProxyEnabled() && isHmrPath(info.restPath)) {
    const state = getRuntimeStateForChat(info.chatId);
    // Unknown session: there is no preview session for this chatId, so there is
    // nothing to boot or hold open for. Close the socket instead of holding a
    // stale HMR connection (and instead of queueing a no-op boot for a session
    // that does not exist). Without this guard the `!state.running` branch below
    // would `acceptAndHoldWebSocket` an orphan socket indefinitely.
    if (!state.session) {
      try { socket.destroy(); } catch { /* already closed */ }
      return true;
    }
    if (!state.running) {
      if (!state.booting) queueRuntimeBoot(info.chatId);
      if (acceptAndHoldWebSocket(req, socket)) return true;
      try { socket.destroy(); } catch { /* already closed */ }
      return true;
    }
  }
  const runtime = await ensureRuntimeForChat(info.chatId);
  if (!runtime) return false;
  rewriteRequestUrl(req, info.chatId, info.restPath, search);
  // Next 16 dev (`blockCrossSiteDEV`) avvisar WS-upgrades till interna paths
  // (`/_next/*`, `/__nextjs*`) vars `Origin` inte matchar dev-serverns hostname
  // (här 127.0.0.1) eller `allowedDevOrigins`. Browserns HMR-socket skickar
  // `Origin: https://<fly-host>` → 403 → syns som 502 via Fly-edgen. Värre:
  // Next 16.2 levererar Reacts debugkanal (REACT_DEBUG_CHUNK) över samma
  // socket och HYDRERINGEN väntar på den — utan ansluten HMR-WS förblir
  // previewn död SSR-HTML (inga klick funkar). Origin-lösa upgrades släpps
  // igenom av Next ("Allow requests with no origin"), så vi strippar headern
  // för interna Next-paths. App-egna WS-endpoints lämnas orörda.
  if (isHmrPath(info.restPath) || info.restPath.startsWith("/_next/") || info.restPath.startsWith("/__nextjs")) {
    delete req.headers.origin;
  }
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

// Inspector-bridge-injektion: aktiv ENDAST när `req.__inspectInjectTag` satts
// (dvs `?inspect=1` + konfigurerad app-origin). Allt annat: ren passthrough så
// att dagens preview-beteende är oförändrat.
proxy.on("proxyRes", (proxyRes, req, res) => {
  const tag = req.__inspectInjectTag;
  if (!tag) return; // selfHandleResponse var av → http-proxy skriver själv

  const status = proxyRes.statusCode || 502;
  const headers = Object.assign({}, proxyRes.headers);
  const ct = String(headers["content-type"] || "").toLowerCase();
  const enc = String(headers["content-encoding"] || "").toLowerCase();
  const injectable = ct.includes("text/html") && (!enc || enc === "identity");

  if (!injectable) {
    // Icke-HTML eller komprimerat → ingen säker injektion, passthrough rakt av.
    if (!res.headersSent) res.writeHead(status, headers);
    proxyRes.pipe(res);
    return;
  }

  const chunks = [];
  let total = 0;
  let bailed = false;
  proxyRes.on("data", (chunk) => {
    if (bailed) return;
    total += chunk.length;
    if (total > INSPECT_BRIDGE_MAX_HTML_BYTES) {
      // För stort att buffra → spola ut det vi har och fall tillbaka till pipe.
      bailed = true;
      if (!res.headersSent) {
        delete headers["content-length"];
        res.writeHead(status, headers);
      }
      for (const c of chunks) res.write(c);
      res.write(chunk);
      proxyRes.pipe(res);
    } else {
      chunks.push(chunk);
    }
  });
  proxyRes.on("end", () => {
    if (bailed) { try { res.end(); } catch { /* redan stängd */ } return; }
    let body = Buffer.concat(chunks).toString("utf8");
    const idx = body.toLowerCase().lastIndexOf("</body>");
    body = idx !== -1 ? body.slice(0, idx) + tag + body.slice(idx) : body + tag;
    const out = Buffer.from(body, "utf8");
    // Vi skickar en helt buffrad body med explicit Content-Length, så ev.
    // upstream Transfer-Encoding (t.ex. chunked) MASTE bort — att skicka bade
    // Content-Length och Transfer-Encoding ger ett ogiltigt HTTP-svar som
    // bracker preview-laddningen for chunkad HTML.
    delete headers["transfer-encoding"];
    headers["content-length"] = String(out.length);
    headers["cache-control"] = "no-store";
    if (!res.headersSent) res.writeHead(status, headers);
    res.end(out);
  });
  proxyRes.on("error", () => {
    try { if (!res.headersSent) res.writeHead(502); res.end(); } catch { /* ignore */ }
  });
});

proxy.on("error", (err, req, res) => {
  const isHttpResponse = res && typeof res.writeHead === "function";

  // (C+E) Tidigare återhämtades bara `ECONNREFUSED`. En zombie-runtime som
  // accepterar anslutningar men resettar mitt i svaret (`socket hang up` /
  // ECONNRESET) gav i stället rå `{"error":"proxy_failed"}`-JSON i iframen +
  // Fly PU02. Nu behandlas alla recoverable transportfel lika: recycla runtimen
  // (utan restart-storm) och servera den vänliga auto-reloadande sidan.
  if (isRecoverableProxyError(err) && isHttpResponse) {
    const rawUrl = req?.url || "/";
    const pathname = String(rawUrl).split("?")[0] || "/";
    const info = routeInfoFromPathname(pathname);
    if (info) {
      const session = findSessionByChatId(readStoreSync(), info.chatId);
      if (session) {
        const state = getRuntimeStateForChat(info.chatId);
        // Köa EN restart-boot (dedupad mot pågående boot via `!state.booting`).
        // `restart: true` täcker båda fallen den tidigare split-logiken missade:
        //  - en levande-men-resettande zombie: `bootRuntimeForSession` stoppar
        //    den själv först. Vi gör INTE längre manuell stop-then-queue, som
        //    öppnade ett glapp där sessionen varken var running eller booting
        //    och 4s-refreshen kunde köa en konkurrerande plain boot;
        //  - ett redan dött barn (ECONNREFUSED): `restart: true` kringgår
        //    "stopped recently"-cooldownen som annars markerar sessionen `error`
        //    medan iframen säger att den startar om.
        if (!state.booting) {
          queueRuntimeBoot(info.chatId, { restart: true });
        }
        // Om reset:en skedde EFTER att upstream redan skickat headers/del av
        // body kan vi varken skriva omstartssidan eller JSON-fallbacken nedan.
        // Avsluta/förstör då svaret så iframen inte hänger på just det
        // mid-response-reset-fall den här vägen ska återhämta.
        const wrote = sendRuntimeStartingPage(res, session, { recovering: true });
        if (!wrote && !res.writableEnded) {
          if (typeof res.destroy === "function") res.destroy();
          else res.end();
        }
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

async function cleanupPreviewHostStorage() {
  const nowMs = Date.now();
  const staleRuntimeCleanup = await stopStaleRuntimes(nowMs);
  const activeWorkspaceEntries = new Set(staleRuntimeCleanup.preservedWorkspaceEntries);
  const activePreviewSessionIds = new Set(staleRuntimeCleanup.preservedPreviewSessionIds);
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
        if (typeof session.previewSessionId === "string" && session.previewSessionId.trim()) {
          activePreviewSessionIds.add(session.previewSessionId.trim());
        }
        continue;
      }

      removedSessions++;
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
  applyRuntimePatch,
  proxyPreviewRequest,
  proxyPreviewUpgrade,
  findSessionByChatId,
  listSessions,
  hibernateChatRuntime,
  destroyChatWorkspace,
  runQueuedVerifyJob,
  runVerifyJob,
  runIdResolverFromSession,
  stopRuntimeForSession,
  cleanupPreviewHostStorage,
  __testing: {
    patchNextConfigViaAst,
    patchNextConfigViaRegex,
    patchNextConfigForPreviewBasePath,
    stripTsToWhitespace,
    findConfigObjectExpression,
    patchTouchesStructuralPath,
    patchWorkspaceFiles,
  },
};
