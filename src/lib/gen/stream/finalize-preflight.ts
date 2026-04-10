import { buildPreviewHtml } from "@/lib/gen/preview/build-preview-document";
import { parseCodeProject, serializeCodeProject, type CodeFile } from "@/lib/gen/parser";
import { buildCompleteProject } from "@/lib/gen/project-scaffold";
import { inferCapabilities } from "@/lib/gen/capability-inference";
import { resolveCapabilityPacks, collectPackDeps } from "@/lib/gen/capability-packs";
import { resolveEnhancementPacks, collectEnhancementDeps } from "@/lib/gen/enhancement-packs";
import {
  extractAppRoutePathsFromFilePaths,
  findMissingPlannedRoutes,
  getRoutePlanPrimarySource,
  type PlannedRoute,
  type RoutePlan,
} from "@/lib/gen/route-plan";
import { repairGeneratedFiles } from "@/lib/gen/repair-generated-files";
import { validateAndFix } from "@/lib/gen/autofix/validate-and-fix";
import { runProjectSanityChecks } from "@/lib/gen/validation/project-sanity";
import { runSeoPreflightChecks } from "@/lib/gen/validation/seo-preflight";
import { devLogAppend } from "@/lib/logging/devLog";
import type { CanonicalModelId } from "@/lib/models/catalog";
import type { OrchestrationContract } from "@/lib/gen/orchestration-contract";
import {
  buildPreviewStartContract,
  resolvePreflightIssueCategory,
  type PreflightIssueCategory,
  type PreviewStartContract,
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
  resolvedTier?: CanonicalModelId;
  filesJson: string;
  routePlan?: RoutePlan | null;
  orchestrationContract?: OrchestrationContract | null;
  originalPrompt?: string;
}

export interface RunFinalizePreflightResult {
  filesJson: string;
  finalizedFilesForPreview: CodeFile[];
  preflightFileCount: number;
  preflightIssues: FinalizePreflightIssue[];
  previewBlockingReason: string | null;
  previewStart: PreviewStartContract;
  unresolvedImportFallbackUsed: boolean;
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

/** Heuristic: main app page renders nothing meaningful (no AST — fast preflight). */
function looksLikeEmptyPage(content: string): boolean {
  const body = content
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");
  if (/return\s+null\s*;/i.test(body)) return true;
  if (/return\s*\(\s*<>\s*<\/>\s*\)/i.test(body)) return true;
  if (/return\s*\(\s*<div\s*\/>\s*\)/i.test(body)) return true;
  const pascalJsx = body.match(/<[A-Z][A-Za-z0-9]*[\s>]/g);
  if (pascalJsx && pascalJsx.length > 0) return false;
  const stripped = body.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "");
  const textish = stripped.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  // Intrinsic-only pages: need some visible copy, not just wrappers
  return textish.length < 3;
}

function resolveAppPagePath(files: Array<{ path: string }>): string | null {
  const normalized = files.map((f) => f.path.replace(/\\/g, "/"));
  const exact = normalized.find((p) => p === "app/page.tsx" || p.endsWith("/app/page.tsx"));
  return exact ?? null;
}

function normPath(p: string): string {
  return p.replace(/\\/g, "/");
}

/** Catch Tier-2 / export foot-guns (missing next, broken package.json, etc.). */
function collectTier2HygieneIssues(files: CodeFile[]): FinalizePreflightIssue[] {
  const issues: FinalizePreflightIssue[] = [];
  const byNorm = new Map(files.map((f) => [normPath(f.path), f]));

  const pkgFile = files.find((f) => normPath(f.path) === "package.json");
  if (!pkgFile) {
    issues.push(
      createIssue(
        "package.json",
        "error",
        "Missing package.json — Tier 2 needs it for `npm install` + `next dev`.",
        "dependency_install_failure",
      ),
    );
    return issues;
  }

  try {
    const pkg = JSON.parse(pkgFile.content) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
      scripts?: Record<string, string>;
    };
    if (!pkg.dependencies?.next) {
      issues.push(
        createIssue(
          "package.json",
          "error",
          "Missing `next` in dependencies — preview VM and local `npm run dev` will fail.",
          "dependency_install_failure",
        ),
      );
    }
    const devScript = pkg.scripts?.dev ?? "";
    if (devScript && !/\bnext\b/.test(devScript)) {
      issues.push(
        createIssue(
          "package.json",
          "warning",
          "`scripts.dev` does not reference `next` — Tier 2 expects e.g. `next dev`.",
          "non_blocking_quality_warning",
        ),
      );
    }
    if (!pkg.devDependencies?.typescript && files.some((f) => /\.tsx?$/.test(f.path))) {
      issues.push(
        createIssue(
          "package.json",
          "warning",
          "TypeScript sources present but `typescript` missing from devDependencies.",
          "non_blocking_quality_warning",
        ),
      );
    }
  } catch {
    issues.push(
      createIssue("package.json", "error", "package.json is not valid JSON.", "dependency_install_failure"),
    );
  }

  const hasTsSources = files.some((f) => /\.tsx?$/.test(f.path));
  if (hasTsSources && !byNorm.has("next-env.d.ts")) {
    issues.push(
      createIssue(
        "next-env.d.ts",
        "warning",
        "Missing next-env.d.ts with TypeScript sources — Next creates it on first dev; scaffold should include it.",
        "non_blocking_quality_warning",
      ),
    );
  }

  return issues;
}

