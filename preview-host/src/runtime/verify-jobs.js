"use strict";

// Verifieringsjobb (F3/ReleaseGate-lanen): isolerade verify-workspaces,
// jobbkö (hostgemensam i shared-läge, per chat i maskinläge) och
// lint-klassificering.

const { createHash } = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const {
  activeVerifyChatKeys,
  clipVerifyOutput,
  dependencyStatePathForWorkspace,
  removeDirWithRetries,
  runShellCommand,
  safeChatKey,
  sanitizedEnv,
  workspaceDirForChat,
  workspaceDirForVerifyJob,
} = require("./shared.js");
const { writeFilesIntoWorkspace } = require("./workspace-files.js");
const {
  dependencyFingerprint,
  isNoSpaceInstallFailure,
  resolveInstallCommand,
  runInstallCommandWithFallback,
  tryShareNodeModules,
} = require("./package-install.js");
const { withNoSpaceCleanupRetry } = require("./storage-cleanup.js");
const { ensureProjectMachine } = require("../machines/project-machines.js");
const {
  installInGuest,
  isMachineRuntime,
  noteGuestActivity,
  prepareGuestFiles,
} = require("./machine-runtime.js");

// Per-check ceiling inside a guest machine; the host path relies on the
// verify queue instead, but a remote exec must always settle.
const VERIFY_CHECK_TIMEOUT_MS = 15 * 60 * 1000;

const VERIFY_COMMANDS = {
  typecheck: "node ./node_modules/typescript/bin/tsc --noEmit",
  lint: "node ./node_modules/eslint/bin/eslint.js . --format stylish --no-color",
  build: "node ./node_modules/next/dist/bin/next build",
};

const VERIFY_LOCAL_TOOL_PATHS = {
  typecheck: ["typescript", "bin", "tsc"],
  lint: ["eslint", "bin", "eslint.js"],
  build: ["next", "dist", "bin", "next"],
};

const inflightVerifyByKey = new Map();
// Shared mode: one host-wide chain. Machine mode: one chain per chat.
let sharedVerifyQueue = Promise.resolve();
const verifyQueueByChat = new Map();

function inspectProjectLintSetup(filesJson) {
  const names = new Set(
    Object.keys(filesJson || {}).map((name) => name.replace(/\\/g, "/").toLowerCase()),
  );
  const hasConfig =
    names.has("eslint.config.mjs") ||
    names.has("eslint.config.js") ||
    names.has("eslint.config.cjs") ||
    names.has(".eslintrc") ||
    names.has(".eslintrc.js") ||
    names.has(".eslintrc.cjs") ||
    names.has(".eslintrc.json");

  const packageJson = typeof filesJson?.["package.json"] === "string" ? filesJson["package.json"] : null;
  if (!packageJson) {
    return { ok: false, reason: "missing package.json", hasConfig, hasDependency: false };
  }

  try {
    const parsed = JSON.parse(packageJson);
    const deps = {
      ...(parsed.dependencies || {}),
      ...(parsed.devDependencies || {}),
    };
    const depNames = Object.keys(deps);
    const hasDependency = depNames.includes("eslint");
    if (!hasConfig) {
      return { ok: false, reason: "missing project-local ESLint config", hasConfig, hasDependency };
    }
    if (!hasDependency) {
      return { ok: false, reason: "missing project-local eslint dependency", hasConfig, hasDependency };
    }
    return { ok: true, reason: null, hasConfig, hasDependency };
  } catch {
    return {
      ok: false,
      reason: "package.json is not valid JSON",
      hasConfig,
      hasDependency: false,
    };
  }
}

function projectOwnsLintSetup(filesJson) {
  return inspectProjectLintSetup(filesJson).ok;
}

function parseLintCounts(output) {
  const match = String(output || "").match(
    /(\d+)\s+problems?\s+\((\d+)\s+errors?,\s+(\d+)\s+warnings?\)/i,
  );
  return match
    ? {
        problemCount: Number.parseInt(match[1], 10),
        errorCount: Number.parseInt(match[2], 10),
        warningCount: Number.parseInt(match[3], 10),
      }
    : { problemCount: 0, errorCount: 0, warningCount: 0 };
}

