import {
  markVersionRepairing,
  failVersionVerification,
  saveRepairedFiles,
  getChat,
  markVersionSupersededByRepair,
  renewVersionLease,
} from "@/lib/db/chat-repository-pg";
import { getVersionFilesSnapshot } from "@/lib/gen/version-manager";
import { readRecurringPatternsForChat } from "@/lib/logging/recurring-patterns-reader";
import {
  buildExportableProject,
  chatUsesVerbatimRepo,
} from "@/lib/gen/export/build-exportable-project";
import type { BuildSpecPreviewPolicy } from "@/lib/gen/build-spec";
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
import { resolveSameSignalGateChecks } from "../quality-gate-checks";
import { RepairLedger } from "@/lib/gen/autofix/llm-repair-gate";
import {
  maybeAnalyzeVisualQAForPassedExportable,
  shouldPromoteAfterRepair,
} from "../preview-quality-gate";
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
} from "../repair-loop";
import {
  buildServerVerifyQualityGateMeta,
  buildServerVerifyRepairContextLines,
  buildServerRepairOutcomeMeta,
  collectLintAdvisories,
  compactVisualQAForQualityGateLog,
  resolveServerRepairOutcome,
  type ServerRepairEarlyStop,
  type ServerVerifyFailedOutput,
} from "../server-verify-log-meta";
import { resolvePostRepairFinalize } from "../server-repair-policy";
import { isLatestVersionForChat } from "./lease";

/**
 * Outcome of a server-repair loop run. `supersededByUserEdit` is set when the
 * repair no-op'd because a concurrent user edit advanced `files_json` past the
 * snapshot the repair was based on (#260 Codex P2 `stale_base`). The caller MUST
 * then re-verify the CURRENT files on a fresh lease so the user's newer edit B
 * reaches an honest terminal state instead of lingering in `repairing` (where
 * the readiness watchdog could fail it). Every other outcome already left the
 * row terminal (`repair_available` / `failed`).
 */
interface ServerRepairLoopOutcome {
  supersededByUserEdit: boolean;
  /**
   * The repair was entered from a build/preview-start failure. When the repair
   * is superseded by a concurrent user edit, the caller's re-verify of the
   * CURRENT files (B) MUST keep `build` in its gate — re-verifying B with the
   * typecheck-only design-preview lane could false-green a still-broken build,
   * reintroducing exactly the case this change fixes (#260 Codex P2).
   */
  buildOriginated: boolean;
}

