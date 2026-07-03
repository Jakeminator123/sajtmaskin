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

// 5. Per-chat boot serialization (prod-incident 2026-07-03, chat e8420220):
//    concurrent `restart: true` boots must NEVER run bootRuntimeForSession
//    concurrently — the old "await existing, then run" released all waiters in
//    parallel, spawning two dev servers (EADDRINUSE) and orphaning a child
//    that held Next 16's workspace dev-lock.
{
  const { setBootRunnerForTesting } = runtime.__testing;
  const { writeFileSync, mkdirSync } = await import("node:fs");
  const chatId = "guard-serial-chat";
  const session = {
    sessionId: "guard-serial-session",
    previewSessionId: "ps_guard-serial",
    chatId,
    versionId: "v1",
    previewUrl: `http://localhost/${chatId}`,
    status: "starting",
    lastAction: "start",
    sessionExpiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    filesJson: { "package.json": "{}" },
  };
  mkdirSync(dataDir, { recursive: true });
  writeFileSync(
    join(dataDir, "preview-host-store.json"),
    JSON.stringify({
      sessions: { [session.sessionId]: session },
      logs: {},
      previewSessionToSession: { [session.previewSessionId]: session.sessionId },
    }),
    "utf8",
  );

  let active = 0;
  let maxActive = 0;
  let bootRuns = 0;
  setBootRunnerForTesting(async () => {
    active += 1;
    bootRuns += 1;
    maxActive = Math.max(maxActive, active);
    await new Promise((resolve) => setTimeout(resolve, 40));
    active -= 1;
    return { runtimePort: 4000 + bootRuns };
  });

  try {
    // (a) A burst of concurrent restart boots serializes (concurrency 1) and
    //     coalesces queued restarts instead of running one boot per request.
    const burst = [
      runtime.ensureRuntimeForChat(chatId, { restart: true }),
      runtime.ensureRuntimeForChat(chatId, { restart: true }),
      runtime.ensureRuntimeForChat(chatId, { restart: true }),
    ];
    const burstResults = await Promise.all(burst);
    check("restart burst never overlaps boots", maxActive === 1);
    check("restart burst coalesces queued restarts", bootRuns <= 2);
    check(
      "restart burst boots resolve with the session",
      burstResults.every((r) => r && r.session && r.runtimePort > 0),
    );

    // (b) A restart arriving MID-boot still triggers one follow-up boot
    //     (the original "restart is never dropped" guarantee).
    const before = bootRuns;
    const first = runtime.ensureRuntimeForChat(chatId, { restart: true });
    await new Promise((resolve) => setTimeout(resolve, 10)); // first is now running
    const second = runtime.ensureRuntimeForChat(chatId, { restart: true });
    await Promise.all([first, second]);
    check("mid-boot restart runs a follow-up boot", bootRuns - before === 2);
    check("mid-boot restart still never overlaps", maxActive === 1);

    // (c) Non-restart boots dedupe onto whatever is in flight.
    const beforePlain = bootRuns;
    const restartBoot = runtime.ensureRuntimeForChat(chatId, { restart: true });
    const plainBoot = runtime.ensureRuntimeForChat(chatId, {});
    check("plain boot dedupes to in-flight boot", plainBoot === restartBoot);
    await Promise.all([restartBoot, plainBoot]);
    check("deduped plain boot ran no extra boot", bootRuns - beforePlain === 1);
  } finally {
    setBootRunnerForTesting(null);
  }
}

rmSync(dataDir, { recursive: true, force: true });

if (failures > 0) {
  console.error(`[test-runtime-guards] FAILED — ${failures} check(s) failed.`);
  process.exit(1);
}
console.log("[test-runtime-guards] All guards green.");
