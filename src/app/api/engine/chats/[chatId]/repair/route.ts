import { NextResponse } from "next/server";
import { z } from "zod";
import { getEngineVersionForChatByIdForRequest } from "@/lib/tenant";
import { createEngineVersionErrorLogs } from "@/lib/db/services/version-errors";
import { dbConfigured } from "@/lib/db/client";
import { getVersionFiles } from "@/lib/gen/version-manager";
import {
  createDraftVersion,
  markVersionRepairing,
  promoteVersion,
  failVersionVerification,
  getChat,
} from "@/lib/db/chat-repository-pg";
import { buildExportableProject } from "@/lib/gen/build-exportable-project";
import {
  exportableToQualityGateFiles,
  qualityGateAllPassed,
  shouldPromoteAfterRepair,
} from "@/lib/gen/preview-quality-gate";
import { analyzeVisualQuality, isVisualQAEnabled } from "@/lib/gen/visual-qa";
import { runAutoFix } from "@/lib/gen/autofix/pipeline";
import { runLlmFixer } from "@/lib/gen/autofix/llm-fixer";
import { parseCodeProject } from "@/lib/gen/parser";
import type { CodeFile } from "@/lib/gen/parser";
import { ownModelIdToCanonicalModelId } from "@/lib/models/catalog";
import { resolvePhaseModel } from "@/lib/models/phase-routing";
import { MANUAL_REPAIR_ROUTE_MAX_LLM_PASSES } from "@/lib/gen/defaults";
import { resolveServerRepairEarlyStopReason } from "@/lib/gen/server-repair-policy";
import {
  buildServerRepairOutcomeMeta,
  buildServerVerifyQualityGateMeta,
  buildServerVerifyRepairContextLines,
  compactVisualQAForQualityGateLog,
} from "@/lib/gen/server-verify-log-meta";

export const runtime = "nodejs";
export const maxDuration = 180;

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

