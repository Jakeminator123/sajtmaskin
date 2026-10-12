import { dbConfigured } from "@/lib/db/client";
import { assertPromoteAllowed } from "@/lib/db/promote-guard";
import { recordQualityGatePassedForCurrentContent } from "@/lib/db/services/generation-telemetry";
import { logTier3MissingEnvBlockedDetached } from "@/lib/integrations/log-tier3-missing-env";
import { warnLog } from "@/lib/utils/debug";
import type { VisualQAResult } from "../visual-qa";
import { describeQualityGateVerification, QUALITY_GATE_COMMANDS, QUALITY_GATE_SETUP_HINT,
  QualityGateNotConfiguredError, QualityGateUnavailableError, isQualityGateConfigured, isQualityGateDisabledByEnv,
  type QualityGateCheckResult } from "../preview-quality-gate";
import { checkTier3ReadinessForVersion, serverOwnedF3ReadinessParams } from "../tier3-readiness";
import {
  markVersionVerifying,
  promoteVersion,
  failVersionVerification,
  markVersionSupersededByRepair,
  resetVersionVerificationToPending,
  updateVersionFiles,
} from "@/lib/db/chat-repository-pg";
import { readServerRepairBudget } from "@/lib/db/services/server-repair-budget";
import { holdVersionForIntegrationMigration } from "@/lib/db/chat-repository/version-lifecycle";
import { parseCodeProject, serializeCodeProject } from "@/lib/gen/parser";
import type { BuildSpecPreviewPolicy } from "@/lib/gen/build-spec";
import {
  fullProjectProtectedDroppedPaths,
  missingProtectedPathsPersistBlock,
  partitionGeneratedFilesForProtectedPaths,
  reinjectProtectedPathsFromFallback,
} from "@/lib/gen/scaffolds/protected-paths";
import { runDeterministicRepairPrepass } from "../repair-loop";
import { getVersionFilesSnapshot } from "@/lib/gen/version-manager";
import {
  isCurrentIntegrationMigrationHold,
  isNonTerminalVerificationState,
} from "../stale-verification";
import {
  buildExportableProject,
  chatUsesVerbatimRepo,
} from "@/lib/gen/export/build-exportable-project";
import { createEngineVersionErrorLogs } from "@/lib/db/services/version-errors";
import { emit as emitBusEvent } from "@/lib/logging/event-bus";
// Side-effect imports: wire default subscribers (devLog-mirror + DB
// sink) so every `version.verifier.done`/`version.build.error` emit
// below reaches both the legacy surfaces and the UI projection.
import "@/lib/logging/event-bus-subscribers";
import "@/lib/logging/event-bus-error-log-sink";
import {
  isTypecheckOnlyAdvisory,
  resolvePostRepairGateChecks,
} from "../quality-gate-checks";
import type { RepairLedger } from "@/lib/gen/autofix/llm-repair-gate";
import {
  maybeAnalyzeVisualQAForPassedExportable,
  qualityGateAllPassed,
  runQualityGateOnExportable,
} from "../preview-quality-gate";
import { REPAIR_LOOP_BUDGET_MS } from "@/lib/gen/defaults";
import {
  buildServerVerifyQualityGateMeta,
  collectLintAdvisories,
  compactVisualQAForQualityGateLog,
} from "../server-verify-log-meta";
import { resolveBackgroundRepairDeadlineEpochMs } from "../server-repair-policy";
import {
  acquireVerifyLease,
  inflight,
  isLatestVersionForChat,
  isServerVerifyEligible,
  releaseVerifyLease,
} from "./lease";
import { logQualityGateFailuresBestEffort, partitionServerVerifyFailures } from "./failures";
import { tryServerRepairLoop } from "./repair-execution";
import {
  evaluateServerOwnedF3Readiness,
  loadServerVerifyF3ReadinessContext,
  persistF3ReadinessHold,
  resolveSnapshotFilesRevision,
  type ServerVerifyF3ReadinessContext,
} from "./f3-readiness";

const REVERIFY_CURRENT_CONTEXT = Symbol("reverify-current-context");

type VersionFilesSnapshot = NonNullable<Awaited<ReturnType<typeof getVersionFilesSnapshot>>>;

function snapshotIsTerminalOrMigrationHeld(snapshot: VersionFilesSnapshot): boolean {
  return (
    isCurrentIntegrationMigrationHold({
      release_state: snapshot.releaseState,
      verification_state: snapshot.verificationState,
      verification_summary: snapshot.verificationSummary,
      files_revision: snapshot.filesRevision,
    }) || !isNonTerminalVerificationState(snapshot.verificationState)
  );
}

async function settleExhaustedContextRetry(params: {
  versionId: string;
  runId: string;
  snapshot: VersionFilesSnapshot;
  preserveRepairPayload: boolean;
}): Promise<void> {
  const { versionId, runId, snapshot, preserveRepairPayload } = params;
  if (snapshot.verificationState !== "verifying" && snapshot.verificationState !== "repairing") {
    return;
  }
  await resetVersionVerificationToPending(
    versionId,
    "Provider decision context changed during verification; retry the current version.",
    runId,
    {
      expected: {
        filesJson: snapshot.filesJson,
        filesRevision: snapshot.filesRevision,
        editKind: snapshot.editKind,
        verificationState: snapshot.verificationState,
        releaseState: "draft",
        verificationSummary: snapshot.verificationSummary,
      },
      preserveRepairPayload,
    },
  );
}

/**
 * Fire-and-forget server-side verification + capped repair loop.
 * Called from generation stream after finalize. Does NOT block the SSE response.
 *
 * `diagnosticOnly` (default false) skips auto-promotion and LLM repair.
 * When the gate has repairable code failures, the mechanical deterministic
 * prepass still runs and may persist `files_json` improvements (SM-024);
 * terminal state remains failed because verifier blockers forbid promotion.
 */
export type ServerVerificationInput = {
  chatId: string;
  versionId: string;
  diagnosticOnly?: boolean;
  /**
   * Force `build` into the initial verify gate (#260 Codex P2). Set by the
   * post-supersede re-verify when the abandoned repair was build-originated, so
   * the current files (B) are not false-greened by the typecheck-only lane while
   * a Next build failure still lingers. Defaults to off for the normal F2 path.
   */
  forceBuildCheck?: boolean;
  /**
   * Fas 3 (RepairGate): finalize's `RepairLedger`, handed over so a repair in
   * THIS lane dedupes against content+diagnostics already LLM-repaired during
   * finalize (same process — server-verify is fired from post-finalize).
   * Automatic restarts hydrate durable history; absence never mints a fresh budget.
   */
  repairLedger?: RepairLedger;
  /** Fas 3: finalize's `repairScopeId` — must accompany `repairLedger` so ledger keys collide across lanes. */
  repairScopeId?: string;
  repairAuthority?: "automatic" | "manual";
  onRepairAvailable?: (payload: {
    versionId: string;
    summary: string | null;
    repairAvailableAt: string | null;
  }) => void;
  /** Internal bound: at most one fresh re-entry after a decision-context CAS miss. */
  contextRetryUsed?: boolean;
};

export type VersionVerificationOutcome =
  | { kind: "continue"; filesRevision: string; vmGatePassed: boolean; promoted: boolean; advisory: boolean }
  | { kind: "stop"; reason: string; retryable: boolean; vmGatePassed?: boolean; promoted?: false }
  | { kind: "superseded"; cause: "files" | "context" | "newer_version"; forceBuildCheck: boolean; contextRetryUsed: boolean };

export type HeldVersionVerificationInput = ServerVerificationInput & {
  holderRunId: string;
  snapshot: VersionFilesSnapshot;
};

export async function triggerServerVerification(params: ServerVerificationInput): Promise<VersionVerificationOutcome | void> {
  if (!isServerVerifyEligible(params.versionId)) return { kind: "stop", reason: "not_eligible", retryable: false };
  inflight.add(params.versionId);
  const lease = await acquireVerifyLease(params.versionId, "server_verify");
  if (!lease.proceed) {
    inflight.delete(params.versionId);
    return { kind: "stop", reason: lease.reason, retryable: true };
  }
  try {
    const snapshot = await getVersionFilesSnapshot(params.versionId);
    if (!snapshot?.files.length) return { kind: "stop", reason: "no_files", retryable: false };
    return await verifyVersionUnderLease({ ...params, holderRunId: lease.runId, snapshot });
  } finally {
    await releaseVerifyLease(params.versionId, lease.runId);
    inflight.delete(params.versionId);
  }
}

