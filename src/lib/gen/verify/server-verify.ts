/**
 * Server-side verify+repair loop.
 *
 * Triggered after finalize+preview verify handoff in the generation stream as a
 * fire-and-forget background task. Updates version verification state
 * on the DB; the UI reads server state via version polls.
 *
 * Note: this module uses preview-host's isolated verify lane. It does not
 * control the primary tier-2 preview provider for end users.
 *
 * Deduplicated: the same versionId will not run twice concurrently.
 */
import { dbConfigured } from "@/lib/db/client";
import {
  markVersionVerifying,
  markVersionRepairing,
  promoteVersion,
  failVersionVerification,
  saveRepairedFiles,
  getChat,
  getLatestVersion,
  getPreferredVersion,
  markVersionSupersededByRepair,
  acquireVersionLease,
  releaseVersionLease,
  renewVersionLease,
  type VersionJobKind,
} from "@/lib/db/chat-repository-pg";
import { getVersionFilesSnapshot } from "@/lib/gen/version-manager";
import { readRecurringPatternsForChat } from "@/lib/logging/recurring-patterns-reader";
import { buildExportableProject } from "@/lib/gen/export/build-exportable-project";
import { parseCodeProject, serializeCodeProject, type CodeFile } from "@/lib/gen/parser";
import { createEngineVersionErrorLogs } from "@/lib/db/services/version-errors";
import { emit as emitBusEvent } from "@/lib/logging/event-bus";
import { devLogAppend } from "@/lib/logging/devLog";
import { warnLog } from "@/lib/utils/debug";
import {
  partitionGeneratedFilesForProtectedPaths,
  reinjectProtectedPathsFromFallback,
} from "@/lib/gen/scaffolds/protected-paths";
// Side-effect imports: wire default subscribers (devLog-mirror + DB
// sink) so every `version.verifier.done`/`version.build.error` emit
// below reaches both the legacy surfaces and the UI projection.
import "@/lib/logging/event-bus-subscribers";
import "@/lib/logging/event-bus-error-log-sink";
import { DESIGN_PREVIEW_QUALITY_GATE_CHECKS } from "./quality-gate-checks";
import {
  isQualityGateConfigured,
  maybeAnalyzeVisualQAForPassedExportable,
  qualityGateAllPassed,
  runQualityGateOnExportable,
  shouldPromoteAfterRepair,
} from "./preview-quality-gate";
import { DEFAULT_MODEL_ID, ownModelIdToCanonicalModelId } from "@/lib/models/catalog";
import { resolvePhaseModel, resolvePhaseThinking } from "@/lib/models/phase-routing";
import {
  LLM_FIXER_RETRY_TIMEOUT_MS,
  LLM_FIXER_TIMEOUT_MS,
  SERVER_REPAIR_MAX_PASSES,
} from "@/lib/gen/defaults";
import {
  buildGroupedRepairErrorContext,
  buildRepairErrorContextLines,
  runRepairLoop,
  type RepairErrorManifest,
} from "./repair-loop";
import {
  buildServerVerifyQualityGateMeta,
  buildServerVerifyRepairContextLines,
  buildServerRepairOutcomeMeta,
  compactVisualQAForQualityGateLog,
  type ServerVerifyFailedOutput,
} from "./server-verify-log-meta";

const inflight = new Set<string>();

export function isServerVerifyEligible(versionId: string): boolean {
  if (!dbConfigured) return false;
  if (!isQualityGateConfigured()) return false;
  if (inflight.has(versionId)) return false;
  return true;
}

type LeaseOutcome = { proceed: true; runId?: string } | { proceed: false };

/**
 * Acquire the distributed per-version lease (Plan C / P1). The local `inflight`
 * Set is the cheap pre-DB short-circuit; this is the cross-instance truth.
 *
 *  - lease granted        -> { proceed: true, runId }
 *  - another live lease   -> { proceed: false } (another instance owns it; bail)
 *  - DB error / no table  -> { proceed: true, runId: undefined } — degrade to the
 *    legacy Set-only behaviour rather than disabling verify/repair or crashing a
 *    fire-and-forget job (the additive migration ships before this code per the
 *    plan's deploy order, so this window is normally zero).
 */