function classifyLintResult(result) {
  const counts = parseLintCounts(result.output);
  if (result.exitCode === 0) {
    return {
      passed: true,
      advisory: counts.warningCount > 0,
      repairable: false,
      failureKind: null,
      ...counts,
    };
  }
  if (result.exitCode === 1 && counts.errorCount > 0) {
    return {
      passed: false,
      advisory: false,
      repairable: true,
      failureKind: "code",
      ...counts,
    };
  }
  return {
    passed: false,
    advisory: false,
    repairable: false,
    failureKind: "tooling",
    ...counts,
  };
}

let verifyInstallRunner = runInstallCommandWithFallback;
let verifyCommandRunner = runShellCommand;
/** Replaces the whole job inside the queue so guards can observe scheduling. */
let verifyJobRunnerForTesting = null;

/**
 * SM-080: the same verify job executed inside the chat's own guest machine.
 * Same result shape and classification as the host path; only the execution
 * site differs. Verify and boot never share a mutable workspace: the guest
 * keeps `live` and `verify-<id>` apart and the verify workspace is removed
 * when the job ends.
 */
async function runVerifyJobInMachine(params) {
  const { verifyId, chatId, versionId, filesJson, checks } = params;
  const workspace = `verify-${verifyId.replace(/[^A-Za-z0-9_-]/g, "")}`.slice(0, 87);
  const startedAt = Date.now();
  const jobStartedAtIso = new Date(startedAt).toISOString();
  let firstFailureCheck = null;
  const results = [];
  const pushResult = (entry) => {
    const normalized = { durationMs: 0, ...entry };
    if (firstFailureCheck === null && normalized.passed === false) {
      firstFailureCheck = normalized.check;
    }
    results.push(normalized);
    return normalized;
  };
  const finish = () => ({
    verifyId,
    versionId,
    durationMs: Date.now() - startedAt,
    jobStartedAt: jobStartedAtIso,
    jobFinishedAt: new Date().toISOString(),
    firstFailureCheck,
    results,
  });

  // Never replace the machine from here: it may be serving the live preview.
  const { guest } = await ensureProjectMachine(chatId, { allowReplace: false });
  try {
    await guest.putWorkspace(workspace, prepareGuestFiles(filesJson));
    const install = resolveInstallCommand(filesJson);
    const fingerprint = dependencyFingerprint(filesJson);
    let shared = { reused: false, reason: "lockfile_stale" };
    if (!install.lockfileStale) {
      const seeded = await guest
        .seedNodeModules(workspace, { fingerprint, from: "live" })
        .catch((error) => ({ seeded: false, reason: `share_failed:${error.message}` }));
      shared = seeded?.seeded
        ? { reused: true, method: seeded.method ?? "copy" }
        : { reused: false, reason: seeded?.reason ?? "fingerprint_mismatch" };
    }
    if (shared.reused) {
      pushResult({
        check: "install-cache-share",
        passed: true,
        exitCode: 0,
        output: `Reused node_modules from live guest workspace via ${shared.method}.`,
      });
    } else if (shared.reason !== "missing_fingerprint") {
      pushResult({
        check: "install-cache-share",
        passed: true,
        exitCode: 0,
        output: `Skipped node_modules reuse: ${shared.reason}.`,
      });
    }
    let installResult;
    if (shared.reused) {
      installResult = {
        passed: true,
        exitCode: 0,
        durationMs: 0,
        output: "Dependency fingerprint matched; copied project-local node_modules and skipped install.",
        usedFallback: false,
        peerConflictDetected: false,
      };
    } else {
      try {
        const outcome = await installInGuest({ guest, workspace, filesJson, log: async () => {} });
        installResult = {
          passed: true,
          exitCode: 0,
          durationMs: 0,
          output: outcome.installOutput || install.successLabel,
          usedFallback: outcome.usedFallback === true,
          peerConflictDetected: outcome.peerConflictDetected === true,
        };
      } catch (error) {
        const diagnostics = error?.installDiagnostics ?? null;
        installResult = {
          passed: false,
          exitCode: diagnostics?.exitCode ?? 1,
          durationMs: 0,
          output: error instanceof Error ? error.message : "Install failed in guest.",
          failureReason: diagnostics?.failureReason ?? null,
          usedFallback: false,
          peerConflictDetected: false,
        };
      }
    }
    const installDiskFull =
      !installResult.passed &&
      (installResult.failureReason === "no_space" || isNoSpaceInstallFailure(installResult.output));
    pushResult({
      check: "install",
      passed: installResult.passed,
      exitCode: installResult.exitCode,
      durationMs: installResult.durationMs,
      repairable: installResult.passed ? false : !installDiskFull,
      failureKind: installResult.passed ? null : installDiskFull ? "tooling" : "code",
      output: installResult.passed
        ? installResult.output || install.successLabel
        : installResult.output || `(No install output captured; exit ${installResult.exitCode ?? "unknown"}).`,
    });
    if (!installResult.passed) return finish();
    if (installResult.usedFallback && installResult.peerConflictDetected) {
      pushResult({
        check: "install-peer-fallback",
        passed: true,
        advisory: true,
        repairable: false,
        exitCode: 0,
        output:
          `Peer dependency conflict detected; fallback used: ${install.fallbackLogLabel}. ` +
          "Preview can start, but this is not a publish-ready install (Vercel npm install has no --legacy-peer-deps).",
      });
    }

    const probes = checks
      .map((check) => VERIFY_LOCAL_TOOL_PATHS[check])
      .filter(Boolean)
      .map((parts) => `node_modules/${parts.join("/")}`);
    const state = probes.length > 0 ? await guest.state(workspace, { probes }) : { probes: {} };
    for (const check of checks) {
      let toolingError = null;
      if (check === "lint") {
        const lintSetup = inspectProjectLintSetup(filesJson);
        if (!lintSetup.ok) toolingError = lintSetup.reason;
      }
      const localToolPath = VERIFY_LOCAL_TOOL_PATHS[check];
      if (!toolingError && localToolPath) {
        const probe = `node_modules/${localToolPath.join("/")}`;
        if (state?.probes?.[probe] !== true) {
          toolingError = `installed project is missing ${probe}`;
        }
      }
      if (toolingError) {
        pushResult({
          check,
          passed: false,
          advisory: false,
          repairable: false,
          failureKind: "tooling",
          exitCode: 2,
          errorCount: 0,
          warningCount: 0,
          output: `${check} tooling/configuration error: ${toolingError}. No package download was attempted.`,
        });
        continue;
      }
      const command = VERIFY_COMMANDS[check];
      if (!command) continue;
      const result = await guest.exec(workspace, { command, timeoutMs: VERIFY_CHECK_TIMEOUT_MS });
      const output = clipVerifyOutput(check, result.output);
      const lintClassification = check === "lint" ? classifyLintResult(result) : null;
      const passed = lintClassification?.passed ?? result.exitCode === 0;
      pushResult({
        check,
        passed,
        advisory: lintClassification?.advisory ?? false,
        repairable: lintClassification?.repairable ?? !passed,
        failureKind: lintClassification?.failureKind ?? (passed ? null : "code"),
        exitCode: result.exitCode,
        durationMs: result.durationMs ?? 0,
        errorCount: lintClassification?.errorCount ?? undefined,
        warningCount: lintClassification?.warningCount ?? undefined,
        output: passed || output ? output : `(No ${check} output captured; exit ${result.exitCode}).`,
      });
    }
    return finish();
  } finally {
    await guest.deleteWorkspace(workspace).catch(() => {});
    // The guest stays up; its idle clock restarts now and the idle sweep
    // destroys it after PREVIEW_GUEST_IDLE_DESTROY_MS without activity.
    noteGuestActivity(chatId);
  }
}

