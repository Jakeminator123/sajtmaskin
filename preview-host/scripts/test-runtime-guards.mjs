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
  existsSync,
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

// 5. Repeated unexpected clean exits are bounded per session+version window.
//    Before this guard every proxy refresh queued another boot and each boot
//    rewrote readiness to `starting`, so the app never received a failure.
{
  const {
    classifyRuntimeCleanExitLoop,
    RUNTIME_CLEAN_EXIT_LIMIT,
    RUNTIME_CLEAN_EXIT_WINDOW_MS,
  } = runtime.__testing;
  let timestamps = [];
  const startedAt = 1_000_000;
  for (let index = 0; index < RUNTIME_CLEAN_EXIT_LIMIT; index += 1) {
    const result = classifyRuntimeCleanExitLoop({
      timestamps,
      now: startedAt + index * 1_000,
    });
    timestamps = result.timestamps;
    check(
      `clean exit ${index + 1} has expected terminal state`,
      result.failed === (index + 1 >= RUNTIME_CLEAN_EXIT_LIMIT),
    );
  }
  const afterWindow = classifyRuntimeCleanExitLoop({
    timestamps,
    now: startedAt + RUNTIME_CLEAN_EXIT_WINDOW_MS + 5_000,
  });
  check("clean-exit window expires old attempts", afterWindow.failed === false);
  check("clean-exit window retains only the new attempt", afterWindow.timestamps.length === 1);
}

// 6. Per-chat boot serialization (prod-incident 2026-07-03, chat e8420220):
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

// 9. Referer-fallback inputs for supported root-absolute runtime requests:
//    Next internals and generated `/api/*` calls omit the multiplexed chatId
//    prefix. Plain site routes must never match, or real 404s would be masked.
{
  const {
    APP_API_ROOT_PATH_RE,
    chatIdFromReferer,
    NEXT_INTERNAL_ROOT_PATH_RE,
  } = runtime.__testing;
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
  check("App Router API path matches the app-api matcher", APP_API_ROOT_PATH_RE.test("/api/chat"));
  check("App Router API root matches the app-api matcher", APP_API_ROOT_PATH_RE.test("/api"));
  check("API-looking page path does NOT match", !APP_API_ROOT_PATH_RE.test("/apis/chat"));
  check("plain site route does NOT match the matcher", !NEXT_INTERNAL_ROOT_PATH_RE.test("/om/kontakt"));
  check("chatId-prefixed path does NOT match the matcher", !NEXT_INTERNAL_ROOT_PATH_RE.test("/7e8f51e0-abc/__nextjs_font/geist-latin.woff2"));
}

// 10. Stale-lockfile protocol (prod incident 2026-07-31, radix-ui): when the
//     app marks a mutated lockfile stale, resolveInstallCommand must run the
//     package manager WITHOUT frozen-lockfile as the PRIMARY command so the
//     newly-pinned dependency is actually installed and the lockfile updated.
{
  const { resolveInstallCommand, readStaleLockfileMarker, LOCKFILE_STALE_MARKER_PATH } =
    runtime.__testing;
  const staleMarker = JSON.stringify({
    reason: "dep-completer pinned radix-ui",
    packageManager: "pnpm",
    mutatedAt: new Date().toISOString(),
  });
  const pnpmStale = resolveInstallCommand({
    "package.json": "{}",
    "pnpm-lock.yaml": "lockfileVersion: 9",
    [LOCKFILE_STALE_MARKER_PATH]: staleMarker,
  });
  check("stale pnpm lock installs WITHOUT --frozen-lockfile", /--no-frozen-lockfile/.test(pnpmStale.command));
  check("stale pnpm lock never runs frozen as primary", !/\s--frozen-lockfile/.test(pnpmStale.command));
  check("stale pnpm lock is flagged for lockfile capture", pnpmStale.lockfileStale === true && pnpmStale.packageManager === "pnpm");

  const npmStale = resolveInstallCommand({
    "package.json": "{}",
    "package-lock.json": "{}",
    [LOCKFILE_STALE_MARKER_PATH]: staleMarker,
  });
  check("stale npm lock uses `npm install` not `npm ci`", /^npm install/.test(npmStale.command) && !/npm ci/.test(npmStale.command));

  const yarnStale = resolveInstallCommand({
    "package.json": "{}",
    "yarn.lock": "",
    [LOCKFILE_STALE_MARKER_PATH]: staleMarker,
  });
  check("stale yarn lock drops --frozen-lockfile", !/--frozen-lockfile/.test(yarnStale.command));

  // Non-stale keeps today's frozen behaviour.
  const pnpmFresh = resolveInstallCommand({ "package.json": "{}", "pnpm-lock.yaml": "lockfileVersion: 9" });
  check("fresh pnpm lock still runs frozen", /--frozen-lockfile/.test(pnpmFresh.command) && pnpmFresh.lockfileStale === false);

  check("stale marker parses shape", readStaleLockfileMarker({ [LOCKFILE_STALE_MARKER_PATH]: staleMarker })?.packageManager === "pnpm");
  check("absent stale marker is null", readStaleLockfileMarker({ "package.json": "{}" }) === null);
}

