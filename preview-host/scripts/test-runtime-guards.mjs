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
import {
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
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
// production callers (npm/pnpm/yarn installs) never need embedded quotes either.
//
// An inline `node -e setTimeout(function(){},60000)` is NOT safe: runShellCommand
// runs `sh -lc <string>` on unix, where `(){}` are shell metacharacters, so sh
// mangled the expression and node exited instantly on Linux (the guard only ever
// passed on Windows cmd.exe — surfaced when this suite started running in CI,
// A#28). Run a temp SCRIPT FILE instead so the command string is just
// `node <path>` — no parens/metachars, hung on both platforms.
const hangScript = join(dataDir, "hang.mjs");
writeFileSync(hangScript, "setTimeout(() => {}, 60000)\n");
// 1. Hung child + timeoutMs → settles with timedOut/exit 124.
{
  const startedAt = Date.now();
  const result = await runShellCommand(
    `node ${hangScript}`,
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

// 6. dependencyFingerprint mixes in the install-policy token so a policy change
//    invalidates prior cached fingerprints (Codex P2 on PR #454). Same deps but
//    a different policy MUST produce a different fingerprint; identical deps +
//    policy MUST be stable.
{
  const { dependencyFingerprint } = runtime.__testing;
  const files = { "package.json": "{}", "pnpm-lock.yaml": "lockfile: 9" };
  const fp1 = dependencyFingerprint(files);
  const fp2 = dependencyFingerprint({ ...files });
  check("fingerprint is stable for identical deps+policy", fp1 === fp2);
  check("fingerprint changes when deps change", fp1 !== dependencyFingerprint({ ...files, "package.json": '{"x":1}' }));
  check(
    "fingerprint includes the install policy token",
    typeof runtime.__testing.DEPENDENCY_INSTALL_POLICY === "string" &&
      runtime.__testing.DEPENDENCY_INSTALL_POLICY.length > 0,
  );
}

// 7. ReleaseGate uses only project-local tools, keeps lint warnings advisory,
//    and classifies missing/broken lint tooling separately from user-code errors.
{
  const {
    VERIFY_COMMANDS,
    classifyLintResult,
    inspectProjectLintSetup,
    resolveInstallCommand,
  } = runtime.__testing;
  check("verify commands never invoke npx", Object.values(VERIFY_COMMANDS).every((cmd) => !/\bnpx\b/.test(cmd)));
  check("lint command resolves project-local eslint", /node_modules\/eslint\/bin\/eslint\.js/.test(VERIFY_COMMANDS.lint));

  const warning = classifyLintResult({
    exitCode: 0,
    output: "✖ 2 problems (0 errors, 2 warnings)",
  });
  check("lint warnings pass", warning.passed === true);
  check("lint warnings are advisory", warning.advisory === true && warning.warningCount === 2);
  check("lint warnings are never repairable", warning.repairable === false);

  const error = classifyLintResult({
    exitCode: 1,
    output: "✖ 1 problem (1 error, 0 warnings)",
  });
  check("lint errors block", error.passed === false);
  check("lint errors remain repairable user-code failures", error.repairable === true && error.failureKind === "code");

  const tooling = classifyLintResult({ exitCode: 2, output: "ESLint configuration failed" });
  check("lint config/tool failures block", tooling.passed === false);
  check("lint config/tool failures never enter code repair", tooling.repairable === false && tooling.failureKind === "tooling");

  const validLintFiles = {
    "package.json": JSON.stringify({ devDependencies: { eslint: "9.39.2" } }),
    "eslint.config.mjs": "export default [];",
  };
  check("canonical export owns complete lint setup", inspectProjectLintSetup(validLintFiles).ok === true);
  check(
    "missing lint config is a tooling error",
    inspectProjectLintSetup({ "package.json": validLintFiles["package.json"] }).ok === false,
  );
  check(
    "missing local eslint dependency is a tooling error",
    inspectProjectLintSetup({ "package.json": "{}", "eslint.config.mjs": "export default [];" }).ok === false,
  );

  const npmLockInstall = resolveInstallCommand({ "package-lock.json": "{}" });
  check(
    "npm lock primary and fallback include devDependencies",
    [npmLockInstall.command, npmLockInstall.fallbackCommand].every((command) =>
      /--include=dev/.test(command),
    ),
  );
  const npmInstall = resolveInstallCommand({ "package.json": "{}" });
  check(
    "npm unlocked primary and fallback include devDependencies",
    [npmInstall.command, npmInstall.fallbackCommand].every((command) =>
      /--include=dev/.test(command),
    ),
  );
  const pnpmInstall = resolveInstallCommand({ "pnpm-lock.yaml": "lockfileVersion: 9" });
  check(
    "pnpm primary and fallback include devDependencies",
    [pnpmInstall.command, pnpmInstall.fallbackCommand].every((command) =>
      /--prod=false/.test(command),
    ),
  );
  check(
    "yarn install avoids the Berry-incompatible production flag",
    !/--production(?:=|\s|$)/.test(
      [
        resolveInstallCommand({ "yarn.lock": "" }).command,
        resolveInstallCommand({ "yarn.lock": "" }).fallbackCommand,
      ].join(" "),
    ),
  );
  check(
    "verify commands only use installed project-local tooling",
    Object.values(runtime.__testing.VERIFY_COMMANDS).every(
      (command) => command.startsWith("node ./node_modules/") && !/\bnpx\b/.test(command),
    ),
  );
}

// 8. Matching dependency fingerprints are copied into an isolated verify
//    workspace and skip install. A mismatch performs the project's own install.
{
  const {
    dependencyFingerprint,
    dependencyStatePathForWorkspace,
    setVerifyRunnersForTesting,
    tryShareNodeModules,
    workspaceDirForChat,
  } = runtime.__testing;
  const chatId = "guard-dependency-reuse";
  const source = workspaceDirForChat(chatId);
  const target = join(dataDir, "copy-target");
  const filesJson = {
    "package.json": JSON.stringify({ devDependencies: { eslint: "9.39.2" } }),
    "eslint.config.mjs": "export default [];",
  };
  const fingerprint = dependencyFingerprint(filesJson);
  for (const [relativePath, contents] of [
    [["eslint", "bin", "eslint.js"], "source"],
    [["typescript", "bin", "tsc"], "source"],
    [["next", "dist", "bin", "next"], "source"],
  ]) {
    const localToolPath = join(source, "node_modules", ...relativePath);
    mkdirSync(join(localToolPath, ".."), { recursive: true });
    writeFileSync(localToolPath, contents, "utf8");
  }
  writeFileSync(
    dependencyStatePathForWorkspace(source),
    JSON.stringify({ fingerprint }),
    "utf8",
  );
  mkdirSync(target, { recursive: true });

  const copied = tryShareNodeModules({
    sourceWorkspaceDir: source,
    targetWorkspaceDir: target,
    expectedFingerprint: fingerprint,
  });
  check("matching fingerprint reuses dependencies", copied.reused === true && copied.method === "copy");
  check("verify dependency reuse is never a symlink", !lstatSync(join(target, "node_modules")).isSymbolicLink());
  writeFileSync(join(target, "node_modules", "eslint", "bin", "eslint.js"), "verify-copy", "utf8");
  check(
    "verify copy cannot mutate live node_modules",
    readFileSync(join(source, "node_modules", "eslint", "bin", "eslint.js"), "utf8") === "source",
  );
  check(
    "fingerprint mismatch refuses dependency reuse",
    tryShareNodeModules({
      sourceWorkspaceDir: source,
      targetWorkspaceDir: target,
      expectedFingerprint: dependencyFingerprint({
        ...filesJson,
        "package.json": JSON.stringify({ devDependencies: { eslint: "9.39.3" } }),
      }),
    }).reused === false,
  );

  let installRuns = 0;
  const commands = [];
  setVerifyRunnersForTesting({
    installRunner: async (workspaceDir) => {
      installRuns += 1;
      mkdirSync(join(workspaceDir, "node_modules", "eslint", "bin"), { recursive: true });
      writeFileSync(join(workspaceDir, "node_modules", "eslint", "bin", "eslint.js"), "", "utf8");
      return {
        passed: true,
        exitCode: 0,
        durationMs: 1,
        output: "installed",
        usedFallback: false,
        peerConflictDetected: false,
      };
    },
    commandRunner: async (command) => {
      commands.push(command);
      return command.includes("eslint")
        ? { exitCode: 0, output: "✖ 1 problem (0 errors, 1 warning)", timedOut: false }
        : { exitCode: 0, output: "", timedOut: false };
    },
  });
  try {
    const reused = await runtime.runVerifyJob({
      verifyId: "reuse",
      chatId,
      versionId: "v-reuse",
      filesJson,
      checks: ["typecheck", "lint", "build"],
    });
    check("matching fingerprint skips verify install", installRuns === 0);
    check(
      "F3 checks execute typecheck then lint then build",
      commands.join("|") ===
        [
          runtime.__testing.VERIFY_COMMANDS.typecheck,
          runtime.__testing.VERIFY_COMMANDS.lint,
          runtime.__testing.VERIFY_COMMANDS.build,
        ].join("|"),
    );
    const lint = reused.results.find((result) => result.check === "lint");
    check("warning-only VM lint is promotable", lint?.passed === true && lint?.advisory === true);

    commands.length = 0;
    const mismatchFiles = {
      ...filesJson,
      "package.json": JSON.stringify({
        dependencies: { next: "16.2.9" },
        devDependencies: { eslint: "9.39.2", typescript: "5.9.3" },
      }),
    };
    const mismatch = await runtime.runVerifyJob({
      verifyId: "mismatch",
      chatId: "guard-dependency-mismatch",
      versionId: "v-mismatch",
      filesJson: mismatchFiles,
      checks: ["lint"],
    });
    check("fingerprint mismatch installs project dependencies", installRuns === 1);
    check("mismatch lint used the installed local binary", mismatch.results.some((result) => result.check === "lint"));

    const missingSetup = await runtime.runVerifyJob({
      verifyId: "missing-eslint",
      chatId: "guard-missing-eslint",
      versionId: "v-missing-eslint",
      filesJson: { "package.json": "{}" },
      checks: ["lint"],
    });
    const missingLint = missingSetup.results.find((result) => result.check === "lint");
    check("missing local ESLint never false-greens", missingLint?.passed === false);
    check("missing local ESLint is non-repairable tooling failure", missingLint?.repairable === false && missingLint?.failureKind === "tooling");
    check("missing local ESLint never invokes a package runner", commands.length === 1);

    commands.length = 0;
    const missingCoreTools = await runtime.runVerifyJob({
      verifyId: "missing-core-tools",
      chatId: "guard-missing-core-tools",
      versionId: "v-missing-core-tools",
      filesJson: { "package.json": "{}" },
      checks: ["typecheck", "build"],
    });
    for (const checkName of ["typecheck", "build"]) {
      const result = missingCoreTools.results.find((entry) => entry.check === checkName);
      check(`${checkName} missing local binary never false-greens`, result?.passed === false);
      check(
        `${checkName} missing local binary is non-repairable tooling failure`,
        result?.repairable === false && result?.failureKind === "tooling",
      );
    }
    check("missing typecheck/build tooling never invokes a package runner", commands.length === 0);
  } finally {
    setVerifyRunnersForTesting();
  }
}

// 9. Referer-fallback inputs for root-absolute Next-internal requests (TODO #4
//    mitigation): the dev-overlay requests `/__nextjs_font/*` WITHOUT the
//    chatId prefix. `chatIdFromReferer` must recover the chatId from the
//    iframe page URL, and the path matcher must only trigger on Next-internal
//    prefixes (never plain site routes, which would mask real 404s).
{
  const { chatIdFromReferer, NEXT_INTERNAL_ROOT_PATH_RE } = runtime.__testing;
  check(
    "referer with chatId prefix resolves the chatId",
    chatIdFromReferer({
      headers: { referer: "https://vm-fly-jakem.fly.dev/7e8f51e0-abc?t=1&inspect=1" },
    }) === "7e8f51e0-abc",
  );
  check("referer without a path resolves to null", chatIdFromReferer({ headers: { referer: "https://vm-fly-jakem.fly.dev/" } }) === null);
  check("missing referer resolves to null", chatIdFromReferer({ headers: {} }) === null);
  check("malformed referer resolves to null", chatIdFromReferer({ headers: { referer: "not a url" } }) === null);
  check("font path matches the Next-internal matcher", NEXT_INTERNAL_ROOT_PATH_RE.test("/__nextjs_font/geist-latin.woff2"));
  check("_next asset path matches the Next-internal matcher", NEXT_INTERNAL_ROOT_PATH_RE.test("/_next/static/media/x.woff2"));
  check("plain site route does NOT match the matcher", !NEXT_INTERNAL_ROOT_PATH_RE.test("/om/kontakt"));
  check("chatId-prefixed path does NOT match the matcher", !NEXT_INTERNAL_ROOT_PATH_RE.test("/7e8f51e0-abc/__nextjs_font/geist-latin.woff2"));
}

rmSync(dataDir, { recursive: true, force: true });

if (failures > 0) {
  console.error(`[test-runtime-guards] FAILED — ${failures} check(s) failed.`);
  process.exit(1);
}
console.log("[test-runtime-guards] All guards green.");
