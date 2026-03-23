import { NextResponse } from "next/server";
import { z } from "zod";
import { getEngineVersionForChatByIdForRequest } from "@/lib/tenant";
import { getVersionFiles } from "@/lib/gen/version-manager";
import { updateVersionFiles, promoteVersion } from "@/lib/db/chat-repository-pg";
import { createEngineVersionErrorLogs } from "@/lib/db/services";
import { dbConfigured } from "@/lib/db/client";
import { runAutoFix } from "@/lib/gen/autofix/pipeline";
import { runLlmFixer } from "@/lib/gen/autofix/llm-fixer";
import type { CodeFile } from "@/lib/gen/parser";

export const runtime = "nodejs";
export const maxDuration = 120;

const requestSchema = z.object({
  versionId: z.string().min(1),
});

function serializeFilesToCodeProject(files: CodeFile[]): string {
  return files
    .map((file) => {
      const lang = file.language || (file.path.endsWith(".css") ? "css" : "tsx");
      return `\`\`\`${lang} file="${file.path}"\n${file.content}\n\`\`\``;
    })
    .join("\n\n");
}

export async function POST(req: Request, ctx: { params: Promise<{ chatId: string }> }) {
  try {
    const { chatId } = await ctx.params;
    const body = await req.json().catch(() => ({}));
    const validation = requestSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json({ error: "Validation failed", details: validation.error.issues }, { status: 400 });
    }

    const { versionId } = validation.data;
    const scopedVersion = await getEngineVersionForChatByIdForRequest(req, chatId, versionId);
    if (!scopedVersion) {
      return NextResponse.json({ error: "Version not found for chat" }, { status: 404 });
    }

    const internalVersionId = scopedVersion.version.id;
    const codeFiles = await getVersionFiles(internalVersionId);
    if (!codeFiles || codeFiles.length === 0) {
      return NextResponse.json({ error: "No files found for version" }, { status: 404 });
    }

    const startMs = Date.now();
    const content = serializeFilesToCodeProject(codeFiles);

    const machineResult = await runAutoFix(content, { chatId });
    let currentContent = machineResult.fixedContent;
    let machineFixCount = machineResult.fixes.length;

    const { validateGeneratedCode } = await import("@/lib/gen/retry/validate-syntax");
    let syntaxCheck = await validateGeneratedCode(currentContent);
    let llmSuccess = false;
    let llmFixedFiles: string[] = [];
    let llmDurationMs = 0;

    if (!syntaxCheck.valid) {
      const errorSummary = syntaxCheck.errors
        .slice(0, 12)
        .map((e) => `${e.file || "unknown"}:${e.line}:${e.column} — ${e.message}`)
        .filter(Boolean);

      const llmResult = await runLlmFixer(currentContent, errorSummary);
      llmDurationMs = llmResult.durationMs;
      if (llmResult.success) {
        const reFixed = await runAutoFix(llmResult.fixedContent, { chatId });
        currentContent = reFixed.fixedContent;
        syntaxCheck = await validateGeneratedCode(currentContent);
        llmSuccess = true;
        llmFixedFiles = llmResult.fixedFiles;
      }
    }

    const { parseCodeProject } = await import("@/lib/gen/parser");
    const finalFiles = parseCodeProject(currentContent).files;
    const filesJson = JSON.stringify(
      finalFiles.map((f) => ({ path: f.path, content: f.content, language: f.language || "tsx" })),
    );

    await updateVersionFiles(internalVersionId, filesJson);

    const totalDurationMs = Date.now() - startMs;

    const logs: Array<{
      chatId: string;
      versionId: string;
      level: "info" | "warning" | "error";
      category: string;
      message: string;
      meta: Record<string, unknown>;
    }> = [];

    if (llmSuccess) {
      logs.push({
        chatId,
        versionId: internalVersionId,
        level: "info",
        category: "autofix:llm-success",
        message: `LLM fixer repaired ${llmFixedFiles.length} file(s) in ${Math.round(llmDurationMs)}ms.`,
        meta: { fixedFiles: llmFixedFiles, durationMs: llmDurationMs, machineFixCount, syntaxValid: syntaxCheck.valid },
      });
    }

    if (machineFixCount > 0 || llmSuccess) {
      logs.push({
        chatId,
        versionId: internalVersionId,
        level: "info",
        category: "autofix:repair-version",
        message: `Repair completed: ${machineFixCount} machine fix(es), LLM ${llmSuccess ? "succeeded" : "skipped/failed"}.`,
        meta: { machineFixCount, llmSuccess, llmFixedFiles, totalDurationMs, syntaxValid: syntaxCheck.valid },
      });
    }

    if (syntaxCheck.valid) {
      await promoteVersion(internalVersionId, "Repaired and syntax-validated by repair-version.").catch(() => {});
    }

    if (logs.length > 0 && dbConfigured) {
      await createEngineVersionErrorLogs(logs).catch((err) => {
        console.warn("[repair-version] Failed to persist logs:", err);
      });
    }

    return NextResponse.json({
      success: syntaxCheck.valid,
      machineFixCount,
      llmSuccess,
      llmFixedFiles,
      syntaxValid: syntaxCheck.valid,
      remainingErrors: syntaxCheck.valid ? 0 : syntaxCheck.errors.length,
      totalDurationMs,
    });
  } catch (err) {
    console.error("[repair-version] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Repair failed" },
      { status: 500 },
    );
  }
}
