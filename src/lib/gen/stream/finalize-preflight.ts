import { BROAD_REPAIR_MAX_PASSES } from "@/lib/gen/defaults";
import { runSharedRepair } from "@/lib/gen/autofix/shared-repair";
import { syntaxErrorsToDiagnostics } from "@/lib/gen/autofix/repair-diagnostics";
import { buildPreviewHtml } from "@/lib/gen/preview";
import type { CodeFile } from "@/lib/gen/parser";
import { materializeImages } from "@/lib/gen/post-process/image-materializer";
import { buildCompleteProject } from "@/lib/gen/project-scaffold";
import { extractAppRoutePathsFromFilePaths, findMissingPlannedRoutes, type RoutePlan } from "@/lib/gen/route-plan";
import { repairGeneratedFiles } from "@/lib/gen/repair-generated-files";
import { runProjectSanityChecks } from "@/lib/gen/validation/project-sanity";
import { applyCriticalSeoBaseline } from "@/lib/gen/validation/seo-auto-baseline";
import { runSeoPreflightChecks } from "@/lib/gen/validation/seo-preflight";
import { parseFilesFromContent } from "@/lib/gen/version-manager";
import { devLogAppend } from "@/lib/logging/devLog";
import { isLegacyPreviewShimsEnabled } from "@/lib/env";

export type FinalizePreflightIssue = {
  file: string;
  severity: "error" | "warning";
  message: string;
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
  routePlan = null,
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
      devLogAppend("in-progress", {
        type: "merged-syntax.invalid",
        chatId,
        errorCount: mergedSyntax.errors.length,
        errors: mergedSyntax.errors.slice(0, 8),
      });

      const repairResult = await runSharedRepair(
        mergedProjectContent,
        syntaxErrorsToDiagnostics(mergedSyntax.errors),
        async (c) => {
          const v = await validateGeneratedCode(c);
          return syntaxErrorsToDiagnostics(v.errors);
        },
        { chatId, model, maxPasses: BROAD_REPAIR_MAX_PASSES },
      );

      if (repairResult.fixerUsed) {
        mergedProjectContent = repairResult.content;
        mergedSyntax = await validateGeneratedCode(mergedProjectContent);
        try {
          finalFiles = (
            JSON.parse(parseFilesFromContent(mergedProjectContent)) as Array<{
              path: string;
              content: string;
              language?: string;
            }>
          ).map((file) => ({ ...file, language: file.language || "tsx" }));
          const postFixRepair = repairGeneratedFiles(finalFiles);
          finalFiles = postFixRepair.files;
          nextFilesJson = JSON.stringify(finalFiles);
        } catch {
          // parse failed — keep existing finalFiles
        }
        devLogAppend("in-progress", {
          type: "merged-syntax.shared-repair",
          chatId,
          diagnosticsBefore: repairResult.diagnosticsBefore,
          diagnosticsAfter: repairResult.diagnosticsAfter,
          passes: repairResult.passes,
        });
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

    const seoBaseline = applyCriticalSeoBaseline(finalFiles);
    if (seoBaseline.fixes.length > 0) {
      finalFiles = seoBaseline.files;
      nextFilesJson = JSON.stringify(finalFiles);
      devLogAppend("in-progress", {
        type: "seo-baseline",
        chatId,
        fixes: seoBaseline.fixes,
      });
    }

    finalizedFilesForPreview = finalFiles;
    if (isLegacyPreviewShimsEnabled()) {
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
    }

    const completeProjectFiles = repairGeneratedFiles(buildCompleteProject(finalFiles)).files;
    preflightFileCount = completeProjectFiles.length;
    const sanity = runProjectSanityChecks(completeProjectFiles);
    preflightIssues = [...preflightIssues, ...sanity.issues];
    const seoIssues = runSeoPreflightChecks(completeProjectFiles);
    preflightIssues = [
      ...preflightIssues,
      ...seoIssues.map((issue) => ({
        file: issue.file || "seo",
        severity: issue.severity,
        message: issue.message,
      })),
    ];
    const actualRoutes = extractAppRoutePathsFromFilePaths(completeProjectFiles.map((file) => file.path));
    const missingPlannedRoutes = findMissingPlannedRoutes(routePlan, actualRoutes);
    if (missingPlannedRoutes.length > 0) {
      const severity: FinalizePreflightIssue["severity"] =
        routePlan?.source === "brief" ? "error" : "warning";
      preflightIssues.push(
        ...missingPlannedRoutes.slice(0, 10).map((route) => ({
          file: route.path,
          severity,
          message: `Planned route is missing from generated files: ${route.path} (${route.name})`,
        })),
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
