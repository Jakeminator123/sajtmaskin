import { spawn, spawnSync } from "node:child_process";
import { createConnection } from "node:net";
import { dirname, resolve } from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parse as parseDotenv } from "dotenv";

const IS_WIN = process.platform === "win32";

const trackedChildren = new Set();
function trackChild(child) {
  if (!child || typeof child.pid !== "number") return child;
  trackedChildren.add(child);
  child.once("exit", () => trackedChildren.delete(child));
  return child;
}

function killTree(pid) {
  if (!pid) return;
  if (IS_WIN) {
    try {
      spawnSync("taskkill", ["/F", "/T", "/PID", String(pid)], {
        stdio: "ignore",
        windowsHide: true,
      });
    } catch {}
  } else {
    try { process.kill(-pid, "SIGTERM"); } catch {}
    try { process.kill(pid, "SIGTERM"); } catch {}
  }
}

function killAllTrackedChildren() {
  for (const child of trackedChildren) {
    killTree(child.pid);
  }
  trackedChildren.clear();
}

let cleanupRan = false;
function installCleanupHandlers() {
  const cleanup = (signal) => {
    if (cleanupRan) return;
    cleanupRan = true;
    try { killWorker(); } catch {}
    killAllTrackedChildren();
    if (signal === "exit") return;
    process.exit(signal === "SIGINT" ? 130 : signal === "SIGTERM" ? 143 : 1);
  };
  process.on("SIGINT", () => cleanup("SIGINT"));
  process.on("SIGTERM", () => cleanup("SIGTERM"));
  process.on("SIGHUP", () => cleanup("SIGHUP"));
  process.on("SIGBREAK", () => cleanup("SIGBREAK"));
  process.on("exit", () => cleanup("exit"));
  process.on("uncaughtException", (err) => {
    console.error("[next-runner] uncaught:", err);
    cleanup("uncaughtException");
  });
}

const args = process.argv.slice(2);
const nextCommand = args[0];
const env = { ...process.env };

if (nextCommand === "dev" && !("SAJTMASKIN_DEV_LOG_STDOUT" in env)) {
  env.SAJTMASKIN_DEV_LOG_STDOUT = "true";
}

// Load .env.local so we can read INSPECTOR_CAPTURE_WORKER_URL before Next.js
const __dirname = dirname(fileURLToPath(import.meta.url));
const envLocalPath = resolve(__dirname, "..", "..", ".env.local");
if (existsSync(envLocalPath)) {
  try {
    const parsed = parseDotenv(readFileSync(envLocalPath, "utf-8"));
    for (const [key, val] of Object.entries(parsed)) {
      if (!(key in env)) env[key] = val;
    }
  } catch {}
}

if (env.NODE_OPTIONS) {
  const tokens = env.NODE_OPTIONS.split(/\s+/).filter(Boolean);
  const filtered = [];

  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];

    if (token === "--localstorage-file") {
      if (tokens[i + 1] && !tokens[i + 1].startsWith("-")) {
        i += 1;
      }
      continue;
    }

    if (token.startsWith("--localstorage-file=")) {
      continue;
    }

    filtered.push(token);
  }

  if (filtered.length > 0) {
    env.NODE_OPTIONS = filtered.join(" ");
  } else {
    delete env.NODE_OPTIONS;
  }
}

// ── Inspector worker auto-management ──

const WORKER_SCRIPT = resolve(__dirname, "..", "..", "services", "inspector-worker", "server.mjs");
const WORKER_URL = env.INSPECTOR_CAPTURE_WORKER_URL?.trim() || "";
const WORKER_PORT = (() => {
  try { return new URL(WORKER_URL).port || "3310"; } catch { return "3310"; }
})();
const SHOULD_MANAGE_WORKER =
  Boolean(WORKER_URL) &&
  WORKER_URL.includes("localhost") &&
  existsSync(WORKER_SCRIPT);
const IS_BUILD = nextCommand === "build";
const LOCAL_DEV_LOG = "logs/sajtmaskin-local.log";
const LOCAL_DEV_DOC_LOG = "logs/sajtmaskin-local-document.txt";

function portIsOpen(port) {
  return new Promise((resolve) => {
    const socket = createConnection({ port: Number(port), host: "127.0.0.1" });
    socket.setTimeout(800);
    socket.on("connect", () => { socket.destroy(); resolve(true); });
    socket.on("timeout", () => { socket.destroy(); resolve(false); });
    socket.on("error", () => { socket.destroy(); resolve(false); });
  });
}

let workerProcess = null;
let workerRestarts = 0;
const MAX_WORKER_RESTARTS = 5;

