import { NextResponse, after } from "next/server";
import { z } from "zod";
import { withRateLimit } from "@/lib/rateLimit";
import { getEngineVersionForChatByIdForRequest } from "@/lib/tenant";
import { createEngineVersionErrorLogs } from "@/lib/db/services/version-errors";
import { dbConfigured } from "@/lib/db/client";
import { getVersionFilesSnapshot } from "@/lib/gen/version-manager";
import {
  markVersionRepairing,
  failVersionVerification,
  failVersionVerificationIfUnleased,
  saveRepairedFiles,
  getChat,
  acquireVersionLease,
  releaseVersionLease,
  renewVersionLease,
} from "@/lib/db/chat-repository-pg";
import { buildExportableProject } from "@/lib/gen/export/build-exportable-project";
import {
  maybeAnalyzeVisualQAForPassedExportable,
  shouldPromoteAfterRepair,
} from "@/lib/gen/verify/preview-quality-gate";
import { resolvePostRepairGateChecks } from "@/lib/gen/verify/quality-gate-checks";
import { parseCodeProject } from "@/lib/gen/parser";
import type { CodeFile } from "@/lib/gen/parser";
import { readRecurringPatternsForChat } from "@/lib/logging/recurring-patterns-reader";
import { devLogAppend } from "@/lib/logging/devLog";
import { ownModelIdToCanonicalModelId } from "@/lib/models/catalog";
import { resolvePhaseModel, resolvePhaseThinking } from "@/lib/models/phase-routing";
import {
  LLM_FIXER_RETRY_TIMEOUT_MS,
  LLM_FIXER_TIMEOUT_MS,
  MANUAL_REPAIR_ROUTE_MAX_LLM_PASSES,
  REPAIR_LOOP_BUDGET_MS,
} from "@/lib/gen/defaults";
import {
  partitionGeneratedFilesForProtectedPaths,
  reinjectProtectedPathsFromFallback,
} from "@/lib/gen/scaffolds/protected-paths";
import {
  buildGroupedRepairErrorContext,
  buildRepairErrorContextLines,
  runRepairLoop,
} from "@/lib/gen/verify/repair-loop";
import {
  buildServerRepairOutcomeMeta,
  buildServerVerifyQualityGateMeta,
  buildServerVerifyRepairContextLines,
  compactVisualQAForQualityGateLog,
} from "@/lib/gen/verify/server-verify-log-meta";
import { triggerServerVerification } from "@/lib/gen/verify/server-verify";

export const runtime = "nodejs";
export const maxDuration = 420;

const qualityGateFailureSchema = z.object({
  check: z.enum(["typecheck", "build", "lint"]),
  exitCode: z.number(),
  output: z.string(),
  errorCount: z.number().optional(),
  durationMs: z.number().nullable().optional(),
});

const repairContextSchema = z.object({
  qualityGate: z.array(qualityGateFailureSchema).optional(),
  qualityGateMeta: z
    .object({
      verifyLaneDurationMs: z.number().nullable().optional(),
      firstFailureCheck: z.string().nullable().optional(),
      jobStartedAt: z.string().nullable().optional(),
      jobFinishedAt: z.string().nullable().optional(),
    })
    .optional(),
  visualQA: z
    .array(z.object({ check: z.string(), score: z.number(), detail: z.string() }))
    .optional(),
  previousVersionErrors: z.array(z.string()).optional(),
  currentVersionErrors: z.array(z.string()).optional(),
  scaffoldRetry: z
    .object({
      labels: z.array(z.string()).optional(),
      currentScaffoldId: z.string().optional(),
      currentScaffoldLabel: z.string().optional(),
      suggestedScaffoldId: z.string().optional(),
      suggestedScaffoldLabel: z.string().optional(),
      reason: z.string(),
    })
    .nullable()
    .optional(),
});

const requestSchema = z.object({
  versionId: z.string().min(1),
  repairContext: repairContextSchema,
});

function filesToCodeProject(files: CodeFile[]): string {
  return files
    .map((f) => {
      const lang = f.language || "tsx";
      return `\`\`\`${lang} file="${f.path}"\n${f.content}\n\`\`\``;
    })
    .join("\n\n");
}

function codeProjectToFiles(content: string): CodeFile[] {
  return parseCodeProject(content).files;
}