function createIssue(
  file: string,
  severity: "error" | "warning",
  message: string,
  category?: PreflightIssueCategory | null,
): FinalizePreflightIssue {
  return {
    file,
    severity,
    message,
    category: resolvePreflightIssueCategory({ file, severity, message, category }),
  };
}

function buildContractBackedRoutePlan(
  orchestrationContract: OrchestrationContract | null | undefined,
): RoutePlan | null {
  if (!orchestrationContract) return null;
  const requiredRoutePaths = orchestrationContract.generationToValidate.requiredRoutePaths;
  if (requiredRoutePaths.length === 0) return null;
  const routes: PlannedRoute[] = requiredRoutePaths.map((path) => ({
    path,
    name: path === "/" ? "Home" : path.split("/").filter(Boolean).join(" ") || "Route",
    intent: "Derived from orchestration contract required routes.",
    required: true,
  }));
  const rs = orchestrationContract.scaffoldToRoute.routeSource;
  return {
    provenance: { primarySource: rs, sources: [rs] },
    siteType:
      routes.length === 1
        ? "one-page"
        : routes.some((route) => route.path.startsWith("/dashboard") || route.path === "/settings")
          ? "app-shell"
          : "brochure",
    reason: "Generated from orchestration contract for preflight validation fallback.",
    routes,
  };
}