/** Same post-lease raw snapshot throughout. No lease ownership or re-entry here. */
export async function verifyVersionUnderLease(params: HeldVersionVerificationInput): Promise<VersionVerificationOutcome> {
  const {
    chatId,
    versionId,
    onRepairAvailable,
    diagnosticOnly = false,
    forceBuildCheck = false,
    contextRetryUsed = false,
    repairLedger,
    repairScopeId,
  } = params;
  const runId = params.holderRunId;
  if (!runId?.trim() || !params.snapshot.filesRevision?.trim()) return { kind: "stop", reason: "snapshot_unavailable", retryable: true };
  let outcome: VersionVerificationOutcome = { kind: "stop", reason: "verification_stopped", retryable: false };
  // #260 Codex P2 (stale-base re-verify): set when the repair no-op'd because a
  // concurrent user edit advanced files_json past the repaired-from snapshot.
  let reverifyCurrent = false;
  let reverifyFromContextCasMiss = false;
  // #260 Codex P2 (build-origin false-green): carry the abandoned repair's
  // build-origin into the post-supersede re-verify so B's gate keeps `build`.
  let reverifyForceBuildCheck = false;
  // #260 Codex P2 / Bugbot (no fail of B from a stale repair on crash): the
  // exact files_json this run is based on, hoisted so the catch can re-check
  // staleness before failing (staleBaseNoOp lives inside tryServerRepairLoop and
  // is lost when it throws).
  let baseFilesJsonForRecovery: string | null = null;

  const execute = async (): Promise<void> => {
  try {
    if (!(await isLatestVersionForChat(chatId, versionId))) {
      outcome = { kind: "superseded", cause: "newer_version", forceBuildCheck, contextRetryUsed };
      await markVersionSupersededByRepair(versionId, null, runId).catch(() => null);
      await createEngineVersionErrorLogs([
        {
          chatId,
          versionId,
          level: "warning",
          category: "server-verify:superseded",
          message: "Background verification skipped because a newer version already exists.",
          meta: { serverOwned: true },
        },
      ]).catch(() => null);
      return;
    }
    const snapshot = params.snapshot;
    if (!snapshot || snapshot.files.length === 0) return;
    // Read only the atomic creation receipt. Missing history is never seeded here.
    if (params.repairAuthority !== "manual" && snapshot.filesRevision) {
      await readServerRepairBudget({ chatId, versionId, runId, filesRevision: snapshot.filesRevision });
    }
    const codeFiles = snapshot.files;
    // #260 / P2 #5: carry the exact files_json the repair will be based on so a
    // concurrent user edit can't be silently overwritten by saveRepairedFiles.
    const baseFilesJson = snapshot.filesJson;
    baseFilesJsonForRecovery = baseFilesJson;
    // F2/F3 policy derived from the version lifecycle. Threaded into BOTH the
    // initial verify gate (below) AND the repair loop so an F3/integrations
    // version is always gated on the full integrations lane (typecheck + build
    // + lint) and is never green-lit on the F2/design (typecheck-only) lane
    // (#291 Codex P1 — the first gate can `promoteVersion` before the repair
    // branch is ever reached).
    const previewPolicy: BuildSpecPreviewPolicy =
      snapshot.lifecycleStage === "integrations" ? "fidelity3" : "fidelity2";
    const actualFilesRevision = snapshot.filesRevision;
    const filesRevision = resolveSnapshotFilesRevision({
      filesRevision: snapshot.filesRevision,
      filesJson: baseFilesJson,
    });
    const parentVersionId = snapshot.parentVersionId ?? null;
    let f3ReadinessContext: ServerVerifyF3ReadinessContext | null = null;
    if (previewPolicy === "fidelity3") {
      {
        const loaded = await loadServerVerifyF3ReadinessContext(chatId);
        if ("error" in loaded) {
          outcome = { kind: "stop", reason: loaded.error, retryable: true };
          await persistF3ReadinessHold({
            chatId,
            versionId,
            filesRevision,
            result: { ready: false, ok: false, reason: "readiness_unavailable", retryable: true },
            at: "before_first_gate",
          });
          return;
        }
        f3ReadinessContext = loaded;
        const readiness = await evaluateServerOwnedF3Readiness({
          chatId,
          versionId,
          parentVersionId,
          filesRevision,
          preloadedFiles: codeFiles,
          orchestrationSnapshot: f3ReadinessContext.orchestrationSnapshot,
          projectId: f3ReadinessContext.projectId,
        });
        if (!readiness.ready) {
        outcome = { kind: "stop", reason: readiness.reason, retryable: readiness.retryable === true };
        if (readiness.reason === "integration_migration_required") {
          const migrationHold = await holdVersionForIntegrationMigration(
            versionId,
            {
              verificationState: snapshot.verificationState ?? "pending",
              filesRevision: actualFilesRevision,
              filesJson: baseFilesJson,
              editKind: snapshot.editKind,
              orchestrationSnapshot: f3ReadinessContext.orchestrationSnapshot,
            },
            runId,
          );
          if (migrationHold === "cas_miss" && contextRetryUsed) {
            await settleExhaustedContextRetry({
              versionId,
              runId,
              snapshot,
              preserveRepairPayload: snapshot.verificationState === "repairing",
            });
            return;
          }
          if (migrationHold === "cas_miss") {
            reverifyCurrent = true;
            reverifyFromContextCasMiss = true;
            return;
          }
          if (migrationHold === "applied") {
            await persistF3ReadinessHold({
              chatId,
              versionId,
              filesRevision,
              result: readiness,
              at: "before_first_gate",
            });
          }
          return;
        }
        await persistF3ReadinessHold({
          chatId,
          versionId,
          filesRevision,
          result: readiness,
          at: "before_first_gate",
        });
        return;
        }
      }
    }

    await markVersionVerifying(versionId, undefined, runId).catch(() => null);

    // Imported repos (v0-templates / ZIP imports) verify verbatim so the gate
    // tests the SAME project the preview VM runs — never a scaffold-merged
    // variant with force-pinned baseline dependency versions.
    const evaluation = await evaluateVersionGateSnapshot({ chatId, versionId, snapshot, forceBuildCheck });
    if (!evaluation) {
      outcome = { kind: "stop", reason: "quality_gate_disabled", retryable: false };
      await resetVersionVerificationToPending(versionId, undefined, runId).catch(() => null);
      return;
    }
    const { gateResult, passed, visualQA, advisory: f2TypecheckAdvisory } = evaluation;
    const lintAdvisories = collectLintAdvisories(gateResult.results);
    const advisoryPromote = f2TypecheckAdvisory && !diagnosticOnly;

    // For the advisory case, ATTEMPT the promotion before emitting the outcome
    // so the bus signal reflects reality. `promoteVersion` is lease-conditioned:
    // a no-op (null) means a takeover/lease-loss or a guard/DB refusal.
    const persistPromotionMigrationHold = async () => {
      outcome = { kind: "stop", reason: "integration_migration_required", retryable: false };
      await persistF3ReadinessHold({
        chatId,
        versionId,
        filesRevision,
        result: {
          ready: false,
          ok: false,
          reason: "integration_migration_required",
          retryable: false,
        },
        at: "before_promotion",
      });
    };
    const advisoryPromotion = advisoryPromote
      ? await promoteVersionWithRetry(
          versionId,
          "Designläge: previewen renderar. Typecheck-varningar kvarstår (advisory, ej blockerande).",
          runId,
        ).catch(() => null)
      : null;
    if (advisoryPromotion === "integration_migration_required") {
      await persistPromotionMigrationHold();
      return;
    }
    const advisoryPromoted = advisoryPromotion !== null;

    // Advisory promote that did NOT take (lease takeover / guard / transient DB
    // write). Emit NO terminal bus event: a terminal bus `failed` is sticky in
    // `reconcileTerminalDbState` (a later DB `passed` from the client
    // quality-gate route or a takeover run cannot upgrade a bus already
    // `failed`), so a `failed` here would pin a false-red even after the version
    // is promoted elsewhere. Leaving the bus spinning lets the authoritative DB
    // `passed` upgrade it to `done`, and the stale-verification watchdog is the
    // backstop if nothing promotes. Failing the row here would also clobber the
    // owning run on a lease takeover.
    if (advisoryPromote && !advisoryPromoted) {
      outcome = { kind: "stop", reason: "promotion_deferred", retryable: true, vmGatePassed: passed, promoted: false };
      await createEngineVersionErrorLogs([
        {
          chatId,
          versionId,
          level: "info",
          category: "quality-gate:typecheck-advisory",
          message:
            "Designläge: advisory-promotering utfördes inte (lease/guard/DB) — lämnar terminalstatus till DB/route/watchdog.",
          meta: { serverOwned: true, advisory: true, advisoryPromoted: false },
        },
      ]).catch(() => null);
      return;
    }

    // L1: F3 before_promotion must run BEFORE the passed bus + green
    // `preflight:quality-gate` log. Otherwise UI (`reconcileTerminalDbState`)
    // treats bus `done` as klar, and the stale watchdog
    // (`isLatestGateVerdictGreen` → `promoteVersionIfUnleased`) can promote
    // without this grind.
    if (
      passed &&
      !advisoryPromoted &&
      !diagnosticOnly &&
      previewPolicy === "fidelity3" &&
      f3ReadinessContext
    ) {
      const readiness = await evaluateServerOwnedF3Readiness({
        chatId,
        versionId,
        parentVersionId,
        filesRevision,
        preloadedFiles: codeFiles,
        orchestrationSnapshot: f3ReadinessContext.orchestrationSnapshot,
        projectId: f3ReadinessContext.projectId,
      });
      if (!readiness.ready) {
        outcome = { kind: "stop", reason: readiness.reason, retryable: readiness.retryable === true, vmGatePassed: passed };
        if (readiness.reason === "integration_migration_required") {
          const held = await holdVersionForIntegrationMigration(
            versionId,
            {
              verificationState: "verifying",
              filesRevision: actualFilesRevision,
              filesJson: baseFilesJson,
              editKind: snapshot.editKind,
              orchestrationSnapshot: f3ReadinessContext.orchestrationSnapshot,
            },
            runId,
          );
          if (held === "applied") {
            await persistF3ReadinessHold({
              chatId,
              versionId,
              filesRevision,
              result: readiness,
              at: "before_promotion",
            });
          } else if (held === "cas_miss") {
            const current = await getVersionFilesSnapshot(versionId).catch(() => null);
            if (!current || current.files.length === 0 || snapshotIsTerminalOrMigrationHeld(current)) {
              return;
            }
            if (contextRetryUsed) {
              await settleExhaustedContextRetry({
                versionId,
                runId,
                snapshot: current,
                preserveRepairPayload: current.verificationState === "repairing",
              });
            } else if (isNonTerminalVerificationState(current.verificationState)) {
              reverifyCurrent = true;
              reverifyFromContextCasMiss = true;
              throw REVERIFY_CURRENT_CONTEXT;
            }
          }
        } else {
          await persistF3ReadinessHold({
            chatId,
            versionId,
            filesRevision,
            result: readiness,
            at: "before_promotion",
          });
          await resetVersionVerificationToPending(
            versionId,
            `F3 readiness blocked (${readiness.reason}) at before_promotion.`,
            runId,
          ).catch(() => null);
        }
        return;
      }
    }

    if (passed && diagnosticOnly) {
      outcome = { kind: "stop", reason: "diagnostic_only", retryable: false, vmGatePassed: true, promoted: false };
      // Diagnostics-only mode: even a passing gate must NOT publish a green
      // outcome before promotion, because verifier blockers still disallow
      // promotion regardless of build/typecheck status.
      await createEngineVersionErrorLogs([
        {
          chatId,
          versionId,
          level: "info",
          category: "server-verify:diagnostic",
          message:
            "Server verify gate passed but promotion is suppressed (verifier blockers exist).",
          meta: { serverOwned: true, diagnosticOnly: true },
        },
      ]).catch(() => null);
      await failVersionVerification(
        versionId,
        "Verifier-LLM flagged blocking findings; server-verify gate passed. Manual review or repair required.",
        runId,
      ).catch(() => null);
      return;
    }

    let normalPromoted = false;
    if (passed && !advisoryPromoted) {
      const promotion = await promoteVersionWithRetry(
        versionId,
        lintAdvisories.length > 0
          ? "Automatic server verification passed with lint warnings (advisory)."
          : "Automatic server verification passed.",
        runId,
      ).catch(() => null);
      if (promotion === "integration_migration_required") {
        await persistPromotionMigrationHold();
        return;
      }
      if (promotion === null) {
        outcome = { kind: "stop", reason: "promotion_deferred", retryable: true, vmGatePassed: passed, promoted: false };
        await createEngineVersionErrorLogs([
          {
            chatId,
            versionId,
            level: "info",
            category: "preflight:quality-gate",
            message:
              "Server verify passed, but promotion was not applied (lease/guard/DB); terminal status remains authoritative in DB/watchdog.",
            meta: { serverOwned: true, promoted: false },
          },
        ]).catch(() => null);
        return;
      }
      normalPromoted = true;
    }

    // Green only after a real promotion took. A passing gate is evidence for
    // promotion, not itself a published terminal success.
    const outcomeIsGreen = advisoryPromoted || normalPromoted;
    if (outcomeIsGreen) outcome = { kind: "continue", filesRevision,
      vmGatePassed: passed, promoted: true, advisory: f2TypecheckAdvisory || lintAdvisories.length > 0 };

    // OMTAG-06: emit `version.verifier.done` as the canonical outcome
    // signal. The DB sink subscriber (see `event-bus-error-log-sink.ts`)
    // still persists the legacy `engine_version_error_logs` row via the
    // same payload, so no downstream reader breaks.
    const qualityGateMeta = buildServerVerifyQualityGateMeta({
      passed,
      advisory: f2TypecheckAdvisory || lintAdvisories.length > 0,
      advisoryChecks: f2TypecheckAdvisory
        ? ["typecheck"]
        : lintAdvisories.length > 0
          ? ["lint"]
          : [],
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
      outcome: outcomeIsGreen ? "passed" : "failed",
      blocked: !outcomeIsGreen,
      findings: outcomeIsGreen
        ? []
        : gateResult.results
            .filter((r) => !r.passed)
            .map((r) => ({ id: r.check, detail: r.output?.slice(0, 200) ?? "" })),
    });
    if (advisoryPromoted) {
      // Advisory promotion must not read as SOLID green on the status
      // projection: mark the run degraded ("klar med varningar") — mirrors the
      // quality-gate route's advisory emit so both paths surface identically.
      emitBusEvent({
        t: "version.degraded",
        versionId,
        chatId,
        kind: "typecheck_advisory",
        message: "Designläge: versionen promotades med typecheck-varningar (advisory).",
        meta: { advisoryChecks: ["typecheck"] },
      });
    }
    await createEngineVersionErrorLogs([
      {
        chatId,
        versionId,
        level: passed
          ? lintAdvisories.length > 0
            ? "warning"
            : "info"
          : advisoryPromoted
            ? "warning"
            : "error",
        category: advisoryPromoted ? "quality-gate:typecheck-advisory" : "preflight:quality-gate",
        message: passed
          ? lintAdvisories.length > 0
            ? "Server verify passed with lint warnings (advisory)."
            : "Server verify passed."
          : advisoryPromoted
            ? "Designläge: typecheck-varning (advisory) — previewen renderar; server-verify promotade utan repair."
            : "Server verify failed.",
        meta: advisoryPromoted
          ? { ...qualityGateMeta, advisory: true, failedChecks: ["typecheck"] }
          : qualityGateMeta,
      },
    ]).catch((err) => {
      console.warn("[server-verify] Failed to persist quality gate summary log:", err);
    });

    // Advisory promotion succeeded (the no-op case returned above); done.
    if (advisoryPromoted) {
      return;
    }

    if (passed) {
      if (normalPromoted && lintAdvisories.length > 0) {
        try {
          emitBusEvent({
            t: "version.degraded",
            versionId,
            chatId,
            kind: "lint_advisory",
            message: "ReleaseGate godkändes med ESLint-varningar (advisory).",
            meta: {
              advisoryChecks: ["lint"],
              warningCount: lintAdvisories.reduce(
                (sum, result) => sum + (result.warningCount ?? 0),
                0,
              ),
            },
          });
        } catch {
          // Telemetry only — never invalidate a successful promotion.
        }
      }
      return;
    }

    const { failedOutputs, nonRepairableFailures } = partitionServerVerifyFailures(
      gateResult.results,
    );
    if (nonRepairableFailures.length > 0) {
      await createEngineVersionErrorLogs(
        nonRepairableFailures.map((result) => ({
          chatId,
          versionId,
          level: "error" as const,
          category: `quality-gate:${result.check}-tooling`,
          message: `${result.check} tooling/configuration failure; not repairable as user code.`,
          meta: {
            failureKind: result.failureKind ?? "tooling",
            output: result.output.slice(0, 12_000),
            serverOwned: true,
          },
        })),
      ).catch(() => null);
      if (failedOutputs.length === 0) {
        await failVersionVerification(
          versionId,
          `ReleaseGate tooling/configuration failure (${nonRepairableFailures
            .map((result) => result.check)
            .join(", ")}); automatic code repair was not started.`,
          runId,
        ).catch(() => null);
        return;
      }
    }
    logQualityGateFailuresBestEffort({ chatId, versionId, failedOutputs });

    if (diagnosticOnly) {
      // SM-024: verifier blockers still forbid promotion AND LLM repair
      // (regress-on-repair: LLM passes can worsen blocking findings). But the
      // VM gate may have independent, mechanically fixable code failures
      // (import-repair / autofix). Run that deterministic prepass, persist
      // improvements into files_json, then fail closed — never promote.
      let deterministicMeta: {
        attempted: boolean;
        contentChanged: boolean;
        persisted: boolean;
        importRepairFixCount: number;
        handledCodes: string[];
        skippedPersistReason?: string;
        error?: string;
      } = {
        attempted: false,
        contentChanged: false,
        persisted: false,
        importRepairFixCount: 0,
        handledCodes: [],
      };

      if (failedOutputs.length > 0) {
        try {
          const repairVerbatimRepo = await chatUsesVerbatimRepo(chatId);
          const exportableForRepair = await buildExportableProject(codeFiles, {
            verbatimRepo: repairVerbatimRepo,
          });
          const initialContent = serializeCodeProject(exportableForRepair);
          const prepass = await runDeterministicRepairPrepass({
            initialContent,
            failedOutputs,
            previewPolicy,
            chatId,
            verbatimRepo: repairVerbatimRepo,
          });
          deterministicMeta = {
            attempted: true,
            contentChanged: prepass.changed,
            persisted: false,
            importRepairFixCount: prepass.fixCount,
            handledCodes: prepass.handledCodes,
          };

          if (prepass.changed) {
            const rawRepairedFiles = parseCodeProject(prepass.content).files;
            const protectedPartition =
              partitionGeneratedFilesForProtectedPaths(rawRepairedFiles);
            const reinjection = reinjectProtectedPathsFromFallback({
              kept: protectedPartition.kept,
              droppedPaths: fullProjectProtectedDroppedPaths(
                rawRepairedFiles,
                protectedPartition.dropped,
              ),
              fallbackFiles: codeFiles,
            });
            const repairedFilesJson = JSON.stringify(reinjection.files);
            const persistBlock = missingProtectedPathsPersistBlock(reinjection.stillMissing, {
              verbatimRepo: repairVerbatimRepo,
            });
            if (persistBlock) {
              deterministicMeta.skippedPersistReason = "protected_paths_still_missing";
            } else if (repairedFilesJson !== baseFilesJson) {
              // Supersede guard (bugbot HIGH on this diff): the gate can run
              // for minutes after the initial latest-check at the top of the
              // run. Re-check before mutating so a follow-up version created
              // meanwhile never gets its predecessor's files rewritten under
              // it. `expectedFilesJson` below still guards the same-version
              // race (user edit advancing files_json).
              if (!(await isLatestVersionForChat(chatId, versionId))) {
                deterministicMeta.skippedPersistReason = "superseded_by_newer_version";
              } else {
                const persisted = await updateVersionFiles(versionId, repairedFilesJson, {
                  holderRunId: runId,
                  expectedFilesJson: baseFilesJson,
                }).catch((err) => {
                  console.warn(
                    "[server-verify] Failed to persist diagnostic deterministic repair:",
                    err,
                  );
                  return false;
                });
                deterministicMeta.persisted = persisted === true;
              }
            }
          }
        } catch (err) {
          // Fail-closed: keep today's surface-only path when mechanical repair throws.
          deterministicMeta = {
            ...deterministicMeta,
            attempted: true,
            error: err instanceof Error ? err.message : String(err),
          };
          console.warn(
            "[server-verify] Deterministic diagnostic repair failed; falling back to surface-only:",
            err,
          );
        }
      }

      const diagnosticMessage = !deterministicMeta.attempted
        ? "Server verify gate failed but auto-repair suppressed (verifier blockers already exist; surface findings for inspection only)."
        : deterministicMeta.error
          ? "Server verify gate failed; deterministic repair threw (LLM repair suppressed — verifier blockers). Surface findings only."
          : deterministicMeta.contentChanged
            ? deterministicMeta.persisted
              ? "Server verify gate failed; deterministic repair persisted improvements (LLM repair suppressed — verifier blockers forbid promotion)."
              : "Server verify gate failed; deterministic repair improved content but could not persist (LLM repair suppressed — verifier blockers)."
            : "Server verify gate failed; deterministic repair ran with no content change (LLM repair suppressed — verifier blockers).";

      await createEngineVersionErrorLogs([
        {
          chatId,
          versionId,
          level: "warning",
          category: "server-verify:diagnostic",
          message: diagnosticMessage,
          meta: {
            serverOwned: true,
            diagnosticOnly: true,
            failedChecks: failedOutputs.map((f) => f.check),
            deterministicRepair: deterministicMeta,
          },
        },
      ]).catch(() => null);
      // 2026-04-23 (showcase-bug rootfix, fas D2): terminal-state resolve.
      // See matching comment in the `passed` branch above. Here verifier-LLM
      // and server-verify both agree the version is broken, so resolve to
      // `failed` cleanly. `triggerBuildErrorRepair` can still flip this to
      // `repair_available` later when the VM emits a build-error SSE.
      // Honesty note (bugbot MEDIUM on this diff): the gate ran on the
      // PRE-repair content; after a persisted deterministic fix the recorded
      // check list may no longer describe the stored files_json. Re-running
      // the gate here is out of scope for the diagnostics lane (promotion is
      // forbidden by verifier blockers regardless), so the summary says which
      // content the findings refer to instead of implying they were re-checked.
      await failVersionVerification(
        versionId,
        `Verifier-LLM blockers + server-verify gate failed (${failedOutputs
          .map((f) => f.check)
          .join(", ")}).${
          deterministicMeta.persisted
            ? " Deterministic repair persisted improvements afterwards; the gate findings refer to the pre-repair content."
            : ""
        }`,
        runId,
      ).catch(() => null);
      return;
    }

    const repairOutcome = await tryServerRepairLoop({
      chatId,
      versionId,
      codeFiles,
      baseFilesJson,
      baseFilesRevision: actualFilesRevision,
      baseEditKind: snapshot.editKind,
      previewPolicy,
      failedOutputs,
      verifyLaneDurationMs: gateResult.verifyLaneDurationMs,
      firstFailureCheck: gateResult.firstFailureCheck,
      jobStartedAt: gateResult.jobStartedAt,
      jobFinishedAt: gateResult.jobFinishedAt,
      onRepairAvailable,
      runId,
      // #260 Codex P2 (forced build gate): a build-originated re-verify keeps
      // `build` in the post-repair gate even if this round only re-fails tsc.
      forceBuildGate: forceBuildCheck,
      // Bind this fire-and-forget loop to a wall-clock ceiling so it cannot keep
      // burning LLM passes minutes after the user left (the background lane
      // previously passed no deadline → capped only by pass count + per-pass
      // timeouts). Reuses the lease-holding-route budget as a generous bound.
      repairDeadlineEpochMs: resolveBackgroundRepairDeadlineEpochMs({
        nowMs: Date.now(),
        budgetMs: REPAIR_LOOP_BUDGET_MS,
      }),
      repairLedger,
      repairScopeId,
      contextRetryUsed,
      repairAuthority: params.repairAuthority,
      f3Readiness:
        previewPolicy === "fidelity3" && f3ReadinessContext
          ? {
              parentVersionId,
              orchestrationSnapshot: f3ReadinessContext.orchestrationSnapshot,
              projectId: f3ReadinessContext.projectId,
            }
          : null,
    });
    if (repairOutcome.stop) {
      outcome = { kind: "stop", ...repairOutcome.stop };
      return;
    }
    outcome = { kind: "stop", reason: "repair_settled", retryable: false };
    reverifyCurrent = repairOutcome.reverifyCurrent;
    reverifyFromContextCasMiss = repairOutcome.contextCasMiss === true;
    reverifyForceBuildCheck = repairOutcome.buildOriginated;
    if (repairOutcome.integrationMigrationHoldApplied) return;
  } catch (err) {
    if (err === REVERIFY_CURRENT_CONTEXT) {
      // Return supersession to the coordinator. No fail/green signal belongs
      // to the old context and this core never acquires a replacement lease.
    } else if (err instanceof QualityGateUnavailableError || err instanceof QualityGateNotConfiguredError) {
      outcome = { kind: "stop", reason: err instanceof QualityGateNotConfiguredError ? "quality_gate_disabled" : "quality_gate_unavailable",
        retryable: err instanceof QualityGateUnavailableError };
      await resetVersionVerificationToPending(versionId, undefined, runId).catch(() => null);
    } else {
      console.error("[server-verify] Error:", err);
      // #260 Codex P2 / Bugbot (no fail of B from a stale repair): staleBaseNoOp
      // lives inside tryServerRepairLoop and is lost when it throws, so the outer
      // catch must re-check here. If a concurrent user edit advanced files_json
      // past the snapshot this run was based on, do NOT finalize the newer edit B
      // as failed from the abandoned repair(A) — re-verify B instead (build kept in
      // the gate, conservatively, since the crash hid which checks were failing).
      let staleAfterError = false;
      if (baseFilesJsonForRecovery !== null) {
        const current = await getVersionFilesSnapshot(versionId).catch(() => null);
        if (current && current.filesJson !== baseFilesJsonForRecovery) {
          staleAfterError = true;
        }
      }
      if (staleAfterError) {
        reverifyCurrent = true;
        reverifyForceBuildCheck = true;
      } else {
        await failVersionVerification(
          versionId,
          "Server verification could not complete.",
          runId,
        ).catch(() => null);
      }
    }
  }
  };
  await execute();
  if (reverifyCurrent) return {
    kind: "superseded", cause: reverifyFromContextCasMiss ? "context" : "files",
    forceBuildCheck: reverifyForceBuildCheck || forceBuildCheck,
    contextRetryUsed: contextRetryUsed || reverifyFromContextCasMiss,
  };
  return outcome;
}

