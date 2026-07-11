import { buildPreviewHtml } from "@/lib/gen/preview/build-preview-document";
import { parseCodeProject, serializeCodeProject, type CodeFile } from "@/lib/gen/parser";
import {
  buildCompleteProject,
  type ProjectEnvLocalOptions,
} from "@/lib/gen/export/project-scaffold";
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
import { capDegeneratePayload, detectDegenerateFiles } from "@/lib/gen/verify/degeneracy-guard";
import { runAutoFix } from "@/lib/gen/autofix/pipeline";
import { RepairLedger, runLlmRepairGate } from "@/lib/gen/autofix/llm-repair-gate";
import { partitionGeneratedFilesForProtectedPaths } from "@/lib/gen/scaffolds/protected-paths";
import { runProjectSanityChecks } from "@/lib/gen/validation/project-sanity";
import {
  buildShellPageContent,
  routePathToPageFilePath,
} from "./finalize-preflight/shell-pages";
import { runSeoPreflightChecks } from "@/lib/gen/validation/seo-preflight";
import { runHydrationPreflightChecks } from "@/lib/gen/validation/hydration-preflight";
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
  repairLedger?: RepairLedger;
  repairScopeId?: string;
  /**
   * Limits the pipeline-authored `.env.local` persisted by the scaffold merge.
   * Preview still builds its runtime env independently.
   */
  projectEnvLocalOptions?: ProjectEnvLocalOptions;
  /**
   * True for verbatim imported-repo edits (v0-template chats). Relaxes ONLY the
   * scaffold-*contract* check (project-sanity) from blocking errors to
   * non-blocking warnings — an arbitrary v0 repo does not conform to the
   * own-engine scaffold contract. Render-safety gates stay blocking for all
   * chats: the composition-aware home-route gate (a dropped/broken page or
   * missing delegated component must still block, not ship blank), merged-syntax,
   * degeneracy, and buildable-preview.
   */
  importedRepoMode?: boolean;
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
 * real branded landing).
 *
 * The measure is composition-aware: a modern App Router home page often
 * delegates its body to a local section/page component
 * (`return <PalmaGuide />`), leaving little inline text in `app/page.tsx`
 * itself. Counting the page file in isolation then mis-flags a perfectly
 * real, content-rich site as "trivial/blank" and forces a manual "Fixa
 * projekt" re-run. `measureComposedHomeRenderedLength` therefore also
 * counts the rendered content of local components that are imported AND
 * rendered as JSX in the page, so a sparse-but-composing page passes while
 * a truly empty `<main />` is still blocked.
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

/**
 * Local (non-package) import sources that may resolve to a generated
 * component file in the same project. Package imports (e.g. `next/link`,
 * `lucide-react`) are ignored because their content does not live in the
 * generated file set.
 *
 * Only `@/` (the alias the generated tsconfig actually configures — see
 * `src/lib/gen/export/project-scaffold.ts`) and relative paths are treated
 * as resolvable. `~/` is intentionally NOT supported: the generated project
 * cannot resolve it at build/preview time, so counting a `~/`-imported
 * component would let a thin home page pass the gate while runtime fails.
 */
const LOCAL_IMPORT_PREFIX = /^(?:\.\.?\/|@\/)/;

type LocalComponentImport = { source: string; exportName: string };

/**
 * Parse local-component imports from a page module, mapping each imported
 * binding name (the identifier used in JSX) to its module source AND the
 * name it is exported under (`"default"` for default imports, the original
 * name for `{ Foo as Bar }`). The export name lets us measure only the
 * rendered component, not unrelated module-level exports/data.
 */
function parseLocalComponentImports(content: string): Map<string, LocalComponentImport> {
  const map = new Map<string, LocalComponentImport>();
  const importRe =
    /import\s+(?:([A-Za-z_$][\w$]*)\s*,?\s*)?(?:\{([^}]*)\})?\s*from\s*["']([^"']+)["']/g;
  let match: RegExpExecArray | null;
  while ((match = importRe.exec(content)) !== null) {
    const [, defaultName, named, source] = match;
    if (!source || !LOCAL_IMPORT_PREFIX.test(source)) continue;
    if (defaultName) map.set(defaultName, { source, exportName: "default" });
    if (named) {
      for (const part of named.split(",")) {
        const trimmed = part.trim();
        if (!trimmed) continue;
        const [original, alias] = trimmed.split(/\s+as\s+/).map((s) => s.trim());
        const binding = alias || original;
        if (binding) map.set(binding, { source, exportName: original });
      }
    }
  }
  return map;
}