export async function tryServerRepairLoop(params: {
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
  /**
   * Version preview policy (F2 `"fidelity2"` / F3 `"fidelity3"`). Threaded into
   * `runRepairLoop` so the deterministic import-repair only (re)introduces
   * tier-3 backend SDK imports in F3. Omitted → F2-safe.
   */
  previewPolicy?: BuildSpecPreviewPolicy;
  /**
   * #260 Codex P2 (forced build gate): the re-verify that spawned this loop was
   * intentionally build-originated (`forceBuildCheck`). OR this into the local
   * `buildOriginated` so a round where `build` passes but `typecheck` fails does
   * not drop `build` from the post-repair gate and false-green a still-broken
   * build. `triggerBuildErrorRepair` always passes `true`.
   */
  forceBuildGate?: boolean;
  /**
   * A3: absolut `Date.now()`-deadline som trädas ner i `runRepairLoop` så en
   * SYNKRON anropare (deploy-repair-endpointen) kan binda loopen till sin
   * route-`maxDuration`. Utelämnad → obundet (bakgrundskörning: server-verify /
   * post-finalize auto-repair, dagens beteende).
   */
  repairDeadlineEpochMs?: number;
  /** Fas 3 (RepairGate): shared ledger + scope for cross-lane dedupe. */
  repairLedger?: RepairLedger;
  repairScopeId?: string;
}): Promise<ServerRepairLoopOutcome> {
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
    previewPolicy,
    forceBuildGate = false,
    repairDeadlineEpochMs,
  } = params;
  // Fas 3: without a finalize handover, use a fresh per-run ledger + a
  // version-bound scope (mirrors runner.ts's `{base}:{pass}` pattern) so the
  // loop still dedupes identical retries within this repair run.
  const repairLedger = params.repairLedger ?? new RepairLedger();
  const repairScopeId = params.repairScopeId ?? `${versionId}:server-repair`;
  const verifyContext = {
    verifyLaneDurationMs,
    firstFailureCheck,
    jobStartedAt,
    jobFinishedAt,
  };
  const hadQualityGateFailures = failedOutputs.length > 0;
  // #260 Codex P2 (build-origin false-green): the repair was entered from a
  // build/preview-start failure. Check ALL original failures, not just
  // `firstFailureCheck`: when typecheck AND build both failed, `firstFailureCheck`
  // is "typecheck", yet the build must still be re-run — both in the post-repair
  // gate below AND in the caller's post-supersede re-verify of the current files.
  // `forceBuildGate` carries an intentionally build-originated re-verify so a
  // round that only re-fails on typecheck cannot drop `build` from the gate.
  const buildOriginated =
    forceBuildGate ||
    failedOutputs.some((output) => output.check === "build") ||
    firstFailureCheck === "build";
  // #260 Codex P2 (repair-vs-edit finalize): set when saveRepairedFiles no-ops
  // because a concurrent user edit advanced files_json past the repaired-from
  // snapshot. Used after the loop to skip failVersionVerification so the user's
  // newer edit is never finalized as failed from a stale repair(A).
  let staleBaseNoOp = false;

  await markVersionRepairing(versionId, undefined, runId).catch(() => null);
  // NOTE: intentionally NOT emitting version.repair.started/passIndex here.
  // Surfacing bounded "Reparerar X/2" for the server-verify auto-repair path
  // would require a terminal bus event when the loop finishes — but its
  // success outcome is `repair_available` (awaiting accept), which has no clean
  // terminal phase in the bus lifecycle, so emitting repair.started alone would
  // strand the projection in `repairing` (Bugbot #340). The finalize-runner
  // repair path DOES emit + settle, so the UI progress works there. Wiring the
  // server-verify path is tracked as a follow-up (needs a repair_available
  // bus-settle). See BUG-SWARM-BACKLOG.md.

  // Same verbatim rule as the verify lane: imported repos are gated on the
  // project as-is, never a scaffold-merged variant.
  const repairVerbatimRepo = await chatUsesVerbatimRepo(chatId);
  const exportable = await buildExportableProject(codeFiles, {
    verbatimRepo: repairVerbatimRepo,
  });
  const initialContent = serializeCodeProject(exportable);

  async function tryPromoteAfterGate(
    projectContent: string,
    method: "deterministic" | "llm",
  ): Promise<boolean> {
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
    const protectedPartition = partitionGeneratedFilesForProtectedPaths(rawRepairedFiles);
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
    const exportableForGate = await buildExportableProject(repairedFiles, {
      verbatimRepo: repairVerbatimRepo,
    });
    const decision = await shouldPromoteAfterRepair({
      chatId,
      versionId,
      exportable: exportableForGate,
      hadQualityGateFailures,
      // Fas 3 same-signal-kontrakt: the post-repair gate must re-run every
      // check that originally failed — a repair is only "repaired" when the
      // SAME signal passes again. Union of the base lane (#260 build-origin
      // escalation, #291 F3 integrations lane) and the origin failed checks.
      checks: resolveSameSignalGateChecks({
        originFailedChecks: failedOutputs.map((output) => output.check),
        buildOriginated,
        previewPolicy,
      }),
    });
    const visualQA = maybeAnalyzeVisualQAForPassedExportable({
      exportable: exportableForGate,
      results: decision.results,
      onError: (vqaErr) => {
        console.warn("[server-verify] Post-repair visual QA error (non-fatal):", vqaErr);
      },
    });
    const visualQAMeta = visualQA ? compactVisualQAForQualityGateLog(visualQA) : undefined;
    const postRepairLintAdvisories = collectLintAdvisories(decision.results);
    let promoted = false;
    if (decision.promote) {
      if (!(await isLatestVersionForChat(chatId, versionId))) {
        await markVersionSupersededByRepair(versionId, null, runId).catch(() => null);
        await createEngineVersionErrorLogs([
          {
            chatId,
            versionId,
            level: "warning",
            category: "server-verify:superseded",
            message: "Post-repair promotion skipped because a newer version already exists.",
            meta: {
              method,
              serverOwned: true,
            },
          },
        ]).catch(() => null);
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
      const saveResult = await saveRepairedFiles(
        versionId,
        filesJson,
        msg,
        runId,
        baseFilesJson,
      ).catch((err) => {
        console.warn("[server-verify] Failed to save repaired version files:", err);
        return { status: "failed" as const };
      });
      if (saveResult.status === "stale_base") {
        staleBaseNoOp = true;
      }
      const saved = saveResult.status === "saved" ? saveResult.version : null;
      promoted = Boolean(saved);
      if (saved && onRepairAvailable) {
        onRepairAvailable({
          versionId: saved.id,
          summary: saved.verification_summary,
          repairAvailableAt: saved.repair_available_at,
        });
      }
    }
    const lintAdvisoryPromoted = promoted && postRepairLintAdvisories.length > 0;
    if (lintAdvisoryPromoted) {
      try {
        emitBusEvent({
          t: "version.degraded",
          versionId,
          chatId,
          kind: "lint_advisory",
          message: "Post-repair ReleaseGate godkändes med ESLint-varningar (advisory).",
          meta: {
            advisoryChecks: ["lint"],
            warningCount: postRepairLintAdvisories.reduce(
              (sum, result) => sum + (result.warningCount ?? 0),
              0,
            ),
          },
        });
      } catch {
        // Telemetry only — never invalidate a verified repair candidate.
      }
    }
    await createEngineVersionErrorLogs([
      {
        chatId,
        versionId,
        level: promoted ? (lintAdvisoryPromoted ? "warning" : "info") : "warning",
        category: "preflight:quality-gate",
        message: promoted
          ? lintAdvisoryPromoted
            ? `Post-repair quality gate passed with lint warnings (advisory, ${method}); repair is ready for acceptance.`
            : `Post-repair quality gate passed (${method}); repair is ready for acceptance.`
          : decision.promote
            ? `Post-repair quality gate passed but repair could not be saved (${method}).`
            : "Post-repair quality gate did not pass; not promoting.",
        meta: buildServerVerifyQualityGateMeta({
          passed: promoted,
          advisory: lintAdvisoryPromoted,
          advisoryChecks: lintAdvisoryPromoted ? ["lint"] : [],
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

  // Fas 3 (base-aware tidig abort): checked by the loop at every pass start
  // and before the final gate. Detects BOTH superseded flavors:
  //   - a NEWER VERSION row exists (repair target is no longer the latest) —
  //     the existing promote path would mark it superseded AFTER doing all the
  //     work; abort early instead;
  //   - `files_json` advanced past the base snapshot (concurrent user edit) —
  //     the base-bound save would no-op (`stale_base`) after the work is done.
  let supersededKind: "newer_version" | "files_advanced" | null = null;
  const shouldAbortSuperseded = async (): Promise<boolean> => {
    if (supersededKind) return true;
    if (!(await isLatestVersionForChat(chatId, versionId))) {
      supersededKind = "newer_version";
      return true;
    }
    const current = await getVersionFilesSnapshot(versionId).catch(() => null);
    if (current && current.filesJson !== baseFilesJson) {
      supersededKind = "files_advanced";
      return true;
    }
    return false;
  };

  const loopResult = await runRepairLoop({
    initialContent,
    chatId,
    previewPolicy,
    failedOutputs,
    contextLines: repairLogContext.contextLines,
    // Global budget (manifest `repairPolicies.serverRepairPasses`, default 2).
    maxLlmPasses: SERVER_REPAIR_MAX_PASSES,
    llmTimeoutMs: LLM_FIXER_TIMEOUT_MS,
    llmRetryTimeoutMs: LLM_FIXER_RETRY_TIMEOUT_MS,
    // A3: bunden till anroparens route-maxDuration för synkron deploy-repair;
    // undefined för bakgrundskörning (obundet, dagens beteende).
    repairDeadlineEpochMs,
    fixerModel,
    fixerThinking: fixerThinking?.thinking,
    fixerReasoningEffort: fixerThinking?.reasoningEffort,
    fixerReasoningMode: fixerThinking?.reasoningMode,
    recurringPatterns: readRecurringPatternsForChat(chatId),
    hasActionableErrorContext: hadQualityGateFailures,
    repairLedger,
    repairScopeId,
    shouldAbortSuperseded,
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
    return { supersededByUserEdit: false, buildOriginated };
  }

  // Fas 3 (base-aware tidig abort): the loop stopped because the version got
  // superseded mid-repair. Resolve per flavor:
  //  - newer_version: mark the row superseded (the same terminal state the
  //    promote path would have reached AFTER wasting the remaining budget) and
  //    log the canonical `superseded_by_newer_version` outcome. No re-verify —
  //    the newer version owns its own verify lifecycle.
  //  - files_advanced: identical semantics to a stale-base no-op — fall through
  //    via `staleBaseNoOp` so the caller re-verifies the CURRENT files (B).
  if (!loopResult.promoted && loopResult.earlyStopReason === "superseded") {
    if (supersededKind === "newer_version") {
      await markVersionSupersededByRepair(versionId, null, runId).catch(() => null);
      await createEngineVersionErrorLogs([
        {
          chatId,
          versionId,
          level: "warning",
          category: "server-verify:superseded",
          message:
            "Server repair aborted early: a newer version exists, so the repair result would be discarded.",
          meta: { serverOwned: true, supersededKind },
        },
      ]).catch(() => null);
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
      );
      return { supersededByUserEdit: false, buildOriginated };
    }
    staleBaseNoOp = true;
  }

  // #260 Codex P2 (stale-base before fail): a non-promoted repair never reached
  // saveRepairedFiles, so `staleBaseNoOp` can still be false even if a concurrent
  // user edit advanced files_json past the snapshot this repair was based on.
  // Re-read the current snapshot and treat a changed files_json as a stale-base
  // no-op so we re-verify the current files (B) on a fresh lease instead of
  // finalizing B as failed from this stale repair(A).
  if (!loopResult.promoted && !staleBaseNoOp) {
    const currentSnapshot = await getVersionFilesSnapshot(versionId).catch(() => null);
    if (currentSnapshot && currentSnapshot.filesJson !== baseFilesJson) {
      staleBaseNoOp = true;
    }
  }

  const finalizeAction = resolvePostRepairFinalize({
    staleBaseNoOp,
    remainingErrors: loopResult.remainingErrors,
  });

  if (finalizeAction === "skip_stale_base") {
    // #260 Codex P2: a concurrent user edit advanced files_json past snapshot A
    // while this repair ran, so saveRepairedFiles no-op'd by design. Do NOT
    // failVersionVerification — that would finalize the user's newer edit B as
    // failed from a stale repair(A). Signal the caller to re-verify the current
    // files (B) on a fresh lease so B reaches an honest terminal state instead
    // of lingering in `repairing` (where the readiness watchdog could fail it).
    await createEngineVersionErrorLogs([
      {
        chatId,
        versionId,
        level: "warning",
        category: "server-verify:stale-base-skip",
        message:
          "Post-repair finalize skipped: files_json advanced (concurrent edit); re-verifying the current files instead of failing from stale repair.",
        meta: { serverOwned: true, staleBaseNoOp: true },
      },
    ]).catch(() => null);
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
    );
    return { supersededByUserEdit: true, buildOriginated };
  }

  if (finalizeAction === "fail_syntax_clean") {
    // Keep the cause honest: a wall-clock / fixer timeout is NOT an unresolved
    // gate, so don't blame the gate when the loop stopped on time budget
    // (Bugbot #318 — same branching as the manual repair route).
    const syntaxCleanSummary =
      loopResult.earlyStopReason === "time_budget_exceeded"
        ? `Server repair stopped after ${loopResult.llmPasses} attempt(s): time budget exceeded before the quality gate could be resolved (code is syntactically valid). Try again, or edit the file manually.`
        : `Server repair could not resolve the quality gate after ${loopResult.llmPasses} attempt(s): code is syntactically valid but typecheck/build still fails${loopResult.earlyStopReason ? ` (${loopResult.earlyStopReason})` : ""}. Try a smaller or more specific prompt, or edit the file manually.`;
    await failVersionVerification(versionId, syntaxCleanSummary, runId).catch(() => null);
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
    return { supersededByUserEdit: false, buildOriginated };
  }

  const incompleteSummary =
    loopResult.earlyStopReason === "time_budget_exceeded"
      ? `Server repair stopped after ${loopResult.llmPasses} attempt(s): time budget exceeded with ${loopResult.remainingErrors} esbuild syntax error(s) remaining.`
      : `Server repair incomplete after ${loopResult.llmPasses} attempt(s): ${loopResult.remainingErrors} esbuild syntax error(s) remain${loopResult.earlyStopReason ? ` (${loopResult.earlyStopReason})` : ""}.`;
  await failVersionVerification(versionId, incompleteSummary, runId).catch(() => null);
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
  return { supersededByUserEdit: false, buildOriginated };
}

function logRepairOutcome(
  chatId: string,
  versionId: string,
  method: "deterministic" | "llm",
  repaired: boolean,
  llmPasses: number,
  remainingErrors?: number,
  earlyStopReason?: ServerRepairEarlyStop | null,
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
  // quality-gate (tsc/build/eslint) outcome. The canonical taxonomy resolver
  // (Fas 0) surfaces the syntax-clean-but-gate-failed case explicitly so logs
  // don't read as "0 errors but somehow not promoted" (historic confusion).
  const { message } = resolveServerRepairOutcome({
    method,
    repaired,
    remainingErrors,
    syntaxCleanGateFailed: outcomeQualifier?.syntaxCleanGateFailed,
    earlyStopReason,
  });
  createEngineVersionErrorLogs([
    {
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
    },
  ]).catch((err) => {
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