async function acquireVerifyLease(
  versionId: string,
  kind: VersionJobKind,
): Promise<LeaseOutcome> {
  try {
    const lease = await acquireVersionLease(versionId, kind);
    if (!lease) return { proceed: false };
    return { proceed: true, runId: lease.runId };
  } catch (err) {
    warnLog(
      "engine",
      "[server-verify] version lease acquire failed; falling back to process-local Set only",
      { versionId, kind, error: err instanceof Error ? err.message : String(err) },
    );
    return { proceed: true, runId: undefined };
  }
}

async function releaseVerifyLease(versionId: string, runId: string | undefined): Promise<void> {
  if (!runId) return;
  await releaseVersionLease(versionId, runId).catch(() => {});
}

async function isLatestVersionForChat(chatId: string, versionId: string): Promise<boolean> {
  const preferred = (await getPreferredVersion(chatId).catch(() => null))
    ?? (await getLatestVersion(chatId).catch(() => null));
  return !preferred || preferred.id === versionId;
}

/**
 * Fire-and-forget server-side verification + capped repair loop.
 * Called from generation stream after finalize. Does NOT block the SSE response.
 *
 * `diagnosticOnly` (default false) skips both auto-promotion and the
 * auto-repair loop — we only persist quality-gate findings as logs so
 * SSR/build-error visibility exists for whitelisted UIs even when the
 * version has verifier-blocking findings (in which case promotion is
 * disallowed by design).
 */
