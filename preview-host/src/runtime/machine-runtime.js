"use strict";

// SM-080: project runtime inside the project's own Fly Machine.
//
// When `PREVIEW_HOST_ISOLATION=machine`, the boot path in process-lifecycle.js
// calls into this module instead of writing a workspace under /data and
// spawning npm on the host. The host keeps the session store, the boot
// serialization, readiness verdicts and the public proxy; the guest agent
// (../../guest/agent.js) owns files, install and the dev process.
//
// No function here ever falls back to the shared host: a missing machine,
// unreachable agent or identity mismatch throws, and the caller records the
// boot as failed.

const { EventEmitter } = require("node:events");

const { isMachineIsolation } = require("../machines/isolation-config.js");
const {
  destroyProjectMachine,
  ensureProjectMachine,
  guestForChat,
  stopProjectMachine,
} = require("../machines/project-machines.js");
const { machineIsolationConfig } = require("../machines/isolation-config.js");
const {
  BINARY_BASE64_PREFIX,
  materializeBinaryContent,
  patchNextConfigInFilesJson,
} = require("./workspace-files.js");
const {
  INSTALL_TIMEOUT_MS,
  classifyInstallFailure,
  dependencyFingerprint,
  isNoSpaceInstallFailure,
  isPeerDependencyInstallFailure,
  resolveInstallCommand,
  verifyInstalledDependencies,
} = require("./package-install.js");
const { appendRuntimeLog, clipVerifyOutput, isHmrProxyEnabled } = require("./shared.js");

const LIVE_WORKSPACE = "live";
const REMOTE_POLL_INTERVAL_MS = 2000;
const REMOTE_POLL_FAILURE_LIMIT = 8;

function isMachineRuntime() {
  return isMachineIsolation();
}

/**
 * Transport form of a file snapshot for the guest: binary envelopes are
 * decoded here (same compatibility shield as the on-disk writer) and the
 * preview basePath is injected into next.config in memory.
 */
function prepareGuestFiles(filesJson) {
  const patched = patchNextConfigInFilesJson(filesJson || {});
  const out = {};
  for (const [relPath, content] of Object.entries(patched)) {
    if (typeof content === "string" && content.startsWith(BINARY_BASE64_PREFIX)) {
      out[relPath] = { encoding: "base64", content: materializeBinaryContent(content).toString("base64") };
    } else {
      out[relPath] = { encoding: "utf8", content: String(content) };
    }
  }
  return out;
}

function installEnvOverrides() {
  return {
    NODE_ENV: "development",
    NPM_CONFIG_PRODUCTION: "false",
    NPM_CONFIG_OMIT: "",
    NPM_CONFIG_PREFER_OFFLINE: "true",
  };
}

function describeSilentExit(attempt) {
  return `(no output captured; exit ${attempt.exitCode ?? "unknown"}${attempt.signal ? `, signal ${attempt.signal}` : ""})`;
}

/**
 * Guest-side counterpart of `runInstallCommandWithFallback`: primary
 * command, then the compatibility fallback on peer conflicts (or always, for
 * package managers whose fallback is just "non-frozen"). ENOSPC inside the
 * guest is the project's own rootfs, so there is no cache purge to try.
 */