function spawnWorker() {
  const wp = trackChild(spawn(process.execPath, [WORKER_SCRIPT], {
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...env, PORT: WORKER_PORT },
    detached: false,
    windowsHide: true,
  }));

  wp.stdout.on("data", (chunk) => {
    const line = chunk.toString().trim();
    if (line) console.info(`\x1b[36m[inspector-worker]\x1b[0m ${line}`);
  });

  wp.stderr.on("data", (chunk) => {
    const line = chunk.toString().trim();
    if (line) console.error(`\x1b[36m[inspector-worker]\x1b[0m \x1b[31m${line}\x1b[0m`);
  });

  wp.on("exit", (code) => {
    if (workerProcess !== wp) return;
    workerProcess = null;
    if (cleanupRan) return;
    if (code !== 0 && code !== null && workerRestarts < MAX_WORKER_RESTARTS) {
      workerRestarts++;
      const delay = Math.min(1000 * workerRestarts, 5000);
      console.info(
        `\x1b[36m[inspector-worker]\x1b[0m exited with code ${code}, restarting in ${delay}ms (${workerRestarts}/${MAX_WORKER_RESTARTS})`
      );
      setTimeout(() => { workerProcess = spawnWorker(); }, delay);
    } else if (code !== 0 && code !== null) {
      console.error(`\x1b[36m[inspector-worker]\x1b[0m gave up after ${MAX_WORKER_RESTARTS} restarts`);
    }
  });

  return wp;
}

function killWorker() {
  if (!workerProcess) return;
  const wp = workerProcess;
  workerProcess = null;
  killTree(wp.pid);
}

async function maybeStartWorker() {
  if (!SHOULD_MANAGE_WORKER || IS_BUILD) return;

  if (await portIsOpen(WORKER_PORT)) {
    console.info(
      `\x1b[36m[inspector-worker]\x1b[0m already running on port ${WORKER_PORT} – skipping`
    );
    return;
  }

  console.info(`\x1b[36m[inspector-worker]\x1b[0m starting on port ${WORKER_PORT}...`);
  workerProcess = spawnWorker();
}

function printDevBanner() {
  if (nextCommand !== "dev") return;

  const mirrorEnabled = env.SAJTMASKIN_DEV_LOG_STDOUT !== "false";
  console.info(`\x1b[35m[sajtmaskin-dev]\x1b[0m dev log file: ${LOCAL_DEV_LOG}`);
  console.info(`\x1b[35m[sajtmaskin-dev]\x1b[0m detailed log document: ${LOCAL_DEV_DOC_LOG}`);
  console.info(
    `\x1b[35m[sajtmaskin-dev]\x1b[0m compact generation summaries in terminal: ${mirrorEnabled ? "on" : "off"}`
  );
  if (mirrorEnabled) {
    console.info(
      "\x1b[35m[sajtmaskin-dev]\x1b[0m set SAJTMASKIN_DEV_LOG_STDOUT=false to keep logs only in files"
    );
  }
}

// ── Error-log RAG auto-ingest ──
//
// Run BEFORE next dev|build|start so a follow-up generation has the freshest
// possible "lessons from similar past builds" snapshot. The indexer is
// delta-aware (skips when producer NDJSON is older than snapshot), idempotent,
// and time-capped via Promise.race to never block startup beyond 5s.
//
// Toggle via SAJTMASKIN_USE_ERROR_LOG_RAG; the indexer itself runs unconditionally
// so the snapshot stays current — the runtime retriever respects the flag.
const RAG_INDEXER_PATH = resolve(__dirname, "..", "observability", "index-error-log-rag.mjs");

async function maybeRunErrorLogRagIndexer() {
  if (!existsSync(RAG_INDEXER_PATH)) return;
  const startedAt = Date.now();
  const ragProc = trackChild(spawn(process.execPath, [RAG_INDEXER_PATH, "--quiet"], {
    stdio: "ignore",
    env,
    detached: false,
    windowsHide: true,
  }));
  await new Promise((resolveOuter) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      const ms = Date.now() - startedAt;
      console.info(`\x1b[35m[error-log-rag]\x1b[0m indexer finished (${ms}ms)`);
      resolveOuter();
    };
    const timeout = setTimeout(() => {
      killTree(ragProc.pid);
      console.info("\x1b[35m[error-log-rag]\x1b[0m indexer skipped (timeout 5s, non-fatal)");
      finish();
    }, 5000);
    ragProc.on("exit", () => {
      clearTimeout(timeout);
      finish();
    });
    ragProc.on("error", () => {
      clearTimeout(timeout);
      finish();
    });
  });
}

// ── Start Next.js ──

installCleanupHandlers();

await maybeStartWorker();
await maybeRunErrorLogRagIndexer();

// Refresh the fixer-registry snapshot the backoffice reads. Slow first run
// (~3s for tsx warmup) but cached after — and we don't block on it.
const FIXER_REGISTRY_DUMP_PATH = resolve(
  __dirname, "..", "observability", "dump-fixer-registry.mjs",
);
if (existsSync(FIXER_REGISTRY_DUMP_PATH)) {
  const dumpProc = trackChild(spawn(process.execPath, [FIXER_REGISTRY_DUMP_PATH, "--quiet"], {
    stdio: "ignore",
    env,
    detached: false,
    windowsHide: true,
  }));
  dumpProc.on("error", () => {});
  // Fire-and-forget; do not block dev/build/start.
}
printDevBanner();

const nextBin = resolve(__dirname, "..", "..", "node_modules", "next", "dist", "bin", "next");
const child = trackChild(spawn(process.execPath, [nextBin, ...args], {
  stdio: "inherit",
  env,
  windowsHide: true,
}));

child.on("error", (error) => {
  console.error(error);
  cleanupRan = true;
  try { killWorker(); } catch {}
  killAllTrackedChildren();
  process.exit(1);
});

child.on("exit", (code) => {
  cleanupRan = true;
  try { killWorker(); } catch {}
  killAllTrackedChildren();
  process.exit(code ?? 1);
});
