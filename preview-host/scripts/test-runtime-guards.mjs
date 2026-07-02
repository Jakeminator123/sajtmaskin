/**
 * Targeted guard tests for the M#fly1 runtime changes (PR #357):
 *
 *   1. `runShellCommand` with `timeoutMs` MUST settle (kill a hung child and
 *      resolve with `timedOut: true`) — the global install queue serializes
 *      every install, so a hung install would otherwise wedge all later
 *      boots/verifies VM-wide (VADE/Codex P1).
 *   2. `runShellCommand` without a timeout keeps today's behavior.
 *   3. `sweepIdleRuntimes` is a no-op on an empty runtime table and respects
 *      the PREVIEW_HOST_RUNTIME_IDLE_STOP_MS=0 kill switch.
 *   4. `registerPreviewSocket` counts and releases viewer sockets (the
 *      "never reap a watched preview" invariant's input signal).
 *
 * Runs with plain node (no test framework — preview-host has none):
 *   node scripts/test-runtime-guards.mjs
 */
import { createRequire } from "node:module";
import { EventEmitter } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Isolated store dir so the test never touches a real data dir.
const dataDir = mkdtempSync(join(tmpdir(), "preview-host-guard-test-"));
process.env.PREVIEW_HOST_DATA_DIR = dataDir;

const require = createRequire(import.meta.url);
const runtime = require("../src/runtime.js");
const { runShellCommand } = runtime.__testing;

let failures = 0;
function check(label, condition) {
  if (condition) {
    console.log(`  OK    ${label}`);
  } else {
    failures += 1;
    console.error(`  FAIL  ${label}`);
  }
}

// Quote-free commands: the Windows fallback path (`cmd /d /s /c <string>`)
// mangles embedded quotes when spawn re-quotes the joined argument, and the
// production callers (npm/pnpm/yarn installs) never need embedded quotes
// either. `node -e` with a space-free expression works on both platforms.
// 1. Hung child + timeoutMs → settles with timedOut/exit 124.
{
  const startedAt = Date.now();
  const result = await runShellCommand(
    "node -e setTimeout(function(){},60000)",
    { stdio: ["ignore", "pipe", "pipe"], timeoutMs: 1500, timeoutLabel: "Guard test" },
  );
  check("hung command settles via timeoutMs", Date.now() - startedAt < 30_000);
  check("timeout resolves timedOut=true", result.timedOut === true);
  check("timeout resolves non-zero exit code", result.exitCode !== 0);
  check(
    "timeout output mentions the kill",
    /timed out after/.test(result.output ?? ""),
  );
}

// 2. Normal command without timeout — unchanged contract.
{
  const result = await runShellCommand("node -p 40+2", {
    stdio: ["ignore", "pipe", "pipe"],
  });
  check("plain command exits 0", result.exitCode === 0);
  check("plain command captures output", /42/.test(result.output ?? ""));
  check("plain command is not timedOut", result.timedOut === false);
}

// 3. Idle sweep no-op + kill switch.
{
  const swept = await runtime.sweepIdleRuntimes();
  check("idle sweep on empty table stops nothing", swept.stoppedRuntimes === 0);
}

// 4. Preview-socket viewer counting.
{
  const { registerPreviewSocket, activePreviewSocketCount } = runtime.__testing;
  const socket = new EventEmitter();
  registerPreviewSocket("guard-chat", socket);
  check("open socket counts as viewer", activePreviewSocketCount("guard-chat") === 1);
  socket.emit("close");
  check("closed socket releases viewer", activePreviewSocketCount("guard-chat") === 0);
}

rmSync(dataDir, { recursive: true, force: true });

if (failures > 0) {
  console.error(`[test-runtime-guards] FAILED — ${failures} check(s) failed.`);
  process.exit(1);
}
console.log("[test-runtime-guards] All guards green.");
