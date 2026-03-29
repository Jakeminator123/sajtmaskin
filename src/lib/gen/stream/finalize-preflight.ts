import { buildPreviewHtml } from "@/lib/gen/preview";
import type { CodeFile } from "@/lib/gen/parser";
import { buildCompleteProject } from "@/lib/gen/project-scaffold";
import { extractAppRoutePathsFromFilePaths, findMissingPlannedRoutes, type RoutePlan } from "@/lib/gen/route-plan";
import { repairGeneratedFiles } from "@/lib/gen/repair-generated-files";
import { runProjectSanityChecks } from "@/lib/gen/validation/project-sanity";
import { runSeoPreflightChecks } from "@/lib/gen/validation/seo-preflight";
import { devLogAppend } from "@/lib/logging/devLog";
import {
  buildSandboxStartContract,
  detectPreflightIssueCategory,
  type PreflightIssueCategory,
  type SandboxStartContract,
} from "./preflight-contract";

export type FinalizePreflightIssue = {
  file: string;
  severity: "error" | "warning";
  message: string;
  category: PreflightIssueCategory;
};

export interface RunFinalizePreflightParams {
  chatId: string;
  model: string;
  filesJson: string;
  routePlan?: RoutePlan | null;
}

export interface RunFinalizePreflightResult {
  filesJson: string;
  finalizedFilesForPreview: CodeFile[];
  preflightFileCount: number;
  preflightIssues: FinalizePreflightIssue[];
  previewBlockingReason: string | null;
  sandbox: SandboxStartContract;
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

function createIssue(
  file: string,
  severity: "error" | "warning",
  message: string,
): FinalizePreflightIssue {
  return {
    file,
    severity,
    message,
    category: detectPreflightIssueCategory({ file, severity, message }),
  };
}

export async function runFinalizePreflight({
  chatId,
  model: _model,
  filesJson,
  routePlan = null,
}: RunFinalizePreflightParams): Promise<RunFinalizePreflightResult> {
  let nextFilesJson = filesJson;
  let preflightIssues: FinalizePreflightIssue[] = [];
  let preflightFileCount = 0;
  let previewBlockingReason: string | null = null;
  let finalizedFilesForPreview: CodeFile[] = [];
  let sandbox = buildSandboxStartContract({
    issues: [],
    finalizedPreviewFileCount: 0,
  });

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
      devLogAppend("in-progress", {
        type: "merged-syntax.invalid",
        chatId,
        errorCount: mergedSyntax.errors.length,
        errors: mergedSyntax.errors.slice(0, 8),
      });

      if (!mergedSyntax.valid) {
        preflightIssues.push(
          ...mergedSyntax.errors.slice(0, 20).map((error) =>
            createIssue(
              error.file,
              "error",
              `Merged syntax error line ${error.line}:${error.column} — ${error.message}`,
            )
          ),
        );
      }
    }

    finalizedFilesForPreview = finalFiles;
    try {
      const previewHtml = buildPreviewHtml(finalizedFilesForPreview);
      if (!previewHtml) {
        previewBlockingReason =
          "Automatic preflight could not build a renderable own-engine preview entrypoint.";
        preflightIssues.push(createIssue("preview", "error", previewBlockingReason));
      }
    } catch (previewErr) {
      previewBlockingReason =
        previewErr instanceof Error
          ? `Automatic preflight failed while preparing preview: ${previewErr.message}`
          : "Automatic preflight failed while preparing preview.";
      preflightIssues.push(createIssue("preview", "error", previewBlockingReason));
      devLogAppend("in-progress", {
        type: "preview-preflight.error",
        chatId,
        message: previewBlockingReason,
      });
    }

    const completeProjectFiles = repairGeneratedFiles(buildCompleteProject(finalFiles)).files;
    preflightFileCount = completeProjectFiles.length;
    const sanity = runProjectSanityChecks(completeProjectFiles);
    preflightIssues = [
      ...preflightIssues,
      ...sanity.issues.map((issue) => createIssue(issue.file, issue.severity, issue.message)),
    ];
    const seoIssues = runSeoPreflightChecks(completeProjectFiles);
    preflightIssues = [
      ...preflightIssues,
      ...seoIssues.map((issue) =>
        createIssue(issue.file || "seo", issue.severity, issue.message)
      ),
    ];
    const actualRoutes = extractAppRoutePathsFromFilePaths(completeProjectFiles.map((file) => file.path));
    const missingPlannedRoutes = findMissingPlannedRoutes(routePlan, actualRoutes);
    if (missingPlannedRoutes.length > 0) {
      const severity: FinalizePreflightIssue["severity"] =
        routePlan?.source === "brief" ? "error" : "warning";
      preflightIssues.push(
        ...missingPlannedRoutes.slice(0, 10).map((route) =>
          createIssue(
            route.path,
            severity,
            `Planned route is missing from generated files: ${route.path} (${route.name})`,
          )
        ),
      );
      devLogAppend("in-progress", {
        type: "route-plan.preflight",
        chatId,
        source: routePlan?.source ?? null,
        siteType: routePlan?.siteType ?? null,
        missingRoutes: missingPlannedRoutes.map((route) => route.path),
      });
    }
    if (sanity.issues.length > 0) {
      devLogAppend("in-progress", {
        type: "project-sanity",
        chatId,
        valid: sanity.valid,
        issues: sanity.issues.slice(0, 20),
        completeProjectFiles: completeProjectFiles.length,
      });
    }
    sandbox = buildSandboxStartContract({
      issues: preflightIssues,
      finalizedPreviewFileCount: finalizedFilesForPreview.length,
    });
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
    sandbox,
  };
}