async function runInstallAttemptsInGuest(guest, workspace, install) {
  const timeoutMs = INSTALL_TIMEOUT_MS > 0 ? INSTALL_TIMEOUT_MS : undefined;
  const runAttempt = async (command) => {
    const result = await guest.exec(workspace, {
      command,
      timeoutMs,
      env: installEnvOverrides(),
    });
    return { ...result, clippedOutput: clipVerifyOutput("install", result.output) };
  };
  const primary = await runAttempt(install.command);
  if (primary.exitCode === 0) {
    return {
      passed: true,
      exitCode: 0,
      durationMs: primary.durationMs,
      output: install.successLabel,
      usedFallback: false,
      peerConflictDetected: false,
      installKind: "strict_pass",
    };
  }
  const diskFull = isNoSpaceInstallFailure(primary.output);
  const peerConflictDetected = isPeerDependencyInstallFailure(primary.output);
  if (!diskFull && (peerConflictDetected || install.alwaysAllowFallback) && install.fallbackCommand) {
    const fallback = await runAttempt(install.fallbackCommand);
    if (fallback.exitCode === 0) {
      return {
        passed: true,
        exitCode: 0,
        durationMs: primary.durationMs + fallback.durationMs,
        output: [
          install.successLabel,
          peerConflictDetected
            ? `[quality-warning] Peer dependency conflict detected. Compatibility fallback used: ${install.fallbackLogLabel}.`
            : `[quality-warning] Primary install failed. Compatibility fallback used: ${install.fallbackLogLabel}.`,
        ].join("\n"),
        usedFallback: true,
        peerConflictDetected,
        installKind: "fallback",
      };
    }
    return {
      passed: false,
      exitCode: fallback.exitCode,
      failureReason: classifyInstallFailure(fallback.clippedOutput, fallback.exitCode, fallback.signal),
      primaryFailureReason: classifyInstallFailure(primary.clippedOutput, primary.exitCode, primary.signal),
      durationMs: primary.durationMs + fallback.durationMs,
      output: [
        `[primary] ${install.logLabel} failed:`,
        primary.clippedOutput || describeSilentExit(primary),
        "",
        `[fallback] ${install.fallbackLogLabel} failed:`,
        fallback.clippedOutput || describeSilentExit(fallback),
      ].join("\n"),
      signal: fallback.signal ?? primary.signal ?? null,
      usedFallback: true,
      peerConflictDetected,
    };
  }
  return {
    passed: false,
    exitCode: primary.exitCode,
    failureReason: diskFull
      ? "no_space"
      : classifyInstallFailure(primary.clippedOutput, primary.exitCode, primary.signal),
    durationMs: primary.durationMs,
    output: primary.clippedOutput || describeSilentExit(primary),
    signal: primary.signal ?? null,
    usedFallback: false,
    peerConflictDetected,
  };
}

/**
 * Guest-side counterpart of `runInstallCommand`: fingerprint skip, warm
 * seed, install + fallback, dependency postcondition, fingerprint stamp and
 * stale-lockfile round trip. Same outcome shape as the host version so the
 * boot path's session bookkeeping is unchanged.
 */