type GateResult = {
  passed: boolean;
  checks: QualityGateCheckResult[];
  verifyLaneDurationMs: number;
  firstFailureCheck: string | null;
  jobStartedAt: string | null;
  jobFinishedAt: string | null;
  visualQA?: VisualQAResult;
};

function buildQualityGateSummaryLog(params: {
  checkResults: QualityGateCheckResult[];
  verifyLaneDurationMs: number;
  firstFailureCheck: string | null;
  jobStartedAt: string | null;
  jobFinishedAt: string | null;
  visualQA?: VisualQAResult;
  /**
   * F2 render-first advisory: the VM gate did not pass but the only failure is
   * `typecheck` on a design-preview (F2) version. `next dev` renders JS despite
   * TS type errors, so the preview is usable — log a WARNING (not an error) and
   * let the version promote instead of failing + auto-repairing. F3 and any
   * build/lint failure never take this path.
   */
  advisory?: boolean;
}) {
  const {
    checkResults,
    verifyLaneDurationMs,
    firstFailureCheck,
    jobStartedAt,
    jobFinishedAt,
    visualQA,
    advisory = false,
  } = params;
  const passed = qualityGateAllPassed(checkResults);
  const hasAdvisory = advisory || checkResults.some((result) => result.advisory === true);
  const visualQAMeta =
    visualQA &&
    typeof visualQA.overallScore === "number" &&
    Array.isArray(visualQA.checks)
      ? compactVisualQAForQualityGateLog(visualQA)
      : undefined;

  const level: "info" | "warning" | "error" = passed
    ? hasAdvisory
      ? "warning"
      : "info"
    : advisory
      ? "warning"
      : "error";
  const message = passed
    ? hasAdvisory
      ? "Automatic quality gate passed with advisory findings."
      : "Automatic quality gate passed."
    : advisory
      ? "Designläge: typecheck-varning (advisory) — previewen renderar, versionen promotas."
      : "Automatic quality gate failed.";

  return {
    level,
    category: "preflight:quality-gate" as const,
    message,
    meta: buildServerVerifyQualityGateMeta({
      passed,
      advisory: hasAdvisory,
      advisoryChecks: advisory
        ? ["typecheck"]
        : Array.from(
            new Set(
              checkResults
                .filter((result) => result.advisory === true)
                .map((result) => result.check),
            ),
          ),
      results: checkResults,
      verifyLaneDurationMs,
      firstFailureCheck,
      jobStartedAt,
      jobFinishedAt,
      serverOwned: false,
      visualQA: visualQAMeta,
    }),
  };
}