export async function triggerServerVerification(params: {
  chatId: string;
  versionId: string;
  diagnosticOnly?: boolean;
  onRepairAvailable?: (payload: {
    versionId: string;
    summary: string | null;
    repairAvailableAt: string | null;
  }) => void;
}): Promise<void> {
  const { chatId, versionId, onRepairAvailable, diagnosticOnly = false } = params;
  if (!isServerVerifyEligible(versionId)) return;
  inflight.add(versionId);
  const lease = await acquireVerifyLease(versionId, "server_verify");
  if (!lease.proceed) {
    // Another live lease already owns this version (another instance/run) —
    // bail exactly like the old process-local Set short-circuit.
    inflight.delete(versionId);
    return;
  }
  const runId = lease.runId;

  try {
    if (!(await isLatestVersionForChat(chatId, versionId))) {
      await markVersionSupersededByRepair(versionId, null, runId).catch(() => null);
      await createEngineVersionErrorLogs([{
        chatId,
        versionId,
        level: "warning",
        category: "server-verify:superseded",
        message: "Background verification skipped because a newer version already exists.",
        meta: { serverOwned: true },
      }]).catch(() => null);
      return;
    }
    const snapshot = await getVersionFilesSnapshot(versionId);
    if (!snapshot || snapshot.files.length === 0) return;
    const codeFiles = snapshot.files;
    // #260 / P2 #5: carry the exact files_json the repair will be based on so a
    // concurrent user edit can't be silently overwritten by saveRepairedFiles.
    const baseFilesJson = snapshot.filesJson;

    await markVersionVerifying(versionId, undefined, runId).catch(() => null);

    const exportable = await buildExportableProject(codeFiles);
    const gateResult = await runQualityGateOnExportable({
      chatId,
      versionId,
      exportable,
      checks: DESIGN_PREVIEW_QUALITY_GATE_CHECKS,
    });
    if (!gateResult) {
      await failVersionVerification(versionId, "Quality gate unavailable during verification.", runId).catch(() => null);
      return;
    }

    const passed = qualityGateAllPassed(gateResult.results);
    const visualQA = maybeAnalyzeVisualQAForPassedExportable({
      exportable,
      results: gateResult.results,
      onError: (vqaErr) => {
        console.warn("[server-verify] Visual QA error (non-fatal):", vqaErr);
      },
    });

    // OMTAG-06: emit `version.verifier.done` as the canonical outcome
    // signal. The DB sink subscriber (see `event-bus-error-log-sink.ts`)
    // still persists the legacy `engine_version_error_logs` row via the
    // same payload, so no downstream reader breaks.
    const qualityGateMeta = buildServerVerifyQualityGateMeta({
      passed,
      results: gateResult.results,
      verifyLaneDurationMs: gateResult.verifyLaneDurationMs,
      firstFailureCheck: gateResult.firstFailureCheck,
      jobStartedAt: gateResult.jobStartedAt,
      jobFinishedAt: gateResult.jobFinishedAt,
      visualQA: visualQA ? compactVisualQAForQualityGateLog(visualQA) : undefined,
    });
    emitBusEvent({
      t: "version.verifier.done",
      versionId,
      chatId,
      outcome: passed ? "passed" : "failed",
      blocked: !passed,
      findings: passed
        ? []
        : gateResult.results
            .filter((r) => !r.passed)
            .map((r) => ({ id: r.check, detail: r.output?.slice(0, 200) ?? "" })),
    });
    await createEngineVersionErrorLogs([{
      chatId,
      versionId,
      level: passed ? "info" : "error",
      category: "preflight:quality-gate",
      message: passed ? "Server verify passed." : "Server verify failed.",
      meta: qualityGateMeta,
    }]).catch((err) => {
      console.warn("[server-verify] Failed to persist quality gate summary log:", err);
    });

    if (passed) {
      if (diagnosticOnly) {
        // Diagnostics-only mode: even a passing gate must NOT promote,
        // because verifier-blocking findings (which the caller
        // explicitly knew about when picking diagnosticOnly) still
        // disallow promotion regardless of build/typecheck status.
        await createEngineVersionErrorLogs([{
          chatId,
          versionId,
          level: "info",
          category: "server-verify:diagnostic",
          message:
            "Server verify gate passed but promotion is suppressed (verifier blockers exist).",
          meta: { serverOwned: true, diagnosticOnly: true },
        }]).catch(() => null);
        // 2026-04-23 (showcase-bug rootfix, fas D2): terminal-state resolve.
        // Since runner.ts no longer pre-commits `failed` for verifier-only
        // blocking, server-verify is the authority that must set terminal
        // state. A verifier-LLM/real-build mismatch (verifier flagged, tsc
        // passed) still disallows promotion, so resolve to `failed` with a
        // summary that distinguishes this case from a real build failure.
        await failVersionVerification(
          versionId,
          "Verifier-LLM flagged blocking findings; server-verify gate passed. Manual review or repair required.",
          runId,
        ).catch(() => null);
        return;
      }
      await promoteVersion(versionId, "Automatic server verification passed.", runId).catch(() => null);
      return;
    }

    const failedOutputs = gateResult.results
      .filter((r) => !r.passed)
      .map((r) => ({
        check: r.check,
        exitCode: r.exitCode,
        output: r.output,
        durationMs: r.durationMs ?? null,
      }));

    if (diagnosticOnly) {
      // Diagnostics-only mode: log the failures and return. Do NOT enter
      // the repair loop — that would mutate the version under
      // conditions where promotion is forbidden anyway, and would
      // contribute to the regress-on-repair pattern (see Snickar
      // Anders log: blocking went from 1 → 3 across two repair passes
      // because every pass mutated and re-failed). Surfacing the
      // failures is enough; manual repair via the explicit
      // `/api/engine/chats/.../repair` HTTP path is still available
      // for the user.
      await createEngineVersionErrorLogs([{
        chatId,
        versionId,
        level: "warning",
        category: "server-verify:diagnostic",
        message:
          "Server verify gate failed but auto-repair suppressed (verifier blockers already exist; surface findings for inspection only).",
        meta: {
          serverOwned: true,
          diagnosticOnly: true,
          failedChecks: failedOutputs.map((f) => f.check),
        },
      }]).catch(() => null);
      // 2026-04-23 (showcase-bug rootfix, fas D2): terminal-state resolve.
      // See matching comment in the `passed` branch above. Here verifier-LLM
      // and server-verify both agree the version is broken, so resolve to
      // `failed` cleanly. `triggerBuildErrorRepair` can still flip this to
      // `repair_available` later when the VM emits a build-error SSE.
      await failVersionVerification(
        versionId,
        `Verifier-LLM blockers + server-verify gate failed (${failedOutputs
          .map((f) => f.check)
          .join(", ")}).`,
        runId,
      ).catch(() => null);
      return;
    }

    await tryServerRepairLoop({
      chatId,
      versionId,
      codeFiles,
      baseFilesJson,
      failedOutputs,
      verifyLaneDurationMs: gateResult.verifyLaneDurationMs,
      firstFailureCheck: gateResult.firstFailureCheck,
      jobStartedAt: gateResult.jobStartedAt,
      jobFinishedAt: gateResult.jobFinishedAt,
      onRepairAvailable,
      runId,
    });
  } catch (err) {
    console.error("[server-verify] Error:", err);
    await failVersionVerification(
      versionId,
      "Server verification could not complete.",
      runId,
    ).catch(() => null);
  } finally {
    await releaseVerifyLease(versionId, runId);
    inflight.delete(versionId);
  }
}

