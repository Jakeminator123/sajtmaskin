"use strict";

// Processkörning inne i gästmaskinen: engångskommandon (install, typecheck,
// build, lint) och den enda långlivade dev-processen. Allt körs som gästens
// egen OS-användare i den egna maskinen; hostens API-nyckel eller
// gästtoken når aldrig en barnprocess.

const { spawn } = require("node:child_process");

const OUTPUT_MAX_CHARS = 256_000;
const SIGNAL_EXIT_CODE = 253;
const DEV_OUTPUT_RING_MAX = 400;
const DEV_OUTPUT_LINE_MAX = 500;

const CHILD_ENV_ALLOWLIST = new Set([
  "PATH", "HOME", "USER", "SHELL", "LANG", "TERM",
  "NODE_ENV", "NODE_OPTIONS", "NODE_PATH",
  "NPM_CONFIG_CACHE", "NPM_CONFIG_REGISTRY", "PNPM_CONFIG_STORE_DIR",
  "YARN_CACHE_FOLDER", "YARN_GLOBAL_FOLDER", "COREPACK_HOME",
  "XDG_DATA_HOME", "XDG_CACHE_HOME",
  "NEXT_TELEMETRY_DISABLED",
  "TMPDIR", "TMP", "TEMP",
  // Windows-only: cmd.exe and npm need these to run at all in local tests.
  "SYSTEMROOT", "SystemRoot", "COMSPEC", "ComSpec", "PATHEXT", "APPDATA",
  "LOCALAPPDATA", "USERPROFILE", "PROGRAMFILES", "ProgramFiles", "WINDIR", "windir",
]);

// Overrides the control plane may pass per command. Anything else is dropped
// so a compromised control-plane payload still cannot smuggle arbitrary
// variables (for example LD_PRELOAD) into the guest's processes.
const OVERRIDE_KEY_RE =
  /^(NODE_ENV|NPM_CONFIG_[A-Z0-9_]+|PNPM_CONFIG_[A-Z0-9_]+|YARN_[A-Z0-9_]+|COREPACK_HOME|PORT|HOSTNAME|NEXT_TELEMETRY_DISABLED|SAJTMASKIN_PREVIEW_[A-Z0-9_]+|NEXT_PUBLIC_[A-Z0-9_]+)$/;

function childEnv(overrides = {}) {
  const out = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value !== "string") continue;
    if (CHILD_ENV_ALLOWLIST.has(key)) out[key] = value;
  }
  // pnpm 10+/11 refuses dependency build scripts by default. In the guest
  // those scripts run inside the project's own machine as the guest user, so
  // allowing them has no cross-project blast radius.
  out.PNPM_CONFIG_DANGEROUSLY_ALLOW_ALL_BUILDS = "true";
  for (const [key, value] of Object.entries(overrides || {})) {
    if (typeof value !== "string") continue;
    if (!OVERRIDE_KEY_RE.test(key)) continue;
    out[key] = value;
  }
  return out;
}

function killTree(child, useProcessGroup) {
  try {
    if (process.platform === "win32") {
      spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"], { stdio: "ignore" });
      return;
    }
    if (useProcessGroup) {
      process.kill(-child.pid, "SIGKILL");
      return;
    }
    child.kill("SIGKILL");
  } catch {
    /* already exited */
  }
}

function spawnShell(command, options) {
  if (process.platform === "win32") {
    return spawn("cmd.exe", ["/d", "/s", "/c", command], options);
  }
  return spawn("sh", ["-lc", command], { ...options, detached: true });
}

/**
 * Run one shell command to completion. Always settles; a timeout kills the
 * whole process group and resolves with `timedOut: true` and exit 124 (same
 * contract as the host's `runShellCommand`).
 */
function runCommand(command, { cwd, env, timeoutMs }) {
  const hasTimeout = Number.isFinite(timeoutMs) && timeoutMs > 0;
  const useProcessGroup = process.platform !== "win32";
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    let child;
    try {
      child = spawnShell(command, { cwd, env, stdio: ["ignore", "pipe", "pipe"] });
    } catch (error) {
      reject(error);
      return;
    }
    let output = "";
    let timedOut = false;
    let timer = null;
    const append = (chunk) => {
      output += String(chunk);
      if (output.length > OUTPUT_MAX_CHARS) output = output.slice(-OUTPUT_MAX_CHARS);
    };
    if (hasTimeout) {
      timer = setTimeout(() => {
        timedOut = true;
        killTree(child, useProcessGroup);
      }, timeoutMs);
      timer.unref?.();
    }
    child.stdout.on("data", append);
    child.stderr.on("data", append);
    child.once("error", (error) => {
      if (timer) clearTimeout(timer);
      reject(error);
    });
    child.once("close", (code, signal) => {
      if (timer) clearTimeout(timer);
      const durationMs = Date.now() - startedAt;
      if (timedOut) {
        resolve({
          exitCode: 124,
          output: `${output}\n[preview-guest] Command timed out after ${Math.round(timeoutMs / 1000)}s and was killed.`,
          timedOut: true,
          signal: signal ?? null,
          durationMs,
        });
        return;
      }
      resolve({
        exitCode: typeof code === "number" ? code : signal ? SIGNAL_EXIT_CODE : 1,
        output,
        timedOut: false,
        signal: signal ?? null,
        durationMs,
      });
    });
  });
}

