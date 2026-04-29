import type {
  ScaffoldFile,
  ScaffoldFilePromptRole,
  ScaffoldFileSerialization,
  ScaffoldManifest,
} from "./types";
import type { BuildSpecContextPolicy } from "../build-spec";
import type { InferredCapabilities } from "../capability-inference";
import type { RoutePlan } from "../route-plan";
import { buildFileContext } from "../context/file-context-builder";

export type ScaffoldSerializeMode = "structural" | "inspirational";

export interface ScaffoldSerializeOptions {
  maxChars?: number;
  contextPolicy?: BuildSpecContextPolicy;
  forceFullDump?: boolean;
  routePlan?: RoutePlan;
  capabilities?: InferredCapabilities;
}

/**
 * Scaffold Contract V2: per-file render policy used by
 * `renderSelectedScaffoldFiles`. Manifest authors can set
 * `role`/`serialization`/`maxPromptChars` on `ScaffoldFile`. When the
 * fields are absent the default policy is derived from the file path
 * via `defaultRoleForPath()` so all 9 existing scaffolds shrink without
 * touching any manifest.
 */
const ROUTE_PAGE_BODY_BUDGET_CHARS = 900;
const EXCERPT_BODY_BUDGET_CHARS = 700;

const PLACEHOLDER_REPLACEMENT_INSTRUCTIONS = [
  "**CRITICAL — Replace ALL placeholders before shipping.**",
  "Bracket placeholders like `[Butiksnamn]`, `[Företagsnamn]`, `[Produktnamn]`, `[Pris]`, `[Kundens namn]`, `[Roll]`, `[Företag]` MUST be replaced with real content derived from the user's prompt.",
  "Template tokens like `{{PRODUCT_NAME}}` MUST be replaced with the actual product/brand name from the brief.",
  "Scaffold sample data (demo person names, `example.com` emails, generic author names like \"Alex\", placeholder stats) should be rewritten to match the user's domain.",
  "Never leave literal brackets, curly-brace tokens, or obvious scaffold boilerplate in the final output.",
].join(" ");

const DEFAULT_LIGHTWEIGHT_SCAFFOLD_CHARS = 10_000;
const INSPIRATIONAL_LAYOUT_FILE_BUDGET_CHARS = 2_400;
const FILE_CONTRACT_HEADER = [
  "The following entries are **FileContract** summaries, not complete source files.",
  "Never copy a FileContract block verbatim into output.",
  "When you emit any listed path, emit a complete valid file that follows the contract.",
].join(" ");

function extractImportLines(content: string): string[] {
  const lines = content.split("\n");
  const importLines: string[] = [];
  let braceDepth = 0;

  for (const line of lines) {
    const isImportStart = /^\s*import\s/.test(line);
    const isFromLine = /^\s*\}?\s*from\s/.test(line);

    if (isImportStart || (importLines.length > 0 && (isFromLine || braceDepth > 0))) {
      importLines.push(line);
      for (const ch of line) {
        if (ch === "{") braceDepth++;
        if (ch === "}") braceDepth = Math.max(0, braceDepth - 1);
      }
    } else if (importLines.length > 0 && line.trim() === "") {
      break;
    } else if (importLines.length > 0) {
      break;
    }
  }
  return importLines;
}

function extractImportBlock(content: string, filePath: string): string {
  const importLines = extractImportLines(content);
  if (importLines.length === 0) return "";
  return `\n\n## Import Reference (from scaffold ${filePath})\n\nEvery generated file MUST include complete imports at the top. Follow this pattern:\n\n\`\`\`tsx\n${importLines.join("\n")}\n\`\`\``;
}

