import { NextResponse } from "next/server";
import { z } from "zod";
import { getEngineVersionForChatByIdForRequest } from "@/lib/tenant";
import { createEngineVersionErrorLogs } from "@/lib/db/services/version-errors";
import { dbConfigured } from "@/lib/db/client";
import { getVersionFiles } from "@/lib/gen/version-manager";
import {
  markVersionRepairing,
  failVersionVerification,
  saveRepairedFiles,
  getChat,
} from "@/lib/db/chat-repository-pg";
import { buildExportableProject } from "@/lib/gen/export/build-exportable-project";
import {
  maybeAnalyzeVisualQAForPassedExportable,
  shouldPromoteAfterRepair,
} from "@/lib/gen/verify/preview-quality-gate";
import { SERVER_VERIFY_QUALITY_GATE_CHECKS } from "@/lib/gen/verify/quality-gate-checks";
import { parseCodeProject } from "@/lib/gen/parser";
import type { CodeFile } from "@/lib/gen/parser";
import { ownModelIdToCanonicalModelId } from "@/lib/models/catalog";
import { resolvePhaseModel, resolvePhaseThinking } from "@/lib/models/phase-routing";
import { MANUAL_REPAIR_ROUTE_MAX_LLM_PASSES } from "@/lib/gen/defaults";
import {
  buildRepairErrorContextLines,
  runRepairLoop,
} from "@/lib/gen/verify/repair-loop";
import {
  buildServerRepairOutcomeMeta,
  buildServerVerifyQualityGateMeta,
  buildServerVerifyRepairContextLines,
  compactVisualQAForQualityGateLog,
} from "@/lib/gen/verify/server-verify-log-meta";

export const runtime = "nodejs";
export const maxDuration = 300;
const MANUAL_REPAIR_LLM_TIMEOUT_MS = 60_000;

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
  let internalVersionId: string | null = null;
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

    const { versionId, repairContext } = validation.data;

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
    const codeFiles = await getVersionFiles(internalVersionId);
    if (!codeFiles || codeFiles.length === 0) {
      return NextResponse.json(
        { error: "No files found for version" },
        { status: 404 },
      );
    }

    if (dbConfigured) {
      await markVersionRepairing(internalVersionId).catch((err) => {
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
    }): Promise<{ ok: boolean; newVersionId: string | null }> {
      const { projectContent, method } = params;
      const promoteReason =
        method === "deterministic"
          ? "Server repair passed quality gate (deterministic). Awaiting acceptance."
          : "Server repair passed quality gate (LLM). Awaiting acceptance.";
      const repairedFiles = codeProjectToFiles(projectContent);
      const exportable = await buildExportableProject(repairedFiles);
      const decision = await shouldPromoteAfterRepair({
        chatId,
        versionId: currentVersionId,
        exportable,
        hadQualityGateFailures,
        checks: SERVER_VERIFY_QUALITY_GATE_CHECKS,
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
        const savedVersion = await saveRepairedFiles(currentVersionId, filesJson, promoteReason).catch((err) => {
          console.warn("[repair] Failed to save repaired version files:", err);
          return null;
        });
        if (savedVersion) {
          promoted = true;
          newVersionId = savedVersion.id;
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
    const gateErrorLines = [
      ...buildServerVerifyRepairContextLines({
        failedOutputs: normalizedFailures,
        verifyLaneDurationMs: repairContext.qualityGateMeta?.verifyLaneDurationMs ?? 0,
        firstFailureCheck: repairContext.qualityGateMeta?.firstFailureCheck ?? null,
        jobStartedAt: repairContext.qualityGateMeta?.jobStartedAt ?? null,
        jobFinishedAt: repairContext.qualityGateMeta?.jobFinishedAt ?? null,
      }),
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
      llmTimeoutMs: MANUAL_REPAIR_LLM_TIMEOUT_MS,
      fixerModel,
      fixerThinking: fixerThinking?.thinking,
      fixerReasoningEffort: fixerThinking?.reasoningEffort,
      hasActionableErrorContext:
        gateFailures.length > 0 ||
        currentVersionErrors.length > 0 ||
        previousVersionErrors.length > 0 ||
        visualQaLines.length > 0,
      onNoContext: async () => {
        if (!dbConfigured) return;
        await failVersionVerification(
          currentVersionId,
          "Repair attempted but no actionable error context available.",
        ).catch((err) => {
          console.warn("[repair] Failed to mark version failed (no context):", err);
        });
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
            },
          },
        ]).catch((err) => {
          console.warn("[repair] Failed to log no-context repair outcome:", err);
        });
      },
      onAttemptPromotion: async (projectContent, method) => {
        const promote = await promoteIfPostRepairGatePasses({
          projectContent,
          method,
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
      );
      return NextResponse.json({
        repaired: false,
        deterministic: false,
        remainingErrors: loopResult.remainingErrors,
      });
    }

    if (!loopResult.promoted && dbConfigured) {
      if (loopResult.remainingErrors === 0) {
        await failVersionVerification(
          currentVersionId,
          "Server repair: syntax clean but quality gate still failing.",
        ).catch((err) => {
          console.warn("[repair] Failed to mark version failed after repair:", err);
        });
      } else {
        await failVersionVerification(
          currentVersionId,
          `Server repair incomplete (${loopResult.remainingErrors} errors remain).`,
        ).catch((err) => {
          console.warn("[repair] Failed to mark version failed after repair:", err);
        });
      }
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
    );

    return NextResponse.json({
      repaired: loopResult.promoted,
      deterministic,
      newVersionId,
      remainingErrors: loopResult.remainingErrors,
      improvedSyntax: loopResult.improvedSyntax,
      earlyStopReason: loopResult.earlyStopReason,
      status: loopResult.promoted ? "repair_available" : "completed",
      reason: loopResult.promoted
        ? "Server-reparation finns sparad och vantar pa att accepteras."
        : null,
    });
  } catch (err) {
    console.error("[repair] Error:", err);
    if (dbConfigured && internalVersionId) {
      await failVersionVerification(
        internalVersionId,
        `Repair crashed: ${err instanceof Error ? err.message : "unknown"}`,
      ).catch(() => null);
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Repair failed" },
      { status: 500 },
    );
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
      }),
    },
  ]).catch((err) => {
    console.warn("[repair] Failed to log repair:", err);
  });
}
