import { runAutoFix } from "@/lib/gen/autofix/pipeline";
import { buildPreviewHtml } from "@/lib/gen/preview";
import type { CodeFile } from "@/lib/gen/parser";
import { materializeImages } from "@/lib/gen/post-process/image-materializer";
import { buildCompleteProject } from "@/lib/gen/project-scaffold";
import { repairGeneratedFiles } from "@/lib/gen/repair-generated-files";
import { runProjectSanityChecks } from "@/lib/gen/validation/project-sanity";
import { parseFilesFromContent } from "@/lib/gen/version-manager";
import { devLogAppend } from "@/lib/logging/devLog";

export type FinalizePreflightIssue = {
  file: string;
  severity: "error" | "warning";
  message: string;
};

export interface RunFinalizePreflightParams {
  chatId: string;
  model: string;
  filesJson: string;
}

export interface RunFinalizePreflightResult {
  filesJson: string;
  finalizedFilesForPreview: CodeFile[];
  preflightFileCount: number;
  preflightIssues: FinalizePreflightIssue[];
  previewBlockingReason: string | null;
}

function inferCodeFenceLanguage(path: string): string {
  if (path.endsWith(".tsx")) return "tsx";
  if (path.endsWith(".ts")) return "ts";
  if (path.endsWith(".jsx")) return "jsx";
  if (path.endsWith(".js")) return "js";
  if (path.endsWith(".css")) return "css";
  if (path.endsWith(".json")) return "json";
  return "txt";
}

function serializeFilesToCodeProject(files: CodeFile[]): string {
  return files
    .map(
      (file) =>
        `\`\`\`${file.language || inferCodeFenceLanguage(file.path)} file="${file.path}"\n${file.content}\n\`\`\``,
    )
    .join("\n\n");
}

export async function runFinalizePreflight({
  chatId,
  model,
  filesJson,
}: RunFinalizePreflightParams): Promise<RunFinalizePreflightResult> {
  let nextFilesJson = filesJson;
  let preflightIssues: FinalizePreflightIssue[] = [];
  let preflightFileCount = 0;
  let previewBlockingReason: string | null = null;
  let finalizedFilesForPreview: CodeFile[] = [];

  try {
    let finalFiles = (
      JSON.parse(nextFilesJson) as Array<{ path: string; content: string; language?: string }>
    ).map((file) => ({ ...file, language: file.language || "tsx" }));

    const repairResult = repairGeneratedFiles(finalFiles);
    finalFiles = repairResult.files;
    if (repairResult.fixes.length > 0) {
      nextFilesJson = JSON.stringify(finalFiles);
      devLogAppend("in-progress", {
        type: "file-repair",
        chatId,
        fixes: repairResult.fixes,
      });
    }

    const { validateGeneratedCode } = await import("@/lib/gen/retry/validate-syntax");
    let mergedProjectContent = serializeFilesToCodeProject(finalFiles);
    let mergedSyntax = await validateGeneratedCode(mergedProjectContent);
    if (!mergedSyntax.valid) {
      const initialMergedSyntaxErrorCount = mergedSyntax.errors.length;
      devLogAppend("in-progress", {
        type: "merged-syntax.invalid",
        chatId,
        errorCount: mergedSyntax.errors.length,
        errors: mergedSyntax.errors.slice(0, 8),
      });

      const { runLlmFixer } = await import("@/lib/gen/autofix/llm-fixer");
      const fixerResult = await runLlmFixer(
        mergedProjectContent,
        mergedSyntax.errors.map((error) => `${error.file}:${error.line} ${error.message}`),
      );

      if (fixerResult.success) {
        const reFixed = await runAutoFix(fixerResult.fixedContent, { chatId, model });
        const reValidated = await validateGeneratedCode(reFixed.fixedContent);
        if (reValidated.valid || reValidated.errors.length < mergedSyntax.errors.length) {
          finalFiles = (
            JSON.parse(parseFilesFromContent(reFixed.fixedContent)) as Array<{
              path: string;
              content: string;
              language?: string;
            }>
          ).map((file) => ({ ...file, language: file.language || "tsx" }));
          const postFixRepair = repairGeneratedFiles(finalFiles);
          finalFiles = postFixRepair.files;
          nextFilesJson = JSON.stringify(finalFiles);
          mergedProjectContent = reFixed.fixedContent;
          mergedSyntax = reValidated;
          devLogAppend("in-progress", {
            type: "merged-syntax.fixed",
            chatId,
            errorsBefore: initialMergedSyntaxErrorCount,
            errorsAfter: reValidated.errors.length,
            repairFixes: postFixRepair.fixes,
          });
        }
      }

      if (!mergedSyntax.valid) {
        preflightIssues.push(
          ...mergedSyntax.errors.slice(0, 20).map((error) => ({
            file: error.file,
            severity: "error" as const,
            message: `Merged syntax error line ${error.line}:${error.column} — ${error.message}`,
          })),
        );
      }
    }

    finalizedFilesForPreview = finalFiles;
    try {
      const previewHtml = buildPreviewHtml(finalizedFilesForPreview);
      if (!previewHtml) {
        previewBlockingReason =
          "Automatic preflight could not build a renderable own-engine preview entrypoint.";
        preflightIssues.push({
          file: "preview",
          severity: "error",
          message: previewBlockingReason,
        });
      }
    } catch (previewErr) {
      previewBlockingReason =
        previewErr instanceof Error
          ? `Automatic preflight failed while preparing preview: ${previewErr.message}`
          : "Automatic preflight failed while preparing preview.";
      preflightIssues.push({
        file: "preview",
        severity: "error",
        message: previewBlockingReason,
      });
      devLogAppend("in-progress", {
        type: "preview-preflight.error",
        chatId,
        message: previewBlockingReason,
      });
    }

    const completeProjectFiles = repairGeneratedFiles(buildCompleteProject(finalFiles)).files;
    preflightFileCount = completeProjectFiles.length;
    const sanity = runProjectSanityChecks(completeProjectFiles);
    preflightIssues = [...preflightIssues, ...sanity.issues];
    if (sanity.issues.length > 0) {
      devLogAppend("in-progress", {
        type: "project-sanity",
        chatId,
        valid: sanity.valid,
        issues: sanity.issues.slice(0, 20),
        completeProjectFiles: completeProjectFiles.length,
      });
    }
  } catch (sanityErr) {
    console.warn("[sanity] Project sanity check error:", sanityErr);
    devLogAppend("in-progress", {
      type: "project-sanity.error",
      chatId,
      message: sanityErr instanceof Error ? sanityErr.message : "Unknown sanity error",
    });
  }

  return {
    filesJson: nextFilesJson,
    finalizedFilesForPreview,
    preflightFileCount,
    preflightIssues,
    previewBlockingReason,
  };
}
