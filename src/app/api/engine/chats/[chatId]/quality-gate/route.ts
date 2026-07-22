import { NextResponse } from "next/server";
import { z } from "zod";
import { withRateLimit } from "@/lib/rateLimit";
import { emit as emitBusEvent } from "@/lib/logging/event-bus";
import { getEngineVersionForChatByIdForRequest } from "@/lib/tenant";
import { createEngineVersionErrorLogs } from "@/lib/db/services/version-errors";
import { dbConfigured } from "@/lib/db/client";
import { getVersionFiles } from "@/lib/gen/version-manager";
import {
  failVersionVerification,
  getLatestVersion,
  getVersionById,
  markVersionVerifying,
  markVersionSupersededByRepair,
  promoteVersion,
  acquireVersionLease,
  releaseVersionLease,
  resetVersionVerificationToPending,
} from "@/lib/db/chat-repository-pg";
import { assertPromoteAllowed } from "@/lib/db/promote-guard";
import { warnLog } from "@/lib/utils/debug";
import { buildExportableProject } from "@/lib/gen/export/build-exportable-project";
import {
  DESIGN_PREVIEW_QUALITY_GATE_CHECKS,
  INTEGRATIONS_BUILD_QUALITY_GATE_CHECKS,
  QUALITY_GATE_CHECK_VALUES,
  isTypecheckOnlyAdvisory,
} from "@/lib/gen/verify/quality-gate-checks";
import type { VisualQAResult } from "@/lib/gen/verify/visual-qa";
import {
  describeQualityGateVerification,
  QUALITY_GATE_COMMANDS,
  QUALITY_GATE_SETUP_HINT,
  QualityGateNotConfiguredError,
  QualityGateUnavailableError,
  exportableToQualityGateFiles,
  isQualityGateConfigured,
  isQualityGateDisabledByEnv,
  maybeAnalyzeVisualQAForPassedExportable,
  runQualityGateChecks,
  qualityGateAllPassed,
  type QualityGateCheckResult,
} from "@/lib/gen/verify/preview-quality-gate";
import {
  buildServerVerifyQualityGateMeta,
  compactVisualQAForQualityGateLog,
} from "@/lib/gen/verify/server-verify-log-meta";
import { checkTier3ReadinessForVersion } from "@/lib/integrations/tier3-readiness-gate";

export const runtime = "nodejs";
export const maxDuration = 800;

/** Uses preview-host verify lane for verification only (typecheck/build/lint), not the live preview workspace. */

const requestSchema = z.object({
  versionId: z.string().min(1),
  /**
   * Explicit canonical gate selection for deterministic F3 release checks.
   * `integrationsBuild` is accepted only for a tenant-scoped integrations row
   * and re-runs the shared F3 readiness/Product Postcheck gate before verify.
   */
  gate: z.enum(["designPreview", "integrationsBuild"]).optional(),
  // Default to the canonical F2 design-preview lane (`DESIGN_PREVIEW_QUALITY_GATE_CHECKS`)
  // so that if `manifest.json` `qualityGateTiers.designPreview` is widened
  // (e.g. to add `lint`), the route default tracks it instead of silently
  // staying on a hardcoded `["typecheck"]`.
  checks: z
    .array(z.enum(QUALITY_GATE_CHECK_VALUES))
    .min(1, "At least one quality gate check is required.")
    .optional()
    .default([...DESIGN_PREVIEW_QUALITY_GATE_CHECKS]),
});

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
      ? "F2 render-first: typecheck-varning (advisory) — previewen renderar, versionen promotas."
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

