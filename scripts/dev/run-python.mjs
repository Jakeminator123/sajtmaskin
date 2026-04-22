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

import { spawn, spawnSync } from "node:child_process";
import process from "node:process";

const FORCED = process.env.SAJTMASKIN_PYTHON?.trim();

const CANDIDATES = FORCED
  ? [{ command: FORCED, args: [] }]
  : [
      { command: "python3", args: [] },
      { command: "python", args: [] },
      ...(process.platform === "win32"
        ? [
            { command: "py", args: ["-3"] },
            { command: "py", args: [] },
          ]
        : []),
    ];

function probe(candidate) {
  try {
    const result = spawnSync(
      candidate.command,
      [...candidate.args, "-c", "import sys; sys.exit(0 if sys.version_info[0] >= 3 else 1)"],
      { stdio: "ignore", windowsHide: true },
    );
    return result.status === 0;
  } catch {
    return false;
  }
}

const interpreter = CANDIDATES.find(probe);

if (!interpreter) {
  const tried = CANDIDATES.map((c) => [c.command, ...c.args].join(" ")).join(", ");
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
