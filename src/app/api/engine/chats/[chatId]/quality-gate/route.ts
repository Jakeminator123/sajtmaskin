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
} from "@/lib/db/chat-repository-pg";
import { assertPromoteAllowed } from "@/lib/db/promote-guard";
import { buildExportableProject } from "@/lib/gen/export/build-exportable-project";
import {
  DESIGN_PREVIEW_QUALITY_GATE_CHECKS,
  QUALITY_GATE_CHECK_VALUES,
} from "@/lib/gen/verify/quality-gate-checks";
import type { VisualQAResult } from "@/lib/gen/verify/visual-qa";
import {
  describeQualityGateVerification,
  QUALITY_GATE_COMMANDS,
  QUALITY_GATE_SETUP_HINT,
  QualityGateNotConfiguredError,
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
export const maxDuration = 300;

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
}) {
  const {
    checkResults,
    verifyLaneDurationMs,
    firstFailureCheck,
    jobStartedAt,
    jobFinishedAt,
    visualQA,
  } = params;
  const passed = qualityGateAllPassed(checkResults);
  const visualQAMeta =
    visualQA &&
    typeof visualQA.overallScore === "number" &&
    Array.isArray(visualQA.checks)
      ? compactVisualQAForQualityGateLog(visualQA)
      : undefined;

  return {
    level: passed ? ("info" as const) : ("error" as const),
    category: "preflight:quality-gate" as const,
    message: passed ? "Automatic quality gate passed." : "Automatic quality gate failed.",
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

      const completeProjectFiles = await buildExportableProject(codeFiles);
      const qualityGateFiles = exportableToQualityGateFiles(completeProjectFiles);

      // Distributed lease (Plan C / P1): this HTTP verify mutates the same
      // engine_versions row as the auto server-verify flow. Take the
      // per-version lease so the two can't race; 409 if another job owns it.
      // Fail-safe: a DB error/missing table degrades to the legacy unlocked path.
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

      await markVersionVerifying(internalVersionId, undefined, qgRunId).catch((err) => {
        console.warn("[quality-gate] Failed to mark version verifying:", err);
      });

      try {
        const { results, verifyLaneDurationMs, firstFailureCheck, jobStartedAt, jobFinishedAt } =
          await runQualityGateChecks({
          chatId,
          versionId: internalVersionId,
          files: qualityGateFiles,
          checks,
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
            }),
          },
          ...results
            .filter((r) => !r.passed)
            .map((r) => {
              return {
                chatId,
                versionId: internalVersionId,
                level: "error" as const,
                category: `quality-gate:${r.check}`,
                message: `${r.check} failed (exit ${r.exitCode})`,
                meta: {
                  stage: r.check,
                  command: QUALITY_GATE_COMMANDS[r.check as keyof typeof QUALITY_GATE_COMMANDS] ?? null,
                  output: r.output.slice(0, 12_000),
                  outputLength: r.output.length,
                  exitCode: r.exitCode,
                  durationMs: r.durationMs ?? null,
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
        if (gateResult.passed) {
          // Check the false-green guard *explicitly* before promoting so we can
          // tell a real guard block apart from a transient promote failure. A
          // block means the finalize verifier flagged this row (telemetry
          // `qualityGateResult`); a DB error after the guard allowed must NOT be
          // mislabeled as a verifier block (would show a misleading red and lose
          // the version to "failed" on an infra hiccup).
          const guard = await assertPromoteAllowed(internalVersionId).catch((err) => {
            console.warn("[quality-gate] Promote guard check failed (fail-open):", err);
            return { allowed: true as const };
          });
          if (!guard.allowed) {
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
          } else {
            const promoted = await promoteVersion(internalVersionId, verificationSummary, qgRunId).catch(
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
        // Transient promote failure: not green, but not a verifier block either.
        if (promoteError) {
          return NextResponse.json({
            ...gateResult,
            passed: false,
            vmGatePassed: true,
            promoteError: true,
          });
        }
        return NextResponse.json(gateResult);
      } catch (err) {
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