function normalizeRepairContextLines(lines: string[] | undefined, label: string): string[] {
  if (!Array.isArray(lines) || lines.length === 0) return [];
  return lines
    .map((line) => (typeof line === "string" ? line.trim() : ""))
    .filter(Boolean)
    .slice(0, 12)
    .map((line) => `[${label}] ${line}`);
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ chatId: string }> },
) {
  return withRateLimit(req, "engine:repair", () => handlePOST(req, ctx));
}

async function handlePOST(
  req: Request,
  ctx: { params: Promise<{ chatId: string }> },
) {
  // #284 follow-up (wall-clock graceful stop): bound the repair loop to this
  // route's static maxDuration, measured from request entry, so a slow multi-
  // pass repair stops and releases its lease before the platform hard-kills the
  // route mid-pass / mid-DB-write.
  const repairDeadlineEpochMs = Date.now() + REPAIR_LOOP_BUDGET_MS;
  let internalVersionId: string | null = null;
  let resolvedChatId: string | null = null;
  // #260 Codex P2 / Bugbot (no fail of B from a stale repair on crash): the exact
  // files_json this run is based on, hoisted so the catch can re-check staleness
  // even when the throw preceded the promotion/no-context/post-loop recheck.
  let baseFilesJsonForRecovery: string | null = null;
  let leaseRunId: string | undefined;
  let ownershipLost = false;
  // #260 Codex P2 (repair-vs-edit finalize): set when saveRepairedFiles no-ops
  // because a concurrent user edit advanced files_json past the repaired-from
  // snapshot. Used to skip failing the (newer) version below.
  let staleBaseNoOp = false;
  // #260 Codex P2 (route re-verify build-gate): hoisted to the finally scope so
  // the after() re-verify of the user's current files (B) keeps `build` in its
  // gate when the abandoned manual repair was build/preview-start originated.
  // Set once `repairContext` is known below.
  let reverifyForceBuildCheck = false;
  // Fail a version after an unsuccessful repair, recovering from lease loss.
  // The lease-conditioned write no-ops if this run lost ownership (expired lease
  // or a takeover), which would otherwise strand the row in `repairing` — the
  // readiness watchdog covers that too, but recover inline so the HTTP response
  // is accurate. Returns true when THIS run still owned the write; false when
  // ownership was lost (then only the unleased watchdog may finalize it, and a
  // genuine takeover keeps its own state).
  const failAfterRepair = async (versionId: string, summary: string): Promise<boolean> => {
    const owned = await failVersionVerification(versionId, summary, leaseRunId).catch((err) => {
      console.warn("[repair] Failed to mark version failed after repair:", err);
      return null;
    });
    if (owned) return true;
    await failVersionVerificationIfUnleased(versionId, summary).catch((err) => {
      console.warn("[repair] Unleased fail fallback errored:", err);
    });
    return false;
  };
  try {
    const { chatId } = await ctx.params;
    resolvedChatId = chatId;
    const body = await req.json().catch(() => ({}));
    const validation = requestSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: "Validation failed", details: validation.error.issues },
        { status: 400 },
      );
    }

    const { versionId, repairContext } = validation.data;

    // #260 Codex P2 (route re-verify build-gate): compute the build-origin signal
    // once here, at a scope visible to the finally-block after() re-verify. A
    // build/preview-start repair must keep `build` both in its own post-repair
    // gate AND in the re-verify of the user's current files (B) — degrading to
    // the typecheck-only lane would false-green a still-broken build.
    reverifyForceBuildCheck =
      repairContext.qualityGateMeta?.firstFailureCheck === "build" ||
      (repairContext.qualityGate?.some((failure) => failure.check === "build") ?? false);

    const scopedVersion = await getEngineVersionForChatByIdForRequest(
      req,
      chatId,
      versionId,
    );
    if (!scopedVersion) {
      return NextResponse.json(
        { error: "Version not found for chat" },
        { status: 404 },
      );
    }

    internalVersionId = scopedVersion.version.id;

    if (dbConfigured) {
      // Distributed lease (Plan C / P1 + Codex P2): acquire the per-version
      // lease BEFORE reading the version files, so the repair always operates on
      // the snapshot the lease protects — never a stale pre-lease read that a
      // concurrent job could overwrite. 409 if another job owns it. Fail-safe: a
      // DB error/missing table degrades to the legacy unlocked path.
      try {
        const lease = await acquireVersionLease(internalVersionId, "manual_repair");
        if (!lease) {
          return NextResponse.json(
            {
              error: "Version is busy (another verify/repair job holds the lock). Try again shortly.",
              code: "version_busy",
            },
            { status: 409 },
          );
        }
        leaseRunId = lease.runId;
      } catch (err) {
        console.warn("[repair] Lease acquire failed; proceeding without distributed lock:", err);
        leaseRunId = undefined;
      }
    }

    const snapshot = await getVersionFilesSnapshot(internalVersionId);
    if (!snapshot || snapshot.files.length === 0) {
      return NextResponse.json(
        { error: "No files found for version" },
        { status: 404 },
      );
    }
    const codeFiles = snapshot.files;
    // #260 / P2 #5: the exact files_json this repair is based on. saveRepairedFiles
    // binds its write to it so a concurrent user edit is never clobbered.
    const baseFilesJson = snapshot.filesJson;
    baseFilesJsonForRecovery = baseFilesJson;

    if (dbConfigured) {
      await markVersionRepairing(internalVersionId, undefined, leaseRunId).catch((err) => {
        console.warn("[repair] Failed to mark version repairing:", err);
      });
    }

    const exportable = await buildExportableProject(codeFiles);
    const initialContent = filesToCodeProject(exportable);
    const gateFailures = repairContext.qualityGate ?? [];
    const currentVersionErrors = normalizeRepairContextLines(
      repairContext.currentVersionErrors,
      "persisted-current",
    );
    const previousVersionErrors = normalizeRepairContextLines(
      repairContext.previousVersionErrors,
      "persisted-previous",
    );
    const visualQaLines = Array.isArray(repairContext.visualQA)
      ? repairContext.visualQA
          .slice(0, 6)
          .map((entry) => `[visual-qa] ${entry.check} (${entry.score}/100): ${entry.detail}`)
      : [];
    const hadQualityGateFailures = gateFailures.length > 0;
    const currentVersionId = internalVersionId ?? scopedVersion.version.id;

    async function promoteIfPostRepairGatePasses(params: {
      projectContent: string;
      method: "deterministic" | "llm";
      /**
       * Absolute deadline (ms) from the repair loop's budget-aware final gate by
       * which the post-repair preview-host verify must have aborted. Bounds the
       * verify so a late one aborts before this route's `maxDuration` and the
       * lease is always released (Codex P1 #286). Undefined for the early
       * deterministic gate.
       */
      verifyDeadlineEpochMs?: number;
    }): Promise<{ ok: boolean; newVersionId: string | null }> {
      const { projectContent, method, verifyDeadlineEpochMs } = params;
      const promoteReason =
        method === "deterministic"
          ? "Server repair passed quality gate (deterministic). Awaiting acceptance."
          : "Server repair passed quality gate (LLM). Awaiting acceptance.";
      const rawRepairedFiles = codeProjectToFiles(projectContent);
      // Block the manual-repair bypass of SCAFFOLD_PROTECTED_PATHS:
      // mirrors the server-verify guard. `codeFiles` here is the
      // pre-repair persisted version fetched at the top of handlePOST,
      // so it carries the canonical scaffold/previous content for any
      // protected path the LLM regenerated.
      const protectedPartition =
        partitionGeneratedFilesForProtectedPaths(rawRepairedFiles);
      const reinjection = reinjectProtectedPathsFromFallback({
        kept: protectedPartition.kept,
        droppedPaths: protectedPartition.dropped.map((f) => f.path),
        // codeFiles is narrowed by the early-return null check at the top
        // of handlePOST, but TypeScript loses that narrowing across this
        // async closure boundary; cast back to the verified shape.
        fallbackFiles: codeFiles as CodeFile[],
      });
      const repairedFiles = reinjection.files;
      if (protectedPartition.dropped.length > 0) {
        const droppedPaths = protectedPartition.dropped.map((f) => f.path);
        console.warn(
          "[repair] Scaffold-protected paths emitted by repair LLM — dropped from saveRepairedFiles input",
          {
            chatId,
            versionId: currentVersionId,
            droppedPaths,
            reinjected: reinjection.reinjected,
            stillMissing: reinjection.stillMissing,
            branch: "manual-repair",
            method,
          },
        );
        devLogAppend("in-progress", {
          type: "scaffold-protected-overwrite-blocked",
          chatId,
          versionId: currentVersionId,
          branch: "manual-repair",
          method,
          droppedPaths,
          reinjected: reinjection.reinjected,
          stillMissing: reinjection.stillMissing,
        });
      }
      // Codex P2 (renew before the post-repair gate): shouldPromoteAfterRepair
      // runs a preview-host verify that can take up to ~390s (verify timeout,
      // kept 30s under the route budget). Renew here so a slow gate cannot
      // expire the lease before the renew-before-save below.
      if (leaseRunId) await renewVersionLease(currentVersionId, leaseRunId).catch(() => {});
      const exportable = await buildExportableProject(repairedFiles);
      // #260 Codex P2 (build-origin false-green): if the failure that triggered
      // this manual repair was a build/preview-start error, the post-repair gate
      // must keep `build` — degrading to typecheck-only would false-green a
      // still-broken build into repair_available. Reuses the hoisted
      // `reverifyForceBuildCheck` (same build-origin signal) so the post-repair
      // gate and the finally after() re-verify stay in lockstep.
      const decision = await shouldPromoteAfterRepair({
        chatId,
        versionId: currentVersionId,
        exportable,
        hadQualityGateFailures,
        checks: resolvePostRepairGateChecks(reverifyForceBuildCheck),
        verifyDeadlineEpochMs,
      });
      const visualQA = maybeAnalyzeVisualQAForPassedExportable({
        exportable,
        results: decision.results,
        onError: (vqaErr) => {
          console.warn("[repair] Post-repair visual QA error (non-fatal):", vqaErr);
        },
      });
      const visualQAMeta = visualQA
        ? compactVisualQAForQualityGateLog(visualQA)
        : undefined;
      let promoted = false;
      let newVersionId: string | null = null;
      if (decision.promote && dbConfigured) {
        const filesJson = JSON.stringify(repairedFiles);
        // Renew right before the write: a long repair loop may have run past
        // the TTL. Renew re-extends while we still own it; if another run took
        // over, the lease-conditioned write in saveRepairedFiles no-ops.
        if (leaseRunId) await renewVersionLease(currentVersionId, leaseRunId).catch(() => {});
        const saveResult = await saveRepairedFiles(currentVersionId, filesJson, promoteReason, leaseRunId, baseFilesJson).catch((err) => {
          console.warn("[repair] Failed to save repaired version files:", err);
          return { status: "failed" as const };
        });
        if (saveResult.status === "saved") {
          promoted = true;
          newVersionId = saveResult.version.id;
        } else if (saveResult.status === "stale_base") {
          // #260 Codex P2: a concurrent user edit advanced files_json past the
          // snapshot this repair was based on. The write no-op'd by design — do
          // not fail the (newer) version below.
          staleBaseNoOp = true;
        }
      }
      if (dbConfigured) {
        await createEngineVersionErrorLogs([
          {
            chatId,
            versionId: currentVersionId,
            level: promoted ? ("info" as const) : ("warning" as const),
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
              serverOwned: false,
              visualQA: visualQAMeta,
              errorManifest: groupedGateContext.errorManifest,
            }),
          },
        ]).catch((err) => {
          console.warn("[repair] Failed to log post-repair quality gate:", err);
        });
      }
      return { ok: promoted, newVersionId };
    }

    const normalizedFailures = gateFailures.map((failure) => ({
      check: failure.check,
      exitCode: failure.exitCode,
      output: failure.output,
      durationMs: failure.durationMs ?? null,
    }));
    const groupedGateContext = buildGroupedRepairErrorContext(normalizedFailures, {
      projectContent: initialContent,
    });
    const gateErrorLines = [
      ...buildServerVerifyRepairContextLines({
        failedOutputs: normalizedFailures,
        verifyLaneDurationMs: repairContext.qualityGateMeta?.verifyLaneDurationMs ?? 0,
        firstFailureCheck: repairContext.qualityGateMeta?.firstFailureCheck ?? null,
        jobStartedAt: repairContext.qualityGateMeta?.jobStartedAt ?? null,
        jobFinishedAt: repairContext.qualityGateMeta?.jobFinishedAt ?? null,
      }),
      ...groupedGateContext.contextLines,
      ...buildRepairErrorContextLines(normalizedFailures),
      ...currentVersionErrors,
      ...previousVersionErrors,
      ...visualQaLines,
    ];
    let llmPasses = 0;
    const originatingChat = await getChat(chatId).catch(() => null);
    const originatingTier = ownModelIdToCanonicalModelId(originatingChat?.model ?? null);
    const fixerModel = originatingTier
      ? resolvePhaseModel(originatingTier, "fixer").modelId
      : undefined;
    const fixerThinking = originatingTier
      ? resolvePhaseThinking(originatingTier, "fixer")
      : null;

    const loopResult = await runRepairLoop<{ newVersionId: string | null }>({
      initialContent,
      failedOutputs: normalizedFailures,
      contextLines: gateErrorLines,
      maxLlmPasses: MANUAL_REPAIR_ROUTE_MAX_LLM_PASSES,
      llmTimeoutMs: LLM_FIXER_TIMEOUT_MS,
      llmRetryTimeoutMs: LLM_FIXER_RETRY_TIMEOUT_MS,
      repairDeadlineEpochMs,
      fixerModel,
      fixerThinking: fixerThinking?.thinking,
      fixerReasoningEffort: fixerThinking?.reasoningEffort,
      recurringPatterns: readRecurringPatternsForChat(chatId),
      hasActionableErrorContext:
        gateFailures.length > 0 ||
        currentVersionErrors.length > 0 ||
        previousVersionErrors.length > 0 ||
        visualQaLines.length > 0,
      onBeforePass: async () => {
        if (leaseRunId) await renewVersionLease(currentVersionId, leaseRunId).catch(() => {});
      },
      onNoContext: async () => {
        if (!dbConfigured) return;
        // #260 Codex P2: the promotion attempt already no-op'd on stale_base (a
        // concurrent user edit advanced files_json), so do NOT fail the version
        // here — that would finalize the user's newer edit B as failed from a
        // stale repair. The finally-block re-verify settles B on a fresh lease.
        if (staleBaseNoOp) return;
        // #260 Codex P2 (stale-base before fail): defensive re-read — a no-context
        // fail must also not finalize a changed B. The promotion attempt may not
        // have run (hence no stale_base save signal), yet files_json could have
        // advanced. Re-check and skip the fail when it did.
        const currentSnapshot = await getVersionFilesSnapshot(currentVersionId).catch(() => null);
        if (currentSnapshot && currentSnapshot.filesJson !== baseFilesJson) {
          staleBaseNoOp = true;
          return;
        }
        await failVersionVerification(
          currentVersionId,
          "Repair attempted but no actionable error context available.",
          leaseRunId,
        ).catch((err) => {
          console.warn("[repair] Failed to mark version failed (no context):", err);
        });
        // NB: `loopResult` is in TDZ here — this callback fires from inside
        // the awaited `runRepairLoop(...)` call below, so the outer
        // `const loopResult = ...` binding is not yet assigned. Use the
        // pre-computed gate manifest instead (the no-context branch by
        // definition has no incremental loop output to surface).
        await createEngineVersionErrorLogs([
          {
            chatId,
            versionId: currentVersionId,
            level: "warning" as const,
            category: "server-repair",
            message: "Repair attempted without actionable error context.",
            meta: {
              repaired: false,
              remainingErrors: 0,
              qualityGateFailureCount: gateFailures.length,
              serverOwned: false,
              errorManifest: groupedGateContext.errorManifest,
            },
          },
        ]).catch((err) => {
          console.warn("[repair] Failed to log no-context repair outcome:", err);
        });
      },
      onAttemptPromotion: async (projectContent, method, options) => {
        const promote = await promoteIfPostRepairGatePasses({
          projectContent,
          method,
          verifyDeadlineEpochMs: options?.verifyDeadlineEpochMs,
        });
        return {
          promoted: promote.ok,
          payload: { newVersionId: promote.newVersionId },
        };
      },
    });

    llmPasses = loopResult.llmPasses;
    const deterministic = loopResult.method === "deterministic";
    const newVersionId = loopResult.payload?.newVersionId ?? null;

    if (loopResult.noContext) {
      logRepair(
        chatId,
        currentVersionId,
        "llm",
        false,
        llmPasses,
        loopResult.remainingErrors,
        loopResult.earlyStopReason,
        repairContext.qualityGateMeta,
        loopResult.errorManifest,
      );
      // #260 Codex P2: a concurrent user edit advanced files_json during the
      // promotion attempt (stale_base), so onNoContext deliberately skipped
      // failing the version. Surface it as superseded — the finally-block
      // re-verify settles B on a fresh lease — instead of a plain no-context
      // result that would imply B itself is unrepairable. (The post-loop
      // stale-base branch below is unreachable here: noContext returns first.)
      if (staleBaseNoOp) {
        await createEngineVersionErrorLogs([
          {
            chatId,
            versionId: currentVersionId,
            level: "warning" as const,
            category: "server-repair",
            message:
              "Repair not finalized: files_json advanced (concurrent edit); version not failed from stale repair.",
            meta: { serverOwned: false, staleBaseNoOp: true },
          },
        ]).catch((err) => {
          console.warn("[repair] Failed to log stale-base skip (no-context):", err);
        });
        return NextResponse.json({
          repaired: false,
          deterministic: false,
          remainingErrors: loopResult.remainingErrors,
          status: "superseded",
          reason:
            "Versionen ändrades under reparationen — den här reparationen sparades inte.",
        });
      }
      return NextResponse.json({
        repaired: false,
        deterministic: false,
        remainingErrors: loopResult.remainingErrors,
      });
    }

    // #260 Codex P2 (stale-base before fail): a non-promoted repair whose
    // promotion gate did not pass never reached saveRepairedFiles, so
    // `staleBaseNoOp` can still be false even if a concurrent user edit advanced
    // files_json past the repaired-from snapshot. Re-read and compare before
    // failing so we never finalize the user's newer edit B from this stale
    // repair(A); the finally after() re-verify settles B instead.
    if (!loopResult.promoted && dbConfigured && !staleBaseNoOp) {
      const currentSnapshot = await getVersionFilesSnapshot(currentVersionId).catch(() => null);
      if (currentSnapshot && currentSnapshot.filesJson !== baseFilesJson) {
        staleBaseNoOp = true;
      }
    }

    if (!loopResult.promoted && dbConfigured && !staleBaseNoOp) {
      const failSummary =
        loopResult.remainingErrors === 0
          ? "Server repair: syntax clean but quality gate still failing."
          : `Server repair incomplete (${loopResult.remainingErrors} errors remain).`;
      ownershipLost = !(await failAfterRepair(currentVersionId, failSummary));
    } else if (staleBaseNoOp) {
      // #260 Codex P2: skip failing the version — a concurrent user edit
      // advanced files_json past the repaired-from snapshot, so finalizing it
      // as failed would discard the user's newer edit's status from a stale
      // repair. Surface it as superseded instead.
      await createEngineVersionErrorLogs([
        {
          chatId,
          versionId: currentVersionId,
          level: "warning" as const,
          category: "server-repair",
          message:
            "Repair not finalized: files_json advanced (concurrent edit); version not failed from stale repair.",
          meta: { serverOwned: false, staleBaseNoOp: true },
        },
      ]).catch((err) => {
        console.warn("[repair] Failed to log stale-base skip:", err);
      });
    }

    logRepair(
      chatId,
      currentVersionId,
      deterministic ? "deterministic" : "llm",
      loopResult.promoted,
      llmPasses,
      loopResult.remainingErrors,
      loopResult.earlyStopReason,
      repairContext.qualityGateMeta,
      loopResult.errorManifest,
    );

    return NextResponse.json({
      repaired: loopResult.promoted,
      deterministic,
      newVersionId,
      remainingErrors: loopResult.remainingErrors,
      improvedSyntax: loopResult.improvedSyntax,
      earlyStopReason: loopResult.earlyStopReason,
      status: loopResult.promoted
        ? "repair_available"
        : staleBaseNoOp || ownershipLost
          ? "superseded"
          : "completed",
      reason: loopResult.promoted
        ? "Serverreparation finns sparad och väntar på att accepteras."
        : staleBaseNoOp
          ? "Versionen ändrades under reparationen — den här reparationen sparades inte."
          : ownershipLost
            ? "En annan körning tog över versionen — den här reparationen sparades inte."
            : null,
    });
  } catch (err) {
    console.error("[repair] Error:", err);
    // #260 Codex P2 (no fail of B from a stale repair): a crash must NOT finalize
    // the user's newer edit B as failed from the abandoned stale repair(A).
    // staleBaseNoOp may not be set yet if the throw preceded the promotion
    // attempt / no-context / post-loop recheck, so re-read the base here too: if
    // files_json advanced past this run's snapshot, mark it superseded so the
    // finally after() re-verify (plus the lease-safe readiness watchdog) settle B
    // instead of failing it.
    if (dbConfigured && internalVersionId && !staleBaseNoOp && baseFilesJsonForRecovery) {
      const current = await getVersionFilesSnapshot(internalVersionId).catch(() => null);
      if (current && current.filesJson !== baseFilesJsonForRecovery) {
        staleBaseNoOp = true;
      }
    }
    if (dbConfigured && internalVersionId && !staleBaseNoOp) {
      await failAfterRepair(
        internalVersionId,
        `Repair crashed: ${err instanceof Error ? err.message : "unknown"}`,
      );
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Repair failed" },
      { status: 500 },
    );
  } finally {
    if (leaseRunId && internalVersionId) {
      await releaseVersionLease(internalVersionId, leaseRunId).catch(() => {});
    }
    // #260 Codex P2 (stale-base re-verify): a concurrent user edit advanced
    // files_json past the repaired-from snapshot, so the repair no-op'd
    // (stale_base) and we did NOT fail the version. Re-verify the current files
    // (B) on a fresh lease — scheduled via after() so it runs AFTER the response
    // (and after this run's lease is released above), never as a detached
    // fire-and-forget promise. B then reaches an honest terminal state instead
    // of lingering in `repairing` (where the readiness watchdog could fail it).
    if (staleBaseNoOp && internalVersionId && resolvedChatId) {
      const reverifyChatId = resolvedChatId;
      const reverifyVersionId = internalVersionId;
      // #260 Codex P2 (route re-verify build-gate): thread the build-origin
      // signal so a build/preview-start repair re-verifies B with `build` in the
      // gate, not the typecheck-only lane. If a concurrent verify already holds
      // `inflight` for this version, triggerServerVerification returns early and
      // this callback no-ops — the readiness watchdog (lease-safe
      // failVersionVerificationIfUnleased; targets `repairing`) is the backstop
      // for that residual edge, so the row never stays stuck. See
      // BUG-SWARM-BACKLOG.md (#265 Bugbot MEDIUM: deferred re-verify inflight).
      const reverifyForce = reverifyForceBuildCheck;
      after(async () => {
        await triggerServerVerification({
          chatId: reverifyChatId,
          versionId: reverifyVersionId,
          forceBuildCheck: reverifyForce,
        }).catch(() => {});
      });
    }
  }
}

