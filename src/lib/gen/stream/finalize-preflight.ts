import { buildPreviewHtml } from "@/lib/gen/preview/build-preview-document";
import { parseCodeProject, serializeCodeProject, type CodeFile } from "@/lib/gen/parser";
import { buildCompleteProject } from "@/lib/gen/export/project-scaffold";
import { collectRequiredUiComponents } from "@/lib/gen/export/project-scaffold-ui-reader";

import {
  extractAppRoutePathsFromFilePaths,
  findMissingPlannedRoutes,
  getRoutePlanPrimarySource,
  normalizeRoutePath,
  type PlannedRoute,
  type RoutePlan,
} from "@/lib/gen/route-plan";
import { repairGeneratedFiles } from "@/lib/gen/autofix/repair-generated-files";
import { runAutoFix } from "@/lib/gen/autofix/pipeline";
import { validateAndFix } from "@/lib/gen/autofix/validate-and-fix";
import { FEATURES } from "@/lib/config";
import { runProjectSanityChecks } from "@/lib/gen/validation/project-sanity";
import {
  buildShellPageContent,
  routePathToPageFilePath,
} from "./finalize-preflight/shell-pages";
import { runSeoPreflightChecks } from "@/lib/gen/validation/seo-preflight";
import { findCriticalPlaceholderHits } from "@/lib/gen/eval/checks";
import {
  crossCheckHrefsAgainstRoutes,
  extractHrefsFromFiles,
  formatMismatchMessage,
} from "@/lib/gen/verify/href-route-cross-check";
import { devLogAppend } from "@/lib/logging/devLog";
import type { CanonicalModelId } from "@/lib/models/catalog";
import type { OrchestrationContract } from "@/lib/gen/orchestration-contract";
import type { BuildSpec } from "@/lib/gen/build-spec";
import {
  buildPreviewStartContract,
  resolvePreflightIssueCategory,
  type PreflightIssueCategory,
  type PreviewStartContract,
} from "./preflight-contract";

/**
 * Remove literal route files when a dynamic-segment counterpart exists.
 * E.g. `app/product/id/page.tsx` is removed if `app/product/[id]/page.tsx` exists.
 */
function removeLiteralRouteDuplicates(files: CodeFile[]): CodeFile[] {
  const appPaths = new Set(files.map((f) => f.path.replace(/\\/g, "/")));
  const toRemove = new Set<string>();

  for (const filePath of appPaths) {
    const match = filePath.match(/^((?:src\/)?app\/.+)\/(\w+)\/(page|layout)\.(tsx|jsx|ts|js)$/);
    if (!match) continue;
    const [, parentPath, segment, fileType, ext] = match;
    const dynamicPath = `${parentPath}/[${segment}]/${fileType}.${ext}`;
    if (appPaths.has(dynamicPath)) {
      toRemove.add(filePath);
    }
  }

  if (toRemove.size === 0) return files;
  return files.filter((f) => !toRemove.has(f.path.replace(/\\/g, "/")));
}

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
  buildSpec?: BuildSpec | null;
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

/**
 * Public helper so finalize-version can synthesize preflight issues
 * after the main preflight has already run (e.g. shrink-guard block,
 * placeholder-verifier block). Keeps the category-resolution logic in
 * one place.
 */
