"use strict";

// Verifieringsjobb (F3/ReleaseGate-lanen): isolerade verify-workspaces,
// serialiserad jobbkö och lint-klassificering. Ren extraktion ur runtime.js —
// ingen beteendeändring.

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
let verifyQueue = Promise.resolve();

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

async function runVerifyJob(params) {
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
            exitCode: 0,
            durationMs: 0,
            output: `Peer dependency conflict detected; fallback used: ${install.fallbackLogLabel}.`,
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

function buildVerifyJobKey(params) {
  // Order is part of the gate contract (F3: typecheck → lint → build), so two
  // jobs with the same set in different orders must never dedupe together.
  const checks = Array.isArray(params.checks) ? params.checks.join(",") : "";
  return [
    params.chatId,
    params.versionId,
    checks,
    dependencyFingerprint(params.filesJson),
  ].join(":");
}

function runQueuedVerifyJob(params) {
  const jobKey = buildVerifyJobKey(params);
  const existing = inflightVerifyByKey.get(jobKey);
  if (existing) {
    return existing;
  }

  // Verify runs beside live previews on the same VM, so serialize jobs to avoid
  // duplicated installs/typechecks fighting for RAM and disk at the same time.
  const task = verifyQueue
    .catch(() => undefined)
    .then(async () => {
      const chatKey = safeChatKey(params.chatId);
      activeVerifyChatKeys.add(chatKey);
      try {
        return await runVerifyJob(params);
      } finally {
        activeVerifyChatKeys.delete(chatKey);
      }
    });

  inflightVerifyByKey.set(jobKey, task);
  verifyQueue = task.catch(() => undefined);

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
}

module.exports = {
  VERIFY_COMMANDS,
  inspectProjectLintSetup,
  projectOwnsLintSetup,
  classifyLintResult,
  runVerifyJob,
  runQueuedVerifyJob,
  setVerifyRunnersForTesting,
};