// 11. Readiness ≠ process running: the Next build-error overlay is HTTP 200
//     HTML with visible text, so waitForReady must REJECT it instead of
//     accepting it as ready (the false-green behind the incident).
{
  const { htmlLooksLikeBuildError, waitForReady } = runtime.__testing;
  const { createServer } = await import("node:http");
  const overlayHtml =
    "<!doctype html><html><head><title>Build Error</title></head><body><nextjs-portal></nextjs-portal><pre>Module not found: Can't resolve 'radix-ui'</pre></body></html>";
  const goodHtml =
    "<!doctype html><html><head><title>My site</title></head><body><main><h1>Welcome to the homepage</h1><p>Lots of real visible content here for readiness.</p></main></body></html>";

  check("overlay HTML is detected as a build error", htmlLooksLikeBuildError(overlayHtml) === true);
  check("normal HTML is not a build error", htmlLooksLikeBuildError(goodHtml) === false);

  // A HEALTHY preview whose content legitimately renders error prose (error
  // dashboards, log viewers, monitoring UIs — the kind of v0 project this host
  // serves) must NOT be flagged: generic phrases only count alongside a Next
  // dev-overlay structural marker.
  const errorDashboardHtml =
    "<!doctype html><html><head><title>Error Dashboard</title></head><body><main><h1>Incidents</h1><ul><li>Unhandled Runtime Error &mdash; 12 events</li><li>Module not found &mdash; 3 events</li></ul><p>Cannot find module errors are trending down. 0 Build Errors today.</p></main></body></html>";
  check(
    "healthy error-dashboard content is NOT a build error",
    htmlLooksLikeBuildError(errorDashboardHtml) === false,
  );
  check(
    "generic error prose alongside a Next overlay marker IS a build error",
    htmlLooksLikeBuildError(
      "<!doctype html><html><body><div data-nextjs-dialog>Unhandled Runtime Error</div></body></html>",
    ) === true,
  );
  check(
    "the Next compiler prose alone is a build error",
    htmlLooksLikeBuildError(
      "<!doctype html><html><body><h1>Failed to compile</h1><pre>./app/page.tsx</pre></body></html>",
    ) === true,
  );
  check("empty HTML is not a build error", htmlLooksLikeBuildError("") === false);

  async function withServer(html, fn) {
    const server = createServer((_req, res) => {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(html);
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address();
    try {
      return await fn(`http://127.0.0.1:${port}/`);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  }

  let overlayRejected = false;
  let overlayMessage = "";
  await withServer(overlayHtml, async (url) => {
    try {
      await waitForReady(url);
    } catch (err) {
      overlayRejected = true;
      overlayMessage = err instanceof Error ? err.message : String(err);
    }
  });
  check("waitForReady rejects a persistent build-error overlay", overlayRejected === true);
  check("waitForReady rejection names the build error", /build error overlay/i.test(overlayMessage));

  let goodResolved = false;
  await withServer(goodHtml, async (url) => {
    try {
      await waitForReady(url);
      goodResolved = true;
    } catch {
      goodResolved = false;
    }
  });
  check("waitForReady accepts a real ready page", goodResolved === true);

  let dashboardResolved = false;
  await withServer(errorDashboardHtml, async (url) => {
    try {
      await waitForReady(url);
      dashboardResolved = true;
    } catch {
      dashboardResolved = false;
    }
  });
  check("waitForReady accepts a healthy page that renders error prose", dashboardResolved === true);

  // Persistent empty <body> must NOT false-green, and must NOT wait out the full
  // readiness deadline either: it gets its own, much shorter window. Shrink both
  // for this guard — prod uses 600s readiness / 90s empty-body.
  const emptyHtml =
    "<!doctype html><html><head><title>Boot</title></head><body><div id=\"__next\"></div></body></html>";
  const previousReadyMax = process.env.PREVIEW_HOST_RUNTIME_READY_MAX_MS;
  const previousEmptyMax = process.env.PREVIEW_HOST_RUNTIME_READY_EMPTY_BODY_MAX_MS;
  process.env.PREVIEW_HOST_RUNTIME_READY_MAX_MS = "60000";
  process.env.PREVIEW_HOST_RUNTIME_READY_EMPTY_BODY_MAX_MS = "3000";
  let emptyRejected = false;
  let emptyMessage = "";
  const emptyStartedAt = Date.now();
  try {
    await withServer(emptyHtml, async (url) => {
      try {
        await waitForReady(url);
      } catch (err) {
        emptyRejected = true;
        emptyMessage = err instanceof Error ? err.message : String(err);
      }
    });
  } finally {
    if (previousReadyMax === undefined) {
      delete process.env.PREVIEW_HOST_RUNTIME_READY_MAX_MS;
    } else {
      process.env.PREVIEW_HOST_RUNTIME_READY_MAX_MS = previousReadyMax;
    }
    if (previousEmptyMax === undefined) {
      delete process.env.PREVIEW_HOST_RUNTIME_READY_EMPTY_BODY_MAX_MS;
    } else {
      process.env.PREVIEW_HOST_RUNTIME_READY_EMPTY_BODY_MAX_MS = previousEmptyMax;
    }
  }
  const emptyElapsedMs = Date.now() - emptyStartedAt;
  check("waitForReady rejects a persistent empty HTML body", emptyRejected === true);
  check(
    "empty-body rejection names the empty-body condition",
    /empty body/i.test(emptyMessage) && /body text still empty/i.test(emptyMessage),
  );
  check(
    "empty-body rejection does not accept early (waits out its own window)",
    emptyElapsedMs >= 2500,
  );
  // The point of the separate window: a client-rendered page must fail in ~3s
  // here, not sit for the 60s readiness deadline. Without this the fix trades a
  // false-green for a ten-minute hang in prod.
  check(
    "empty-body rejection uses its OWN window, not the readiness deadline",
    emptyElapsedMs < 20_000,
  );

  // Motprov: empty during first compile, then meaningful content → ready.
  // Proves we keep polling instead of failing on the first empty responses.
  {
    let hits = 0;
    const server = createServer((_req, res) => {
      hits += 1;
      const html = hits < 3 ? emptyHtml : goodHtml;
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(html);
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address();
    let delayedReady = false;
    try {
      await waitForReady(`http://127.0.0.1:${port}/`);
      delayedReady = true;
    } catch {
      delayedReady = false;
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
    check(
      "waitForReady accepts a page that fills in after empty compile polls",
      delayedReady === true && hits >= 3,
    );
  }
}

// 12. PM-safe dependency postcondition: prefer the package manager's own view,
//     fail closed when a declared direct dep is missing from the installed graph.
{
  const { verifyInstalledDependencies, collectInstalledDirectDepNames } = runtime.__testing;
  const filesJson = {
    "package.json": JSON.stringify({
      dependencies: { next: "15.0.0", react: "18", "radix-ui": "^1" },
      devDependencies: { typescript: "5" },
    }),
    "package-lock.json": "{}",
  };
  const wsDir = join(dataDir, "postcond-ws");
  mkdirSync(wsDir, { recursive: true });

  const lsWithAll = JSON.stringify({
    dependencies: { next: { version: "15" }, react: { version: "18" }, "radix-ui": { version: "1" } },
    devDependencies: { typescript: { version: "5" } },
  });
  const lsMissingRadix = JSON.stringify({
    dependencies: { next: { version: "15" }, react: { version: "18" } },
    devDependencies: { typescript: { version: "5" } },
  });

  const okResult = await verifyInstalledDependencies(wsDir, filesJson, {
    packageManager: "npm",
    commandRunner: async () => ({ exitCode: 0, output: lsWithAll, timedOut: false }),
  });
  check("postcondition passes when all direct deps present (PM view)", okResult.ok === true && okResult.checkedWith === "npm-ls");

  const missingResult = await verifyInstalledDependencies(wsDir, filesJson, {
    packageManager: "npm",
    commandRunner: async () => ({ exitCode: 1, output: lsMissingRadix, timedOut: false }),
  });
  check("postcondition fails closed when a direct dep is missing", missingResult.ok === false && missingResult.missing.includes("radix-ui"));

  check(
    "collectInstalledDirectDepNames parses pnpm array shape",
    collectInstalledDirectDepNames(JSON.stringify([{ dependencies: { "radix-ui": { version: "1" } } }]), "pnpm")?.has("radix-ui") === true,
  );
  check(
    "collectInstalledDirectDepNames parses yarn tree shape",
    collectInstalledDirectDepNames('{"type":"tree","data":{"trees":[{"name":"radix-ui@1.0.0"}]}}', "yarn")?.has("radix-ui") === true,
  );
}

// 13. REPRO (old behavior false-greened): warm node_modules + stale pnpm lock +
//     a newly pinned dep. runInstallCommand must (a) NOT stamp the dependency
//     fingerprint when install exits 0 but the dep is still missing, and (b)
//     stamp it AND return the regenerated lockfile only after the postcondition
//     confirms the dep is present. On master, install exit 0 stamped the
//     fingerprint unconditionally → the missing dep was cached as "installed".
{
  const {
    runInstallCommand,
    dependencyStatePathForWorkspace,
    setBootInstallRunnersForTesting,
    LOCKFILE_STALE_MARKER_PATH,
  } = runtime.__testing;

  const filesJson = {
    "package.json": JSON.stringify({
      dependencies: { next: "15.0.0", react: "18", "react-dom": "18", "radix-ui": "^1" },
    }),
    "pnpm-lock.yaml": "lockfileVersion: 9\n# stale: missing radix-ui\n",
    [LOCKFILE_STALE_MARKER_PATH]: JSON.stringify({
      reason: "dep-completer pinned radix-ui",
      packageManager: "pnpm",
      mutatedAt: new Date().toISOString(),
    }),
  };

  // (a) install exits 0 but installs nothing (the stale-lockfile bug) → the
  //     postcondition catches the still-missing dep and the fingerprint is NOT
  //     written, so the next boot re-runs install (no false green).
  {
    const wsDir = join(dataDir, "repro-falsegreen");
    mkdirSync(join(wsDir, "node_modules"), { recursive: true }); // warm modules
    setBootInstallRunnersForTesting({
      installRunner: async () => ({
        passed: true,
        exitCode: 0,
        durationMs: 1,
        output: "Already up to date",
        usedFallback: false,
        peerConflictDetected: false,
      }),
      // PM view reports radix-ui is NOT installed (install did nothing).
      postconditionCommandRunner: async () => ({
        exitCode: 0,
        output: JSON.stringify({
          dependencies: { next: { version: "15" }, react: { version: "18" }, "react-dom": { version: "18" } },
        }),
        timedOut: false,
      }),
    });
    let threw = false;
    try {
      await runInstallCommand(wsDir, "ps_repro_a", filesJson);
    } catch {
      threw = true;
    } finally {
      setBootInstallRunnersForTesting();
    }
    check("repro(a): install exit 0 but missing dep throws", threw === true);
    check(
      "repro(a): dependency fingerprint NOT written on failed postcondition",
      !existsSync(dependencyStatePathForWorkspace(wsDir)),
    );
  }

  // (b) the fix: the non-frozen install actually installs radix-ui and
  //     regenerates the lockfile → postcondition passes, fingerprint is stamped,
  //     and the regenerated lockfile is returned for persistence.
  {
    const wsDir = join(dataDir, "repro-fixed");
    mkdirSync(join(wsDir, "node_modules"), { recursive: true });
    setBootInstallRunnersForTesting({
      installRunner: async (workspaceDir) => {
        // Simulate a real non-frozen install: materialize the dep + rewrite lock.
        mkdirSync(join(workspaceDir, "node_modules", "radix-ui"), { recursive: true });
        writeFileSync(
          join(workspaceDir, "pnpm-lock.yaml"),
          "lockfileVersion: 9\n# regenerated: includes radix-ui\n",
          "utf8",
        );
        return {
          passed: true,
          exitCode: 0,
          durationMs: 1,
          output: "pnpm install passed.",
          usedFallback: false,
          peerConflictDetected: false,
        };
      },
      postconditionCommandRunner: async () => ({
        exitCode: 0,
        output: JSON.stringify({
          dependencies: {
            next: { version: "15" },
            react: { version: "18" },
            "react-dom": { version: "18" },
            "radix-ui": { version: "1" },
          },
        }),
        timedOut: false,
      }),
    });
    let outcome = null;
    try {
      outcome = await runInstallCommand(wsDir, "ps_repro_b", filesJson);
    } finally {
      setBootInstallRunnersForTesting();
    }
    check("repro(b): fingerprint written only after postcondition passes", existsSync(dependencyStatePathForWorkspace(wsDir)));
    check("repro(b): regenerated lockfile returned for persistence", outcome?.regeneratedLockfile?.path === "pnpm-lock.yaml");
    check(
      "repro(b): regenerated lockfile content reflects the reinstall",
      /regenerated: includes radix-ui/.test(outcome?.regeneratedLockfile?.content ?? ""),
    );
    check("repro(b): stale marker cleared flag set", outcome?.staleCleared === true);
  }
}

// 14. GUARD (Bugbot finding 2): a fingerprint-match skip must NOT ignore the
//     stale-lockfile marker. A prior boot may have stamped this exact
//     fingerprint BEFORE the lockfile was marked stale, so a plain
//     fingerprint-equality early-return would skip the one non-frozen reconcile
//     forever. With the marker present, runInstallCommand must fall through to
//     the (non-frozen) install + postcondition even though the fingerprint
//     matches the prior stamp.
{
  const {
    runInstallCommand,
    dependencyFingerprint,
    dependencyStatePathForWorkspace,
    setBootInstallRunnersForTesting,
    resolveInstallCommand,
    LOCKFILE_STALE_MARKER_PATH,
  } = runtime.__testing;

  const filesJson = {
    "package.json": JSON.stringify({
      dependencies: { next: "15.0.0", react: "18", "react-dom": "18", "radix-ui": "^1" },
    }),
    "pnpm-lock.yaml": "lockfileVersion: 9\n# stale: missing radix-ui\n",
    [LOCKFILE_STALE_MARKER_PATH]: JSON.stringify({
      reason: "dep-completer pinned radix-ui after a prior fingerprint stamp",
      packageManager: "pnpm",
      mutatedAt: new Date().toISOString(),
    }),
  };

  // Sanity: the marker makes resolveInstallCommand pick the non-frozen path.
  check(
    "finding2: stale marker selects the non-frozen install command",
    resolveInstallCommand(filesJson).lockfileStale === true,
  );

  const wsDir = join(dataDir, "finding2-stale-skip");
  mkdirSync(join(wsDir, "node_modules"), { recursive: true }); // warm modules
  // Pre-stamp the SAME fingerprint a prior boot would have written — this is the
  // exact condition the plain skip would short-circuit on.
  writeFileSync(
    dependencyStatePathForWorkspace(wsDir),
    JSON.stringify({ fingerprint: dependencyFingerprint(filesJson) }, null, 2),
    "utf8",
  );

  let installRan = false;
  let postconditionRan = false;
  setBootInstallRunnersForTesting({
    installRunner: async (workspaceDir) => {
      installRan = true;
      mkdirSync(join(workspaceDir, "node_modules", "radix-ui"), { recursive: true });
      writeFileSync(
        join(workspaceDir, "pnpm-lock.yaml"),
        "lockfileVersion: 9\n# regenerated: includes radix-ui\n",
        "utf8",
      );
      return {
        passed: true,
        exitCode: 0,
        durationMs: 1,
        output: "pnpm install --no-frozen-lockfile passed.",
        usedFallback: false,
        peerConflictDetected: false,
      };
    },
    postconditionCommandRunner: async () => {
      postconditionRan = true;
      return {
        exitCode: 0,
        output: JSON.stringify({
          dependencies: {
            next: { version: "15" },
            react: { version: "18" },
            "react-dom": { version: "18" },
            "radix-ui": { version: "1" },
          },
        }),
        timedOut: false,
      };
    },
  });

  let outcome = null;
  try {
    outcome = await runInstallCommand(wsDir, "ps_finding2", filesJson);
  } finally {
    setBootInstallRunnersForTesting();
  }

  check("finding2: fingerprint match + stale marker does NOT skip install", installRan === true);
  check("finding2: postcondition runs on the forced reconcile", postconditionRan === true);
  check("finding2: install was not reported as skipped", outcome?.skipped !== true);
  check(
    "finding2: regenerated lockfile returned for persistence",
    outcome?.regeneratedLockfile?.path === "pnpm-lock.yaml",
  );
}

// Disk budget: package caches must live on the mounted volume, and a disk-full
// install must be recognised as such. Before this, npm cached into the Fly
// rootfs (`/root/.npm`) — a layer no cleanup path reclaims — and filled it to 0
// bytes free, after which every preview boot died with ENOSPC while `/data`
// still had 17 GB free (2026-07-31).
{
  const { isNoSpaceInstallFailure, sanitizedEnv, PACKAGE_CACHE_DIR, NPM_CACHE_DIR } =
    runtime.__testing;

  check(
    "package cache dir is inside the data volume",
    PACKAGE_CACHE_DIR.startsWith(dataDir),
  );

  // Each key below is the one its tool actually reads. Getting the NAME wrong
  // fails silently — the tool just keeps using its rootfs default — so these
  // assertions are the only thing standing between a typo and a wedged VM.
  // `PNPM_STORE_DIR` (no CONFIG) and a bare `YARN_CACHE_FOLDER` were exactly
  // that mistake: pnpm reads PNPM_CONFIG_*, and Yarn Berry's default global
  // cache overrides cacheFolder entirely.
  const env = sanitizedEnv();
  check("npm cache env points at the volume", env.NPM_CONFIG_CACHE === NPM_CACHE_DIR);
  check(
    "pnpm store env uses the PNPM_CONFIG_ prefix pnpm actually reads",
    String(env.PNPM_CONFIG_STORE_DIR).startsWith(dataDir),
  );
  check("yarn classic cache env points at the volume", String(env.YARN_CACHE_FOLDER).startsWith(dataDir));
  check(
    "yarn berry global folder points at the volume",
    String(env.YARN_GLOBAL_FOLDER).startsWith(dataDir),
  );
  check("corepack home points at the volume", String(env.COREPACK_HOME).startsWith(dataDir));
  check("XDG data home points at the volume", String(env.XDG_DATA_HOME).startsWith(dataDir));
  check("XDG cache home points at the volume", String(env.XDG_CACHE_HOME).startsWith(dataDir));
  check(
    "no cache env var still points at the rootfs home",
    !Object.entries(env)
      .filter(([key]) => /CACHE|STORE_DIR|COREPACK|XDG/.test(key))
      .some(([, value]) => /^\/root\//.test(String(value))),
  );

  // Allowlist-kopieringen lät en ÄRVD cache-variabel vinna över den beräknade
  // sökvägen. `NPM_CONFIG_CACHE=/root/.npm` är npm:s egen default och lätt att
  // ärva från en basbild eller ett `fly secrets`-misstag — och då är hela
  // volym-fixen ovan verkningslös utan att något test märkte det, eftersom
  // sviten körs utan variabeln satt.
  {
    const prior = process.env.NPM_CONFIG_CACHE;
    // `npm run` injicerar sin egen konfiguration som `npm_config_*` i GEMENER.
    // Windows env-namn är skiftlägesokänsliga men BEHÅLLER det skiftläge som
    // sattes först, så en tilldelning till `NPM_CONFIG_CACHE` här skulle dyka
    // upp som `npm_config_cache` i `Object.entries` och missa allowlisten —
    // varpå testet nedan hade blivit grönt utan att bevisa någonting. Radera
    // först, så äger vi skiftläget.
    const setCache = (value) => {
      delete process.env.NPM_CONFIG_CACHE;
      process.env.NPM_CONFIG_CACHE = value;
    };
    try {
      setCache("/root/.npm");
      check(
        "an inherited cache path outside the volume is ignored",
        sanitizedEnv().NPM_CONFIG_CACHE === NPM_CACHE_DIR,
      );

      // Men en ärvd sökväg som ligger PÅ volymen är ett legitimt val (t.ex.
      // fly.toml:s egen rad) och ska respekteras.
      const onVolume = join(dataDir, "package-caches", "npm-custom");
      setCache(onVolume);
      check(
        "an inherited cache path inside the volume is respected",
        sanitizedEnv().NPM_CONFIG_CACHE === onVolume,
      );

      // En syskonmapp med samma prefix ligger INTE i volymen.
      setCache(`${dataDir}-elsewhere`);
      check(
        "a sibling path that merely shares the prefix is ignored",
        sanitizedEnv().NPM_CONFIG_CACHE === NPM_CACHE_DIR,
      );
    } finally {
      delete process.env.NPM_CONFIG_CACHE;
      if (prior !== undefined) process.env.NPM_CONFIG_CACHE = prior;
    }
  }

  check(
    "npm ENOSPC output is recognised as disk-full",
    isNoSpaceInstallFailure("npm error code ENOSPC\nnpm error syscall write"),
  );
  check(
    "plain-text no-space message is recognised",
    isNoSpaceInstallFailure("Error: no space left on device"),
  );
  check(
    "an ordinary dependency failure is NOT disk-full",
    !isNoSpaceInstallFailure("npm error code ERESOLVE\nnpm error ERESOLVE unable to resolve"),
  );
  check("empty output is NOT disk-full", !isNoSpaceInstallFailure(""));

  // Forced purge must empty the cache tree but leave the directories usable.
  mkdirSync(join(NPM_CACHE_DIR, "_cacache"), { recursive: true });
  writeFileSync(join(NPM_CACHE_DIR, "_cacache", "blob.bin"), "x".repeat(2048));
  const purge = await runtime.cleanupPackageCaches({ force: true });
  check("forced purge reports the reclaimed size", purge.cacheBytesBefore >= 2048);
  check("forced purge removed the cached blob", !existsSync(join(NPM_CACHE_DIR, "_cacache", "blob.bin")));
  check("forced purge recreated the cache dir", existsSync(NPM_CACHE_DIR));

  // A small cache is under budget and must be kept warm.
  writeFileSync(join(NPM_CACHE_DIR, "small.bin"), "y".repeat(64));
  const keep = await runtime.cleanupPackageCaches();
  check("cache under budget is not purged", keep.purgedCache === false);
  check("cache under budget survives cleanup", existsSync(join(NPM_CACHE_DIR, "small.bin")));

  // Storage reporting must surface the cache so a full disk is diagnosable
  // from `GET /admin/storage` instead of requiring `fly ssh`.
  const described = await runtime.describePackageCacheStorage();
  check("storage report includes the cache dir", described.dir === PACKAGE_CACHE_DIR);
  check("storage report includes a byte count", Number.isFinite(described.bytes));
  const reused = await runtime.describePackageCacheStorage({ knownBytes: 4242 });
  check("storage report can reuse an already-measured size", reused.bytes === 4242);

  // The size walk is async by construction (`fsp.readdir` / `fsp.lstat`). A
  // timer-based "did the event loop tick" assertion is flaky: on a fast CI
  // host a one-file tree completes as a chain of already-resolved microtasks
  // before a 1 ms interval ever fires, even though the walk never blocked.
  // Assert the contract we can actually observe — it returns a Promise and a
  // correct byte count — and leave the non-blocking property to code review
  // of the `await fsp.*` body.
  writeFileSync(join(NPM_CACHE_DIR, "loop.bin"), "z".repeat(1024));
  const measuredPromise = runtime.directorySizeBytes(PACKAGE_CACHE_DIR);
  check(
    "directory size walk returns a Promise",
    typeof measuredPromise?.then === "function",
  );
  const measured = await measuredPromise;
  check("directory size walk returns a byte count", measured >= 1024);

  // A purge requested from outside an install (background sweep, admin
  // endpoint) must take the install slot, or it can `rm -rf` the cache out from
  // under an in-flight `npm install` and fail it with a bogus ENOENT.
  const { runInInstallSlot } = runtime.__testing;
  const order = [];
  const slowInstall = runInInstallSlot(async () => {
    order.push("install:start");
    await new Promise((resolve) => setTimeout(resolve, 30));
    order.push("install:end");
  });
  const purgeDuringInstall = runtime.cleanupPackageCaches({ force: true }).then(() => {
    order.push("purge");
  });
  await Promise.all([slowInstall, purgeDuringInstall]);
  check(
    "external cache purge waits for the in-flight install",
    order.join(",") === "install:start,install:end,purge",
  );

  // ...while the ENOSPC path inside an install purges WITHOUT the slot, since
  // it already holds it. Queuing there would deadlock the whole VM.
  const inSlot = await runInInstallSlot(async () =>
    runtime.__testing.cleanupPackageCachesUnqueued({ force: true }),
  );
  check("in-slot purge completes without deadlocking", inSlot.purgedCache === true);
}

// 16. Boot-failure cap (P2 crash-loop without error surface):
//     When install/boot fails, splash refresh + status traffic used to call
//     ensureRuntimeForChat forever. After N failures for the same version the
//     session must stay terminal `error` and refuse further boots so the app
//     can project readinessState=failed (existing preview-status → error log).
{
  const { setBootInstallRunnersForTesting, clearRuntimeStateForTesting } =
    runtime.__testing;
  // Mirror the clean-exit budget: three strikes, then terminal.
  const BOOT_FAILURE_CAP = 3;
  const chatId = "guard-boot-fail-cap";
  const sessionId = "guard-boot-fail-session";
  const previewSessionId = "ps_guard-boot-fail";
  const versionId = "v-boot-fail";

  function writeBootFailSession() {
    const session = {
      sessionId,
      previewSessionId,
      chatId,
      versionId,
      previewUrl: `http://localhost/${chatId}`,
      status: "starting",
      lastAction: "start",
      sessionExpiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      filesJson: {
        "package.json": JSON.stringify({
          name: "boot-fail-cap",
          private: true,
          dependencies: { next: "15.0.0", react: "18", "react-dom": "18" },
        }),
      },
    };
    mkdirSync(dataDir, { recursive: true });
    writeFileSync(
      join(dataDir, "preview-host-store.json"),
      JSON.stringify({
        sessions: { [sessionId]: session },
        logs: {},
        previewSessionToSession: { [previewSessionId]: sessionId },
      }),
      "utf8",
    );
  }

  let installAttempts = 0;
  setBootInstallRunnersForTesting({
    installRunner: async () => {
      installAttempts += 1;
      return {
        passed: false,
        exitCode: 1,
        durationMs: 1,
        output: "pnpm install failed: simulated boot failure",
        usedFallback: false,
        peerConflictDetected: false,
      };
    },
  });

  // ensureRuntimeForChat clears inflightBootByChat in a trailing microtask.
  // Await one macrotask so the next call does not reuse the rejected promise
  // (same gap the 4s splash refresh has in production).
  async function ensureBootAttempt() {
    try {
      await runtime.ensureRuntimeForChat(chatId);
    } catch {
      /* boot failure expected */
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  try {
    writeBootFailSession();

    // Motprov: one failure must still be retriable — the next ensure still boots.
    await ensureBootAttempt();
    check("boot failure #1 records an install attempt", installAttempts === 1);
    const afterFirst = installAttempts;
    await ensureBootAttempt();
    check(
      "boot after fewer-than-N failures still retries",
      installAttempts === afterFirst + 1,
    );

    // Drive remaining failures up to the cap.
    while (installAttempts < BOOT_FAILURE_CAP) {
      await ensureBootAttempt();
    }
    check(
      "boot failure cap reached exactly N install attempts",
      installAttempts === BOOT_FAILURE_CAP,
    );

    const atCap = installAttempts;
    await ensureBootAttempt();
    const storeAfter = JSON.parse(
      readFileSync(join(dataDir, "preview-host-store.json"), "utf8"),
    );
    const terminal = storeAfter.sessions[sessionId];
    check(
      "boot failure cap refuses further boots",
      installAttempts === atCap,
    );
    check(
      "boot failure cap leaves session terminal error",
      terminal?.status === "error" && terminal?.readinessState === "failed",
    );
  } finally {
    setBootInstallRunnersForTesting();
    clearRuntimeStateForTesting(chatId, sessionId);
  }
}

// 17. Boot-failure budget vs the same-version repair (Bugbot finding on #799):
//     `POST /preview/session/update` resets the budget because rewriting content
//     IS the repair. Install runs for minutes, so that reset routinely lands
//     while a boot is in flight. The failing boot must count from the STORE, not
//     from the session snapshot it started with — otherwise its catch writes the
//     pre-reset strikes back, reaches the cap, and the pre-boot guard refuses
//     the very boot the update asked for.
{
  const { setBootInstallRunnersForTesting, clearRuntimeStateForTesting } = runtime.__testing;
  const chatId = "guard-boot-reset-race";
  const sessionId = "guard-boot-reset-session";
  const previewSessionId = "ps_guard-boot-reset";
  const versionId = "v-boot-reset";
  const storePath = join(dataDir, "preview-host-store.json");
  const readStore = () => JSON.parse(readFileSync(storePath, "utf8"));
  const writeStore = (data) => writeFileSync(storePath, JSON.stringify(data), "utf8");

  // Seed ONE strike short of the cap for this version.
  const seededStrikes = [Date.now() - 3_000, Date.now() - 2_000];
  mkdirSync(dataDir, { recursive: true });
  writeStore({
    sessions: {
      [sessionId]: {
        sessionId,
        previewSessionId,
        chatId,
        versionId,
        previewUrl: `http://localhost/${chatId}`,
        status: "starting",
        lastAction: "start",
        sessionExpiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        runtimeBootFailureVersionId: versionId,
        runtimeBootFailureTimestamps: [...seededStrikes],
        filesJson: {
          "package.json": JSON.stringify({
            name: "boot-reset-race",
            private: true,
            dependencies: { next: "15.0.0", react: "18", "react-dom": "18" },
          }),
        },
      },
    },
    logs: {},
    previewSessionToSession: { [previewSessionId]: sessionId },
  });

  let installAttempts = 0;
  let resetApplied = false;
  setBootInstallRunnersForTesting({
    installRunner: async () => {
      installAttempts += 1;
      if (!resetApplied) {
        // Mirror exactly what the update route writes to the budget when the
        // same version is rewritten — mid-install, as it happens in production.
        resetApplied = true;
        const data = readStore();
        data.sessions[sessionId].runtimeBootFailureVersionId = versionId;
        data.sessions[sessionId].runtimeBootFailureTimestamps = [];
        writeStore(data);
      }
      return {
        passed: false,
        exitCode: 1,
        durationMs: 1,
        output: "pnpm install failed: simulated failure after a mid-install reset",
        usedFallback: false,
        peerConflictDetected: false,
      };
    },
  });

  async function attemptBoot() {
    try {
      await runtime.ensureRuntimeForChat(chatId);
    } catch {
      /* boot failure expected */
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  try {
    await attemptBoot();
    const afterRace = readStore().sessions[sessionId];
    const afterRaceStrikes = Array.isArray(afterRace?.runtimeBootFailureTimestamps)
      ? afterRace.runtimeBootFailureTimestamps
      : null;
    check(
      "mid-install reset survives the failing boot's own write",
      afterRaceStrikes?.length === 1,
    );
    check(
      "the failing boot does not resurrect pre-reset strikes",
      !seededStrikes.some((stamp) => (afterRaceStrikes ?? []).includes(stamp)),
    );

    // The whole point of the reset: the repaired project must get to boot.
    const beforeRetry = installAttempts;
    await attemptBoot();
    check("a boot after a mid-install reset is not refused", installAttempts === beforeRetry + 1);

    // Motprov: with no update in between, genuine repeated failures must STILL
    // cap. The fix must not disarm the guard it protects.
    await attemptBoot();
    const atCap = installAttempts;
    await attemptBoot();
    const capped = readStore().sessions[sessionId];
    check("genuine repeated failures still reach the cap", installAttempts === atCap);
    check(
      "capped session is still terminal error",
      capped?.status === "error" && capped?.readinessState === "failed",
    );
  } finally {
    setBootInstallRunnersForTesting();
    clearRuntimeStateForTesting(chatId, sessionId);
  }
}

// SM-044: swapping the runtime under an open iframe must tell that client to
// reload. The preview URL is stable (host proxies /{chatId}/), so a leftover
// document from the previous Next process hydrates against the new process's
// HTML/JS and throws. Non-restart boots must not send an extra signal.
{
  const {
    registerPreviewSocket,
    setBootRunnerForTesting,
    clearRuntimeStateForTesting,
    markPendingPreviewClientReload,
    clearPendingPreviewClientReload,
  } = runtime.__testing;

  function fakePreviewSocket() {
    const socket = new EventEmitter();
    socket.writes = [];
    socket.destroyed = false;
    socket.writable = true;
    socket.write = (buf) => {
      socket.writes.push(Buffer.from(buf));
      return true;
    };
    return socket;
  }

  function seedReloadSession(chatId) {
    const session = {
      sessionId: `sess-${chatId}`,
      previewSessionId: `ps-${chatId}`,
      chatId,
      versionId: "v1",
      previewUrl: `http://localhost/${chatId}`,
      status: "warm_project",
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
    return session;
  }

  function wroteReloadPage(socket) {
    return socket.writes.some((buf) => /reloadPage/.test(buf.toString("utf8")));
  }

  setBootRunnerForTesting(async () => ({ runtimePort: 4202 }));

  try {
    const swapChat = "guard-reload-swap";
    const swapSession = seedReloadSession(swapChat);
    const openSocket = fakePreviewSocket();
    registerPreviewSocket(swapChat, openSocket);
    await runtime.ensureRuntimeForChat(swapChat, { restart: true });
    check(
      "runtime swap with an open iframe sends reloadPage on preview sockets",
      wroteReloadPage(openSocket),
    );
    clearRuntimeStateForTesting(swapChat, swapSession.sessionId);

    const keepChat = "guard-reload-keep";
    const keepSession = seedReloadSession(keepChat);
    const quietSocket = fakePreviewSocket();
    registerPreviewSocket(keepChat, quietSocket);
    await runtime.ensureRuntimeForChat(keepChat, {});
    check(
      "session without runtime swap does not send reloadPage",
      quietSocket.writes.length === 0 && !wroteReloadPage(quietSocket),
    );
    clearRuntimeStateForTesting(keepChat, keepSession.sessionId);

    const freshChat = "guard-reload-fresh";
    const freshSession = seedReloadSession(freshChat);
    await runtime.ensureRuntimeForChat(freshChat, { restart: true });
    const lateSocket = fakePreviewSocket();
    registerPreviewSocket(freshChat, lateSocket);
    await new Promise((resolve) => setImmediate(resolve));
    check(
      "restart without an open iframe does not leave a pending reload for later sockets",
      lateSocket.writes.length === 0,
    );
    clearRuntimeStateForTesting(freshChat, freshSession.sessionId);

    const ghostChat = "guard-reload-ghost";
    const ghostSession = seedReloadSession(ghostChat);
    const storePath = join(dataDir, "preview-host-store.json");
    const store = JSON.parse(readFileSync(storePath, "utf8"));
    store.sessions[ghostSession.sessionId].runtimePort = 4201;
    writeFileSync(storePath, JSON.stringify(store), "utf8");
    await runtime.ensureRuntimeForChat(ghostChat, { restart: true });
    const ghostSocket = fakePreviewSocket();
    registerPreviewSocket(ghostChat, ghostSocket, { handshakeComplete: true });
    check(
      "restart with a prior runtime port still delivers reload to a late HMR reconnect",
      wroteReloadPage(ghostSocket),
    );
    clearRuntimeStateForTesting(ghostChat, ghostSession.sessionId);
    clearPendingPreviewClientReload(ghostChat);

    const reconnectChat = "guard-reload-reconnect";
    markPendingPreviewClientReload(reconnectChat);
    const reconnectSocket = fakePreviewSocket();
    registerPreviewSocket(reconnectChat, reconnectSocket, { handshakeComplete: true });
    check(
      "pending reload is delivered when a socket connects after the old runtime died",
      wroteReloadPage(reconnectSocket),
    );
    clearPendingPreviewClientReload(reconnectChat);

    const proxyChat = "guard-reload-proxy-handshake";
    markPendingPreviewClientReload(proxyChat);
    const proxySocket = fakePreviewSocket();
    registerPreviewSocket(proxyChat, proxySocket);
    check(
      "pending reload is not written before the WebSocket handshake completes",
      proxySocket.writes.length === 0,
    );
    clearPendingPreviewClientReload(proxyChat);

    const boomChat = "guard-reload-failsafe";
    const boomSession = seedReloadSession(boomChat);
    const boomSocket = fakePreviewSocket();
    boomSocket.write = () => {
      throw new Error("write failed");
    };
    registerPreviewSocket(boomChat, boomSocket);
    let bootThrew = false;
    try {
      await runtime.ensureRuntimeForChat(boomChat, { restart: true });
    } catch {
      bootThrew = true;
    }
    check("reload write failure does not fail the restart boot", bootThrew === false);
    clearRuntimeStateForTesting(boomChat, boomSession.sessionId);
    clearPendingPreviewClientReload(boomChat);

    check(
      "pending reload outlasts the default 10 min install timeout",
      runtime.__testing.PREVIEW_CLIENT_RELOAD_PENDING_MS >= 10 * 60 * 1000,
    );
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