/**
 * Resolves whether the post-VM build-error auto-repair loop is enabled
 * for the current runtime. Defaults to ON in `development` and Vercel
 * `preview` (so the loop is exercised constantly during build), and OFF
 * in `production` until we have enough live data to flip the default
 * there too. Explicit `SAJTMASKIN_AUTO_REPAIR_BUILD_ERROR=0|1|true|false`
 * always wins over the default.
 */
function isAutoRepairBuildErrorEnabled(): boolean {
  const explicit = process.env.SAJTMASKIN_AUTO_REPAIR_BUILD_ERROR?.trim().toLowerCase();
  if (explicit === "1" || explicit === "true" || explicit === "on" || explicit === "yes") {
    return true;
  }
  if (explicit === "0" || explicit === "false" || explicit === "off" || explicit === "no") {
    return false;
  }
  const vercelEnv = process.env.VERCEL_ENV?.trim().toLowerCase();
  if (vercelEnv === "preview" || vercelEnv === "development") return true;
  if (vercelEnv === "production") return false;
  const nodeEnv = process.env.NODE_ENV?.trim().toLowerCase();
  if (nodeEnv === "development" || nodeEnv === "test") return true;
  return false;
}

/**
 * Auto-trigger a server-side repair loop when the live preview-VM emits
 * a `build-error` SSE (npm install / next build / dev server crashed).
 *
 * Closes the gap between "the user mental model" — *VM-fel ska åka
 * tillbaka in i repair-kedjan automatiskt* — and the previous reality,
 * where build-error only triggered a UI banner unless the user
 * manually clicked "Repair" or the F2 verification policy happened to
 * also schedule server-verify (which it usually doesn't in design
 * mode, see `resolvePostFinalizeServerVerifyDecision`).
 *
 * **Default on in dev/preview** (Wave 4 of the LLM-flow consolidation).
 * Production still waits for explicit opt-in via
 * `SAJTMASKIN_AUTO_REPAIR_BUILD_ERROR=1` until we have enough field
 * data to flip the production default. Same `inflight` dedup as
 * server-verify, so we never run two repair loops on the same version
 * concurrently regardless of which path triggered them.
 */