async function runVerifyJob(params) {
  if (isMachineRuntime()) return runVerifyJobInMachine(params);
  const { verifyId, chatId, versionId, filesJson, checks } = params;
  const workspaceDir = workspaceDirForVerifyJob(chatId, verifyId);
  const startedAt = Date.now();
  const jobStartedAtIso = new Date(startedAt).toISOString();
  let firstFailureCheck = null;

  function pushResult(entry) {
    const normalized = {
      durationMs: 0,
      ...entry,
    };
    if (firstFailureCheck === null && normalized.passed === false) {
      firstFailureCheck = normalized.check;
    }
    return normalized;
  }

  const runJob = async () => {
    try {
      writeFilesIntoWorkspace(workspaceDir, filesJson);
      const results = [];
      const install = resolveInstallCommand(filesJson);
      const fingerprint = dependencyFingerprint(filesJson);
      // A stale-lockfile marker must force a real (non-frozen) install even in
      // the verify lane (Bugbot finding 2): reusing the live workspace's
      // node_modules on a fingerprint match would inherit the same
      // not-yet-reconciled tree and skip the one corrective install.
      const shareNodeModulesResult = install.lockfileStale
        ? { reused: false, reason: "lockfile_stale" }
        : tryShareNodeModules({
            sourceWorkspaceDir: workspaceDirForChat(chatId),
            targetWorkspaceDir: workspaceDir,
            expectedFingerprint: fingerprint,
          });
      if (shareNodeModulesResult.reused) {
        results.push(
          pushResult({
            check: "install-cache-share",
            passed: true,
            exitCode: 0,
            durationMs: 0,
            output: `Reused node_modules from live workspace via ${shareNodeModulesResult.method}.`,
          }),
        );
      } else if (shareNodeModulesResult.reason !== "missing_fingerprint") {
        results.push(
          pushResult({
            check: "install-cache-share",
            passed: true,
            exitCode: 0,
            durationMs: 0,
            output: `Skipped node_modules reuse: ${shareNodeModulesResult.reason}.`,
          }),
        );
      }
      const installResult = shareNodeModulesResult.reused
        ? {
            passed: true,
            exitCode: 0,
            durationMs: 0,
            output: "Dependency fingerprint matched; copied project-local node_modules and skipped install.",
            usedFallback: false,
            peerConflictDetected: false,
          }
        : await verifyInstallRunner(workspaceDir, install);
      // A disk-full install is a host problem, not a defect in the generated
      // project. Marking it `code`/repairable (the default for a failed check)
      // sent the app's repair loop off to "fix" `npm error code ENOSPC` in the
      // user's source — an entire LLM repair pass spent on something no code
      // change can affect, ending in a red "Verifiering misslyckades".
      const installDiskFull =
        !installResult.passed && isNoSpaceInstallFailure(installResult.output);
      results.push(
        pushResult({
          check: "install",
          passed: installResult.passed,
          exitCode: installResult.exitCode,
          durationMs: installResult.durationMs,
          repairable: installResult.passed ? false : !installDiskFull,
          failureKind: installResult.passed ? null : installDiskFull ? "tooling" : "code",
          output:
            installResult.passed
              ? installResult.output || install.successLabel
              : installResult.output ||
                `(No install output captured; exit ${installResult.exitCode ?? "unknown"}).`,
        }),
      );
      if (!installResult.passed) {
        const finishedAtIso = new Date().toISOString();
        return {
          verifyId,
          versionId,
          durationMs: Date.now() - startedAt,
          jobStartedAt: jobStartedAtIso,
          jobFinishedAt: finishedAtIso,
          firstFailureCheck,
          results,
        };
      }
      if (shareNodeModulesResult.reused) {
        fs.writeFileSync(
          dependencyStatePathForWorkspace(workspaceDir),
          JSON.stringify({ fingerprint }, null, 2),
          "utf8",
        );
      }
      if (installResult.usedFallback && installResult.peerConflictDetected) {
        results.push(
          pushResult({
            check: "install-peer-fallback",
            passed: true,
            advisory: true,
            repairable: false,
            exitCode: 0,
            durationMs: 0,
            output:
              `Peer dependency conflict detected; fallback used: ${install.fallbackLogLabel}. ` +
              "Preview can start, but this is not a publish-ready install (Vercel npm install has no --legacy-peer-deps).",
          }),
        );
      }

      for (const check of checks) {
        let toolingError = null;
        if (check === "lint") {
          const lintSetup = inspectProjectLintSetup(filesJson);
          if (!lintSetup.ok) toolingError = lintSetup.reason;
        }
        const localToolPath = VERIFY_LOCAL_TOOL_PATHS[check];
        if (
          !toolingError &&
          localToolPath &&
          !fs.existsSync(path.join(workspaceDir, "node_modules", ...localToolPath))
        ) {
          toolingError = `installed project is missing node_modules/${localToolPath.join("/")}`;
        }
        if (toolingError) {
          results.push(
            pushResult({
              check,
              passed: false,
              advisory: false,
              repairable: false,
              failureKind: "tooling",
              exitCode: 2,
              durationMs: 0,
              errorCount: 0,
              warningCount: 0,
              output: `${check} tooling/configuration error: ${toolingError}. No package download was attempted.`,
            }),
          );
          continue;
        }
        const command = VERIFY_COMMANDS[check];
        if (!command) continue;
        const checkStartedAt = Date.now();
        const result = await verifyCommandRunner(command, {
          cwd: workspaceDir,
          stdio: ["ignore", "pipe", "pipe"],
          env: sanitizedEnv(),
        });
        const durationMs = Date.now() - checkStartedAt;
        const output = clipVerifyOutput(check, result.output);
        const lintClassification =
          check === "lint" ? classifyLintResult(result) : null;
        const passed = lintClassification?.passed ?? result.exitCode === 0;
        results.push(
          pushResult({
            check,
            passed,
            advisory: lintClassification?.advisory ?? false,
            repairable: lintClassification?.repairable ?? !passed,
            failureKind: lintClassification?.failureKind ?? (passed ? null : "code"),
            exitCode: result.exitCode,
            durationMs,
            errorCount: lintClassification?.errorCount ?? undefined,
            warningCount: lintClassification?.warningCount ?? undefined,
            output:
              passed || output
                ? output
                : `(No ${check} output captured; exit ${result.exitCode}).`,
          }),
        );
      }

      const finishedAtIso = new Date().toISOString();
      return {
        verifyId,
        versionId,
        durationMs: Date.now() - startedAt,
        jobStartedAt: jobStartedAtIso,
        jobFinishedAt: finishedAtIso,
        firstFailureCheck,
        results,
      };
    } finally {
      await removeDirWithRetries(workspaceDir).catch(() => {});
    }
  };

  return withNoSpaceCleanupRetry(runJob);
}