function collectOrchestrationContractIssues(
  orchestrationContract: OrchestrationContract | null | undefined,
  files: CodeFile[],
): FinalizePreflightIssue[] {
  if (!orchestrationContract) return [];
  const issues: FinalizePreflightIssue[] = [];
  const fileSet = new Set(files.map((file) => normPath(file.path)));
  const hasRequiredFile = (requiredFile: string): boolean => {
    const normalized = normPath(requiredFile);
    if (fileSet.has(normalized)) return true;
    if (normalized.startsWith("app/")) {
      return fileSet.has(`src/${normalized}`);
    }
    if (normalized.startsWith("src/app/")) {
      return fileSet.has(normalized.replace(/^src\//, ""));
    }
    return false;
  };
  for (const requiredFile of orchestrationContract.generationToValidate.requiredFiles) {
    if (!hasRequiredFile(requiredFile)) {
      issues.push(
        createIssue(
          requiredFile,
          "warning",
          `Orchestration contract expected required file: ${requiredFile}`,
          "non_blocking_quality_warning",
        ),
      );
    }
  }
  return issues;
}

export async function runFinalizePreflight({
  chatId,
  model: _model,
  resolvedTier,
  filesJson,
  routePlan = null,
  orchestrationContract = null,
  originalPrompt,
}: RunFinalizePreflightParams): Promise<RunFinalizePreflightResult> {
  let nextFilesJson = filesJson;
  let preflightIssues: FinalizePreflightIssue[] = [];
  let preflightFileCount = 0;
  let previewBlockingReason: string | null = null;
  let finalizedFilesForPreview: CodeFile[] = [];
  let unresolvedImportFallbackUsed = false;
  let previewStart = buildPreviewStartContract({
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
    let mergedProjectContent = serializeCodeProject(
      finalFiles.map((file) => ({
        ...file,
        language: file.language || inferCodeFenceLanguage(file.path),
      })),
    );
    let mergedSyntax = await validateGeneratedCode(mergedProjectContent);
    if (!mergedSyntax.valid) {
      devLogAppend("in-progress", {
        type: "merged-syntax.invalid",
        chatId,
        errorCount: mergedSyntax.errors.length,
        errors: mergedSyntax.errors.slice(0, 8),
      });

      const mergedFixResult = await validateAndFix(mergedProjectContent, {
        chatId,
        model: _model,
        resolvedTier,
        fixBudgetMs: 12_000,
      });
      if (mergedFixResult.fixerUsed || mergedFixResult.fixerImproved) {
        devLogAppend("in-progress", {
          type: "merged-syntax.fixer.result",
          chatId,
          fixerUsed: mergedFixResult.fixerUsed,
          fixerImproved: mergedFixResult.fixerImproved,
          errorsBefore: mergedFixResult.errorsBefore,
          errorsAfter: mergedFixResult.errorsAfter,
          status: mergedFixResult.status,
          earlyStopReason: mergedFixResult.earlyStopReason,
        });
      }

      if (mergedFixResult.fixerUsed && mergedFixResult.errorsAfter < mergedFixResult.errorsBefore) {
        const fixedProject = parseCodeProject(mergedFixResult.content);
        if (fixedProject.files.length > 0) {
          finalFiles = fixedProject.files;
          nextFilesJson = JSON.stringify(finalFiles);
          mergedProjectContent = mergedFixResult.content;
          mergedSyntax = await validateGeneratedCode(mergedProjectContent);
        }
      }

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

    const { collectRequiredUiComponents } = await import("@/lib/gen/project-scaffold-ui-reader");
    let capabilityDeps: Record<string, string> | undefined;
    if (originalPrompt) {
      const caps = inferCapabilities(originalPrompt);
      capabilityDeps = {
        ...collectPackDeps(resolveCapabilityPacks(caps)),
        ...collectEnhancementDeps(resolveEnhancementPacks(caps)),
      };
    }
    const completeProjectFiles = repairGeneratedFiles(
      buildCompleteProject(finalFiles, collectRequiredUiComponents(finalFiles), { capabilityDeps }),
    ).files;
    preflightFileCount = completeProjectFiles.length;
    preflightIssues.push(...collectTier2HygieneIssues(completeProjectFiles));
    const sanity = runProjectSanityChecks(completeProjectFiles);
    if (sanity.unresolvedImportFallbackUsed) {
      unresolvedImportFallbackUsed = true;
    }
    preflightIssues = [
      ...preflightIssues,
      ...sanity.issues.map((issue) => createIssue(issue.file, issue.severity, issue.message, issue.category)),
    ];
    const seoIssues = runSeoPreflightChecks(completeProjectFiles);
    preflightIssues = [
      ...preflightIssues,
      ...seoIssues.map((issue) =>
        createIssue(issue.file || "seo", issue.severity, issue.message, issue.category)
      ),
    ];

    const appPagePath = resolveAppPagePath(completeProjectFiles);
    if (appPagePath) {
      const pageFile = completeProjectFiles.find((f) => f.path.replace(/\\/g, "/") === appPagePath);
      if (pageFile?.content && looksLikeEmptyPage(pageFile.content)) {
        preflightIssues.push(
          createIssue(
            appPagePath,
            "warning",
            "Main page appears to render empty content.",
            "non_blocking_quality_warning",
          ),
        );
      }
    }

    const actualRoutes = extractAppRoutePathsFromFilePaths(completeProjectFiles.map((file) => file.path));
    const effectiveRoutePlan = routePlan ?? buildContractBackedRoutePlan(orchestrationContract);
    const missingPlannedRoutes = findMissingPlannedRoutes(effectiveRoutePlan, actualRoutes);
    if (missingPlannedRoutes.length > 0) {
      // Missing secondary routes should not block preview/Tier 2; autofix or follow-up can add them.
      preflightIssues.push(
        ...missingPlannedRoutes.slice(0, 10).map((route) =>
          createIssue(
            route.path,
            "warning",
            `Planned route is missing from generated files: ${route.path} (${route.name})`,
            "non_blocking_quality_warning",
          )
        ),
      );
      devLogAppend("in-progress", {
        type: "route-plan.preflight",
        chatId,
        source: getRoutePlanPrimarySource(effectiveRoutePlan),
        siteType: effectiveRoutePlan?.siteType ?? null,
        missingRoutes: missingPlannedRoutes.map((route) => route.path),
      });
    }
    const orchestrationContractIssues = collectOrchestrationContractIssues(
      orchestrationContract,
      completeProjectFiles,
    );
    if (orchestrationContractIssues.length > 0) {
      preflightIssues.push(...orchestrationContractIssues);
      devLogAppend("in-progress", {
        type: "orchestration-contract.validate",
        chatId,
        issueCount: orchestrationContractIssues.length,
        issues: orchestrationContractIssues.slice(0, 10),
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
    previewStart = buildPreviewStartContract({
      issues: preflightIssues,
      finalizedPreviewFileCount: finalizedFilesForPreview.length,
    });
  } catch (preflightErr) {
    const message =
      preflightErr instanceof Error
        ? `Finalize preflight crashed: ${preflightErr.message}`
        : "Finalize preflight crashed unexpectedly.";
    console.warn("[preflight] Finalize preflight error:", preflightErr);
    previewBlockingReason = previewBlockingReason ?? message;
    preflightIssues.push(
      createIssue("preflight", "error", message, "code_structure_failure"),
    );
    previewStart = buildPreviewStartContract({
      issues: preflightIssues,
      finalizedPreviewFileCount: finalizedFilesForPreview.length,
    });
    devLogAppend("in-progress", {
      type: "preflight.error",
      chatId,
      message,
    });
  }

  return {
    filesJson: nextFilesJson,
    finalizedFilesForPreview,
    preflightFileCount,
    preflightIssues,
    previewBlockingReason,
    previewStart,
    unresolvedImportFallbackUsed,
  };
}