async function installInGuest({ guest, workspace, filesJson, previewSessionId, log }) {
  const emit = log ?? (previewSessionId ? (message) => appendRuntimeLog(previewSessionId, message) : async () => {});
  const fingerprint = dependencyFingerprint(filesJson);
  const install = resolveInstallCommand(filesJson);
  const state = await guest.state(workspace);
  const priorFingerprint = state?.dependencyState?.fingerprint ?? null;
  if (
    fingerprint &&
    priorFingerprint === fingerprint &&
    state.hasNodeModules === true &&
    !install.lockfileStale
  ) {
    await emit(`Skipping install in guest; dependency fingerprint unchanged (${fingerprint.slice(0, 12)}).`);
    return {
      installed: false,
      skipped: true,
      usedFallback: false,
      peerConflictDetected: false,
      installKind: "skipped",
      dependencyFingerprint: fingerprint,
    };
  }
  if (!install.lockfileStale) {
    const seeded = await guest.seedNodeModules(workspace, { fingerprint, from: "warm" }).catch(() => null);
    if (seeded?.seeded) {
      await emit(`Seeded node_modules from the guest image's warm layer (fingerprint ${fingerprint.slice(0, 12)}).`);
      return {
        installed: true,
        skipped: false,
        usedFallback: false,
        peerConflictDetected: false,
        installKind: "strict_pass",
        dependencyFingerprint: fingerprint,
        seededFrom: "warm",
      };
    }
  }
  await emit(
    `Dependency fingerprint changed in guest (prior=${priorFingerprint ? priorFingerprint.slice(0, 12) : "none"}, next=${fingerprint.slice(0, 12)}); installing with ${install.logLabel}.`,
  );
  const installResult = await runInstallAttemptsInGuest(guest, workspace, install);
  if (!installResult.passed) {
    const failureReason = installResult.failureReason ?? "unknown";
    const priorReason =
      installResult.primaryFailureReason && installResult.primaryFailureReason !== failureReason
        ? ` after ${installResult.primaryFailureReason}`
        : "";
    await emit(`${install.logLabel} failed in guest (${failureReason}${priorReason}).\n${installResult.output}`);
    const error = new Error(
      `${install.logLabel} failed with exit code ${installResult.exitCode ?? "unknown"} (${failureReason}${priorReason})`,
    );
    error.installDiagnostics = {
      exitCode: installResult.exitCode ?? null,
      signal: installResult.signal ?? null,
      failureReason,
      runtime: "machine",
      npmDebugLog: null,
    };
    throw error;
  }
  const postcondition = await verifyInstalledDependencies(null, filesJson, {
    packageManager: install.packageManager,
    commandRunner: (command, options) =>
      guest.exec(workspace, { command, timeoutMs: options?.timeoutMs ?? 60_000, env: { NODE_ENV: "development" } }),
    existsProbe: async (name) => {
      const probe = `node_modules/${name}`;
      const probed = await guest.state(workspace, { probes: [probe] });
      return probed?.probes?.[probe] === true;
    },
  });
  if (!postcondition.ok) {
    await emit(
      `${install.logLabel} exited 0 in guest but the dependency postcondition failed (checked via ${postcondition.checkedWith}): missing ${postcondition.missing.join(", ")}.`,
    );
    throw new Error(
      `Dependency postcondition failed after install: missing ${postcondition.missing.join(", ")} (checked via ${postcondition.checkedWith}).`,
    );
  }
  await guest.writeDepsState(workspace, fingerprint);
  await emit(
    installResult.usedFallback
      ? `${install.logLabel} fell back to ${install.fallbackLogLabel} in guest and succeeded.`
      : `${install.logLabel} completed in guest.`,
  );
  const outcome = {
    installed: true,
    skipped: false,
    packageManager: install.packageManager,
    usedFallback: Boolean(installResult.usedFallback),
    peerConflictDetected: Boolean(installResult.peerConflictDetected),
    installKind: installResult.usedFallback ? "fallback" : "strict_pass",
    dependencyFingerprint: fingerprint,
    installOutput: installResult.output,
  };
  if (install.lockfileStale) {
    for (const name of install.packageManager === "pnpm"
      ? ["pnpm-lock.yaml", "pnpm-lock.yml"]
      : install.packageManager === "yarn"
        ? ["yarn.lock"]
        : ["package-lock.json"]) {
      const file = await guest.readFile(workspace, name).catch(() => null);
      if (file?.exists && typeof file.content === "string" && file.content.length > 0) {
        outcome.regeneratedLockfile = { path: name, content: file.content };
        outcome.staleCleared = true;
        await emit(`Regenerated ${name} in guest after non-frozen install; returning it for persistence.`);
        break;
      }
    }
  }
  return outcome;
}

/**
 * Boot phase 1 for a machine runtime: ensure the project's machine, sync the
 * full file snapshot and install. Returns the guest handle the dev server is
 * started on.
 */
async function syncAndInstallInMachine({ chatId, previewSessionId, filesJson }) {
  const log = (message) => appendRuntimeLog(previewSessionId, message);
  const { guest, record } = await ensureProjectMachine(chatId, { log });
  await guest.putWorkspace(LIVE_WORKSPACE, prepareGuestFiles(filesJson));
  await log(`Synced ${Object.keys(filesJson).length} file(s) to guest machine ${record.machineId}.`);
  const installOutcome = await installInGuest({
    guest,
    workspace: LIVE_WORKSPACE,
    filesJson,
    previewSessionId,
  });
  return { guest, record, installOutcome };
}

/** Diff write into the live guest workspace (hot patch / adopted patch). */
async function patchWorkspaceInMachine(chatId, files, removedPaths = []) {
  const guest = guestForChat(chatId);
  if (!guest) {
    const error = new Error("No guest machine is recorded for this chat; cannot patch its workspace.");
    error.code = "PREVIEW_GUEST_MISSING";
    throw error;
  }
  await guest.patchWorkspace(LIVE_WORKSPACE, prepareGuestFiles(files || {}), removedPaths);
}

/**
 * A child-process-shaped handle for the guest's dev process so the existing
 * tracked-runtime bookkeeping (exit handler, output ring, stop path) keeps
 * working unchanged. Polls `/dev/status`; emits `exit`/`close` once the
 * remote process is gone or the agent stops answering.
 */