function filesContentFingerprint(filesJson) {
  const hash = createHash("sha256");
  const entries = Object.entries(filesJson || {})
    .filter(([, content]) => typeof content === "string")
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
  for (const [name, content] of entries) {
    hash.update(name);
    hash.update("\n");
    hash.update(content);
    hash.update("\n");
  }
  return hash.digest("hex");
}

function buildVerifyJobKey(params) {
  // Order is part of the gate contract (F3: typecheck → lint → build), so two
  // jobs with the same set in different orders must never dedupe together.
  // Identity is bound to verified file contents — same chat/version/deps/checks
  // with a different page.tsx must not reuse an in-flight result.
  // `dependencyFingerprint` stays the install-cache key, not this job key.
  const checks = Array.isArray(params.checks) ? params.checks.join(",") : "";
  return [
    params.chatId,
    params.versionId,
    checks,
    filesContentFingerprint(params.filesJson),
  ].join(":");
}

function runQueuedVerifyJob(params) {
  const jobKey = buildVerifyJobKey(params);
  const existing = inflightVerifyByKey.get(jobKey);
  if (existing) {
    return existing;
  }

  // Shared mode: verify runs beside every live preview on this one host, so
  // jobs serialize host-wide to keep installs/typechecks from fighting for
  // RAM and disk. Machine mode: each chat's verify runs in that chat's own
  // guest, so only jobs for the same chat (same guest, same verify slot)
  // serialize; different chats verify in parallel.
  const chatQueueKey = isMachineRuntime() ? String(params.chatId ?? "") : null;
  const previous =
    chatQueueKey === null ? sharedVerifyQueue : (verifyQueueByChat.get(chatQueueKey) ?? Promise.resolve());
  const task = previous
    .catch(() => undefined)
    .then(async () => {
      const chatKey = safeChatKey(params.chatId);
      activeVerifyChatKeys.add(chatKey);
      try {
        return await (verifyJobRunnerForTesting ?? runVerifyJob)(params);
      } finally {
        activeVerifyChatKeys.delete(chatKey);
      }
    });

  inflightVerifyByKey.set(jobKey, task);
  const tail = task.catch(() => undefined);
  if (chatQueueKey === null) {
    sharedVerifyQueue = tail;
  } else {
    verifyQueueByChat.set(chatQueueKey, tail);
    tail.then(() => {
      if (verifyQueueByChat.get(chatQueueKey) === tail) verifyQueueByChat.delete(chatQueueKey);
    });
  }

  return task.finally(() => {
    if (inflightVerifyByKey.get(jobKey) === task) {
      inflightVerifyByKey.delete(jobKey);
    }
  });
}

function setVerifyRunnersForTesting(params = {}) {
  verifyInstallRunner =
    typeof params.installRunner === "function"
      ? params.installRunner
      : runInstallCommandWithFallback;
  verifyCommandRunner =
    typeof params.commandRunner === "function"
      ? params.commandRunner
      : runShellCommand;
  verifyJobRunnerForTesting = typeof params.jobRunner === "function" ? params.jobRunner : null;
}

module.exports = {
  VERIFY_COMMANDS,
  inspectProjectLintSetup,
  projectOwnsLintSetup,
  classifyLintResult,
  runVerifyJob,
  runQueuedVerifyJob,
  buildVerifyJobKey,
  filesContentFingerprint,
  setVerifyRunnersForTesting,
};
