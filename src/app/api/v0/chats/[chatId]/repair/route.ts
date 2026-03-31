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
} from "@/lib/db/chat-repository-pg";
import { buildExportableProject } from "@/lib/gen/build-exportable-project";
import { runAutoFix } from "@/lib/gen/autofix/pipeline";
import { runLlmFixer } from "@/lib/gen/autofix/llm-fixer";
import { parseCodeProject } from "@/lib/gen/parser";
import type { CodeFile } from "@/lib/gen/parser";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_LLM_PASSES = 2;

const qualityGateFailureSchema = z.object({
  check: z.enum(["typecheck", "build", "lint"]),
  exitCode: z.number(),
  output: z.string(),
  errorCount: z.number().optional(),
});

const repairContextSchema = z.object({
  qualityGate: z.array(qualityGateFailureSchema).optional(),
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
    for (const line of trimmed.split("\n")) {
      const stripped = line.trim();
      if (!stripped) continue;
      if (/error\b|TS\d{4}|ERR!|FAIL/i.test(stripped)) {
        lines.push(`[${f.check}] ${stripped}`);
      }
    }
    if (lines.length > 40) break;
  }
  return lines;
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ chatId: string }> },
) {
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

    const internalVersionId = scopedVersion.version.id;
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
    const initialSyntaxErrorCount = syntaxResult.errors.length;

    // Syntax-valid alone is not enough to claim success when this route was
    // triggered by a failed typecheck/build/lint quality gate.
    if (syntaxResult.valid && gateFailures.length === 0) {
      const repairedFiles = codeProjectToFiles(content);
      const filesJson = JSON.stringify(repairedFiles);
      let newVersionId: string | null = null;
      if (dbConfigured) {
        const version = await createDraftVersion(chatId, null, filesJson);
        newVersionId = version.id;
        await promoteVersion(
          newVersionId,
          "Server repair succeeded (deterministic).",
        ).catch((err) => {
          console.warn("[repair] Failed to promote repaired version:", err);
        });
      }
      logRepair(chatId, internalVersionId, "deterministic", true, 0);
      return NextResponse.json({
        repaired: true,
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
      }
      return NextResponse.json({
        repaired: false,
        deterministic: false,
        remainingErrors: syntaxResult.errors.length,
      });
    }

    const gateErrorLines = extractErrorLines(gateFailures);
    let bestContent = content;
    let bestErrorCount = syntaxResult.errors.length;
    let llmPasses = 0;

    for (let pass = 0; pass < MAX_LLM_PASSES; pass++) {
      const errorSummary = [
        ...syntaxResult.errors.map(
          (e) => `${e.file}:${e.line}:${e.column} ${e.message}`,
        ),
        ...gateErrorLines,
      ].slice(0, 50);

      const brokenFiles = [
        ...new Set(
          syntaxResult.errors.map((e) => e.file).filter(Boolean),
        ),
      ];

      const fixerResult = await runLlmFixer(content, errorSummary, {
        requiredFiles: brokenFiles,
      });
      llmPasses++;

      if (!fixerResult.success && !fixerResult.partial) continue;

      const reFixed = await runAutoFix(fixerResult.fixedContent);
      content = reFixed.fixedContent;
      syntaxResult = await validateGeneratedCode(content);

      if (syntaxResult.errors.length < bestErrorCount) {
        bestErrorCount = syntaxResult.errors.length;
        bestContent = content;
      }

      if (syntaxResult.valid) break;
    }

    const repairedFiles = codeProjectToFiles(bestContent);
    const filesJson = JSON.stringify(repairedFiles);
    const repaired = gateFailures.length === 0 && bestErrorCount === 0;
    let newVersionId: string | null = null;
    const improvedSyntax = bestErrorCount < initialSyntaxErrorCount;

    if (dbConfigured && repaired) {
      const version = await createDraftVersion(chatId, null, filesJson);
      newVersionId = version.id;
      await promoteVersion(
        newVersionId,
        "Server repair succeeded (LLM).",
      ).catch((err) => {
        console.warn("[repair] Failed to promote repaired version:", err);
      });
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
    );

    return NextResponse.json({
      repaired,
      deterministic: false,
      newVersionId,
      remainingErrors: bestErrorCount,
      improvedSyntax,
    });
  } catch (err) {
    console.error("[repair] Error:", err);
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
        : `Server repair incomplete (${method}, ${remainingErrors ?? "?"} errors remain).`,
      meta: { method, llmPasses, repaired, remainingErrors },
    },
  ]).catch((err) => {
    console.warn("[repair] Failed to log repair:", err);
  });
}