function defaultRoleForPath(path: string): ScaffoldFilePromptRole {
  const norm = path.replace(/\\/g, "/").toLowerCase();
  if (/(^|\/)layout\.tsx$/.test(norm)) return "root-layout";
  if (/(^|\/)globals\.css$/.test(norm)) return "global-styles";
  if (
    /^package\.json$/.test(norm) ||
    /^tailwind\.config\./.test(norm) ||
    /^next\.config\./.test(norm) ||
    /^postcss\.config\./.test(norm)
  ) {
    return "config";
  }
  if (/(^|\/)page\.tsx$/.test(norm)) return "route-page";
  if (/(^|\/)route\.(ts|tsx)$/.test(norm)) return "api-route";
  if (/^(?:src\/)?components\//.test(norm)) return "shared-component";
  return "default";
}

function defaultSerializationForRole(
  role: ScaffoldFilePromptRole,
): ScaffoldFileSerialization {
  switch (role) {
    case "root-layout":
    case "global-styles":
    case "config":
      return "full";
    case "route-page":
      return "excerpt";
    case "shared-component":
    case "api-route":
      return "signature";
    default:
      return "excerpt";
  }
}

function extractTopLevelExports(content: string): string[] {
  const exports = Array.from(
    content.matchAll(
      /^export\s+(?:default\s+)?(?:async\s+)?(?:function|const|let|class|interface|type|enum)\s+([A-Za-z_$][\w$]*)/gm,
    ),
    (match) => match[1],
  );
  return Array.from(new Set(exports)).slice(0, 8);
}

function extractJsxOutline(content: string): string[] {
  const tags = Array.from(
    content.matchAll(/<([A-Z][A-Za-z0-9_.]*|main|section|header|footer|nav|article|aside)\b/g),
    (match) => match[1],
  );
  return Array.from(new Set(tags)).slice(0, 12);
}

function routePathForFile(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  if (normalized === "app/page.tsx" || normalized === "src/app/page.tsx") return "/";
  const match = normalized.match(/^(?:src\/)?app\/(.+)\/page\.tsx$/);
  if (!match) return "(unknown)";
  return `/${match[1].replace(/\[[^\]]+\]/g, ":param")}`;
}

function formatContractList(label: string, values: string[]): string[] {
  if (values.length === 0) return [`- ${label}: (none detected)`];
  return [`- ${label}:`, ...values.map((value) => `  - \`${value}\``)];
}

function buildFileContract(params: {
  file: ScaffoldFile;
  role: ScaffoldFilePromptRole;
  serialization: ScaffoldFileSerialization;
  completeness: "partial-not-executable" | "signature-only";
  ownership: "llm-owned" | "scaffold-owned";
  mustEmit: boolean;
  notes: string[];
}): string {
  const { file, role, serialization, completeness, ownership, mustEmit, notes } = params;
  const importLines = extractImportLines(file.content);
  const exports = extractTopLevelExports(file.content);
  const outline = extractJsxOutline(file.content);
  return [
    `### FileContract: ${file.path}`,
    `- role: ${role}`,
    `- serialization: ${serialization}`,
    `- completeness: ${completeness}`,
    `- ownership: ${ownership}`,
    `- mustEmit: ${mustEmit ? "true" : "false"}`,
    `- sourceChars: ${file.content.length}`,
    ...(role === "route-page" ? [`- routePath: ${routePathForFile(file.path)}`] : []),
    ...formatContractList("imports", importLines),
    ...formatContractList("exports", exports),
    ...formatContractList("structure", outline),
    "- rules:",
    "  - Do not copy this FileContract into generated code.",
    "  - Preserve listed imports/exports unless intentionally replacing the dependency.",
    "  - If you emit this path, return a complete valid file.",
    ...notes.map((note) => `  - ${note}`),
  ].join("\n");
}

function buildSignatureContract(
  file: ScaffoldFile,
  role: ScaffoldFilePromptRole,
  serialization: ScaffoldFileSerialization,
): string {
  return buildFileContract({
    file,
    role,
    serialization,
    completeness: "signature-only",
    ownership: role === "route-page" ? "llm-owned" : "scaffold-owned",
    mustEmit: role === "route-page",
    notes: ["Use this as an interface/shape reference, not as a body template."],
  });
}

function buildExcerptContract(
  file: ScaffoldFile,
  role: ScaffoldFilePromptRole,
  serialization: ScaffoldFileSerialization,
  maxBodyChars: number,
): string {
  return buildFileContract({
    file,
    role,
    serialization,
    completeness: "partial-not-executable",
    ownership: role === "route-page" ? "llm-owned" : "scaffold-owned",
    mustEmit: role === "route-page",
    notes: [
      `Full source body intentionally omitted from prompt (excerpt budget ${maxBodyChars} chars).`,
      "Use the structure list and imports/exports to produce your own complete implementation.",
    ],
  });
}

function resolveFileRenderPolicy(
  file: ScaffoldFile,
): { role: ScaffoldFilePromptRole; serialization: ScaffoldFileSerialization } {
  const role = file.role ?? defaultRoleForPath(file.path);
  const serialization = file.serialization ?? defaultSerializationForRole(role);
  return { role, serialization };
}

function renderScaffoldFileBlock(file: ScaffoldFile): {
  block: string;
  serialization: ScaffoldFileSerialization;
} {
  const { role, serialization } = resolveFileRenderPolicy(file);
  switch (serialization) {
    case "full": {
      const block = `\`\`\`${inferLang(file.path)} file="${file.path}"\n${file.content}\n\`\`\``;
      return { block, serialization };
    }
    case "signature":
      return {
        block: buildSignatureContract(file, role, serialization),
        serialization,
      };
    case "excerpt":
    default: {
      const baseBudget =
        role === "route-page" ? ROUTE_PAGE_BODY_BUDGET_CHARS : EXCERPT_BODY_BUDGET_CHARS;
      const budget =
        typeof file.maxPromptChars === "number" && file.maxPromptChars > 0
          ? file.maxPromptChars
          : baseBudget;
      return {
        block: buildExcerptContract(file, role, serialization, budget),
        serialization,
      };
    }
  }
}

const CRITICAL_PATH_PATTERNS = [
  /^app\/layout\.tsx$/,
  /^src\/app\/layout\.tsx$/,
  /^app\/globals\.css$/,
  /^src\/app\/globals\.css$/,
  /^app\/page\.tsx$/,
  /^src\/app\/page\.tsx$/,
  /^package\.json$/,
  /^tailwind\.config\./,
  /^next\.config\./,
  /^components\//,
  /^src\/components\//,
];

export function serializeScaffoldForPrompt(
  scaffold: ScaffoldManifest,
  mode: ScaffoldSerializeMode = "structural",
  options: ScaffoldSerializeOptions = {},
): string {
  const maxChars = Math.max(4_000, options.maxChars ?? DEFAULT_LIGHTWEIGHT_SCAFFOLD_CHARS);
  const hints = scaffold.promptHints.length > 0
    ? `\n\nScaffold hints:\n${scaffold.promptHints.map((h) => `- ${h}`).join("\n")}`
    : "";
  const traitLines = [
    scaffold.structureProfile ? `- structure_profile: ${scaffold.structureProfile}` : null,
    scaffold.contentProfile ? `- content_profile: ${scaffold.contentProfile}` : null,
    scaffold.siteKind ? `- site_kind: ${scaffold.siteKind}` : null,
    scaffold.complexity ? `- complexity: ${scaffold.complexity}` : null,
    scaffold.features?.length ? `- features: ${scaffold.features.join(", ")}` : null,
  ].filter(Boolean);
  const roleSplit = traitLines.length
    ? `\n\nScaffold role split (important):\n${traitLines.join("\n")}\n- Use structure_profile as the project/file architecture baseline.\n- Use content_profile as direction only; adapt pages and sections to the user request.\n- Never treat one scaffold as the full identity of the final site.`
    : "";

  if (mode === "inspirational") {
    const filePaths = scaffold.files.map((f) => `- ${f.path}`).join("\n");
    // Inspirational mode wants layout + theme files (layout.tsx, globals.css,
    // package.json, components/*) — page.tsx is shown as a separate import
    // example block below. Filter out page.tsx files BEFORE selecting top-N
    // critical, otherwise multi-page scaffolds (app-shell, dashboard) end up
    // with all 4 critical slots taken by page.tsx files and the layout block
    // renders empty.
    const nonPageScaffold = {
      ...scaffold,
      files: scaffold.files.filter(
        (f) => !f.path.endsWith("/page.tsx") && !f.path.endsWith("\\page.tsx"),
      ),
    };
    const layoutAndStyleFiles = selectCriticalScaffoldFiles(
      nonPageScaffold,
      "light",
      options,
    );
    const layoutBlocks = renderSelectedScaffoldFiles(
      layoutAndStyleFiles,
      Math.min(maxChars, INSPIRATIONAL_LAYOUT_FILE_BUDGET_CHARS),
    );

    const pageFile = scaffold.files.find(
      (f) => f.path.endsWith("/page.tsx") || f.path.endsWith("\\page.tsx") || f.path === "app/page.tsx",
    );
    const importExampleBlock = pageFile ? extractImportBlock(pageFile.content, pageFile.path) : "";

    return `## Scaffold: ${scaffold.label} (inspirational mode)\n\n${scaffold.description}${roleSplit}\n\nUse the scaffold's file structure as a flexible starting point, but **create the visual design, layout, and page structure from scratch** to match the user's request. You are not bound by the scaffold's existing section order, number of sections, or layout patterns. **Invent a unique page flow** that fits the user's specific business — a restaurant site should NOT look like a SaaS landing or a consultant portfolio. Vary section types, grid layouts, visual rhythm, and content hierarchy to genuinely reflect the domain.\n\n${PLACEHOLDER_REPLACEMENT_INSTRUCTIONS}\n\nScaffold file paths (create these files with your own implementation):\n${filePaths}\n\n## Layout & Theme Files (adapt these, don't ignore)\n\n${layoutBlocks}\n\n**Page structure (app/page.tsx):** Do NOT copy a generic hero → cards → testimonials → CTA pattern. Instead, choose sections that genuinely serve this specific business. For example: a restaurant might lead with an atmosphere image + reservation CTA, then menu highlights, then location/hours. A creative studio might open with a bold project showcase grid. Let the user's domain drive the section choices.\n\n**IMPORTANT — Color adaptation:** The scaffold's \`@theme inline\` contains starter palette tokens that must be treated as placeholders. You MUST replace them with a vivid, on-theme palette derived from the user's request. Always emit a complete \`app/globals.css\` with adapted colors. If the output still looks default/neutral, you forgot to adapt the colors.${importExampleBlock}${hints}`;
  }

  // `FEATURES.useLightweightScaffoldSerialization` hardcoded ON 2026-04-22 —
  // only `options.forceFullDump` still triggers the heavy dump path.
  if (options.forceFullDump) {
    const ctx = buildFileContext({
      files: scaffold.files.map((f) => ({ path: f.path, content: f.content, language: inferLang(f.path) })),
      maxChars: 4000,
      includeContents: true,
      maxFilesWithContent: 4,
    });

    const fileBlocks = renderScaffoldFiles(scaffold, maxChars);

    return `## Scaffold: ${scaffold.label}\n\n${scaffold.description}${roleSplit}\n\nTreat these scaffold files as a flexible starting point — not a rigid template. Adapt structure, pages, and components freely to match what the user actually asked for. If the user wants two pages, create two pages even if the scaffold only has one. Rewrite scaffold placeholder copy to reflect the user's actual topic, tone, language, and visual identity. Only return files you need to CREATE or MODIFY. Files you omit are kept as-is.\n\n${PLACEHOLDER_REPLACEMENT_INSTRUCTIONS}\n\n**IMPORTANT — Color adaptation:** The scaffold's \`app/globals.css\` starter palette is a baseline, not the final brand palette. You MUST replace it with a vivid, on-theme palette that fits the user's request. Always emit \`app/globals.css\` with adapted \`@theme inline\` color tokens. Default/neutral output means you forgot.\n\n${ctx.summary}\n\n## Scaffold Files\n\n${fileBlocks}${hints}`;
  }

  const contextPolicy = options.contextPolicy ?? "normal";
  const ctx = buildFileContext({
    files: scaffold.files.map((f) => ({ path: f.path, content: f.content, language: inferLang(f.path) })),
    maxChars: Math.min(4_000, Math.max(1_800, Math.round(maxChars * 0.18))),
    includeContents: false,
    maxFilesWithContent: 0,
  });
  const fileTree = buildScaffoldFileTree(scaffold);
  const criticalFiles = selectCriticalScaffoldFiles(scaffold, contextPolicy, options);
  const usedBeforeCritical =
    `## Scaffold: ${scaffold.label}\n\n${scaffold.description}${roleSplit}\n\nTreat this scaffold as a structural baseline, not a rigid template. Adapt structure, pages, and components to match what the user actually asked for. Use the file tree and critical files below as the main scaffold context. Files you omit are kept as-is.\n\n${PLACEHOLDER_REPLACEMENT_INSTRUCTIONS}\n\n**IMPORTANT — Color adaptation:** Replace the scaffold's neutral placeholder palette with a vivid, on-theme palette that fits the user's request. Always emit \`app/globals.css\` with adapted color tokens.\n\n${ctx.summary}\n\n## Scaffold File Tree\n\n${fileTree}\n\n## Critical Scaffold Files\n\n${FILE_CONTRACT_HEADER}\n\nScaffold files are rendered using a per-role policy: \`layout.tsx\`, \`globals.css\`, and config files are complete code fences; \`page.tsx\` becomes a FileContract; shared components and route handlers become FileContracts with imports/exports/signature only.\n\n`;
  const criticalBudget = Math.max(3_000, maxChars - usedBeforeCritical.length - hints.length);
  const criticalBlocks = renderSelectedScaffoldFiles(criticalFiles, criticalBudget);

  return `${usedBeforeCritical}${criticalBlocks}${hints}`;
}

function inferLang(path: string): string {
  if (path.endsWith(".tsx")) return "tsx";
  if (path.endsWith(".ts")) return "ts";
  if (path.endsWith(".css")) return "css";
  if (path.endsWith(".json")) return "json";
  return "text";
}

function scoreCriticalFile(path: string): number {
  const normalized = path.replace(/\\/g, "/");
  const matchedIdx = CRITICAL_PATH_PATTERNS.findIndex((pattern) => pattern.test(normalized));
  if (matchedIdx !== -1) return matchedIdx;
  // Dual-support: both prefixes accepted because LLM-emitted output may be
  // either `app/`- or `src/app/`-rooted (see `validateScaffoldManifest` JSDoc).
  if (normalized.startsWith("app/") || normalized.startsWith("src/app/")) return 20;
  return 50;
}

function routePathToScaffoldNeedle(routePath: string): string | null {
  const normalized = routePath.replace(/^\/+/, "").toLowerCase();
  if (!normalized) return "page";
  const firstSegment = normalized.split("/")[0] ?? "";
  if (!firstSegment) return null;
  return firstSegment;
}

function scoreRouteRelevance(
  path: string,
  routePlan: RoutePlan | undefined,
): number {
  if (!routePlan || routePlan.routes.length === 0) return 0;
  const normalizedPath = path.replace(/\\/g, "/").toLowerCase();
  let score = 0;
  for (const route of routePlan.routes) {
    const needle = routePathToScaffoldNeedle(route.path);
    if (!needle) continue;
    if (needle === "page" && /(^|\/)page\.tsx$/.test(normalizedPath)) {
      score += 2;
      continue;
    }
    if (normalizedPath.includes(`/${needle}/`) || normalizedPath.includes(`/${needle}.`) || normalizedPath.endsWith(`/${needle}`)) {
      score += 4;
    }
  }
  return score;
}

function scoreCapabilityRelevance(
  path: string,
  capabilities: InferredCapabilities | undefined,
): number {
  if (!capabilities) return 0;
  const normalizedPath = path.replace(/\\/g, "/").toLowerCase();
  let score = 0;
  if (capabilities.needsAuth && /(auth|login|signup|register)/.test(normalizedPath)) score += 3;
  if (capabilities.needsEcommerce && /(product|cart|checkout|store|shop)/.test(normalizedPath)) score += 3;
  if (capabilities.needsAppShell && /(dashboard|settings|users|reports|admin)/.test(normalizedPath)) score += 3;
  if (capabilities.needsForms && /(contact|booking|form)/.test(normalizedPath)) score += 2;
  return score;
}

function selectCriticalScaffoldFiles(
  scaffold: ScaffoldManifest,
  contextPolicy: BuildSpecContextPolicy,
  options: ScaffoldSerializeOptions,
): typeof scaffold.files {
  const maxFiles = contextPolicy === "light" ? 4 : 5;
  return [...scaffold.files]
    .sort((a, b) => {
      const aScore =
        scoreCriticalFile(a.path) -
        scoreRouteRelevance(a.path, options.routePlan) -
        scoreCapabilityRelevance(a.path, options.capabilities);
      const bScore =
        scoreCriticalFile(b.path) -
        scoreRouteRelevance(b.path, options.routePlan) -
        scoreCapabilityRelevance(b.path, options.capabilities);
      const scoreDelta = aScore - bScore;
      if (scoreDelta !== 0) return scoreDelta;
      return a.path.localeCompare(b.path);
    })
    .slice(0, maxFiles);
}

function buildScaffoldFileTree(scaffold: ScaffoldManifest): string {
  return scaffold.files.map((file) => `- ${file.path}`).join("\n");
}

function extractExportSummary(content: string): string {
  const exports = Array.from(
    content.matchAll(/\bexport\s+(?:default\s+)?(?:async\s+)?(?:function|const|class|interface|type)\s+([A-Za-z_$][\w$]*)/g),
    (match) => match[1],
  );
  const unique = Array.from(new Set(exports)).slice(0, 6);
  return unique.length > 0 ? `; exports: ${unique.join(", ")}` : "";
}

function renderOmittedScaffoldFiles(
  files: Array<{ path: string; content: string }>,
  reason: "prompt budget" | "length",
): string {
  if (files.length === 0) return "";
  const lines = files.map((file) => (
    `- \`${file.path}\` omitted for ${reason} (${file.content.length} chars${extractExportSummary(file.content)})`
  ));
  return [
    "_Additional scaffold files omitted. Do not infer missing JSX from partial snippets; create complete files from the file paths, imports, and request context._",
    ...lines,
  ].join("\n");
}

function renderSelectedScaffoldFiles(
  files: Array<{ path: string; content: string }>,
  maxChars: number,
): string {
  const blocks: string[] = [];
  let usedChars = 0;

  for (const file of files) {
    const { block } = renderScaffoldFileBlock(file);
    if (usedChars + block.length > maxChars) {
      const omittedSummary = renderOmittedScaffoldFiles(files.slice(files.indexOf(file)), "prompt budget");
      if (omittedSummary) blocks.push(omittedSummary);
      break;
    }
    blocks.push(block);
    usedChars += block.length;
  }

  return blocks.join("\n\n");
}

function renderScaffoldFiles(scaffold: ScaffoldManifest, maxChars = 140_000): string {
  const blocks: string[] = [];
  let usedChars = 0;

  for (const file of scaffold.files) {
    const block = `\`\`\`${inferLang(file.path)} file="${file.path}"\n${file.content}\n\`\`\``;
    if (usedChars + block.length > maxChars) {
      const omittedSummary = renderOmittedScaffoldFiles(scaffold.files.slice(scaffold.files.indexOf(file)), "length");
      if (omittedSummary) blocks.push(omittedSummary);
      break;
    }

    blocks.push(block);
    usedChars += block.length;
  }

  return blocks.join("\n\n");
}
