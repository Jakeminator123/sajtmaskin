#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Shadcn MCP entry for Cursor: no machine-specific paths in .cursor/mcp.json.
 * Prepends the directory of the current Node binary to PATH (or spawns npx
 * from that directory) so `npx` works even when Cursor's environment omits
 * Volta/fnm/Node from PATH.
 */
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

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

const pathSep = process.platform === "win32" ? ";" : ":";
const oldPath = process.env.Path || process.env.PATH || "";
const prepended = `${nodeDir}${pathSep}${oldPath}`;

const env = {
  ...process.env,
  Path: prepended,
  PATH: prepended,
};

if (!npxPath) {
  console.error(
    "[shadcn-mcp] npx not found next to this Node. execPath=",
    process.execPath,
  );
  process.exit(1);
}

const npxArgs = ["-y", "shadcn@4.13.1", "mcp"];
// On Windows, .cmd/.bat must go through a shell. Do not wrap the path in
// extra quotes inside a cmd /c arg list — Node escapes those to \"…\" and
// cmd then treats the quotes as part of the filename.
const child = spawn(npxPath, npxArgs, {
  stdio: "inherit",
  env,
  shell: process.platform === "win32",
});

child.on("error", (err) => {
  console.error("[shadcn-mcp] spawn error:", err.message);
  process.exit(1);
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.exit(1);
  }
  process.exit(typeof code === "number" && code !== null ? code : 1);
});