function logRepair(
  chatId: string,
  versionId: string,
  method: "deterministic" | "llm",
  repaired: boolean,
  llmPasses: number,
  remainingErrors?: number,
  earlyStopReason?: "fixer_noop" | "no_improvement" | "time_budget_exceeded" | null,
  qualityGateMeta?: {
    verifyLaneDurationMs?: number | null;
    firstFailureCheck?: string | null;
    jobStartedAt?: string | null;
    jobFinishedAt?: string | null;
  },
  errorManifest?: import("@/lib/gen/verify/repair-loop").RepairErrorManifest | null,
) {
  if (!dbConfigured) return;
  createEngineVersionErrorLogs([
    {
      chatId,
      versionId,
      level: repaired ? ("info" as const) : ("warning" as const),
      category: "server-repair",
      message: repaired
        ? `Server repair succeeded (${method}).`
        : `Server repair incomplete (${method}, ${remainingErrors ?? "?"} errors remain${earlyStopReason ? `, ${earlyStopReason}` : ""}).`,
      meta: buildServerRepairOutcomeMeta({
        method,
        llmPasses,
        repaired,
        remainingErrors,
        earlyStopReason,
        verifyLaneDurationMs: qualityGateMeta?.verifyLaneDurationMs ?? 0,
        firstFailureCheck: qualityGateMeta?.firstFailureCheck ?? null,
        jobStartedAt: qualityGateMeta?.jobStartedAt ?? null,
        jobFinishedAt: qualityGateMeta?.jobFinishedAt ?? null,
        serverOwned: false,
        errorManifest: errorManifest ?? null,
      }),
    },
  ]).catch((err) => {
    console.warn("[repair] Failed to log repair:", err);
  });
}