async function isLatestVersionForChat(chatId: string, versionId: string): Promise<boolean> {
  const latest = await getLatestVersion(chatId).catch(() => null);
  return !latest || latest.id === versionId;
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

export async function POST(req: Request, ctx: { params: Promise<{ chatId: string }> }) {
  return withRateLimit(req, "engine:quality-gate", () => handlePOST(req, ctx));
}

async function handlePOST(req: Request, ctx: { params: Promise<{ chatId: string }> }) {
  try {
    const { chatId } = await ctx.params;

    const body = await req.json().catch(() => ({}));
    const validation = requestSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: "Validation failed", details: validation.error.issues },
        { status: 400 },
      );
    }

    const { versionId, gate } = validation.data;

    const scopedVersion = await getEngineVersionForChatByIdForRequest(req, chatId, versionId);
    if (!scopedVersion) {
      return NextResponse.json({ error: "Version not found for chat" }, { status: 404 });
    }
    const internalVersionId = scopedVersion.version.id;
    // Lifecycle is server-owned: every integrations row uses ReleaseGate even
    // when an older resume/post-check caller omits the new `gate` field.
    const effectiveGate =
      scopedVersion.version.lifecycle_stage === "integrations"
        ? "integrationsBuild"
        : gate;

    // F3 preflight validation that does NOT consume the version fileset stays
    // BEFORE the lease (cheap checks; avoids lease churn on pure 409/404 bails).
    // The fileset-consuming readiness check runs AFTER the lease (see below), so
    // it evaluates the same lease-protected snapshot the verifier/promotion use.
    let parentVersionId: string | null = null;
    if (effectiveGate === "integrationsBuild") {
      if (scopedVersion.version.lifecycle_stage !== "integrations") {
        return NextResponse.json(
          {
            error: "ReleaseGate requires an F3 integrations version.",
            code: "integrations_version_required",
          },
          { status: 409 },
        );
      }
      parentVersionId = scopedVersion.version.parent_version_id;
      if (!parentVersionId) {
        return NextResponse.json(
          {
            error: "F3 version is missing its F2 parent.",
            code: "f3_parent_version_missing",
          },
          { status: 409 },
        );
      }
      const parentVersion = await getVersionById(parentVersionId);
      if (!parentVersion || parentVersion.chat_id !== scopedVersion.chat.id) {
        return NextResponse.json(
          { error: "Parent version not found for chat" },
          { status: 404 },
        );
      }
    }

    // M#p4qg — server-authoritative verify lane for F3.
    // The client (`post-checks.ts` `runTier2VerifyLane`) unconditionally posts
    // the typecheck-only `DESIGN_PREVIEW` lane after *every* stream, including
    // after an F3/integrations generation. Trusting that body verbatim lets an
    // `integrations` version get promoted on typecheck alone (build + lint
    // skipped) = false-green. `lifecycle_stage` is the server-owned source of
    // truth, so an F3 row always pays for the full `INTEGRATIONS_BUILD` lane and
    // F2/design always stays on the typecheck-only RenderGate. The request body
    // can select neither a weaker F3 lane nor extra lint/build work for F2.
    const integrationsBuildGate =
      scopedVersion.version.lifecycle_stage === "integrations" ||
      gate === "integrationsBuild";
    const effectiveChecks =
      integrationsBuildGate
        ? [...INTEGRATIONS_BUILD_QUALITY_GATE_CHECKS]
        : [...DESIGN_PREVIEW_QUALITY_GATE_CHECKS];

    // TOCTOU fix (P1): acquire the per-version lease BEFORE reading files or
    // running the F3 readiness check, so readiness → verify → promotion all
    // evaluate ONE lease-protected FILE snapshot (a concurrent repair/verify
    // can no longer swap the files between the readiness check and promotion).
    // 409 if another job owns the lease. `updateVersionFiles` (user edits via
    // PUT/PATCH/DELETE /files, plus the normalize / validate / heal paths) now
    // ALSO takes this lease — its write is blocked (retryable 409 `version_busy`,
    // or a no-op on the best-effort heal path) whenever an unexpired lease owns
    // the version, so a user edit can no longer advance the DB snapshot to B
    // while this gate verified in-memory A. Residual (tracked in
    // BUG-SWARM-BACKLOG, not closed by this fix): product-postcheck rows /
    // `orchestration_snapshot` are read outside the file snapshot.
    let qgRunId: string | undefined;
    if (dbConfigured) {
      let lease: { runId: string } | null = null;
      try {
        lease = await acquireVersionLease(internalVersionId, "server_verify");
      } catch (err) {
        // Fail-CLOSED: a thrown acquire (DB error) must NOT proceed as if the
        // lease were held — the historic fail-open let a stale pre-lease snapshot
        // promote. Surface a retryable 503 so the client retries once the DB
        // recovers; no lease was taken, so there is nothing to release.
        // warnLog (not just console.error) so the failure reaches the same
        // structured observability as server-verify's lease errors.
        warnLog("quality-gate", "Lease acquire threw; failing closed (retryable)", {
          error: err instanceof Error ? err.message : String(err),
        });
        return NextResponse.json(
          {
            error: "Version lease unavailable (database error). Try again shortly.",
            code: "lease_unavailable",
            retryable: true,
          },
          { status: 503 },
        );
      }
      if (!lease) {
        return NextResponse.json(
          {
            error: "Version is busy (another verify/repair job holds the lock). Try again shortly.",
            code: "version_busy",
          },
          { status: 409 },
        );
      }
      qgRunId = lease.runId;
    }

    // Codex P2 (lease leak): everything after a successful acquire runs inside
    // this try/finally, so the lease is ALWAYS released — even if the read /
    // readiness / buildExportableProject / exportableToQualityGateFiles throws
    // (otherwise the row stayed `running` until the TTL and every accept/
    // verify/repair returned version_busy for ~15 min).
    //
    // `verifyLaneStarted` guards the catch below: a throw BEFORE the verify
    // lane starts (file read, readiness, export) must not mark the version
    // `failed` — the gate never evaluated the code, so that would be a
    // false-RED on a transient error (granska-svärm F1 on the TOCTOU fix).
    let verifyLaneStarted = false;
    try {
      // Read the version files EXACTLY ONCE under the lease and feed the SAME
      // set to readiness/export/verify/promotion — no re-read that could observe
      // a different snapshot (TOCTOU + Codex P2 stale-snapshot fix).
      const codeFiles = await getVersionFiles(internalVersionId);

      // Env kill-switch (SAJTMASKIN_DISABLE_QUALITY_GATE): skip the automatic F2
      // RenderGate verify lane entirely. Promote the version straight to
      // `passed` (still subject to the finalize false-green promote-guard) so it
      // lands in the clean resting state WITHOUT the ~5-7s "verifying" spinner
      // (never calls `markVersionVerifying`) or the superseded race. NEVER
      // disables the explicit F3 integrations ReleaseGate — integrations must
      // still typecheck+build before deploy.
      if (!integrationsBuildGate && isQualityGateDisabledByEnv()) {
        const stillLatest = await isLatestVersionForChat(chatId, internalVersionId);
        let promoted = false;
        if (stillLatest) {
          const promotedVersion = await promoteVersion(
            internalVersionId,
            "Quality gate avstängd (SAJTMASKIN_DISABLE_QUALITY_GATE) — auto-godkänd utan verify-lane.",
            qgRunId,
          ).catch((err) => {
            warnLog("quality-gate", "Disabled-path promote failed (non-fatal)", {
              error: err instanceof Error ? err.message : String(err),
            });
            return null;
          });
          promoted = Boolean(promotedVersion);
        }
        return NextResponse.json({
          passed: true,
          skipped: true,
          disabled: true,
          promoted,
          superseded: !stillLatest,
          checks: [],
          reason: "Quality gate avstängd via SAJTMASKIN_DISABLE_QUALITY_GATE.",
        });
      }

      if (effectiveGate === "integrationsBuild") {
        const readiness = await checkTier3ReadinessForVersion({
          versionId: internalVersionId,
          productPostcheckVersionId: parentVersionId ?? undefined,
          orchestrationSnapshot: scopedVersion.chat.orchestration_snapshot,
          projectId: scopedVersion.chat.project_id ?? null,
          preloadedFiles: codeFiles,
        });
        if (!readiness.ok && readiness.reason === "missing_env") {
          return NextResponse.json(
            {
              error: "tier3_env_not_ready",
              ready: false,
              parentVersionId,
              projectId: scopedVersion.chat.project_id ?? null,
              missingByIntegration: readiness.readiness.missingByIntegration,
            },
            { status: 412 },
          );
        }
        if (!readiness.ok && readiness.reason === "product_postcheck_blocked") {
          return NextResponse.json(
            {
              error: "product_postcheck_blocked",
              ready: false,
              parentVersionId,
            },
            { status: 409 },
          );
        }
        if (!readiness.ok) {
          return NextResponse.json(
            {
              error: "version_files_unavailable",
              ready: false,
              parentVersionId,
            },
            { status: 409 },
          );
        }
      }

      if (codeFiles && codeFiles.length > 0) {
        if (!isQualityGateConfigured()) {
          return NextResponse.json(
            {
              error: "Quality gate not configured (missing preview-host verify lane).",
              code: "quality_gate_disabled",
              hint: QUALITY_GATE_SETUP_HINT,
            },
            { status: 501 },
          );
        }

        const completeProjectFiles = await buildExportableProject(codeFiles);
        const qualityGateFiles = exportableToQualityGateFiles(completeProjectFiles);

        verifyLaneStarted = true;
        await markVersionVerifying(internalVersionId, undefined, qgRunId).catch((err) => {
          console.warn("[quality-gate] Failed to mark version verifying:", err);
        });

        const { results, verifyLaneDurationMs, firstFailureCheck, jobStartedAt, jobFinishedAt } =
          await runQualityGateChecks({
          chatId,
          versionId: internalVersionId,
          files: qualityGateFiles,
          checks: effectiveChecks,
          });

        const visualQA: VisualQAResult | undefined = maybeAnalyzeVisualQAForPassedExportable({
          exportable: completeProjectFiles,
          results,
          onError: (vqaErr) => {
            console.warn("[quality-gate] Visual QA error (non-fatal):", vqaErr);
          },
        });

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
        const f2TypecheckAdvisory = isTypecheckOnlyAdvisory({
          // Explicit integrationsBuild is accepted only for an F3 row above
          // and can never use F2's typecheck Advisory.
          isDesignPreview: !integrationsBuildGate,
          gatePassed: gateResult.passed,
          // The client-triggered route has no build-origin re-verify concept; a
          // build/lint failure is already excluded by the typecheck-only check.
          buildOriginated: false,
          results,
        });
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
          ]).catch((err) => {
            console.warn("[quality-gate] Failed to persist superseded log:", err);
          });
          return NextResponse.json({
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
        if (logs.length > 0 && dbConfigured) {
          await createEngineVersionErrorLogs(logs).catch((err) => {
            console.warn("[quality-gate] Failed to persist error logs:", err);
          });
        }
        let promotionBlocked = false;
        let promoteError = false;
        let promoteGuardUnavailable = false;
        let promotionSucceeded = false;
        // Promote when the gate passed OR when it is an F2 typecheck-only
        // advisory (render-first). Both still pay the finalize promote-guard
        // below, so a verifier-blocked version is never advisory-promoted.
        const promoteSummary = f2TypecheckAdvisory
          ? "F2 render-first: previewen renderar. Typecheck-varningar kvarstår (advisory, ej blockerande)."
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
          const guard = await assertPromoteAllowed(internalVersionId, undefined, {
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
            if (!promoted) {
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
            ]).catch((err) => {
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

        // A guard-blocked promotion must NOT read as green. `vmGatePassed`
        // preserves the underlying VM-check status (tsc/eslint/build) for
        // diagnostics, while `passed:false` + `promotionBlocked` tell every
        // caller (incl. ones that only inspect `passed`) the truth.
        if (promotionBlocked) {
          return NextResponse.json({
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
          return NextResponse.json({
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
          return NextResponse.json({
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
                "F2 render-first: versionen promotades med typecheck-varningar (advisory).",
              meta: { advisoryChecks: advisoryCheckNames },
            });
          } catch {
            // Telemetry only — never block the response on a bus failure.
          }
          return NextResponse.json({
            ...gateResult,
            passed: true,
            vmGatePassed: false,
            designAdvisory: true,
            advisoryChecks: advisoryCheckNames,
            promoted: promotionSucceeded,
            ...gateAdvisoryResponseFields,
          });
        }
        return NextResponse.json({
          ...gateResult,
          promoted: promotionSucceeded,
          ...gateAdvisoryResponseFields,
        });
      }

      return NextResponse.json({ error: "No files found for version" }, { status: 404 });
    } catch (err) {
      // Unreachable verify lane (network / timeout / HTTP 4xx-5xx / disk-full):
      // the gate never evaluated the code, so do NOT mark the version `failed`
      // (a false-RED verdict) and do NOT hard-500. Surface a retryable 503 the
      // client can retry; the version stays unpromoted (never false-green) and
      // the `finally` below still releases the lease. A real check failure does
      // not reach here — it returns `passed:false` above.
      if (err instanceof QualityGateUnavailableError) {
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
        return NextResponse.json(
          {
            error: err.message,
            code: "quality_gate_unavailable",
            retryable: err.retryable,
            hint: QUALITY_GATE_SETUP_HINT,
          },
          { status: 503 },
        );
      }
      if (!verifyLaneStarted) {
        // The throw happened during file read / readiness / export — the
        // verify lane never ran, so the version state must stay untouched
        // (no false-RED). Retryable 503, mirroring the lease/verify-lane
        // unavailability contract.
        console.error("[quality-gate] Pre-verify step threw; version state untouched:", err);
        return NextResponse.json(
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
        return NextResponse.json(
          {
            error: err.message,
            code: "quality_gate_disabled",
            hint: QUALITY_GATE_SETUP_HINT,
          },
          { status: 501 },
        );
      }
      throw err;
    } finally {
      if (qgRunId) {
        await releaseVersionLease(internalVersionId, qgRunId).catch(() => {});
      }
    }
  } catch (err) {
    console.error("[quality-gate] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Quality gate failed" },
      { status: 500 },
    );
  }
}