export async function triggerBuildErrorRepair(params: {
  chatId: string;
  versionId: string;
  buildError: {
    stage: string;
    message: string;
    failureCode?: string | null;
  };
  onRepairAvailable?: (payload: {
    versionId: string;
    summary: string | null;
    repairAvailableAt: string | null;
  }) => void;
}): Promise<void> {
  if (!isAutoRepairBuildErrorEnabled()) return;
  const { chatId, versionId, buildError, onRepairAvailable } = params;
  if (!isServerVerifyEligible(versionId)) return;
  // OMTAG-06 / Codex P2: surface the preview-VM build error as a first-class bus
  // event BEFORE acquiring the lease, so the signal (and its error-log
  // projection) is never dropped when another job already owns the version —
  // only the mutating repair below is skipped in that case. The projection will
  // flip `phase` to "failed" until a clean repair pass lands and emits
  // `version.saved` without blockers.
  emitBusEvent({
    t: "version.build.error",
    versionId,
    chatId,
    error: {
      stage: buildError.stage,
      message: buildError.message,
      failureCode: buildError.failureCode ?? null,
    },
    level: "error",
    category: "preview-vm",
  });
  inflight.add(versionId);
  const lease = await acquireVerifyLease(versionId, "build_error_repair");
  if (!lease.proceed) {
    // Another live lease already owns this version — the build-error event is
    // already emitted above; skip only the mutating repair to avoid racing it.
    inflight.delete(versionId);
    return;
  }
  const runId = lease.runId;
  try {
    if (!(await isLatestVersionForChat(chatId, versionId))) return;
    const snapshot = await getVersionFilesSnapshot(versionId);
    if (!snapshot || snapshot.files.length === 0) return;
    const codeFiles = snapshot.files;
    const baseFilesJson = snapshot.filesJson;
    const failureCodeSuffix = buildError.failureCode ? ` [${buildError.failureCode}]` : "";
    const failedOutput: ServerVerifyFailedOutput = {
      check: "build",
      exitCode: 1,
      output: `[preview-vm:${buildError.stage}]${failureCodeSuffix} ${buildError.message}`,
      durationMs: null,
    };
    await tryServerRepairLoop({
      chatId,
      versionId,
      codeFiles,
      baseFilesJson,
      failedOutputs: [failedOutput],
      verifyLaneDurationMs: 0,
      firstFailureCheck: "build",
      jobStartedAt: null,
      jobFinishedAt: null,
      onRepairAvailable,
      runId,
    });
  } catch (err) {
    console.error("[server-verify] build-error repair failed:", err);
  } finally {
    await releaseVerifyLease(versionId, runId);
    inflight.delete(versionId);
  }
}

