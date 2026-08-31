#!/usr/bin/env node
/**
 * Portable Python launcher for npm scripts.
 *
 * Probes for a working Python 3 interpreter across Windows, macOS and Linux,
 * so `npm run backoffice` and `npm run env:*` work regardless of which alias
 * the host installed (`python3`, `python`, or the Windows `py` launcher).
 *
 * Usage from package.json:
 *   "backoffice": "node scripts/dev/run-python.mjs sajtmaskin_backoffice.py",
 *   "env:status": "node scripts/dev/run-python.mjs scripts/env/manage_env.py status"
 *
 * Override with SAJTMASKIN_PYTHON=/path/to/python if you need a specific
 * interpreter (e.g. a virtualenv).
 */

import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

import { pythonCandidates, resolvePython } from "./python-runtime.mjs";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const candidates = pythonCandidates({ root: REPO_ROOT });
const interpreter = resolvePython({ root: REPO_ROOT });

if (!interpreter) {
  const tried = candidates.map((c) => [c.command, ...c.args].join(" ")).join(", ");
  console.error(
    `[run-python] No Python 3 interpreter found. Tried: ${tried}.\n` +
      `Install Python 3 or set SAJTMASKIN_PYTHON to an absolute path.`,
  );
  process.exit(127);
}

const userArgs = process.argv.slice(2);
const child = spawn(interpreter.command, [...interpreter.args, ...userArgs], {
  stdio: "inherit",
  windowsHide: true,
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});

child.on("error", (err) => {
  console.error(`[run-python] Failed to spawn ${interpreter.command}:`, err.message);
  process.exit(1);
});