function buildVerificationSummary(checkResults: QualityGateCheckResult[]): string {
  return describeQualityGateVerification(checkResults);
}

/** M#vlane2 promote-retry tuning: 1 initial attempt + up to 2 retries, short backoff. */
const PROMOTE_MAX_ATTEMPTS = 3;
const PROMOTE_RETRY_BACKOFF_MS = 120;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Whether a thrown promote-UPDATE error is a transient DB condition worth
 * retrying: a `statement_timeout` under row-lock contention (the prod incident
 * 2026-07-13 profile — two verify leases 12 s apart on the same version row),
 * a serialization/deadlock, or a dropped connection. A non-transient error
 * (constraint violation, etc.) is NOT retried.
 */
function isTransientPromoteError(err: unknown): boolean {
  const code =
    err && typeof err === "object" && typeof (err as { code?: unknown }).code === "string"
      ? (err as { code: string }).code
      : null;
  // Postgres SQLSTATEs: 57014 statement_timeout/query_canceled,
  // 40001 serialization_failure, 40P01 deadlock_detected, 08* connection exceptions.
  if (
    code &&
    (code === "57014" || code === "40001" || code === "40P01" || code.startsWith("08"))
  ) {
    return true;
  }
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return (
    msg.includes("statement timeout") ||
    msg.includes("statement_timeout") ||
    msg.includes("canceling statement") ||
    msg.includes("deadlock") ||
    msg.includes("could not serialize") ||
    msg.includes("connection terminated") ||
    msg.includes("connection reset") ||
    msg.includes("timeout")
  );
}

