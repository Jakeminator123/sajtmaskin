import { NextResponse } from "next/server";
import { z } from "zod";
import { withRateLimit } from "@/lib/rateLimit";
import { getEngineVersionForChatByIdForRequest } from "@/lib/tenant";
import { createEngineVersionErrorLogs } from "@/lib/db/services/version-errors";
import { dbConfigured } from "@/lib/db/client";
import { getVersionFiles } from "@/lib/gen/version-manager";
import {
  failVersionVerification,
  getLatestVersion,
  markVersionVerifying,
  markVersionSupersededByRepair,
  promoteVersion,
  acquireVersionLease,
  releaseVersionLease,
  resetVersionVerificationToPending,
} from "@/lib/db/chat-repository-pg";
import { assertPromoteAllowed } from "@/lib/db/promote-guard";
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
  maybeAnalyzeVisualQAForPassedExportable,
  runQualityGateChecks,
  qualityGateAllPassed,
  type QualityGateCheckResult,
} from "@/lib/gen/verify/preview-quality-gate";
import {
  buildServerVerifyQualityGateMeta,
  compactVisualQAForQualityGateLog,
} from "@/lib/gen/verify/server-verify-log-meta";

export const runtime = "nodejs";
export const maxDuration = 800;

/** Uses preview-host verify lane for verification only (typecheck/build/lint), not the live preview workspace. */

const requestSchema = z.object({
  versionId: z.string().min(1),
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
  const visualQAMeta =
    visualQA &&
    typeof visualQA.overallScore === "number" &&
    Array.isArray(visualQA.checks)
      ? compactVisualQAForQualityGateLog(visualQA)
      : undefined;

  const level: "info" | "warning" | "error" = passed
    ? "info"
    : advisory
      ? "warning"
      : "error";
  const message = passed
    ? "Automatic quality gate passed."
    : advisory
      ? "F2 render-first: typecheck-varning (advisory) — previewen renderar, versionen promotas."
      : "Automatic quality gate failed.";

  return {
    level,
    category: "preflight:quality-gate" as const,
    message,
    meta: buildServerVerifyQualityGateMeta({
      passed,
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

    const { versionId, checks } = validation.data;

    const scopedVersion = await getEngineVersionForChatByIdForRequest(req, chatId, versionId);
    if (!scopedVersion) {
      return NextResponse.json({ error: "Version not found for chat" }, { status: 404 });
    }
    const internalVersionId = scopedVersion.version.id;

    // M#p4qg — server-authoritative verify lane for F3.
    // The client (`post-checks.ts` `runTier2VerifyLane`) unconditionally posts
    // the typecheck-only `DESIGN_PREVIEW` lane after *every* stream, including
    // after an F3/integrations generation. Trusting that body verbatim lets an
    // `integrations` version get promoted on typecheck alone (build + lint
    // skipped) = false-green. `lifecycle_stage` is the server-owned source of
    // truth, so an F3 row always pays for the full `INTEGRATIONS_BUILD` lane and
    // the client can never downgrade it. F2/design keeps the request checks.
    const effectiveChecks =
      scopedVersion.version.lifecycle_stage === "integrations"
        ? [...INTEGRATIONS_BUILD_QUALITY_GATE_CHECKS]
        : checks;

    const codeFiles = await getVersionFiles(internalVersionId);
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

      // Distributed lease (Plan C / P1 + Codex P2): take the per-version lease
      // BEFORE materializing inputs, so the gate can't verify/promote a stale
      // pre-lease snapshot that a concurrent repair already replaced. 409 if
      // another job owns it. Fail-safe: a DB error degrades to the unlocked path.
      let qgRunId: string | undefined;
      if (dbConfigured) {
        try {
          const lease = await acquireVersionLease(internalVersionId, "server_verify");
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
        } catch (err) {
          console.warn("[quality-gate] Lease acquire failed; proceeding without distributed lock:", err);
          qgRunId = undefined;
        }
      }

      // Codex P2 (lease leak): everything after a successful acquire runs inside
      // this try/finally, so the lease is ALWAYS released — even if the leased
      // re-read / buildExportableProject / exportableToQualityGateFiles throws
      // (otherwise the row stayed `running` until the TTL and every accept/
      // verify/repair returned version_busy for ~15 min).
      try {
        // Re-read under the lease so verification runs on the lease-protected
        // snapshot, not the pre-acquire read above (Codex P2 stale-snapshot fix).
        const leasedCodeFiles = qgRunId
          ? (await getVersionFiles(internalVersionId)) ?? codeFiles
          : codeFiles;
        const completeProjectFiles = await buildExportableProject(leasedCodeFiles);
        const qualityGateFiles = exportableToQualityGateFiles(completeProjectFiles);

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
          isDesignPreview: scopedVersion.version.lifecycle_stage !== "integrations",
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
            .filter((r) => !r.passed)
            .map((r) => {
              // In the F2 advisory case the typecheck failure is non-blocking:
              // log it as a warning under a distinct category so it stays visible
              // in diagnostics without reading as a hard "failed" verdict.
              const advisoryEntry = f2TypecheckAdvisory && r.check === "typecheck";
              return {
                chatId,
                versionId: internalVersionId,
                level: advisoryEntry ? ("warning" as const) : ("error" as const),
                category: advisoryEntry
                  ? "quality-gate:typecheck-advisory"
                  : `quality-gate:${r.check}`,
                message: advisoryEntry
                  ? `${r.check} advisory (exit ${r.exitCode}) — previewen renderar; ej blockerande i F2`
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
        // Promote when the gate passed OR when it is an F2 typecheck-only
        // advisory (render-first). Both still pay the finalize promote-guard
        // below, so a verifier-blocked version is never advisory-promoted.
        const promoteSummary = f2TypecheckAdvisory
          ? "F2 render-first: previewen renderar. Typecheck-varningar kvarstår (advisory, ej blockerande)."
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
            const promoted = await promoteVersion(internalVersionId, promoteSummary, qgRunId).catch(
              (err) => {
                console.warn("[quality-gate] Failed to promote version:", err);
                return null;
              },
            );
            // The guard already allowed promotion, so a null here is a transient
            // failure (DB error, or a race that re-flagged the signal between the
            // two reads) — not a verifier block. Leave the row at "verifying" and
            // surface a soft error so the client can retry instead of going red.
            if (!promoted) {
              promoteError = true;
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
              "Build checks passed but the finalize verifier flagged blocking findings; promotion was blocked.",
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
            vmGatePassed: true,
            promotionBlocked: true,
            promotionBlockedReason: "finalize_quality_gate_failed",
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
            ...advisoryResponseFields,
          });
        }
        // F2 render-first advisory promotion: report `passed:true` so the client
        // does not auto-repair, but keep the honest signal — `vmGatePassed:false`
        // (the VM typecheck did not pass) plus `designAdvisory` + `advisoryChecks`
        // so no consumer reads this as a solid-green build.
        if (f2TypecheckAdvisory) {
          return NextResponse.json({
            ...gateResult,
            passed: true,
            vmGatePassed: false,
            designAdvisory: true,
            advisoryChecks: advisoryCheckNames,
          });
        }
        return NextResponse.json(gateResult);
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
    }

    return NextResponse.json({ error: "No files found for version" }, { status: 404 });
  } catch (err) {
    console.error("[quality-gate] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Quality gate failed" },
      { status: 500 },
    );
  }
}
