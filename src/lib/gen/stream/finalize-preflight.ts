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
import { runLlmRepairGate } from "@/lib/gen/autofix/llm-repair-gate";
import { partitionGeneratedFilesForProtectedPaths } from "@/lib/gen/scaffolds/protected-paths";
import { FEATURES } from "@/lib/config";
import { runProjectSanityChecks } from "@/lib/gen/validation/project-sanity";
import {
  buildShellPageContent,
  routePathToPageFilePath,
} from "./finalize-preflight/shell-pages";
import { runSeoPreflightChecks } from "@/lib/gen/validation/seo-preflight";
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

/**
 * Plan 11 / open-question #5 hard gate: the user-visible Home route must
 * always exist with non-trivial content after preflight assembly.
 *
 * `LLM_ONLY_PATHS` in `finalize-merge.ts` deliberately strips
 * `app/page.tsx` from the scaffold base so the LLM is forced to emit a
 * branded version; without a safety net here, an LLM that forgets the
 * file ships a 6-file project with an empty `<main>` to disk (Run A +
 * Run B in `STATUS-INVESTIGATE-PAGETSX-LOSS.md`). We block persist with
 * `code_structure_failure` instead of letting that happen silently.
 *
 * "Non-trivial" = > 200 chars of rendered content body after stripping
 * imports, exports, and JSX braces. Picked empirically from observed
 * "blank" pages (~80–120 chars of import + skeleton vs ~600+ for any
 * real branded landing) so a sparse but real page (e.g. `<Hero />`-
 * only) still passes.
 */
const HOME_PAGE_MIN_RENDERED_CHARS = 200;
const HOME_PAGE_REQUIRED_PATHS = ["app/page.tsx", "src/app/page.tsx"] as const;