function posixDirname(filePath: string): string {
  const norm = filePath.replace(/\\/g, "/");
  const idx = norm.lastIndexOf("/");
  return idx === -1 ? "" : norm.slice(0, idx);
}

function resolveRelativeImport(fromPath: string, relative: string): string {
  const segments = `${posixDirname(fromPath)}/${relative}`.split("/");
  const out: string[] = [];
  for (const segment of segments) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") out.pop();
    else out.push(segment);
  }
  return out.join("/");
}

/**
 * Resolve an import source from `fromPath` to a file in the generated set.
 * Supports the `@/` root alias (with and without a `src/` prefix) plus
 * relative paths, trying common TS/JS extensions and `index` files.
 */
function resolveImportToFile(
  source: string,
  fromPath: string,
  byNorm: Map<string, { path: string; content: string }>,
): { path: string; content: string } | null {
  let base: string;
  if (source.startsWith("@/")) {
    base = source.slice(2);
  } else if (source.startsWith("./") || source.startsWith("../")) {
    base = resolveRelativeImport(fromPath, source);
  } else {
    return null;
  }
  base = base.replace(/^\/+/, "");
  if (!base) return null;
  const exts = [".tsx", ".ts", ".jsx", ".js"];
  const bases = base.startsWith("src/") ? [base] : [base, `src/${base}`];
  const candidates: string[] = [];
  for (const candidateBase of bases) {
    candidates.push(candidateBase);
    for (const ext of exts) candidates.push(`${candidateBase}${ext}`);
    for (const ext of exts) candidates.push(`${candidateBase}/index${ext}`);
  }
  for (const candidate of candidates) {
    const hit = byNorm.get(candidate);
    if (hit) return hit;
  }
  return null;
}

/**
 * Find a balanced `{...}` / `(...)` / `[...]` range starting at the first
 * opening delimiter at or after `fromIndex`. String/template literals are
 * skipped so delimiters inside them do not break the balance. Returns the
 * inclusive `[start, end]` indices, or `null` if none is found.
 */
function findBalancedRange(
  content: string,
  fromIndex: number,
): { start: number; end: number } | null {
  const openers: Record<string, string> = { "{": "}", "(": ")", "[": "]" };
  let start = -1;
  for (let i = fromIndex; i < content.length; i++) {
    if (openers[content[i]]) {
      start = i;
      break;
    }
  }
  if (start === -1) return null;
  const stack: string[] = [];
  let quote: string | null = null;
  for (let i = start; i < content.length; i++) {
    const ch = content[i];
    if (quote) {
      if (ch === "\\") {
        i++;
        continue;
      }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      quote = ch;
      continue;
    }
    if (openers[ch]) {
      stack.push(openers[ch]);
    } else if (ch === "}" || ch === ")" || ch === "]") {
      if (stack.pop() !== ch) return { start, end: i };
      if (stack.length === 0) return { start, end: i };
    }
  }
  // Reached EOF with an open delimiter still on the stack: the input is
  // unbalanced (truncated/malformed). Fail closed rather than returning a
  // span to EOF, which would let unrelated trailing module text inflate the
  // measured component body and slip a thin home route past the gate.
  return null;
}

function captureBalancedBlock(content: string, fromIndex: number): string | null {
  const range = findBalancedRange(content, fromIndex);
  return range ? content.slice(range.start, range.end + 1) : null;
}

/** Capture a function body `{...}`, skipping the parameter list `(...)`. */
function captureFunctionBody(content: string, afterName: number): string | null {
  const params = findBalancedRange(content, afterName);
  const bodyFrom = params ? params.end + 1 : afterName;
  return captureBalancedBlock(content, bodyFrom);
}

/** Capture an arrow function's body (block, parenthesized JSX, or expression). */
function captureAfterArrow(content: string, afterArrow: number): string | null {
  let i = afterArrow;
  while (i < content.length && /\s/.test(content[i])) i++;
  const ch = content[i];
  if (ch === "{" || ch === "(") return captureBalancedBlock(content, i);
  const rest = content.slice(i);
  return rest.split(/;\s*\n|\n\s*\n/)[0] ?? null;
}

/**
 * Extract the source of a specific exported component (`exportName`, or
 * `"default"`) from a module, so we can measure only the rendered component
 * and not unrelated module-level exports/data arrays. Returns `null` when
 * the declaration cannot be located (caller then treats it as no content).
 */