/**
 * The single dev process of this guest. `generation` increments on every
 * start so the control plane can tell "my process exited" from "a newer
 * process replaced it".
 */
function createDevProcessManager() {
  let generation = 0;
  let current = null;

  function statusOf(entry, since) {
    if (!entry) {
      return { running: false, generation, exitCode: null, signal: null, startedAt: null, lines: [], outputCursor: 0 };
    }
    const sinceIndex = Number.isSafeInteger(since) && since >= 0 ? since : 0;
    const lines = entry.lines.filter((line) => line.index > sinceIndex).map((line) => line.text);
    return {
      running: entry.exitCode === null && entry.signal === null,
      generation: entry.generation,
      pid: entry.pid,
      exitCode: entry.exitCode,
      signal: entry.signal,
      startedAt: entry.startedAt,
      lines,
      outputCursor: entry.nextLineIndex - 1,
    };
  }

  // A child killed by a signal has `exitCode === null` and `signalCode` set,
  // and its `close` has already fired. Checking only exitCode made stop()
  // wait forever for a second close (hung CI 2026-10-22: DELETE /workspaces
  // after a SIGTERM-stopped dev process). Treat any recorded end as done.
  function childHasEnded(entry) {
    const child = entry?.child;
    return Boolean(
      !child ||
        entry.exitCode !== null ||
        child.exitCode !== null ||
        child.signalCode !== null,
    );
  }

  async function stop(entry, drainMs = 5000) {
    if (!entry || childHasEnded(entry)) return;
    const child = entry.child;
    const drain = Number.isFinite(drainMs) && drainMs >= 0 ? drainMs : 5000;
    await new Promise((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        clearTimeout(hardTimer);
        resolve();
      };
      // Definitive ceiling: whatever the OS does, the caller is never wedged.
      const hardTimer = setTimeout(finish, drain + 5000);
      hardTimer.unref?.();
      child.once("close", finish);
      if (childHasEnded(entry)) {
        finish();
        return;
      }
      if (process.platform === "win32") {
        const killer = spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"], { stdio: "ignore" });
        killer.once("close", () => {
          if (childHasEnded(entry)) finish();
        });
        return;
      }
      const signalGroup = (signal) => {
        try {
          process.kill(-child.pid, signal);
        } catch {
          try { child.kill(signal); } catch { /* gone */ }
        }
      };
      signalGroup("SIGTERM");
      const killTimer = setTimeout(() => {
        if (!childHasEnded(entry)) signalGroup("SIGKILL");
      }, drain);
      killTimer.unref?.();
    });
  }

  return {
    async start({ args, cwd, env }) {
      if (current && !childHasEnded(current)) await stop(current);
      generation += 1;
      const npmArgs = Array.isArray(args) ? args.map(String) : ["run", "dev"];
      const child =
        process.platform === "win32"
          ? spawn("cmd.exe", ["/d", "/s", "/c", `npm ${npmArgs.join(" ")}`], {
              cwd,
              env,
              stdio: ["ignore", "pipe", "pipe"],
            })
          : spawn("npm", npmArgs, { cwd, env, stdio: ["ignore", "pipe", "pipe"], detached: true });
      const entry = {
        generation,
        child,
        pid: child.pid ?? null,
        startedAt: new Date().toISOString(),
        exitCode: null,
        signal: null,
        lines: [],
        nextLineIndex: 1,
      };
      const capture = (chunk) => {
        for (const rawLine of String(chunk).split(/\r?\n/)) {
          const line = rawLine.trimEnd();
          if (!line) continue;
          entry.lines.push({
            index: entry.nextLineIndex++,
            text: line.length > DEV_OUTPUT_LINE_MAX ? `${line.slice(0, DEV_OUTPUT_LINE_MAX)}…` : line,
          });
        }
        if (entry.lines.length > DEV_OUTPUT_RING_MAX) {
          entry.lines.splice(0, entry.lines.length - DEV_OUTPUT_RING_MAX);
        }
      };
      child.stdout.on("data", capture);
      child.stderr.on("data", capture);
      child.once("error", (error) => {
        capture(`[preview-guest] spawn error: ${error.message}`);
        entry.exitCode = 1;
      });
      child.once("close", (code, signal) => {
        entry.exitCode = typeof code === "number" ? code : signal ? SIGNAL_EXIT_CODE : 1;
        entry.signal = signal ?? null;
      });
      current = entry;
      return { generation: entry.generation, pid: entry.pid, startedAt: entry.startedAt };
    },
    async stop({ generation: expected, drainMs } = {}) {
      const entry = current;
      if (!entry) return { stopped: false, generation, exitCode: null, signal: null };
      if (Number.isSafeInteger(expected) && expected !== entry.generation) {
        return { stopped: false, generation: entry.generation, exitCode: entry.exitCode, signal: entry.signal, reason: "generation_mismatch" };
      }
      await stop(entry, drainMs);
      return { stopped: true, generation: entry.generation, exitCode: entry.exitCode, signal: entry.signal };
    },
    status({ since } = {}) {
      return statusOf(current, since);
    },
    async shutdown() {
      if (current) await stop(current, 2000);
    },
    /** Test hook: the exact "already ended" predicate stop() relies on. */
    childHasEndedForTesting: childHasEnded,
  };
}

module.exports = {
  OUTPUT_MAX_CHARS,
  SIGNAL_EXIT_CODE,
  childEnv,
  runCommand,
  createDevProcessManager,
};
