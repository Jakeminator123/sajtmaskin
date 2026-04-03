import { NextResponse } from "next/server";
import { z } from "zod";
import { getEngineVersionForChatByIdForRequest } from "@/lib/tenant";
import { createEngineVersionErrorLogs } from "@/lib/db/services/version-errors";
import { dbConfigured } from "@/lib/db/client";
import { getVersionFiles } from "@/lib/gen/version-manager";
import {
  failVersionVerification,
  markVersionVerifying,
  promoteVersion,
} from "@/lib/db/chat-repository-pg";
import { buildExportableProject } from "@/lib/gen/build-exportable-project";
import { analyzeVisualQuality, isVisualQAEnabled, type VisualQAResult } from "@/lib/gen/visual-qa";
import {
  QUALITY_GATE_COMMANDS,
  QUALITY_GATE_SETUP_HINT,
  QualityGateNotConfiguredError,
  exportableToQualityGateFiles,
  isQualityGateConfigured,
  runQualityGateChecks,
  qualityGateAllPassed,
  type QualityGateCheckResult,
} from "@/lib/gen/preview-quality-gate";

export const runtime = "nodejs";
export const maxDuration = 300;

/** Uses preview-host verify lane for verification only (typecheck/build/lint), not the live preview workspace. */

const requestSchema = z.object({
  versionId: z.string().min(1),
  checks: z
    .array(z.enum(["typecheck", "build", "lint"]))
    .optional()
    .default(["typecheck", "build"]),
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
}) {
  const { checkResults, verifyLaneDurationMs, firstFailureCheck, jobStartedAt, jobFinishedAt } = params;
  return {
    level: checkResults.every((result) => result.passed) ? ("info" as const) : ("error" as const),
    category: "preflight:quality-gate",
    message: checkResults.every((result) => result.passed)
      ? "Automatic quality gate passed."
      : "Automatic quality gate failed.",
    meta: {
      passed: checkResults.every((result) => result.passed),
      checks: checkResults.map((result) => ({
        check: result.check,
        passed: result.passed,
        exitCode: result.exitCode,
        durationMs: result.durationMs ?? null,
      })),
      verifyLaneDurationMs,
      firstFailureCheck,
      jobStartedAt,
      jobFinishedAt,
      serverOwned: false,
    },
  };
}

function buildVerificationSummary(checkResults: QualityGateCheckResult[]): string {
  const failedChecks = checkResults.filter((result) => !result.passed).map((result) => result.check);
  if (failedChecks.length === 0) {
    return "Automatic verification passed.";
  }
  return `Automatic verification failed: ${failedChecks.join(", ")}.`;
}

export async function POST(req: Request, ctx: { params: Promise<{ chatId: string }> }) {
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

      const completeProjectFiles = buildExportableProject(codeFiles);
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

        let visualQA: VisualQAResult | undefined;
        if (isVisualQAEnabled() && qualityGateAllPassed(results)) {
          try {
            visualQA = analyzeVisualQuality(
              qualityGateFiles.map((file) => ({ path: file.name, content: file.content })),
            );
          } catch (vqaErr) {
            console.warn("[quality-gate] Visual QA error (non-fatal):", vqaErr);
          }
        }

        const gateResult: GateResult = {
          passed: qualityGateAllPassed(results),
          checks: results,
          verifyLaneDurationMs,
          firstFailureCheck,
          jobStartedAt,
          jobFinishedAt,
          visualQA,
        };

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
                  command:
                    r.check === "install"
                      ? "npm install --prefer-offline"
                      : QUALITY_GATE_COMMANDS[r.check as keyof typeof QUALITY_GATE_COMMANDS] ?? null,
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

        const verificationSummary = buildVerificationSummary(results);
        if (gateResult.passed) {
          await promoteVersion(internalVersionId, verificationSummary).catch((err) => {
            console.warn("[quality-gate] Failed to promote version:", err);
          });
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