function extractExportedComponentSource(rawContent: string, exportName: string): string | null {
  // Strip comments before delimiter scanning so braces/quotes inside
  // comments (e.g. `/* } */` or `// it's`) cannot confuse the balance
  // matcher and mis-measure the component body.
  const content = rawContent
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");
  let name = exportName;
  if (name === "default") {
    const directFn = /export\s+default\s+(?:async\s+)?function\b/.exec(content);
    if (directFn) {
      const body = captureFunctionBody(content, directFn.index + directFn[0].length);
      return body ? `${directFn[0]} ${body}` : null;
    }
    const directArrow = /export\s+default\s+(?:async\s+)?\([^)]*\)\s*=>/.exec(content);
    if (directArrow) {
      return captureAfterArrow(content, directArrow.index + directArrow[0].length);
    }
    const refDefault = /export\s+default\s+([A-Za-z_$][\w$]*)\s*;?/.exec(content);
    if (refDefault) {
      name = refDefault[1];
    } else {
      return null;
    }
  }
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const fnDecl = new RegExp(`(?:export\\s+)?(?:async\\s+)?function\\s+${escaped}\\b`).exec(content);
  if (fnDecl) {
    const body = captureFunctionBody(content, fnDecl.index + fnDecl[0].length);
    return body ? `${fnDecl[0]} ${body}` : null;
  }
  const constDecl = new RegExp(`(?:export\\s+)?const\\s+${escaped}\\b`).exec(content);
  if (constDecl) {
    const after = constDecl.index + constDecl[0].length;
    const arrowIdx = content.indexOf("=>", after);
    const eqIdx = content.indexOf("=", after);
    if (arrowIdx !== -1) return captureAfterArrow(content, arrowIdx + 2);
    if (eqIdx !== -1) {
      const block = captureBalancedBlock(content, eqIdx + 1);
      return block ?? content.slice(eqIdx + 1).split(/\n\s*\n/)[0] ?? null;
    }
    return null;
  }
  return null;
}

/**
 * Composition-aware home-route content measure. For each local component
 * that is BOTH imported and rendered as JSX in the page, resolve the file
 * and measure ONLY the rendered export's body (not the whole module), so a
 * large unrelated module-level export/data array cannot inflate the count
 * past the gate. One level deep — enough to distinguish a real composed
 * page from an empty `<main />` whose delegated component is also empty.
 */