function createRemoteDevChild({ guest, generation, chatId }) {
  const child = new EventEmitter();
  child.remote = true;
  child.chatId = chatId;
  child.generation = generation;
  child.pid = null;
  child.exitCode = null;
  child.signalCode = null;
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  let cursor = 0;
  let failures = 0;
  let settled = false;
  let timer = null;

  function settle(code, signal) {
    if (settled) return;
    settled = true;
    if (timer) clearInterval(timer);
    child.exitCode = typeof code === "number" ? code : signal ? null : 1;
    child.signalCode = signal ?? null;
    const reportedCode = child.exitCode;
    child.emit("exit", reportedCode, child.signalCode);
    child.emit("close", reportedCode, child.signalCode);
  }

  async function poll() {
    if (settled) return;
    let status;
    try {
      status = await guest.devStatus({ since: cursor });
      failures = 0;
    } catch (error) {
      failures += 1;
      if (failures >= REMOTE_POLL_FAILURE_LIMIT) {
        child.stderr.emit(
          "data",
          `[preview-host] guest agent unreachable (${error instanceof Error ? error.message : "unknown"}); treating dev process as dead.\n`,
        );
        settle(null, "SIGKILL");
      }
      return;
    }
    if (settled) return;
    for (const line of Array.isArray(status.lines) ? status.lines : []) {
      child.stdout.emit("data", `${line}\n`);
    }
    if (Number.isSafeInteger(status.outputCursor)) cursor = Math.max(cursor, status.outputCursor);
    if (status.generation !== generation) {
      settle(null, "SIGTERM");
      return;
    }
    if (status.running !== true) {
      settle(status.exitCode, status.signal ?? null);
    }
  }

  child.stopRemote = async () => {
    if (settled) return;
    try {
      const result = await guest.devStop({ generation });
      settle(result?.exitCode ?? null, result?.signal ?? (result?.stopped ? "SIGTERM" : null));
    } catch {
      settle(null, "SIGKILL");
    }
  };
  child.kill = () => {
    void child.stopRemote();
    return true;
  };

  timer = setInterval(() => {
    void poll();
  }, REMOTE_POLL_INTERVAL_MS);
  timer.unref?.();
  return child;
}

/** Boot phase 2: start `npm run dev` inside the guest and return the handle. */
async function startRemoteDevServer({ chatId, previewSessionId, guest, runId }) {
  const config = machineIsolationConfig();
  const devPort = config.devPort;
  const basePath = `/${chatId}`;
  const started = await guest.devStart({
    args: ["run", "dev", "--", "--hostname", "127.0.0.1", "--port", String(devPort)],
    env: {
      NEXT_TELEMETRY_DISABLED: "1",
      SAJTMASKIN_PREVIEW_BASE_PATH: basePath,
      SAJTMASKIN_PREVIEW_DISABLE_HMR: isHmrProxyEnabled()
        ? "false"
        : (process.env.SAJTMASKIN_PREVIEW_DISABLE_HMR ?? "true"),
      ...(runId ? { SAJTMASKIN_PREVIEW_RUN_ID: runId } : {}),
    },
  });
  const generation = Number.isSafeInteger(started?.generation) ? started.generation : 0;
  await appendRuntimeLog(
    previewSessionId,
    `Started dev runtime in guest machine (generation ${generation}, dev port ${devPort}).`,
  );
  return {
    child: createRemoteDevChild({ guest, generation, chatId }),
    target: guest.proxyTarget(),
    devPort,
  };
}

/** Hibernate/idle: stop the dev process is done by the caller; park the machine. */
async function parkProjectMachine(chatId, { previewSessionId } = {}) {
  const config = machineIsolationConfig();
  if (!config.stopMachineOnHibernate) return false;
  const log = previewSessionId ? (message) => appendRuntimeLog(previewSessionId, message) : undefined;
  try {
    return await stopProjectMachine(chatId, { log });
  } catch (error) {
    await log?.(`Could not stop guest machine: ${error instanceof Error ? error.message : "unknown error"}`);
    return false;
  }
}

async function destroyProjectMachineForChat(chatId) {
  try {
    return await destroyProjectMachine(chatId);
  } catch {
    return false;
  }
}

module.exports = {
  LIVE_WORKSPACE,
  REMOTE_POLL_INTERVAL_MS,
  createRemoteDevChild,
  destroyProjectMachineForChat,
  installInGuest,
  isMachineRuntime,
  parkProjectMachine,
  patchWorkspaceInMachine,
  prepareGuestFiles,
  startRemoteDevServer,
  syncAndInstallInMachine,
};
