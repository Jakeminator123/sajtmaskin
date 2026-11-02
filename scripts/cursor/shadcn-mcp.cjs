#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Shadcn MCP entry for Cursor and Claude Code: no machine-specific paths in
 * the MCP configs. Prepends the directory of the current Node binary to PATH
 * (or spawns npx from that directory) so `npx` works even when the editor's
 * environment omits Volta/fnm/Node from PATH.
 *
 * Process lifetime (Windows): `npx` runs through a shell, so the server is a
 * chain cmd -> npx -> node. Windows does not stop children when a parent
 * stops, so every reconnect used to leave the whole chain running. This
 * wrapper therefore owns the chain:
 *   - stdin is proxied; when the MCP client closes it, the tree is killed;
 *   - normal exit and signals kill the tree;
 *   - a detached reaper kills the tree if this wrapper itself is terminated
 *     (TerminateProcess runs no exit handlers).
 */
const { spawn, spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const isWindows = process.platform === "win32";
const nodeDir = path.dirname(process.execPath);
const npxCmd = path.join(nodeDir, "npx.cmd");
const npxSh = path.join(nodeDir, "npx");
const npxExe = path.join(nodeDir, "npx.exe");

const npxPath = fs.existsSync(npxCmd)
  ? npxCmd
  : fs.existsSync(npxExe)
    ? npxExe
    : fs.existsSync(npxSh)
      ? npxSh
      : null;

const pathSep = isWindows ? ";" : ":";
const oldPath = process.env.Path || process.env.PATH || "";
const prepended = `${nodeDir}${pathSep}${oldPath}`;

const env = {
  ...process.env,
  Path: prepended,
  PATH: prepended,
};

if (!npxPath) {
  console.error("[shadcn-mcp] npx not found next to this Node. execPath=", process.execPath);
  process.exit(1);
}

const npxArgs = ["-y", "shadcn@4.13.1", "mcp"];
// On Windows, .cmd/.bat must go through a shell. Do not wrap the path in
// extra quotes inside a cmd /c arg list — Node escapes those to \"…\" and
// cmd then treats the quotes as part of the filename.
const child = spawn(npxPath, npxArgs, {
  stdio: ["pipe", "inherit", "inherit"],
  env,
  shell: isWindows,
  windowsHide: true,
});

let stopped = false;
function killTree() {
  if (stopped || !child.pid) return;
  stopped = true;
  if (isWindows) {
    spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
      stdio: "ignore",
      windowsHide: true,
    });
  } else {
    try {
      child.kill("SIGTERM");
    } catch {
      // Already gone.
    }
  }
}

// MCP over stdio: the client closing stdin means the session is over.
process.stdin.pipe(child.stdin);
process.stdin.on("end", () => {
  killTree();
  process.exit(0);
});
child.stdin.on("error", () => {
  // The child went away first; its exit handler below ends the wrapper.
});

for (const signal of ["SIGINT", "SIGTERM", "SIGBREAK", "SIGHUP"]) {
  process.on(signal, () => {
    killTree();
    process.exit(0);
  });
}
process.on("exit", killTree);

if (isWindows && child.pid) {
  // Reaper: survives a forced kill of this wrapper and then removes the tree.
  const reaper = `
    const { spawnSync } = require("node:child_process");
    const [wrapper, tree] = process.argv.slice(1).map(Number);
    const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
    const timer = setInterval(() => {
      if (!alive(tree)) { clearInterval(timer); return; }
      if (!alive(wrapper)) {
        spawnSync("taskkill", ["/PID", String(tree), "/T", "/F"], { stdio: "ignore", windowsHide: true });
        clearInterval(timer);
      }
    }, 2000);
  `;
  spawn(process.execPath, ["-e", reaper, String(process.pid), String(child.pid)], {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  }).unref();
}

child.on("error", (err) => {
  console.error("[shadcn-mcp] spawn error:", err.message);
  process.exit(1);
});

child.on("exit", (code, signal) => {
  stopped = true;
  if (signal) {
    process.exit(1);
  }
  process.exit(typeof code === "number" && code !== null ? code : 1);
});