function measureComposedHomeRenderedLength(
  home: { path: string; content: string },
  files: Array<{ path: string; content: string }>,
): number {
  let total = measureRenderedContentLength(home.content);
  const imports = parseLocalComponentImports(home.content);
  if (imports.size === 0) return total;
  const byNorm = new Map(
    files.map((file) => [file.path.replace(/\\/g, "/"), file]),
  );
  const counted = new Set<string>();
  for (const [name, info] of imports) {
    const renderedAsJsx = new RegExp(`<${name}(?=[\\s/>])`).test(home.content);
    if (!renderedAsJsx) continue;
    const file = resolveImportToFile(info.source, home.path, byNorm);
    if (!file) continue;
    const key = `${file.path.replace(/\\/g, "/")}#${info.exportName}`;
    if (counted.has(key)) continue;
    counted.add(key);
    const exportSource = extractExportedComponentSource(file.content, info.exportName);
    if (!exportSource) continue;
    total += measureRenderedContentLength(exportSource);
  }
  return total;
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
  allFiles?: Array<{ path: string; content: string }>,
): FinalizePreflightIssue | null {
  if (!detected) {
    return createIssue(
      "app/page.tsx",
      "error",
      "Required home route is missing — neither app/page.tsx nor src/app/page.tsx exists in the merged file set. Scaffold defaults are blocked from filling this slot (LLM_ONLY_PATHS); the LLM must emit it.",
      "code_structure_failure",
    );
  }
  const renderedLength = allFiles
    ? measureComposedHomeRenderedLength(detected, allFiles)
    : measureRenderedContentLength(detected.content);
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
  repairLedger?: RepairLedger;
  repairScopeId?: string;
}): Promise<{ files: CodeFile[]; recovered: boolean; attempted: boolean; message?: string }> {
  const detectedHome = findHomePageFile(params.files);
  const homeIssue = buildMissingHomeRouteIssue(detectedHome, params.files);
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
      scopeId: params.repairScopeId,
      phase: "home-route-recovery",
      ledger: params.repairLedger,
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
  | "hydration_preflight"
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
  importedRepoMode?: boolean;
}): FinalizePreflightAllResult {
  const tier2Issues = collectTier2HygieneIssues(params.files);

  const sanity = runProjectSanityChecks(params.files);
  // Imported repos (v0 templates) do not conform to the own-engine scaffold
  // contract, so downgrade project-sanity errors to non-blocking warnings —
  // the VM is the real validator for a verbatim repo edit.
  const sanityIssues = sanity.issues.map((issue) => {
    const downgrade = params.importedRepoMode && issue.severity === "error";
    return createIssue(
      issue.file,
      downgrade ? "warning" : issue.severity,
      issue.message,
      downgrade ? "non_blocking_quality_warning" : issue.category,
    );
  });

  const seoIssues = runSeoPreflightChecks(params.files).map((issue) =>
    createIssue(issue.file || "seo", issue.severity, issue.message, issue.category),
  );

  // Non-deterministic-render (hydration-risk) advisory. Always non-blocking —
  // it never gates preview, only surfaces a concrete message so the user isn't
  // left with an opaque console hydration mismatch. Runs for imported-repo
  // follow-ups too (importedRepoMode does not skip this pass).
  const hydrationIssues = runHydrationPreflightChecks(params.files).map((issue) =>
    createIssue(issue.file, issue.severity, issue.message, issue.category),
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
    { pass: "hydration_preflight", issues: hydrationIssues },
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
}): { files: CodeFile[]; addedPaths: string[]; preservedRealPaths: string[] } {
  const { files, routePlan, buildSpec } = params;
  if (!routePlan || !buildSpec) return { files, addedPaths: [], preservedRealPaths: [] };
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
    return { files, addedPaths: [], preservedRealPaths: [] };
  }

  const nextFiles = [...files];
  const addedPaths: string[] = [];
  const preservedRealPaths: string[] = [];

  for (const shellPath of realization.shellRoutePaths) {
    const route = routePlan.routes.find((candidate) => normalizeRoutePath(candidate.path) === shellPath);
    if (!route) continue;
    const pagePath = routePathToPageFilePath(shellPath);
    const candidatePagePaths = [pagePath, `src/${pagePath}`].map((candidate) => normPath(candidate));
    const shellContent = buildShellPageContent(route);
    let materializedExisting = false;
    let preservedRealExisting = false;

    for (let index = 0; index < nextFiles.length; index += 1) {
      const normalizedExistingPath = normPath(nextFiles[index]!.path);
      if (!candidatePagePaths.includes(normalizedExistingPath)) continue;
      // Add-only guard (P7 fix/autofix-fidelity-guards): a deferred-route
      // shell must never silently overwrite a real, content-rich page the
      // model already emitted for this route. Only materialize the shell over
      // an empty/trivial placeholder (`return null`, empty fragment, `<div/>`,
      // or no visible copy). Real pages are preserved verbatim.
      if (!looksLikeEmptyPage(nextFiles[index]!.content)) {
        preservedRealExisting = true;
        continue;
      }
      nextFiles[index] = {
        ...nextFiles[index]!,
        content: shellContent,
        language: "tsx",
      };
      materializedExisting = true;
    }

    if (materializedExisting) {
      addedPaths.push(shellPath);
      continue;
    }
    if (preservedRealExisting) {
      // A real page already covers this route — leave it untouched.
      preservedRealPaths.push(shellPath);
      continue;
    }
    nextFiles.push({
      path: pagePath,
      content: shellContent,
      language: "tsx",
    });
    addedPaths.push(shellPath);
  }

  if (addedPaths.length === 0) {
    return { files, addedPaths: [], preservedRealPaths };
  }
  return { files: nextFiles, addedPaths, preservedRealPaths };
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
  repairLedger: providedRepairLedger,
  repairScopeId,
  projectEnvLocalOptions,
  importedRepoMode = false,
}: RunFinalizePreflightParams): Promise<RunFinalizePreflightResult> {
  const repairLedger = providedRepairLedger ?? new RepairLedger();
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

    // Early degenerate/oversized-output guard (M#og1). Runs BEFORE the
    // merged-syntax validation + LLM repair escalation and before
    // `buildCompleteProject`, so a multi-MB / self-repetitive project never
    // churns the preflight LLM repair (Codex #322) and the bloat is not
    // persisted whole. The offending file is replaced with a small marker stub
    // and a blocking `code_structure_failure` issue is recorded; the rest of
    // preflight then runs cheaply on the trimmed content, and the issue gates
    // preview-start + verification through the normal preflight contract.
    {
      const degeneracy = detectDegenerateFiles(finalFiles);
      if (degeneracy.degenerate) {
        // Fully de-bloat via capDegeneratePayload (stub ALL oversized files +
        // largest until total is under cap) — not just the single named file —
        // so the total-size / split-bloat case is handled here too and the
        // merged-syntax repair below never runs on bloat (Bugbot #322).
        const capped = capDegeneratePayload(finalFiles, degeneracy.reason);
        finalFiles = capped.files;
        nextFilesJson = JSON.stringify(finalFiles);
        preflightIssues.push(
          createIssue(
            degeneracy.file ?? "preflight",
            "error",
            `Degenerate output blocked: ${degeneracy.reason}`,
            "code_structure_failure",
          ),
        );
        previewBlockingReason =
          previewBlockingReason ?? `Degenerate output blocked: ${degeneracy.reason}`;
        devLogAppend("in-progress", {
          type: "degenerate-output.blocked",
          chatId,
          branch: "pre-assembly",
          file: degeneracy.file,
          reason: degeneracy.reason,
          stubbedPaths: capped.stubbedPaths,
          sizeBytes: degeneracy.sizeBytes,
          repeatedLine: degeneracy.repeatedLine,
          repeatCount: degeneracy.repeatCount,
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
    if (shellFill.preservedRealPaths.length > 0) {
      // Add-only guard fired: the model's real page for a deferred route was
      // kept instead of being overwritten by a generic shell. Loud so the
      // "shell silently replaced my real page" fidelity loss is observable.
      devLogAppend("in-progress", {
        type: "route-shells.preserved-real-page",
        chatId,
        paths: shellFill.preservedRealPaths,
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
      // Inlined unconditionally 2026-04-28 (was hardcoded ON since
      // omtag-04 / 2026-04-23 via FEATURES.skipDoubleValidateAndFixOnMerge).
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
      //
      // Inlined unconditionally 2026-04-28 (was hardcoded ON since omtag-04
      // via FEATURES.escalateMergeSyntaxToLlm).
      if (!mergedSyntax.valid) {
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
            scopeId: repairScopeId,
            phase: "merged-syntax",
            ledger: repairLedger,
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
      repairLedger,
      repairScopeId,
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
    let completeProjectFiles = repairGeneratedFiles(
      buildCompleteProject(
        cleanedFiles,
        collectRequiredUiComponents(cleanedFiles),
        projectEnvLocalOptions,
      ),
    ).files;
    // Final degenerate-payload guard (Codex #322): the ASSEMBLED project — not
    // just the pre-assembly input — is what gets persisted, and finalize can
    // AMPLIFY size (the credential-deck incident: ~84 KB model output → ~4.4 MB
    // files_json). Re-check the assembled set; if degenerate, record a blocking
    // issue and cap the persisted payload (stub the largest files) so a
    // multi-MB files_json is never written and the home/sanity passes below run
    // on the trimmed content.
    {
      const assembledDegeneracy = detectDegenerateFiles(completeProjectFiles);
      if (assembledDegeneracy.degenerate) {
        const capped = capDegeneratePayload(
          completeProjectFiles,
          assembledDegeneracy.reason,
        );
        if (capped.stubbedPaths.length > 0) {
          completeProjectFiles = capped.files;
        }
        const alreadyFlagged = preflightIssues.some((issue) =>
          issue.message.startsWith("Degenerate output blocked"),
        );
        if (!alreadyFlagged) {
          preflightIssues.push(
            createIssue(
              assembledDegeneracy.file ?? "preflight",
              "error",
              `Degenerate output blocked: ${assembledDegeneracy.reason}`,
              "code_structure_failure",
            ),
          );
          previewBlockingReason =
            previewBlockingReason ??
            `Degenerate output blocked: ${assembledDegeneracy.reason}`;
        }
        devLogAppend("in-progress", {
          type: "degenerate-output.blocked",
          chatId,
          branch: "assembled",
          file: assembledDegeneracy.file,
          reason: assembledDegeneracy.reason,
          stubbedPaths: capped.stubbedPaths,
        });
      }
    }
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
    // Home-route gate is a universal render-safety check (composition-aware, so
    // legit deep delegation to PRESENT components passes). It stays BLOCKING even
    // for imported repos — a follow-up that drops/breaks the page or a delegated
    // component must not ship a blank site. Only the scaffold-contract check
    // (project-sanity) is relaxed for imported repos (see runFinalizePreflightAll).
    const homePageGateIssue = buildMissingHomeRouteIssue(
      findHomePageFile(completeProjectFiles),
      completeProjectFiles,
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
      importedRepoMode,
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