function measureRenderedContentLength(content: string): number {
  // Strip imports/exports + obvious whitespace so a 60-line file of
  // imports + a `return null` doesn't count as "content".
  const stripped = content
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "")
    .replace(/^\s*import[^;]*;?\s*$/gm, "")
    .replace(/^\s*export\s+(?:default\s+)?(?:async\s+)?(?:function|const|let|var)\s/gm, "")
    .replace(/[{}();,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return stripped.length;
}

function findHomePageFile(
  files: Array<{ path: string; content: string }>,
): { path: string; content: string } | null {
  const wantsNorm = new Set<string>(HOME_PAGE_REQUIRED_PATHS);
  for (const file of files) {
    const norm = file.path.replace(/\\/g, "/");
    if (wantsNorm.has(norm)) return { path: norm, content: file.content };
  }
  return null;
}

function buildMissingHomeRouteIssue(
  detected: { path: string; content: string } | null,
): FinalizePreflightIssue | null {
  if (!detected) {
    return createIssue(
      "app/page.tsx",
      "error",
      "Required home route is missing — neither app/page.tsx nor src/app/page.tsx exists in the merged file set. Scaffold defaults are blocked from filling this slot (LLM_ONLY_PATHS); the LLM must emit it.",
      "code_structure_failure",
    );
  }
  const renderedLength = measureRenderedContentLength(detected.content);
  if (renderedLength < HOME_PAGE_MIN_RENDERED_CHARS) {
    return createIssue(
      detected.path,
      "error",
      `Home route renders trivial content (≈${renderedLength} chars after stripping imports/JSX braces; threshold ${HOME_PAGE_MIN_RENDERED_CHARS}). Likely empty <main> or skeleton-only output. Block persist instead of shipping a blank site.`,
      "code_structure_failure",
    );
  }
  return null;
}

function normPath(p: string): string {
  return p.replace(/\\/g, "/");
}

const HOME_ROUTE_RECOVERY_PATH = "app/page.tsx";
const HOME_ROUTE_RECOVERY_TIMEOUT_MS = 60_000;

function formatRoutePlanForHomeRecovery(routePlan: RoutePlan | null | undefined): string {
  if (!routePlan || routePlan.routes.length === 0) return "Route plan: unavailable";
  const routes = routePlan.routes
    .slice(0, 8)
    .map((route) => {
      const required = route.required ? "required" : "optional";
      return `${route.path} (${route.name}; ${required}) — ${route.intent}`;
    })
    .join("; ");
  return `Route plan: siteType=${routePlan.siteType}; routes=${routes}`;
}

function formatBuildSpecForHomeRecovery(buildSpec: BuildSpec | null | undefined): string {
  if (!buildSpec) return "Build spec: unavailable";
  return [
    `Build spec: intent=${buildSpec.buildIntent}`,
    `mode=${buildSpec.generationMode}`,
    `scaffoldId=${buildSpec.scaffoldId ?? "unknown"}`,
    `stylePack=${buildSpec.stylePack}`,
    `qualityTarget=${buildSpec.qualityTarget}`,
    `routePlanSummary=${buildSpec.routePlanSummary}`,
  ].join("; ");
}

function summarizeFilesForHomeRecovery(files: CodeFile[]): string {
  const paths = files.map((file) => normPath(file.path)).sort();
  const sample = paths.slice(0, 24).join(", ");
  return `Existing generated files (${paths.length}): ${sample}${paths.length > 24 ? ", ..." : ""}`;
}

async function tryRecoverMissingHomeRoute(params: {
  chatId: string;
  resolvedTier?: CanonicalModelId;
  files: CodeFile[];
  originalPrompt?: string;
  buildSpec: BuildSpec | null | undefined;
  routePlan: RoutePlan | null | undefined;
}): Promise<{ files: CodeFile[]; recovered: boolean; attempted: boolean; message?: string }> {
  const detectedHome = findHomePageFile(params.files);
  const homeIssue = buildMissingHomeRouteIssue(detectedHome);
  if (!homeIssue) {
    return { files: params.files, recovered: false, attempted: false };
  }

  const content = serializeCodeProject(params.files);
  const errors = [
    `${HOME_ROUTE_RECOVERY_PATH}:1:1 CRITICAL: ${homeIssue.message}`,
    `Create or replace ${HOME_ROUTE_RECOVERY_PATH} with a complete Next.js App Router page. The scaffold default is blocked by LLM_ONLY_PATHS and must not be used as a silent fallback.`,
    "The recovered page must be a real branded startsida with hero, CTA, and relevant sections; never return an empty, trivial, placeholder, or skeleton-only page.",
    `Original prompt / brief: ${params.originalPrompt?.trim() || "unavailable"}`,
    formatBuildSpecForHomeRecovery(params.buildSpec),
    formatRoutePlanForHomeRecovery(params.routePlan),
    summarizeFilesForHomeRecovery(params.files),
  ];

  try {
    const repairGate = await runLlmRepairGate({
      content,
      errors,
      chatId: params.chatId,
      timeoutMs: HOME_ROUTE_RECOVERY_TIMEOUT_MS,
      requiredFiles: [HOME_ROUTE_RECOVERY_PATH],
      resolvedTier: params.resolvedTier,
    });
    const repairResult = repairGate.result;
    if (!repairResult.success || typeof repairResult.fixedContent !== "string") {
      return {
        files: params.files,
        recovered: false,
        attempted: true,
        message:
          repairResult.missingFiles?.length
            ? `missing required files: ${repairResult.missingFiles.join(", ")}`
            : "repair gate did not return a successful app/page.tsx",
      };
    }

    const recoveredProject = parseCodeProject(repairResult.fixedContent);
    const protectedPartition =
      partitionGeneratedFilesForProtectedPaths(recoveredProject.files);
    const recoveredFiles = protectedPartition.kept;
    if (protectedPartition.dropped.length > 0) {
      const droppedPaths = protectedPartition.dropped.map((file) => file.path);
      devLogAppend("in-progress", {
        type: "scaffold-protected-overwrite-blocked",
        chatId: params.chatId,
        branch: "home-route-recovery",
        droppedPaths,
      });
    }
    const recoveredHome = findHomePageFile(recoveredFiles);
    if (!recoveredHome || normPath(recoveredHome.path) !== HOME_ROUTE_RECOVERY_PATH) {
      return {
        files: params.files,
        recovered: false,
        attempted: true,
        message: "repair gate output did not include app/page.tsx",
      };
    }

    return { files: recoveredFiles, recovered: true, attempted: true };
  } catch (error) {
    return {
      files: params.files,
      recovered: false,
      attempted: true,
      message: error instanceof Error ? error.message : "unknown home route recovery error",
    };
  }
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

function describePreviewBlockFromIssues(
  issues: FinalizePreflightIssue[],
): string | null {
  const blockingIssue = issues.find(
    (issue) => issue.severity === "error" && issue.category !== "non_blocking_quality_warning",
  );
  if (!blockingIssue) return null;
  return `Automatic preflight blocked preview: ${blockingIssue.file}: ${blockingIssue.message}`;
}

type FinalizePreflightPassId =
  | "tier2_hygiene"
  | "project_sanity"
  | "seo_preflight"
  | "href_route_cross_check";

type FinalizePreflightPassResult = {
  pass: FinalizePreflightPassId;
  issues: FinalizePreflightIssue[];
};

type FinalizePreflightAllResult = {
  issues: FinalizePreflightIssue[];
  passes: FinalizePreflightPassResult[];
  unresolvedImportFallbackUsed: boolean;
  sanityValid: boolean;
  sanityIssuesForLog: ReturnType<typeof runProjectSanityChecks>["issues"];
  hrefMismatches: ReturnType<typeof crossCheckHrefsAgainstRoutes>;
};

function runFinalizePreflightAll(params: {
  files: CodeFile[];
  actualRoutes: string[];
}): FinalizePreflightAllResult {
  const tier2Issues = collectTier2HygieneIssues(params.files);

  const sanity = runProjectSanityChecks(params.files);
  const sanityIssues = sanity.issues.map((issue) =>
    createIssue(issue.file, issue.severity, issue.message, issue.category),
  );

  const seoIssues = runSeoPreflightChecks(params.files).map((issue) =>
    createIssue(issue.file || "seo", issue.severity, issue.message, issue.category),
  );

  const extractedHrefs = extractHrefsFromFiles(params.files);
  const hrefMismatches = crossCheckHrefsAgainstRoutes(extractedHrefs, params.actualRoutes);
  const hrefIssues = hrefMismatches.slice(0, 20).map((mismatch) =>
    createIssue(
      mismatch.file,
      "warning",
      formatMismatchMessage(mismatch),
      "non_blocking_quality_warning",
    ),
  );

  const passes: FinalizePreflightPassResult[] = [
    { pass: "tier2_hygiene", issues: tier2Issues },
    { pass: "project_sanity", issues: sanityIssues },
    { pass: "seo_preflight", issues: seoIssues },
    { pass: "href_route_cross_check", issues: hrefIssues },
  ];

  return {
    issues: passes.flatMap((pass) => pass.issues),
    passes,
    unresolvedImportFallbackUsed: sanity.unresolvedImportFallbackUsed,
    sanityValid: sanity.valid,
    sanityIssuesForLog: sanity.issues,
    hrefMismatches,
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
  resolvedTier: _resolvedTier,
  filesJson,
  buildSpec = null,
  routePlan = null,
  orchestrationContract = null,
  originalPrompt: _originalPrompt,
}: RunFinalizePreflightParams): Promise<RunFinalizePreflightResult> {
  let nextFilesJson = filesJson;
  const preflightIssues: FinalizePreflightIssue[] = [];
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

    // GUARD 0 — last-line defence for SCAFFOLD_PROTECTED_PATHS.
    //
    // `mergeGeneratedProjectFiles` (upstream of this function) already
    // partitions LLM-broken protected paths out of `generatedFiles` before
    // merging with the scaffold base. Empirically (eval restaurant /
    // booking-service / multi-page-brochure / consultant-landing
    // 2026-04-27) we still see broken `app/api/placeholder/route.ts`
    // arriving here, which means *some* upstream code path either
    //   (a) bypasses partitionGeneratedFilesForProtectedPaths in merge, or
    //   (b) re-introduces the LLM emission between merge and preflight.
    //
    // Until that source is pinned, run partition once on the parsed
    // input. `buildCompleteProject` lower in this function injects the
    // scaffold default for any path that ends up missing, so dropping
    // is safe — we will never persist a route.ts without route.ts.
    {
      const partition = partitionGeneratedFilesForProtectedPaths(finalFiles);
      if (partition.dropped.length > 0) {
        const droppedPaths = partition.dropped.map((f) => f.path);
        finalFiles = partition.kept;
        nextFilesJson = JSON.stringify(finalFiles);
        console.warn(
          "[finalize-preflight] Initial post-merge files contained scaffold-protected paths — dropped to keep scaffold default",
          { chatId, droppedPaths },
        );
        devLogAppend("in-progress", {
          type: "scaffold-protected-overwrite-blocked",
          chatId,
          branch: "post-merge-initial-parse",
          droppedPaths,
        });
      }
    }

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
      // Hardcoded ON (FEATURES.skipDoubleValidateAndFixOnMerge=true) since
      // omtag-04 (2026-04-23). Revert via code if the legacy validateAndFix
      // behaviour is ever needed again.
      if (!FEATURES.skipDoubleValidateAndFixOnMerge) {
        devLogAppend("in-progress", {
          type: "merged-syntax.mechanical-only.unexpected-flag-state",
          chatId,
          skipDoubleValidateAndFixOnMerge: FEATURES.skipDoubleValidateAndFixOnMerge,
        });
      }
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
            // Belt-and-braces: mechanical autofix is deterministic and
            // unlikely to (re)emit `app/api/placeholder/route.ts`, but
            // mirror the post-LLM-escalation guard so any future fixer
            // that does mutate the project payload cannot bypass
            // SCAFFOLD_PROTECTED_PATHS via this code path.
            const partition =
              partitionGeneratedFilesForProtectedPaths(fixedProject.files);
            finalFiles = partition.kept;
            if (partition.dropped.length > 0) {
              const droppedPaths = partition.dropped.map((f) => f.path);
              mergedProjectContent = serializeCodeProject(finalFiles);
              mergedSyntax = await validateGeneratedCode(mergedProjectContent);
              console.warn(
                "[finalize-preflight] Mechanical autofix output contained scaffold-protected paths — dropped to keep scaffold default",
                { chatId, droppedPaths },
              );
              devLogAppend("in-progress", {
                type: "scaffold-protected-overwrite-blocked",
                chatId,
                branch: "post-merge-mechanical",
                droppedPaths,
              });
            }
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

      // Escalate to LLM repair whenever merged syntax is still invalid after
      // the mechanical pass. Previous version required mechanicalFixCount === 0
      // which (a) missed the throw case (count stays null) and (b) silently
      // skipped escalation when mechanical applied unrelated fixes (e.g. an
      // import) but the underlying brace/parse error remained. The failure
      // mode that motivated this gate (the v2/flying-can `Unexpected "}"`)
      // happens precisely when mechanical can't see the brace context.
      if (!mergedSyntax.valid && FEATURES.escalateMergeSyntaxToLlm) {
        const errorsBefore = mergedSyntax.errors.length;
        const requiredFiles = [
          ...new Set(
            mergedSyntax.errors
              .map((error) => error.file)
              .filter((file): file is string => Boolean(file)),
          ),
        ];
        try {
          const repairGate = await runLlmRepairGate({
            content: mergedProjectContent,
            errors: mergedSyntax.errors.map(
              (error) => `${error.file}:${error.line}:${error.column} ${error.message}`,
            ),
            chatId,
            timeoutMs: 60_000,
            ...(requiredFiles.length > 0 ? { requiredFiles } : {}),
          });
          const repairResult = repairGate.result;
          let errorsAfter = errorsBefore;
          let fixed = false;
          if (
            (repairResult.success || repairResult.partial) &&
            typeof repairResult.fixedContent === "string"
          ) {
            const llmValidation = await validateGeneratedCode(repairResult.fixedContent);
            errorsAfter = llmValidation.errors.length;
            if (llmValidation.valid || errorsAfter < errorsBefore) {
              mergedProjectContent = repairResult.fixedContent;
              mergedSyntax = llmValidation;
              const repairedProject = parseCodeProject(mergedProjectContent);
              // Block the post-merge LLM-escalation bypass of
              // SCAFFOLD_PROTECTED_PATHS: runLlmRepairGate is given the
              // merged project (which contains the canonical scaffold
              // version of protected paths after finalize-merge's
              // partition) and can re-emit broken JSX-in-`.ts` versions
              // while fixing unrelated syntax errors. Drop those LLM
              // emissions; `buildCompleteProject` lower in this function
              // re-injects the scaffold default for any path that's
              // missing afterwards.
              const partition =
                partitionGeneratedFilesForProtectedPaths(repairedProject.files);
              finalFiles = partition.kept;
              if (partition.dropped.length > 0) {
                const droppedPaths = partition.dropped.map((f) => f.path);
                mergedProjectContent = serializeCodeProject(finalFiles);
                mergedSyntax = await validateGeneratedCode(mergedProjectContent);
                errorsAfter = mergedSyntax.errors.length;
                console.warn(
                  "[finalize-preflight] LLM-escalation re-emitted scaffold-protected paths — dropped to keep scaffold default",
                  { chatId, droppedPaths },
                );
                devLogAppend("in-progress", {
                  type: "scaffold-protected-overwrite-blocked",
                  chatId,
                  branch: "post-merge-llm-escalation",
                  droppedPaths,
                });
              }
              nextFilesJson = JSON.stringify(finalFiles);
              fixed = true;
            }
          }
          devLogAppend("in-progress", {
            type: "merged-syntax.llm-escalation",
            chatId,
            errorsBefore,
            errorsAfter,
            fixed,
          });
        } catch (llmErr) {
          devLogAppend("in-progress", {
            type: "merged-syntax.llm-escalation.error",
            chatId,
            message: llmErr instanceof Error ? llmErr.message : "Unknown LLM escalation error",
          });
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

    const homeRecovery = await tryRecoverMissingHomeRoute({
      chatId,
      resolvedTier: _resolvedTier,
      files: finalFiles,
      originalPrompt: _originalPrompt,
      buildSpec,
      routePlan,
    });
    if (homeRecovery.attempted) {
      if (homeRecovery.recovered) {
        finalFiles = homeRecovery.files;
        nextFilesJson = JSON.stringify(finalFiles);
        mergedProjectContent = serializeCodeProject(
          finalFiles.map((file) => ({
            ...file,
            language: file.language || inferCodeFenceLanguage(file.path),
          })),
        );
        mergedSyntax = await validateGeneratedCode(mergedProjectContent);
        devLogAppend("in-progress", {
          type: "home-route-recovery.succeeded",
          chatId,
          path: HOME_ROUTE_RECOVERY_PATH,
          fileCount: finalFiles.length,
          syntaxValid: mergedSyntax.valid,
        });
        if (!mergedSyntax.valid) {
          preflightIssues.push(
            ...mergedSyntax.errors.slice(0, 20).map((error) =>
              createIssue(
                error.file,
                "error",
                `Home route recovery produced syntax error line ${error.line}:${error.column} — ${error.message}`,
                "code_structure_failure",
              )
            ),
          );
        }
      } else {
        devLogAppend("in-progress", {
          type: "home-route-recovery.failed",
          chatId,
          path: HOME_ROUTE_RECOVERY_PATH,
          message: homeRecovery.message ?? "unknown failure",
        });
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

    // Plan 11 / open-question #5: hard gate on missing or trivial home
    // route AFTER scaffold + UI-component assembly. This must fire even
    // if `LLM_ONLY_PATHS` already emitted `missingEmittedEssentials`
    // upstream because the user's complaint is "blank promoted site",
    // and the only way that can happen is if `completeProjectFiles`
    // reaches persist without a renderable Home route.
    const homePageGateIssue = buildMissingHomeRouteIssue(
      findHomePageFile(completeProjectFiles),
    );
    if (homePageGateIssue) {
      preflightIssues.push(homePageGateIssue);
      devLogAppend("in-progress", {
        type: "preflight.home-route.blocked",
        chatId,
        file: homePageGateIssue.file,
        message: homePageGateIssue.message,
        completeProjectFileCount: completeProjectFiles.length,
      });
    }

    // Plan 11 / Bug 1·2 — count-parity assertion. Historic 26-vs-6
    // drift (commit 7a6a6d589) had `preflightFileCount` reporting the
    // assembled count while `nextFilesJson` still pointed at the
    // pre-assembly array. The fix landed but there is no invariant
    // guarding against future regressions. Now: if
    // `JSON.parse(nextFilesJson).length !== preflightFileCount`,
    // emit a hard error and let the caller block persist in strict mode.
    let persistedFileCount: number | null = null;
    try {
      const persistedParsed = JSON.parse(nextFilesJson) as unknown;
      if (Array.isArray(persistedParsed)) {
        persistedFileCount = persistedParsed.length;
      }
    } catch {
      persistedFileCount = null;
    }
    if (
      persistedFileCount !== null &&
      persistedFileCount !== preflightFileCount
    ) {
      const message = `Preflight file count drift: counted ${preflightFileCount} files but nextFilesJson serializes ${persistedFileCount}. Refusing silent persist (plan 11 / count parity invariant).`;
      preflightIssues.push(
        createIssue(
          "preflight",
          "error",
          message,
          "code_structure_failure",
        ),
      );
      devLogAppend("in-progress", {
        type: "preflight.count-parity.failed",
        chatId,
        preflightFileCount,
        persistedFileCount,
      });
    }
    devLogAppend("in-progress", {
      type: "preflight.summary",
      chatId,
      filesChecked: preflightFileCount,
      persistedFilesCount: persistedFileCount,
      hasHomeRouteBlock: Boolean(homePageGateIssue),
    });
    const actualRoutes = extractAppRoutePathsFromFilePaths(
      completeProjectFiles.map((file) => file.path),
    );
    const preflightAll = runFinalizePreflightAll({
      files: completeProjectFiles,
      actualRoutes,
    });
    preflightIssues.push(...preflightAll.issues);
    if (preflightAll.unresolvedImportFallbackUsed) {
      unresolvedImportFallbackUsed = true;
    }

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

    const effectiveRoutePlan = routePlan ?? buildContractBackedRoutePlan(orchestrationContract);
    const missingPlannedRoutes = findMissingPlannedRoutes(effectiveRoutePlan, actualRoutes);

    // Deterministic href ↔ actual-route cross-check. Today this only emits
    // non-blocking warnings while we measure false-positive rate; the gate
    // can be flipped to blocking via repairPolicies once the signal proves
    // clean (see docs/plans/active/repair-loop-hardening.md).
    const hrefMismatches = preflightAll.hrefMismatches;
    if (hrefMismatches.length > 0) {
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
    if (preflightAll.sanityIssuesForLog.length > 0) {
      devLogAppend("in-progress", {
        type: "project-sanity",
        chatId,
        valid: preflightAll.sanityValid,
        issues: preflightAll.sanityIssuesForLog.slice(0, 20),
        completeProjectFiles: completeProjectFiles.length,
      });
    }
    previewStart = buildPreviewStartContract({
      issues: preflightIssues,
      finalizedPreviewFileCount: finalizedFilesForPreview.length,
    });
    if (!previewStart.canStartPreview) {
      previewBlockingReason =
        previewBlockingReason ?? describePreviewBlockFromIssues(preflightIssues);
    }
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
