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
} from "@/lib/db/chat-repository-pg";
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

      await markVersionVerifying(internalVersionId).catch((err) => {
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
          await markVersionSupersededByRepair(internalVersionId).catch((err) => {
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
        if (gateResult.passed) {
          const promoted = await promoteVersion(internalVersionId, verificationSummary).catch(
            (err) => {
              console.warn("[quality-gate] Failed to promote version:", err);
              return null;
            },
          );
          if (!promoted) {
            // False-green guard: the VM checks (tsc/eslint/build) passed but
            // `promoteVersion` refused because the finalize verifier flagged
            // blocking findings (telemetry `qualityGateResult`). Resolve to a
            // truthful terminal state instead of leaving the row at "verifying".
            await failVersionVerification(
              internalVersionId,
              "Build checks passed but the finalize verifier flagged blocking findings; promotion was blocked.",
            ).catch((err) => {
              console.warn(
                "[quality-gate] Failed to mark version failed after promote guard block:",
                err,
              );
            });
          }
        } else {
          await failVersionVerification(internalVersionId, verificationSummary).catch((err) => {
            console.warn("[quality-gate] Failed to mark version failed:", err);
          });
        }

        return NextResponse.json(gateResult);
      } catch (err) {
        await failVersionVerification(
          internalVersionId,
          "Automatic verification could not complete.",
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