async function tryServerRepairLoop(params: {
  chatId: string;
  versionId: string;
  codeFiles: CodeFile[];
  /** Exact files_json the repair is based on (#260 / P2 #5 revision-binding). */
  baseFilesJson: string;
  failedOutputs: ServerVerifyFailedOutput[];
  verifyLaneDurationMs: number;
  firstFailureCheck: string | null;
  jobStartedAt: string | null;
  jobFinishedAt: string | null;
  onRepairAvailable?: (payload: {
    versionId: string;
    summary: string | null;
    repairAvailableAt: string | null;
  }) => void;
  /** Distributed-lease owner id (Plan C). Undefined = legacy Set-only path. */
  runId?: string;
}): Promise<void> {
  const {
    chatId,
    versionId,
    codeFiles,
    baseFilesJson,
    failedOutputs,
    verifyLaneDurationMs,
    firstFailureCheck,
    jobStartedAt,
    jobFinishedAt,
    onRepairAvailable,
    runId,
  } = params;
  const verifyContext = {
    verifyLaneDurationMs,
    firstFailureCheck,
    jobStartedAt,
    jobFinishedAt,
  };
  const hadQualityGateFailures = failedOutputs.length > 0;

  await markVersionRepairing(versionId, undefined, runId).catch(() => null);

  const exportable = await buildExportableProject(codeFiles);
  const initialContent = serializeCodeProject(exportable);

  async function tryPromoteAfterGate(projectContent: string, method: "deterministic" | "llm"): Promise<boolean> {
    // Codex P2 (renew before the post-repair gate): the per-pass onBeforePass
    // renewal only covers the LLM passes. shouldPromoteAfterRepair below runs a
    // preview-host verify that can take up to 300s, after which the
    // renew-before-save fires. Since renewVersionLease refuses expired leases,
    // a slow gate could otherwise expire the lease and no-op a valid
    // saveRepairedFiles. Renew here so the gate window is covered too.
    if (runId) await renewVersionLease(versionId, runId).catch(() => {});
    const rawRepairedFiles = parseCodeProject(projectContent).files;
    // Block the server-repair bypass of SCAFFOLD_PROTECTED_PATHS: even if
    // the LLM regenerates `app/api/placeholder/route.ts` (the JSX-in-`.ts`
    // failure mode that motivated the protected set) and the quality gate
    // happens to pass, never persist the LLM version. Re-inject the path
    // from `codeFiles` (the pre-repair persisted version) which already
    // carries the canonical scaffold/previous content. See
    // `@/lib/gen/scaffolds/protected-paths` for context.
    const protectedPartition =
      partitionGeneratedFilesForProtectedPaths(rawRepairedFiles);
    const reinjection = reinjectProtectedPathsFromFallback({
      kept: protectedPartition.kept,
      droppedPaths: protectedPartition.dropped.map((f) => f.path),
      fallbackFiles: codeFiles,
    });
    const repairedFiles = reinjection.files;
    if (protectedPartition.dropped.length > 0) {
      const droppedPaths = protectedPartition.dropped.map((f) => f.path);
      warnLog(
        "engine",
        "Scaffold-protected paths emitted by repair LLM — dropped from saveRepairedFiles input",
        {
          chatId,
          versionId,
          droppedPaths,
          reinjected: reinjection.reinjected,
          stillMissing: reinjection.stillMissing,
          branch: "server-repair",
          method,
        },
      );
      devLogAppend("in-progress", {
        type: "scaffold-protected-overwrite-blocked",
        chatId,
        versionId,
        branch: "server-repair",
        method,
        droppedPaths,
        reinjected: reinjection.reinjected,
        stillMissing: reinjection.stillMissing,
      });
    }
    const exportableForGate = await buildExportableProject(repairedFiles);
    const decision = await shouldPromoteAfterRepair({
      chatId,
      versionId,
      exportable: exportableForGate,
      hadQualityGateFailures,
      checks: DESIGN_PREVIEW_QUALITY_GATE_CHECKS,
    });
    const visualQA = maybeAnalyzeVisualQAForPassedExportable({
      exportable: exportableForGate,
      results: decision.results,
      onError: (vqaErr) => {
        console.warn("[server-verify] Post-repair visual QA error (non-fatal):", vqaErr);
      },
    });
    const visualQAMeta = visualQA
      ? compactVisualQAForQualityGateLog(visualQA)
      : undefined;
    let promoted = false;
    if (decision.promote) {
      if (!(await isLatestVersionForChat(chatId, versionId))) {
        await markVersionSupersededByRepair(versionId, null, runId).catch(() => null);
        await createEngineVersionErrorLogs([{
          chatId,
          versionId,
          level: "warning",
          category: "server-verify:superseded",
          message: "Post-repair promotion skipped because a newer version already exists.",
          meta: {
            method,
            serverOwned: true,
          },
        }]).catch(() => null);
        return false;
      }
      const filesJson = JSON.stringify(repairedFiles);
      const msg =
        method === "deterministic"
          ? "Server repair passed quality gate (deterministic). Awaiting acceptance."
          : "Server repair passed quality gate (LLM). Awaiting acceptance.";
      // Renew the lease right before persisting: a long repair loop may have run
      // past the TTL. Renew re-extends it while we still own it (run_id +
      // status='running'); if another run took over, saveRepairedFiles's
      // lease-conditioned write no-ops, so we never clobber a newer repair.
      if (runId) await renewVersionLease(versionId, runId).catch(() => {});
      const saved = await saveRepairedFiles(versionId, filesJson, msg, runId, baseFilesJson).catch((err) => {
        console.warn("[server-verify] Failed to save repaired version files:", err);
        return null;
      });
      promoted = Boolean(saved);
      if (saved && onRepairAvailable) {
        onRepairAvailable({
          versionId: saved.id,
          summary: saved.verification_summary,
          repairAvailableAt: saved.repair_available_at,
        });
      }
    }
    await createEngineVersionErrorLogs([
      {
        chatId,
        versionId,
        level: promoted ? "info" : "warning",
        category: "preflight:quality-gate",
        message: promoted
          ? `Post-repair quality gate passed (${method}); repair is ready for acceptance.`
          : decision.promote
            ? `Post-repair quality gate passed but repair could not be saved (${method}).`
            : "Post-repair quality gate did not pass; not promoting.",
        meta: buildServerVerifyQualityGateMeta({
          results: decision.results,
          verifyLaneDurationMs: decision.verifyLaneDurationMs,
          firstFailureCheck: decision.firstFailureCheck,
          jobStartedAt: decision.jobStartedAt,
          jobFinishedAt: decision.jobFinishedAt,
          repass: true,
          method,
          promoted,
          visualQA: visualQAMeta,
          errorManifest: groupedRepairContext.errorManifest,
        }),
      },
    ]).catch((err) => {
      console.warn("[server-verify] Failed to persist post-repair quality gate log:", err);
    });
    return promoted;
  }

  const originatingChat = await getChat(chatId).catch(() => null);
  const originatingTier = ownModelIdToCanonicalModelId(originatingChat?.model ?? null);
  // Bug 01#3 (2026-04-22 audit): fallback till default-tier (pro) när chat-
  // modellen inte mappar till en känd canonical tier. Tidigare blev fixerModel
  // `undefined` och runLlmFixer använde sin interna default — det bröt
  // förutsägbarheten i manifestens phaseRouting (reparation och fas 2 kunde
  // köra på olika tiers utan att det syntes i logs).
  const fixerTier = originatingTier ?? DEFAULT_MODEL_ID;
  const fixerModel = resolvePhaseModel(fixerTier, "fixer").modelId;
  const fixerThinking = resolvePhaseThinking(fixerTier, "fixer");

  const repairLogContext = buildRepairLogContextLines({
    failedOutputs,
    verifyLaneDurationMs,
    firstFailureCheck,
    jobStartedAt,
    jobFinishedAt,
    initialContent,
  });
  const groupedRepairContext = {
    errorManifest: repairLogContext.errorManifest,
  };

  const loopResult = await runRepairLoop({
    initialContent,
    failedOutputs,
    contextLines: repairLogContext.contextLines,
    maxLlmPasses: SERVER_REPAIR_MAX_PASSES,
    llmTimeoutMs: LLM_FIXER_TIMEOUT_MS,
    llmRetryTimeoutMs: LLM_FIXER_RETRY_TIMEOUT_MS,
    fixerModel,
    fixerThinking: fixerThinking?.thinking,
    fixerReasoningEffort: fixerThinking?.reasoningEffort,
    recurringPatterns: readRecurringPatternsForChat(chatId),
    hasActionableErrorContext: hadQualityGateFailures,
    onBeforePass: async () => {
      if (runId) await renewVersionLease(versionId, runId).catch(() => {});
    },
    onAttemptPromotion: async (projectContent, method) => ({
      promoted: await tryPromoteAfterGate(projectContent, method),
    }),
  });

  if (loopResult.promoted) {
    logRepairOutcome(
      chatId,
      versionId,
      loopResult.method ?? "llm",
      true,
      loopResult.llmPasses,
      0,
      undefined,
      verifyContext,
      fixerModel,
      loopResult.errorManifest,
    );
    return;
  }

  if (loopResult.remainingErrors === 0) {
    await failVersionVerification(
      versionId,
      "Server repair: syntax clean (esbuild) but quality gate (typecheck/build) still failing.",
      runId,
    ).catch(() => null);
    logRepairOutcome(
      chatId,
      versionId,
      "llm",
      false,
      loopResult.llmPasses,
      0,
      loopResult.earlyStopReason,
      verifyContext,
      fixerModel,
      loopResult.errorManifest,
      { remainingErrorsSource: "esbuild_syntax", syntaxCleanGateFailed: true },
    );
    return;
  }

  await failVersionVerification(
    versionId,
    `Server repair incomplete (${loopResult.remainingErrors} esbuild syntax errors remain).`,
    runId,
  ).catch(() => null);
  logRepairOutcome(
    chatId,
    versionId,
    "llm",
    false,
    loopResult.llmPasses,
    loopResult.remainingErrors,
    loopResult.earlyStopReason,
    verifyContext,
    fixerModel,
    loopResult.errorManifest,
    { remainingErrorsSource: "esbuild_syntax", syntaxCleanGateFailed: false },
  );
}