function extractErrorLines(
  failures: z.infer<typeof qualityGateFailureSchema>[],
): string[] {
  const lines: string[] = [];
  for (const f of failures) {
    const trimmed = f.output.trim();
    if (!trimmed) continue;
    const outputLines = trimmed.split("\n");
    for (let i = 0; i < outputLines.length; i++) {
      const stripped = outputLines[i].trim();
      if (!stripped) continue;
      if (/error\b|TS\d{4}|ERR!|FAIL/i.test(stripped)) {
        const prevLine = i > 0 ? outputLines[i - 1]?.trim() : "";
        if (prevLine && !lines.includes(`[${f.check}] ${prevLine}`)) {
          lines.push(`[${f.check}] ${prevLine}`);
        }
        lines.push(`[${f.check}] ${stripped}`);
      }
    }
    if (lines.length > 60) break;
  }
  return lines;
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

    const exportable = buildExportableProject(codeFiles);
    let content = filesToCodeProject(exportable);

    // Phase 1: deterministic autofix
    const autoFixResult = await runAutoFix(content);
    content = autoFixResult.fixedContent;

    const { validateGeneratedCode } = await import(
      "@/lib/gen/retry/validate-syntax"
    );
    let syntaxResult = await validateGeneratedCode(content);
    const gateFailures = repairContext.qualityGate ?? [];
    const hadQualityGateFailures = gateFailures.length > 0;
    const initialSyntaxErrorCount = syntaxResult.errors.length;
    const currentVersionId = internalVersionId;

    async function promoteIfPostRepairGatePasses(
      projectContent: string,
      method: "deterministic" | "llm",
      promoteReason: string,
    ): Promise<{ ok: boolean; newVersionId: string | null }> {
      const repairedFiles = codeProjectToFiles(projectContent);
      const exportable = buildExportableProject(repairedFiles);
      const decision = await shouldPromoteAfterRepair({
        chatId,
        versionId: currentVersionId,
        exportable,
        hadQualityGateFailures,
      });
      let visualQAMeta: ReturnType<typeof compactVisualQAForQualityGateLog> | undefined;
      if (
        decision.promote &&
        decision.results &&
        qualityGateAllPassed(decision.results) &&
        isVisualQAEnabled()
      ) {
        try {
          const qFiles = exportableToQualityGateFiles(exportable);
          const v = analyzeVisualQuality(
            qFiles.map((f) => ({ path: f.name, content: f.content })),
          );
          visualQAMeta = compactVisualQAForQualityGateLog(v);
        } catch (vqaErr) {
          console.warn("[repair] Post-repair visual QA error (non-fatal):", vqaErr);
        }
      }
      if (dbConfigured) {
        await createEngineVersionErrorLogs([
          {
            chatId,
            versionId: currentVersionId,
            level: decision.promote ? ("info" as const) : ("warning" as const),
            category: "preflight:quality-gate",
            message: decision.promote
              ? `Post-repair quality gate passed (${method}).`
              : "Post-repair quality gate did not pass; not promoting.",
            meta: buildServerVerifyQualityGateMeta({
              results: decision.results,
              verifyLaneDurationMs: decision.verifyLaneDurationMs,
              firstFailureCheck: decision.firstFailureCheck,
              jobStartedAt: decision.jobStartedAt,
              jobFinishedAt: decision.jobFinishedAt,
              repass: true,
              method,
              promoted: decision.promote,
              serverOwned: false,
              visualQA: visualQAMeta,
            }),
          },
        ]).catch((err) => {
          console.warn("[repair] Failed to log post-repair quality gate:", err);
        });
      }
      if (!decision.promote) {
        return { ok: false, newVersionId: null };
      }
      if (!dbConfigured) {
        return { ok: false, newVersionId: null };
      }
      const filesJson = JSON.stringify(repairedFiles);
      const version = await createDraftVersion(chatId, null, filesJson);
      await promoteVersion(version.id, promoteReason).catch((err) => {
        console.warn("[repair] Failed to promote repaired version:", err);
      });
      return { ok: true, newVersionId: version.id };
    }

    // Re-run quality gate when possible; syntax alone is not enough if gate context exists.
    if (syntaxResult.valid && gateFailures.length === 0) {
      const { ok, newVersionId } = await promoteIfPostRepairGatePasses(
        content,
        "deterministic",
        "Server repair succeeded (deterministic); quality gate re-passed.",
      );
      logRepair(
        chatId,
        internalVersionId,
        "deterministic",
        ok,
        0,
        undefined,
        undefined,
        repairContext.qualityGateMeta,
      );
      return NextResponse.json({
        repaired: ok,
        deterministic: true,
        newVersionId,
        remainingErrors: 0,
      });
    }

    // Phase 2: targeted LLM repair (only with exact error context)
    const hasErrorContext =
      gateFailures.length > 0 || syntaxResult.errors.length > 0;
    if (!hasErrorContext) {
      if (dbConfigured) {
        await failVersionVerification(
          internalVersionId,
          "Repair attempted but no actionable error context available.",
        ).catch((err) => {
          console.warn("[repair] Failed to mark version failed (no context):", err);
        });
        await createEngineVersionErrorLogs([
          {
            chatId,
            versionId: internalVersionId,
            level: "warning" as const,
            category: "server-repair",
            message: "Repair attempted without actionable error context.",
            meta: {
              repaired: false,
              remainingErrors: syntaxResult.errors.length,
              qualityGateFailureCount: gateFailures.length,
              serverOwned: false,
            },
          },
        ]).catch((err) => {
          console.warn("[repair] Failed to log no-context repair outcome:", err);
        });
      }
      return NextResponse.json({
        repaired: false,
        deterministic: false,
        remainingErrors: syntaxResult.errors.length,
      });
    }

    const gateErrorLines = [
      ...buildServerVerifyRepairContextLines({
        failedOutputs: gateFailures.map((failure) => ({
          check: failure.check,
          exitCode: failure.exitCode,
          output: failure.output,
          durationMs: failure.durationMs ?? null,
        })),
        verifyLaneDurationMs: repairContext.qualityGateMeta?.verifyLaneDurationMs ?? 0,
        firstFailureCheck: repairContext.qualityGateMeta?.firstFailureCheck ?? null,
        jobStartedAt: repairContext.qualityGateMeta?.jobStartedAt ?? null,
        jobFinishedAt: repairContext.qualityGateMeta?.jobFinishedAt ?? null,
      }),
      ...extractErrorLines(gateFailures),
    ];
    const filesFromGateOutput = new Set<string>();
    for (const line of gateErrorLines) {
      const fileMatch = line.match(/]\s*([^\s:]+\.\w{2,4}):/);
      if (fileMatch?.[1]) filesFromGateOutput.add(fileMatch[1]);
    }
    let bestContent = content;
    let bestErrorCount = syntaxResult.errors.length;
    let llmPasses = 0;
    let earlyStopReason: "fixer_noop" | "no_improvement" | null = null;
    const originatingChat = await getChat(chatId).catch(() => null);
    const originatingTier = ownModelIdToCanonicalModelId(originatingChat?.model ?? null);
    const fixerModel = originatingTier
      ? resolvePhaseModel(originatingTier, "fixer").modelId
      : undefined;

    for (let pass = 0; pass < MANUAL_REPAIR_ROUTE_MAX_LLM_PASSES; pass++) {
      if (syntaxResult.errors.length > bestErrorCount && bestErrorCount < Infinity) {
        content = bestContent;
        syntaxResult = await validateGeneratedCode(content);
      }
      const errorsBefore = syntaxResult.errors.length;
      const errorSummary = [
        ...syntaxResult.errors.map(
          (e) => `${e.file}:${e.line}:${e.column} ${e.message}`,
        ),
        ...gateErrorLines,
      ].slice(0, 50);

      const brokenFiles = [
        ...new Set([
          ...syntaxResult.errors.map((e) => e.file).filter(Boolean),
          ...filesFromGateOutput,
        ]),
      ];

      const fixerResult = await runLlmFixer(content, errorSummary, {
        model: fixerModel,
        requiredFiles: brokenFiles,
      });
      llmPasses++;

      if (!fixerResult.success && !fixerResult.partial) {
        const stopReason = resolveServerRepairEarlyStopReason({
          fixerProducedOutput: false,
          errorsBefore,
          errorsAfter: errorsBefore,
        });
        earlyStopReason = stopReason === "continue" ? null : stopReason;
        break;
      }

      const reFixed = await runAutoFix(fixerResult.fixedContent);
      content = reFixed.fixedContent;
      syntaxResult = await validateGeneratedCode(content);
      const stopReason = resolveServerRepairEarlyStopReason({
        fixerProducedOutput: true,
        errorsBefore,
        errorsAfter: syntaxResult.errors.length,
      });

      if (syntaxResult.errors.length < bestErrorCount) {
        bestErrorCount = syntaxResult.errors.length;
        bestContent = content;
      }

      if (stopReason !== "continue") {
        earlyStopReason = stopReason;
        break;
      }
      if (syntaxResult.valid) break;
    }

    const syntaxClean = bestErrorCount === 0;
    let newVersionId: string | null = null;
    const improvedSyntax = bestErrorCount < initialSyntaxErrorCount;
    let repaired = false;

    if (dbConfigured && syntaxClean) {
      const promote = await promoteIfPostRepairGatePasses(
        bestContent,
        "llm",
        "Server repair succeeded (LLM); quality gate re-passed.",
      );
      repaired = promote.ok;
      newVersionId = promote.newVersionId;
      if (!repaired) {
        await failVersionVerification(
          internalVersionId,
          "Server repair: syntax clean but quality gate still failing.",
        ).catch((err) => {
          console.warn("[repair] Failed to mark version failed after repair:", err);
        });
      }
    } else if (dbConfigured) {
      await failVersionVerification(
        internalVersionId,
        `Server repair incomplete (${bestErrorCount} errors remain).`,
      ).catch((err) => {
        console.warn("[repair] Failed to mark version failed after repair:", err);
      });
    }

    logRepair(
      chatId,
      internalVersionId,
      "llm",
      repaired,
      llmPasses,
      bestErrorCount,
      earlyStopReason,
      repairContext.qualityGateMeta,
    );

    return NextResponse.json({
      repaired,
      deterministic: false,
      newVersionId,
      remainingErrors: bestErrorCount,
      improvedSyntax,
      earlyStopReason,
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
  earlyStopReason?: "fixer_noop" | "no_improvement" | null,
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
