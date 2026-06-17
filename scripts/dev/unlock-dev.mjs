#!/usr/bin/env node
/**
 * Manual dev-recovery helper (Windows-first).
 *
 * Frees the ports `npm run dev` needs (Next dev + inspector worker) by killing
 * whatever process *tree* is LISTENING on them. Use when `npm run dev` fails
 * with EADDRINUSE or appears "locked up" by a leftover dev server after a hard
 * Ctrl-C / closed terminal.
 *
 * This is intentionally NOT wired into predev/dev — run it explicitly:
 *   npm run dev:unlock
 * Override / add ports:
 *   node scripts/dev/unlock-dev.mjs 3000 3310 4000
 *
 * Safety: it only kills processes that are actually LISTENING on the target
 * ports, so it will not touch unrelated node/build/test processes.
 */
import { spawnSync } from "node:child_process";

const IS_WIN = process.platform === "win32";
const DEFAULT_PORTS = [3000, 3310];

const argPorts = process.argv
  .slice(2)
  .map((n) => Number(n))
  .filter((n) => Number.isInteger(n) && n > 0 && n < 65536);
const targetPorts = argPorts.length ? argPorts : DEFAULT_PORTS;

function listenersForPort(port) {
  const pids = new Set();
  if (IS_WIN) {
    const res = spawnSync("netstat", ["-ano", "-p", "tcp"], { encoding: "utf8" });
    for (const line of (res.stdout || "").split(/\r?\n/)) {
      // e.g.  TCP    0.0.0.0:3000    0.0.0.0:0    LISTENING    12345
      const m = line.match(/^\s*TCP\s+\S+:(\d+)\s+\S+\s+LISTENING\s+(\d+)\s*$/i);
      if (m && Number(m[1]) === port) pids.add(Number(m[2]));
    }
  } else {
    const res = spawnSync("lsof", ["-ti", `tcp:${port}`, "-sTCP:LISTEN"], {
      encoding: "utf8",
    });
    for (const line of (res.stdout || "").split(/\r?\n/)) {
      const pid = Number(line.trim());
      if (Number.isInteger(pid) && pid > 0) pids.add(pid);
    }
  }
  return [...pids];
}

function killTree(pid) {
  if (IS_WIN) {
    spawnSync("taskkill", ["/F", "/T", "/PID", String(pid)], { stdio: "ignore" });
  } else {
    try {
      process.kill(pid, "SIGTERM");
    } catch {}
  }
}

let killedAny = false;
for (const port of targetPorts) {
  const pids = listenersForPort(port).filter((p) => p !== process.pid);
  if (!pids.length) {
    console.log(`[unlock-dev] port ${port}: free`);
    continue;
  }
  for (const pid of pids) {
    console.log(`[unlock-dev] port ${port}: killing PID ${pid} (+ child tree)`);
    killTree(pid);
    killedAny = true;
  }
}

console.log(
  killedAny
    ? "[unlock-dev] freed listed ports. If dev still misbehaves, run: npm run dev:clean"
    : "[unlock-dev] nothing to free. If dev still misbehaves, run: npm run dev:clean",
);