export function createFinalizePreflightIssue(
  file: string,
  severity: "error" | "warning",
  message: string,
  category?: PreflightIssueCategory | null,
): FinalizePreflightIssue {
  return createIssue(file, severity, message, category);
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

function ensureDeferredRouteShells(params: {
  files: CodeFile[];
  routePlan: RoutePlan | null | undefined;
  buildSpec: BuildSpec | null | undefined;
}): { files: CodeFile[]; addedPaths: string[] } {
  const { files, routePlan, buildSpec } = params;
  if (!routePlan || !buildSpec) return { files, addedPaths: [] };
  const realization = buildSpec.routeRealization ?? {
    mode: "full" as const,
    primaryRoutePath: routePlan.routes.find((route) => route.required)?.path ?? routePlan.routes[0]?.path ?? "/",
    fullRoutePaths: routePlan.routes.map((route) => route.path),
    shellRoutePaths: [],
  };

  // Post-derive view of effective-init: shell routes only get materialized
  // by build-spec when the original derive call was effective-init. Different
  // invariant than `isEffectiveInit({ generationMode, isFirstCodeGeneration })`
  // — do NOT swap for that helper here.
  const effectiveInit =
    buildSpec.generationMode === "init" ||
    realization.shellRoutePaths.length > 0;

  if (
    !effectiveInit ||
    realization.mode !== "primary-full-with-shells" ||
    realization.shellRoutePaths.length === 0
  ) {
    return { files, addedPaths: [] };
  }

  const nextFiles = [...files];
  const addedPaths: string[] = [];

  for (const shellPath of realization.shellRoutePaths) {
    const route = routePlan.routes.find((candidate) => normalizeRoutePath(candidate.path) === shellPath);
    if (!route) continue;
    const pagePath = routePathToPageFilePath(shellPath);
    const candidatePagePaths = [pagePath, `src/${pagePath}`].map((candidate) => normPath(candidate));
    const shellContent = buildShellPageContent(route);
    let replacedExisting = false;

    for (let index = 0; index < nextFiles.length; index += 1) {
      const normalizedExistingPath = normPath(nextFiles[index]!.path);
      if (!candidatePagePaths.includes(normalizedExistingPath)) continue;
      nextFiles[index] = {
        ...nextFiles[index]!,
        content: shellContent,
        language: "tsx",
      };
      replacedExisting = true;
    }

    if (!replacedExisting) {
      nextFiles.push({
        path: pagePath,
        content: shellContent,
        language: "tsx",
      });
    }
    addedPaths.push(shellPath);
  }

  if (addedPaths.length === 0) return { files, addedPaths: [] };
  return { files: nextFiles, addedPaths };
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
  buildSpec = null,
  routePlan = null,
  orchestrationContract = null,
  originalPrompt: _originalPrompt,
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

    const shellFill = ensureDeferredRouteShells({ files: finalFiles, routePlan, buildSpec });
    finalFiles = shellFill.files;
    if (shellFill.addedPaths.length > 0) {
      nextFilesJson = JSON.stringify(finalFiles);
      devLogAppend("in-progress", {
        type: "route-shells.added",
        chatId,
        paths: shellFill.addedPaths,
      });
    }

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

    const preValidationAutofix = await runAutoFix(mergedProjectContent, { chatId, model: _model });
    if (preValidationAutofix.fixedContent !== mergedProjectContent) {
      mergedProjectContent = preValidationAutofix.fixedContent;
      const reFixedProject = parseCodeProject(mergedProjectContent);
      if (reFixedProject.files.length > 0) {
        finalFiles = reFixedProject.files;
        nextFilesJson = JSON.stringify(finalFiles);
      }
    }

    let mergedSyntax = await validateGeneratedCode(mergedProjectContent);
    if (!mergedSyntax.valid) {
      devLogAppend("in-progress", {
        type: "merged-syntax.invalid",
        chatId,
        errorCount: mergedSyntax.errors.length,
        errors: mergedSyntax.errors.slice(0, 8),
      });

      // Repair-loop hardening C — skip the LLM-fixer escalation when only
      // merged-syntax fails. Stream-syntax already passed (otherwise we
      // would not be here) so merged-only failures are nearly always import
      // re-stiging, comment stripping, or a duplicate export — all cleanly
      // handled by the deterministic mechanical pipeline. Saves 1 (often
      // wasted) LLM-fixer call per follow-up.
      //
      // Default ON (FEATURES.skipDoubleValidateAndFixOnMerge=true). Toggle
      // off via SAJTMASKIN_SKIP_DOUBLE_VALIDATE_AND_FIX_ON_MERGE=false to
      // restore the legacy validateAndFix behaviour during rollback.
      if (FEATURES.skipDoubleValidateAndFixOnMerge) {
        const mechanicalStartedAt = Date.now();
        try {
          const mechanicalResult = await runAutoFix(mergedProjectContent, {
            chatId,
            model: _model,
            previewPolicy: undefined,
          });
          mergedProjectContent = mechanicalResult.fixedContent;
          mergedSyntax = await validateGeneratedCode(mergedProjectContent);
          devLogAppend("in-progress", {
            type: "merged-syntax.mechanical-only.result",
            chatId,
            fixCount: mechanicalResult.fixes.length,
            warningCount: mechanicalResult.warnings.length,
            durationMs: Date.now() - mechanicalStartedAt,
            stillInvalid: !mergedSyntax.valid,
          });
          if (mechanicalResult.fixes.length > 0) {
            const fixedProject = parseCodeProject(mergedProjectContent);
            if (fixedProject.files.length > 0) {
              finalFiles = fixedProject.files;
              nextFilesJson = JSON.stringify(finalFiles);
            }
          }
        } catch (mechErr) {
          console.warn(
            "[merged-syntax] mechanical-only autofix failed, keeping invalid content:",
            mechErr,
          );
          devLogAppend("in-progress", {
            type: "merged-syntax.mechanical-only.error",
            chatId,
            message:
              mechErr instanceof Error ? mechErr.message : "Unknown mechanical autofix error",
          });
        }
      } else {
        const mergedFixResult = await validateAndFix(mergedProjectContent, {
          chatId,
          model: _model,
          resolvedTier,
          fixBudgetMs: 90_000,
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

    try {
      const previewHtml = buildPreviewHtml(finalFiles);
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

    const cleanedFiles = removeLiteralRouteDuplicates(finalFiles);
    if (cleanedFiles.length !== finalFiles.length) {
      finalFiles = cleanedFiles;
      nextFilesJson = JSON.stringify(finalFiles);
      devLogAppend("in-progress", {
        type: "route-literal-duplicates.removed",
        chatId,
      });
    }
    finalizedFilesForPreview = finalFiles;
    const completeProjectFiles = repairGeneratedFiles(
      buildCompleteProject(cleanedFiles, collectRequiredUiComponents(cleanedFiles)),
    ).files;
    // Canonical persistence payload after finalize-preflight:
    // store the complete scaffold-merged + repaired project so downstream
    // preview/bootstrap does not need to rebuild it again.
    nextFilesJson = JSON.stringify(completeProjectFiles);
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

    // Bracket-placeholder guard. If the LLM left scaffold stubs like
    // `[Rubrik som säger ...]`, `[Tjänst 1]`, `[Bransch]`, `[Ort]` in
    // critical files (app/page.tsx, app/layout.tsx) we treat that as a
    // preview-blocking finalize error so the user is not shown a site
    // with visible `[...]` placeholders. Non-critical files get a warning.
    const placeholderHits = findCriticalPlaceholderHits(completeProjectFiles);
    if (placeholderHits.length > 0) {
      for (const hit of placeholderHits) {
        const sample = hit.samples.slice(0, 3).join(", ");
        preflightIssues.push(
          createIssue(
            hit.file,
            "error",
            `Bracket placeholder(s) left in scaffold output (${hit.count} hits): ${sample}`,
            "code_structure_failure",
          ),
        );
      }
      if (!previewBlockingReason) {
        const firstFile = placeholderHits[0]?.file ?? "app/page.tsx";
        previewBlockingReason = `Placeholder-text kvar i ${firstFile} — modellen fyllde inte i scaffoldstubbarna.`;
      }
      devLogAppend("in-progress", {
        type: "placeholder-guard.block",
        chatId,
        hits: placeholderHits.map((entry) => ({
          file: entry.file,
          count: entry.count,
          samples: entry.samples,
        })),
      });
    }

    const actualRoutes = extractAppRoutePathsFromFilePaths(completeProjectFiles.map((file) => file.path));
    const effectiveRoutePlan = routePlan ?? buildContractBackedRoutePlan(orchestrationContract);
    const missingPlannedRoutes = findMissingPlannedRoutes(effectiveRoutePlan, actualRoutes);

    // Deterministic href ↔ actual-route cross-check. Today this only emits
    // non-blocking warnings while we measure false-positive rate; the gate
    // can be flipped to blocking via repairPolicies once the signal proves
    // clean (see docs/plans/active/repair-loop-hardening.md).
    const extractedHrefs = extractHrefsFromFiles(completeProjectFiles);
    const hrefMismatches = crossCheckHrefsAgainstRoutes(extractedHrefs, actualRoutes);
    if (hrefMismatches.length > 0) {
      preflightIssues.push(
        ...hrefMismatches.slice(0, 20).map((mismatch) =>
          createIssue(
            mismatch.file,
            "warning",
            formatMismatchMessage(mismatch),
            "non_blocking_quality_warning",
          )
        ),
      );
      devLogAppend("in-progress", {
        type: "href-route.cross-check",
        chatId,
        mismatchCount: hrefMismatches.length,
        sample: hrefMismatches.slice(0, 5).map((m) => ({
          file: m.file,
          line: m.line,
          basePath: m.basePath,
          suggestion: m.suggestion,
        })),
        actualRouteCount: actualRoutes.length,
      });
    }

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