/**
 * M#vlane2 + BB#299: the promote-UPDATE occasionally died on a transient
 * `statement_timeout` (prod incident 2026-07-13), which left a passed gate
 * stuck at `verifying` and — ~13 min later — false-red by the readiness
 * watchdog. Retry the write a bounded number of times with a short backoff on
 * transient DB errors so a momentary lock/timeout no longer strands a clean
 * promotion. A lease-conditioned no-op (`null`) is NOT retried (another run
 * took over / guard refusal). A throw on the last attempt (or a non-transient
 * error) resolves to `null`, which the caller maps to the existing retryable
 * `promoteError` branch (never a false-red).
 */
async function promoteVersionWithRetry(
  versionId: string,
  summary: string,
  runId: string | undefined,
): Promise<Awaited<ReturnType<typeof promoteVersion>> | null> {
  for (let attempt = 1; attempt <= PROMOTE_MAX_ATTEMPTS; attempt++) {
    try {
      return await promoteVersion(versionId, summary, runId);
    } catch (err) {
      const transient = isTransientPromoteError(err);
      if (!transient || attempt === PROMOTE_MAX_ATTEMPTS) {
        console.warn(
          `[quality-gate] Promote failed (attempt ${attempt}/${PROMOTE_MAX_ATTEMPTS}, transient=${transient}):`,
          err,
        );
        return null;
      }
      await sleep(PROMOTE_RETRY_BACKOFF_MS * attempt);
    }
  }
  return null;
}



async function evaluateVersionGateSnapshot(params: {
  chatId: string; versionId: string; snapshot: VersionFilesSnapshot;
  forceBuildCheck?: boolean;
  beforeVerify?: () => Promise<void>;
}) {
  const previewPolicy = params.snapshot.lifecycleStage === "integrations" ? "fidelity3" : "fidelity2";
  const exportable = await buildExportableProject(params.snapshot.files, {
    verbatimRepo: await chatUsesVerbatimRepo(params.chatId),
  });
  await params.beforeVerify?.();
  const gateResult = await runQualityGateOnExportable({
    chatId: params.chatId, versionId: params.versionId, exportable,
    checks: resolvePostRepairGateChecks(params.forceBuildCheck === true, previewPolicy),
  });
  if (!gateResult) return null;
  const passed = qualityGateAllPassed(gateResult.results);
  const advisory = isTypecheckOnlyAdvisory({
    isDesignPreview: previewPolicy === "fidelity2", gatePassed: passed,
    buildOriginated: params.forceBuildCheck === true, results: gateResult.results,
  });
  const visualQA = maybeAnalyzeVisualQAForPassedExportable({ exportable, results: gateResult.results });
  return { exportable, gateResult, passed, advisory, visualQA };
}

const QUALITY_GATE_ERROR_LOG_LOCK_TIMEOUT_MS = 3_000;
export type VersionQualityGateResponse = { body: Record<string, unknown>; status: number };
function qualityGateResponse(body: Record<string, unknown>, options?: { status: number }): VersionQualityGateResponse {
  return { body, status: options?.status ?? 200 };
}

/** The HTTP adapter uses body/status; the chain uses the typed decision, never a passed boolean alone. */
export async function runVersionQualityGateUnderLease(
  params: Parameters<typeof settleVersionQualityGateUnderLease>[0],
): Promise<VersionQualityGateResponse & VersionVerificationOutcome> {
  const result = await settleVersionQualityGateUnderLease(params);
  const body = result.body;
  if (body.superseded === true) return { ...result, kind: "superseded", cause: "newer_version",
    forceBuildCheck: false, contextRetryUsed: false };
  if (body.promoted === true) return { ...result, kind: "continue", filesRevision: params.snapshot.filesRevision!,
    vmGatePassed: body.vmGatePassed === undefined ? body.passed === true : body.vmGatePassed === true,
    promoted: true, advisory: body.designAdvisory === true || body.qualityGateAdvisory === true };
  return { ...result, kind: "stop", reason: String(body.code ?? body.error ??
    (body.disabled ? "quality_gate_disabled" : body.promotionBlocked ? "promotion_blocked" :
      body.promoteError ? "promotion_deferred" : "quality_gate_failed")),
    retryable: body.retryable === true || result.status === 503 || body.promoteError === true,
    vmGatePassed: body.vmGatePassed === true || body.passed === true, promoted: false };
}