function logRepairOutcome(
  chatId: string,
  versionId: string,
  method: "deterministic" | "llm",
  repaired: boolean,
  llmPasses: number,
  remainingErrors?: number,
  earlyStopReason?: "fixer_noop" | "no_improvement" | "time_budget_exceeded" | null,
  verifyContext?: {
    verifyLaneDurationMs: number;
    firstFailureCheck: string | null;
    jobStartedAt: string | null;
    jobFinishedAt: string | null;
  },
  fixerModelId?: string | null,
  errorManifest?: RepairErrorManifest | null,
  outcomeQualifier?: {
    remainingErrorsSource?: "esbuild_syntax" | "quality_gate";
    syntaxCleanGateFailed?: boolean;
  },
) {
  // The "remainingErrors" counter reflects esbuild parse errors, not the
  // quality-gate (tsc/build/eslint) outcome. When syntax is clean but the
  // gate still fails we surface that explicitly so logs/UI don't read as
  // "0 errors but somehow not promoted" (the historic confusing case).
  const message = repaired
    ? `Server repair succeeded (${method}).`
    : outcomeQualifier?.syntaxCleanGateFailed
      ? `Server repair incomplete (${method}, syntax clean but quality gate still failing${earlyStopReason ? `, ${earlyStopReason}` : ""}).`
      : `Server repair incomplete (${method}, ${remainingErrors ?? "?"} esbuild syntax errors remain${earlyStopReason ? `, ${earlyStopReason}` : ""}).`;
  createEngineVersionErrorLogs([{
    chatId,
    versionId,
    level: repaired ? "info" : "warning",
    category: "server-repair",
    message,
    meta: {
      ...buildServerRepairOutcomeMeta({
        method,
        llmPasses,
        repaired,
        remainingErrors,
        remainingErrorsSource: outcomeQualifier?.remainingErrorsSource,
        syntaxCleanGateFailed: outcomeQualifier?.syntaxCleanGateFailed,
        earlyStopReason,
        verifyLaneDurationMs: verifyContext?.verifyLaneDurationMs ?? 0,
        firstFailureCheck: verifyContext?.firstFailureCheck ?? null,
        jobStartedAt: verifyContext?.jobStartedAt ?? null,
        jobFinishedAt: verifyContext?.jobFinishedAt ?? null,
        errorManifest: errorManifest ?? null,
      }),
      ...(fixerModelId ? { fixerModelId } : {}),
    },
  }]).catch((err) => {
    console.warn("[server-verify] Failed to persist server-repair outcome log:", err);
  });
}

function buildRepairLogContextLines(params: {
  failedOutputs: ServerVerifyFailedOutput[];
  verifyLaneDurationMs: number;
  firstFailureCheck: string | null;
  jobStartedAt: string | null;
  jobFinishedAt: string | null;
  initialContent: string;
}): {
  errorManifest: RepairErrorManifest;
  contextLines: string[];
} {
  const baseLines = [
    ...buildServerVerifyRepairContextLines({
      failedOutputs: params.failedOutputs,
      verifyLaneDurationMs: params.verifyLaneDurationMs,
      firstFailureCheck: params.firstFailureCheck,
      jobStartedAt: params.jobStartedAt,
      jobFinishedAt: params.jobFinishedAt,
    }),
    ...buildRepairErrorContextLines(params.failedOutputs),
  ];
  const grouped = buildGroupedRepairErrorContext(params.failedOutputs, {
    projectContent: params.initialContent,
  });
  return {
    errorManifest: grouped.errorManifest,
    contextLines: [...grouped.contextLines, ...baseLines],
  };
}
