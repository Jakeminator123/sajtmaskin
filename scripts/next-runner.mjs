import { spawn } from "node:child_process";
import { createConnection } from "node:net";
import { dirname, resolve } from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const nextCommand = args[0];
const env = { ...process.env };

// Load .env.local so we can read INSPECTOR_CAPTURE_WORKER_URL before Next.js
const __dirname = dirname(fileURLToPath(import.meta.url));
const envLocalPath = resolve(__dirname, "..", ".env.local");
if (existsSync(envLocalPath)) {
  try {
    const lines = readFileSync(envLocalPath, "utf-8").split(/\r?\n/);
    for (const line of lines) {
      if (!line.trim() || line.startsWith("#")) continue;
      const eqIdx = line.indexOf("=");
      if (eqIdx < 1) continue;
      const key = line.slice(0, eqIdx).trim();
      const raw = line.slice(eqIdx + 1).trim();
      const val = raw.replace(/^["']|["']$/g, "");
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

const WORKER_SCRIPT = resolve(__dirname, "..", "services", "inspector-worker", "server.mjs");
const WORKER_URL = env.INSPECTOR_CAPTURE_WORKER_URL?.trim() || "";
const WORKER_PORT = (() => {
  try { return new URL(WORKER_URL).port || "3310"; } catch { return "3310"; }
})();
const SHOULD_MANAGE_WORKER =
  Boolean(WORKER_URL) &&
  WORKER_URL.includes("localhost") &&
  existsSync(WORKER_SCRIPT);
const IS_BUILD = nextCommand === "build";

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
  const wp = spawn(process.execPath, [WORKER_SCRIPT], {
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...env, PORT: WORKER_PORT },
    detached: false,
  });

  wp.stdout.on("data", (chunk) => {
    const line = chunk.toString().trim();
    if (line) console.log(`\x1b[36m[inspector-worker]\x1b[0m ${line}`);
  });

  wp.stderr.on("data", (chunk) => {
    const line = chunk.toString().trim();
    if (line) console.error(`\x1b[36m[inspector-worker]\x1b[0m \x1b[31m${line}\x1b[0m`);
  });

  wp.on("exit", (code) => {
    if (workerProcess !== wp) return;
    workerProcess = null;
    if (code !== 0 && code !== null && workerRestarts < MAX_WORKER_RESTARTS) {
      workerRestarts++;
      const delay = Math.min(1000 * workerRestarts, 5000);
      console.log(
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
  try { wp.kill("SIGTERM"); } catch {}
  setTimeout(() => {
    try { wp.kill("SIGKILL"); } catch {}
  }, 3000);
}

async function maybeStartWorker() {
  if (!SHOULD_MANAGE_WORKER || IS_BUILD) return;

  if (await portIsOpen(WORKER_PORT)) {
    console.log(
      `\x1b[36m[inspector-worker]\x1b[0m already running on port ${WORKER_PORT} – skipping`
    );
    return;
  }

  console.log(`\x1b[36m[inspector-worker]\x1b[0m starting on port ${WORKER_PORT}...`);
  workerProcess = spawnWorker();
}

// ── Start Next.js ──

await maybeStartWorker();

const nextBin = resolve(__dirname, "..", "node_modules", "next", "dist", "bin", "next");
const child = spawn(process.execPath, [nextBin, ...args], { stdio: "inherit", env });

child.on("error", (error) => {
  console.error(error);
  killWorker();
  process.exit(1);
});

child.on("exit", (code) => {
  killWorker();
  process.exit(code ?? 1);
});

process.on("SIGINT", () => { killWorker(); });
process.on("SIGTERM", () => { killWorker(); });