/** Deterministic QG only. The caller owns the lease, auth and usage context. */
async function settleVersionQualityGateUnderLease(params: {
  chatId: string; versionId: string; holderRunId: string;
  snapshot: VersionFilesSnapshot;
  gate?: "designPreview" | "integrationsBuild";
}): Promise<VersionQualityGateResponse> {
  const { chatId, versionId: internalVersionId, holderRunId: qgRunId, snapshot } = params;
  if (!qgRunId.trim() || !snapshot.filesRevision?.trim()) {
    return qualityGateResponse({ code: "snapshot_unavailable", retryable: true }, { status: 503 });
  }
  const integrationsBuildGate = snapshot.lifecycleStage === "integrations";
  if (params.gate === "integrationsBuild" && !integrationsBuildGate) {
    return qualityGateResponse({ error: "ReleaseGate requires an F3 integrations version.", code: "integrations_version_required" }, { status: 409 });
  }
  const effectiveGate = integrationsBuildGate ? "integrationsBuild" : "designPreview";
  const parentVersionId = snapshot.parentVersionId ?? null;
  const loaded = integrationsBuildGate ? await loadServerVerifyF3ReadinessContext(chatId) : null;
  if (loaded && "error" in loaded) return qualityGateResponse({ code: loaded.error, retryable: true }, { status: 503 });
  const readinessContext = loaded ?? { orchestrationSnapshot: null, projectId: null };
    let verifyLaneStarted = false;
    try {
      // Read the version files EXACTLY ONCE under the lease and feed the SAME
      // set to readiness/export/verify/promotion — no re-read that could observe
      // a different snapshot (TOCTOU + Codex P2 stale-snapshot fix).
      const codeFiles = snapshot.files;

      // Env kill-switch (SAJTMASKIN_DISABLE_QUALITY_GATE): skip the automatic F2
      // RenderGate verify lane entirely, WITHOUT touching version state (Codex
      // P1 on #573: a skipped gate must never read as verified). The version
      // stays exactly as it was — normally `pending`, which for an F2 design
      // row is the honest "design ready, never gate-verified" resting state
      // (`resolveEngineVersionVerificationSurfaceStatus` → `design_ready`, and
      // the F2 deploy gate only blocks `failed`). No `markVersionVerifying`
      // (so no ~5-7s "verifying" spinner), no promotion, no superseded
      // mutation. NEVER disables the explicit F3 integrations ReleaseGate —
      // integrations must still typecheck+build before deploy.
      if (!integrationsBuildGate && isQualityGateDisabledByEnv()) {
        // Mirror the normal path: a fileless/unreadable snapshot is still 404.
        if (!codeFiles || codeFiles.length === 0) {
          return qualityGateResponse({ error: "No files found for version" }, { status: 404 });
        }
        // Durable trace (the response's skipped/disabled fields are ephemeral):
        // one warning row so readiness/status consumers can see the gate was
        // switched off for this version instead of silently never running.
        if (dbConfigured) {
          await createEngineVersionErrorLogs([
            {
              chatId,
              versionId: internalVersionId,
              level: "warning",
              category: "quality-gate:disabled-skip",
              message:
                "Quality gate avstängd (SAJTMASKIN_DISABLE_QUALITY_GATE) — verify-lane hoppades över; versionen lämnas overifierad.",
              meta: { reason: "quality_gate_disabled_by_env", serverOwned: false },
            },
          ], { lockTimeoutMs: QUALITY_GATE_ERROR_LOG_LOCK_TIMEOUT_MS }).catch((err) => {
            warnLog("quality-gate", "Failed to persist disabled-skip log (non-fatal)", {
              error: err instanceof Error ? err.message : String(err),
            });
          });
        }
        return qualityGateResponse({
          passed: false,
          skipped: true,
          disabled: true,
          promoted: false,
          checks: [],
          reason:
            "Quality gate avstängd via SAJTMASKIN_DISABLE_QUALITY_GATE — versionen lämnas overifierad (ingen verify-körning, ingen promotion).",
        });
      }

      if (effectiveGate === "integrationsBuild") {
        const readiness = await checkTier3ReadinessForVersion(
          serverOwnedF3ReadinessParams({
            versionId: internalVersionId,
            chatId,
            parentVersionId,
            filesRevision: snapshot.filesRevision,
            preloadedFiles: codeFiles,
            orchestrationSnapshot: readinessContext.orchestrationSnapshot,
            projectId: readinessContext.projectId,
          }),
        );
        if (!readiness.ready && readiness.reason === "missing_env") {
          // R7: durable observation for /logg — best-effort, never blocks 412.
          // Prefer parent (design) version id; fall back to the F3 fork.
          const observationVersionId = parentVersionId ?? internalVersionId;
          logTier3MissingEnvBlockedDetached({
            chatId,
            versionId: observationVersionId,
            projectId: readinessContext.projectId,
            missingByIntegration: readiness.readiness.missingByIntegration,
            source: "quality-gate",
            f3VersionId: internalVersionId,
            lockTimeoutMs: QUALITY_GATE_ERROR_LOG_LOCK_TIMEOUT_MS,
          });
          return qualityGateResponse(
            {
              error: "tier3_env_not_ready",
              ready: false,
              parentVersionId,
              projectId: readinessContext.projectId,
              missingByIntegration: readiness.readiness.missingByIntegration,
            },
            { status: 412 },
          );
        }
        if (
          !readiness.ready &&
          (readiness.reason === "product_postcheck_blocked" ||
            readiness.reason === "product_postcheck_pending" ||
            readiness.reason === "product_postcheck_indeterminate" ||
            readiness.reason === "product_postcheck_superseded")
        ) {
          return qualityGateResponse(
            {
              error: readiness.reason,
              ready: false,
              parentVersionId,
              verdict: readiness.verdict,
              retryable: readiness.retryable === true,
            },
            { status: 409 },
          );
        }
        if (!readiness.ready && readiness.reason === "f3_parent_version_missing") {
          return qualityGateResponse(
            {
              error: "Integrationsversionen saknar sin designversion.",
              code: "f3_parent_version_missing",
              ready: false,
              parentVersionId,
              retryable: false,
            },
            { status: 409 },
          );
        }
        if (!readiness.ready && readiness.reason === "readiness_unavailable") {
          return qualityGateResponse(
            {
              error: "F3 readiness unavailable (database error). Try again shortly.",
              code: "readiness_unavailable",
              ready: false,
              parentVersionId,
              retryable: true,
            },
            { status: 503 },
          );
        }
        if (!readiness.ready) {
          return qualityGateResponse(
            {
              error: readiness.reason,
              ready: false,
              parentVersionId,
              retryable: readiness.retryable === true,
            },
            { status: 409 },
          );
        }
      }

      // Early supersede check (2026-07 preview-lifecycle simplification): if a
      // newer version already exists, the VM verify lane (~30-45 s install +
      // typecheck/build) would only produce a result the late supersede check
      // below discards anyway. Settle terminal-neutral `superseded` now —
      // before `markVersionVerifying` — so the abandoned row never spins and
      // the lane budget goes to the newer version instead. Mirrors
      // server-verify's pre-gate skip. Placed AFTER the F3 readiness block so
      // the explicit integrationsBuild flow keeps its 412/409 readiness
      // contract (env dialogs in the builder depend on those statuses).
      if (!(await isLatestVersionForChat(chatId, internalVersionId))) {
        // Only claim `superseded` when the lease-guarded write actually settled
        // the row. `markVersionSupersededByRepair` returns null when its
        // `versionWriteWhere(id, runId)` guard matches no row (the lease no
        // longer owns the version, or another writer already moved it). Returning
        // `superseded: true` regardless was a false-green: status polling/badges
        // would disagree with the gate card while `verification_state` stayed
        // non-terminal (Bugbot). If we did not settle it, fall through to the
        // normal lane so a real verify / the late supersede check terminalizes
        // the row instead of the API lying about a write it never made.
        const earlySettled = await markVersionSupersededByRepair(
          internalVersionId,
          null,
          qgRunId,
        ).catch((err) => {
          console.warn("[quality-gate] Failed to mark superseded version (early):", err);
          return null;
        });
        if (earlySettled) {
          await createEngineVersionErrorLogs([
            {
              chatId,
              versionId: internalVersionId,
              level: "warning",
              category: "quality-gate:superseded",
              message:
                "Quality gate skipped: a newer version already exists; version settled as superseded before the verify lane ran.",
              meta: { serverOwned: false, early: true },
            },
          ], { lockTimeoutMs: QUALITY_GATE_ERROR_LOG_LOCK_TIMEOUT_MS }).catch((err) => {
            console.warn("[quality-gate] Failed to persist early superseded log:", err);
          });
          return qualityGateResponse({
            passed: false,
            superseded: true,
            promoted: false,
            checks: [],
          });
        }
      }

      if (codeFiles && codeFiles.length > 0) {
        if (!isQualityGateConfigured()) {
          return qualityGateResponse(
            {
              error: "Quality gate not configured (missing preview-host verify lane).",
              code: "quality_gate_disabled",
              hint: QUALITY_GATE_SETUP_HINT,
            },
            { status: 501 },
          );
        }

        const evaluation = await evaluateVersionGateSnapshot({ chatId, versionId: internalVersionId, snapshot,
          beforeVerify: async () => {
            verifyLaneStarted = true;
            await markVersionVerifying(internalVersionId, undefined, qgRunId).catch((err) => {
              console.warn("[quality-gate] Failed to mark version verifying:", err);
            });
          },
        });
        if (!evaluation) {
          await resetVersionVerificationToPending(internalVersionId, undefined, qgRunId).catch(() => null);
          return qualityGateResponse({ error: "Quality gate not configured (missing preview-host verify lane).",
            code: "quality_gate_disabled", hint: QUALITY_GATE_SETUP_HINT }, { status: 501 });
        }
        const { results, verifyLaneDurationMs, firstFailureCheck, jobStartedAt, jobFinishedAt } = evaluation.gateResult;
        const visualQA = evaluation.visualQA;

        const gateResult: GateResult = {
          passed: qualityGateAllPassed(results),
          checks: results,
          verifyLaneDurationMs,
          firstFailureCheck,
          jobStartedAt,
          jobFinishedAt,
          visualQA,
        };
        const gateAdvisoryResults = results.filter((result) => result.advisory === true);
        const gateAdvisoryChecks = Array.from(
          new Set(gateAdvisoryResults.map((result) => result.check)),
        );
        const gateAdvisoryResponseFields =
          gateAdvisoryChecks.length > 0
            ? {
                qualityGateAdvisory: true as const,
                advisoryChecks: gateAdvisoryChecks,
              }
            : {};

        const verificationSummary = buildVerificationSummary(results);

        // F2 render-first (#330): a design-preview (F2) version whose ONLY gate
        // failure is `typecheck` is NOT failed/auto-repaired. `next dev` runs the
        // JS regardless of TS type errors, so the live preview renders — a type
        // error is advisory, not a blocker. The version is promoted (still
        // subject to the finalize promote-guard below) and a warning is surfaced.
        // False-green protection: only F2, only when EVERY failing check is
        // `typecheck` (any build/lint failure stays hard), and F3 (`integrations`)
        // is never advisory. Render-safety itself is enforced upstream in
        // finalize-preflight (buildPreviewHtml + home-route gate), so a version
        // that cannot render never reaches this promote path.
        const f2TypecheckAdvisory = evaluation.advisory;
        // Canonical client signal: `checks[]` is what the Agentlogg row
        // renders (`advisory` → "Varning"). `designAdvisory` on the envelope
        // is not enough — without this stamp a failed typecheck still reads
        // "Underkänd" even though the gate promoted with warnings.
        if (f2TypecheckAdvisory) {
          for (const result of results) {
            if (result.check === "typecheck") {
              result.advisory = true;
            }
          }
        }
        const advisoryCheckNames = f2TypecheckAdvisory
          ? Array.from(new Set(results.filter((r) => !r.passed).map((r) => r.check)))
          : [];
        // Carried into the retryable (non-promoted) response branches too, so a
        // transient promote failure on an advisory version does not make the
        // client treat the typecheck-only failure as hard and auto-repair it.
        const advisoryResponseFields = f2TypecheckAdvisory
          ? { designAdvisory: true as const, advisoryChecks: advisoryCheckNames }
          : {};
        // Check superseded BEFORE persisting the regular logs so we don't
        // pile error rows on a version that no longer represents the
        // chat's head; the superseded path persists its own scoped log.
        const stillLatest = await isLatestVersionForChat(chatId, internalVersionId);
        if (!stillLatest) {
          await markVersionSupersededByRepair(internalVersionId, null, qgRunId).catch((err) => {
            console.warn("[quality-gate] Failed to mark superseded version:", err);
          });
          await createEngineVersionErrorLogs([
            {
              chatId,
              versionId: internalVersionId,
              level: "warning",
              category: "quality-gate:superseded",
              message: "Quality gate finished after a newer version was created; skipping state mutation.",
              meta: {
                verificationSummary,
                serverOwned: false,
              },
            },
          ], { lockTimeoutMs: QUALITY_GATE_ERROR_LOG_LOCK_TIMEOUT_MS }).catch((err) => {
            console.warn("[quality-gate] Failed to persist superseded log:", err);
          });
          return qualityGateResponse({
            ...gateResult,
            superseded: true,
            promoted: false,
          });
        }

        const logs = [
          {
            chatId,
            versionId: internalVersionId,
            ...buildQualityGateSummaryLog({
              checkResults: results,
              verifyLaneDurationMs,
              firstFailureCheck,
              jobStartedAt,
              jobFinishedAt,
              visualQA,
              advisory: f2TypecheckAdvisory,
            }),
          },
          ...results
            .filter((r) => !r.passed || r.advisory === true)
            .map((r) => {
              // In the F2 advisory case the typecheck failure is non-blocking:
              // log it as a warning under a distinct category so it stays visible
              // in diagnostics without reading as a hard "failed" verdict.
              const advisoryEntry =
                (f2TypecheckAdvisory && r.check === "typecheck") || r.advisory === true;
              return {
                chatId,
                versionId: internalVersionId,
                level: advisoryEntry ? ("warning" as const) : ("error" as const),
                category: advisoryEntry
                  ? `quality-gate:${r.check}-advisory`
                  : `quality-gate:${r.check}`,
                message: advisoryEntry
                  ? `${r.check} advisory (exit ${r.exitCode}) — ej blockerande`
                  : `${r.check} failed (exit ${r.exitCode})`,
                meta: {
                  stage: r.check,
                  command: QUALITY_GATE_COMMANDS[r.check as keyof typeof QUALITY_GATE_COMMANDS] ?? null,
                  output: r.output.slice(0, 12_000),
                  outputLength: r.output.length,
                  exitCode: r.exitCode,
                  durationMs: r.durationMs ?? null,
                  advisory: advisoryEntry,
                  serverOwned: false,
                },
              };
            }),
        ];
        let promotionBlocked = false;
        let promoteError = false;
        let promoteGuardUnavailable = false;
        let integrationMigrationRequired = false;
        let promotionSucceeded = false;
        // Promote when the gate passed OR when it is an F2 typecheck-only
        // advisory (render-first). Both still pay the finalize promote-guard
        // below, so a verifier-blocked version is never advisory-promoted.
        const promoteSummary = f2TypecheckAdvisory
          ? "Designläge: previewen renderar. Typecheck-varningar kvarstår (advisory, ej blockerande)."
          : gateAdvisoryChecks.length > 0
            ? `ReleaseGate passed with advisory findings: ${gateAdvisoryChecks.join(", ")}.`
          : verificationSummary;
        if (gateResult.passed || f2TypecheckAdvisory) {
          // Check the false-green guard *explicitly* before promoting so we can
          // tell three cases apart: (1) an explicit verifier block, (2) a guard
          // that could not READ the finalize signal (DB error), and (3) a clean
          // allow. `onReadError: "indeterminate"` fails CLOSED on a read error
          // (B08): the historic fail-open here could promote a `verifier_failed`
          // row whenever the telemetry read threw. The `.catch` is defensive for
          // any unexpected throw and also fails closed (retryable).
          const readPromoteGuard = () =>
            assertPromoteAllowed(internalVersionId, undefined, {
              onReadError: "indeterminate",
            }).catch((err) => {
              console.warn(
                "[quality-gate] Promote guard threw unexpectedly; failing closed (retryable):",
                err,
              );
              return {
                allowed: false as const,
                indeterminate: true as const,
                reason: "promote_guard_threw",
              };
            });

          let guard = await readPromoteGuard();

          // Approach B (prod 2026-08-05, chats 4cc467d2 / 41be90f2): when the
          // content-revision gate reports `staleRevision`, the VM checks above
          // already assessed the CURRENT fileset under lease. Stamp a fresh
          // `preflight_passed` for that revision and re-check the guard exactly
          // once — do NOT move an old verdict's revision forward (that would
          // reintroduce false-green), and do NOT treat a matching
          // `verifier_failed` as stale (explicit block path below).
          //
          // The superseded verdict must ALSO not have been blocking. The guard
          // classifies a revision mismatch BEFORE it looks at whether the verdict
          // blocks (`promote-guard.ts`), so `staleRevision` alone also covers
          // "the finalize verifier REJECTED revision A, then the post-check lane
          // mutated the files to B". Re-assessing there would stamp
          // `preflight_passed` over a rejection on the strength of the VM lane
          // alone — exactly the false-green this branch's own B08 comment
          // forbids, since install/typecheck/build is not a substitute for the
          // verifier pass. A blocking stale verdict therefore stays deferred and
          // retryable: the next finalize/verify run produces a verdict that
          // actually applies to the new content.
          if (
            !guard.allowed &&
            "indeterminate" in guard &&
            guard.indeterminate === true &&
            "staleRevision" in guard &&
            guard.staleRevision === true &&
            guard.staleSignalBlocking !== true
          ) {
            const stamped = await recordQualityGatePassedForCurrentContent(
              internalVersionId,
            );
            if (stamped) {
              console.info(
                "[quality-gate] Stale promote-guard revision: stamped fresh verdict for current content and re-checking once",
              );
              guard = await readPromoteGuard();
            }
          }

          if (guard.allowed) {
            // M#vlane2 + BB#299: bounded retry on a transient promote timeout so
            // a momentary row-lock/statement_timeout no longer strands a passed
            // gate at "verifying" (which the watchdog later false-reds).
            const promoted = await promoteVersionWithRetry(
              internalVersionId,
              promoteSummary,
              qgRunId,
            );
            // The guard already allowed promotion, so a null here is a transient
            // failure (DB error, or a race that re-flagged the signal between the
            // two reads) — not a verifier block. Leave the row at "verifying" and
            // surface a soft error so the client can retry instead of going red.
            if (promoted === "integration_migration_required") {
              integrationMigrationRequired = true;
            } else if (!promoted) {
              promoteError = true;
            } else {
              promotionSucceeded = true;
            }
          } else if ("indeterminate" in guard && guard.indeterminate === true) {
            // Guard could not read the finalize signal, so we cannot prove this
            // row is clean. Fail CLOSED but RETRYABLE: do NOT promote, and do NOT
            // mark the version `failed` (a transient DB blip must not false-red a
            // clean version). Leave it at "verifying" and surface a soft error so
            // the client retries — mirrors the transient `promoteError` path.
            // Also covers a staleRevision reassess that still could not produce
            // an applicable verdict (stamp failed / race).
            promoteGuardUnavailable = true;
            // Do NOT persist the raw guard reason into the error log: on a DB/
            // telemetry read error `assertPromoteAllowed` embeds the underlying
            // exception message in `guard.reason`, and this `meta` is rendered
            // verbatim to the chat owner in VersionDiagnosticsDialog. Persist a
            // stable code instead and keep the raw detail in server logs only.
            console.warn(
              "[quality-gate] Promote guard unavailable (raw reason, server-only):",
              guard.reason,
            );
            await createEngineVersionErrorLogs([
              {
                chatId,
                versionId: internalVersionId,
                level: "warning",
                category: "quality-gate:promote-guard-unavailable",
                message:
                  "Build checks passed but the promotion guard could not verify the finalize signal; promotion deferred (retryable).",
                meta: {
                  reason: "promote_guard_signal_unavailable",
                  serverOwned: false,
                },
              },
            ], { lockTimeoutMs: QUALITY_GATE_ERROR_LOG_LOCK_TIMEOUT_MS }).catch((err) => {
              console.warn(
                "[quality-gate] Failed to persist promote-guard-unavailable log:",
                err,
              );
            });
          } else {
            promotionBlocked = true;
            await failVersionVerification(
              internalVersionId,
              // Advisory case: don't claim "build checks passed" — typecheck failed
              // (advisory), and the finalize verifier is what blocked promotion.
              f2TypecheckAdvisory
                ? "Typecheck advisory noted, but the finalize verifier flagged blocking findings; promotion was blocked."
                : "Build checks passed but the finalize verifier flagged blocking findings; promotion was blocked.",
              qgRunId,
            ).catch((err) => {
              console.warn(
                "[quality-gate] Failed to mark version failed after promote guard block:",
                err,
              );
            });
          }
        } else {
          await failVersionVerification(internalVersionId, verificationSummary, qgRunId).catch((err) => {
            console.warn("[quality-gate] Failed to mark version failed:", err);
          });
        }

        if (integrationMigrationRequired) {
          if (dbConfigured) {
            await createEngineVersionErrorLogs(
              [
                {
                  chatId,
                  versionId: internalVersionId,
                  level: "warning",
                  category: "quality-gate:integration-migration-required",
                  message:
                    "Build checks passed, but an integration migration requires explicit review before promotion.",
                  meta: {
                    code: "integration_migration_required",
                    retryable: false,
                    serverOwned: false,
                  },
                },
              ],
              { lockTimeoutMs: QUALITY_GATE_ERROR_LOG_LOCK_TIMEOUT_MS },
            ).catch((err) => {
              console.warn("[quality-gate] Failed to persist integration hold log:", err);
            });
          }
          return qualityGateResponse(
            {
              error:
                "Versionen innehåller ett providerbyte som måste granskas innan den kan markeras klar.",
              code: "integration_migration_required",
              retryable: false,
              passed: false,
              vmGatePassed: gateResult.passed,
              promoted: false,
            },
            { status: 409 },
          );
        }

        if (logs.length > 0 && dbConfigured) {
          await createEngineVersionErrorLogs(logs, {
            lockTimeoutMs: QUALITY_GATE_ERROR_LOG_LOCK_TIMEOUT_MS,
          }).catch((err) => {
            console.warn("[quality-gate] Failed to persist error logs:", err);
          });
        }

        // A guard-blocked promotion must NOT read as green. `vmGatePassed`
        // preserves the underlying VM-check status (tsc/eslint/build) for
        // diagnostics, while `passed:false` + `promotionBlocked` tell every
        // caller (incl. ones that only inspect `passed`) the truth.
        if (promotionBlocked) {
          return qualityGateResponse({
            ...gateResult,
            passed: false,
            // Reflect the true VM-gate status: false in the advisory case where
            // typecheck failed but the finalize verifier then blocked promotion.
            vmGatePassed: gateResult.passed,
            promotionBlocked: true,
            promotionBlockedReason: "finalize_quality_gate_failed",
            promoted: false,
          });
        }
        // Promote guard could not verify the finalize signal (DB/guard error):
        // not green, not a verifier block, retryable. Reuse `promoteError:true`
        // so the existing client retry UX applies with no client change, and add
        // `promoteGuardUnavailable:true` for observability.
        if (promoteGuardUnavailable) {
          return qualityGateResponse({
            ...gateResult,
            passed: false,
            vmGatePassed: gateResult.passed,
            promoteError: true,
            promoteGuardUnavailable: true,
            promoted: false,
            ...advisoryResponseFields,
          });
        }
        // Transient promote failure: not green, but not a verifier block either.
        if (promoteError) {
          return qualityGateResponse({
            ...gateResult,
            passed: false,
            vmGatePassed: gateResult.passed,
            promoteError: true,
            promoted: false,
            ...advisoryResponseFields,
            ...gateAdvisoryResponseFields,
          });
        }
        if (promotionSucceeded && gateAdvisoryChecks.includes("lint")) {
          try {
            emitBusEvent({
              t: "version.degraded",
              versionId: internalVersionId,
              chatId,
              kind: "lint_advisory",
              message: "ReleaseGate godkändes med ESLint-varningar (advisory).",
              meta: {
                advisoryChecks: gateAdvisoryChecks,
                warningCount: gateAdvisoryResults.reduce(
                  (sum, result) => sum + (result.warningCount ?? 0),
                  0,
                ),
              },
            });
          } catch {
            // Telemetry only — never block promotion on a bus failure.
          }
        }
        // F2 render-first advisory promotion: report `passed:true` so the client
        // does not auto-repair, but keep the honest signal — `vmGatePassed:false`
        // (the VM typecheck did not pass) plus `designAdvisory` + `advisoryChecks`
        // so no consumer reads this as a solid-green build.
        if (f2TypecheckAdvisory) {
          // Surface the advisory on the version-status projection (Codex #345
          // P1): without a degradation the status token reads solid green even
          // though the VM typecheck failed. `version.degraded` maps a `done`
          // phase to `degraded` ("klar med varningar") in
          // `mapVersionStatusToDisplay`; the DURABLE record is the promoted
          // row's `verification_summary` (advisory text) + the warning row in
          // `engine_version_error_logs` persisted above.
          try {
            emitBusEvent({
              t: "version.degraded",
              versionId: internalVersionId,
              chatId,
              kind: "typecheck_advisory",
              message:
                "Designläge: versionen promotades med typecheck-varningar (advisory).",
              meta: { advisoryChecks: advisoryCheckNames },
            });
          } catch {
            // Telemetry only — never block the response on a bus failure.
          }
          return qualityGateResponse({
            ...gateResult,
            passed: true,
            vmGatePassed: false,
            designAdvisory: true,
            advisoryChecks: advisoryCheckNames,
            promoted: promotionSucceeded,
            ...gateAdvisoryResponseFields,
          });
        }
        return qualityGateResponse({
          ...gateResult,
          promoted: promotionSucceeded,
          ...gateAdvisoryResponseFields,
        });
      }

      return qualityGateResponse({ error: "No files found for version" }, { status: 404 });
    } catch (err) {
      // Unreachable verify lane (network / timeout / HTTP 4xx-5xx / disk-full):
      // the gate never evaluated the code, so do NOT mark the version `failed`
      // (a false-RED verdict) and do NOT hard-500. Surface a retryable 503 the
      // client can retry; the version stays unpromoted (never false-green) and
      // the `finally` below still releases the lease. A real check failure does
      // not reach here — it returns `passed:false` above.
      if (err instanceof QualityGateUnavailableError || err instanceof QualityGateNotConfiguredError) {
        // Revert the optimistic `markVersionVerifying` above (Codex P2 on #296):
        // leaving the row `verifying` with no running job would let the
        // readiness stale-verification watchdog later mark it `failed` (a
        // delayed false-RED). Reset to `pending` so the version honestly reads
        // "awaiting verification, retryable" instead.
        await resetVersionVerificationToPending(internalVersionId, undefined, qgRunId).catch(
          (resetErr) => {
            console.warn(
              "[quality-gate] Failed to reset version to pending after unavailable verify lane:",
              resetErr,
            );
          },
        );
        return qualityGateResponse(
          {
            error: err.message,
            code: err instanceof QualityGateNotConfiguredError ? "quality_gate_disabled" : "quality_gate_unavailable",
            retryable: err instanceof QualityGateUnavailableError ? err.retryable : false,
            hint: QUALITY_GATE_SETUP_HINT,
          },
          { status: err instanceof QualityGateNotConfiguredError ? 501 : 503 },
        );
      }
      if (!verifyLaneStarted) {
        // The throw happened during file read / readiness / export — the
        // verify lane never ran, so the version state must stay untouched
        // (no false-RED). Retryable 503, mirroring the lease/verify-lane
        // unavailability contract.
        console.error("[quality-gate] Pre-verify step threw; version state untouched:", err);
        return qualityGateResponse(
          {
            error: "Quality gate pre-checks failed before verification started. Try again shortly.",
            code: "quality_gate_unavailable",
            retryable: true,
          },
          { status: 503 },
        );
      }
      await failVersionVerification(
        internalVersionId,
        "Automatic verification could not complete.",
        qgRunId,
      ).catch((updateErr) => {
        console.warn("[quality-gate] Failed to mark version failed after error:", updateErr);
      });
      if (err instanceof QualityGateNotConfiguredError) {
        return qualityGateResponse(
          {
            error: err.message,
            code: "quality_gate_disabled",
            hint: QUALITY_GATE_SETUP_HINT,
          },
          { status: 501 },
        );
      }
      throw err;
    }

}
