import type { ScaffoldManifest } from "./types";
import { FEATURES } from "@/lib/config";
import type { BuildSpecContextPolicy } from "../build-spec";
import { buildFileContext } from "../context/file-context-builder";

const CREATIVE_THEME_KEYWORDS = [
  "retro", "vintage", "western", "cowboy", "vilda västern", "steampunk",
  "cyberpunk", "futuristic", "futuristisk", "neon", "grunge", "gothic",
  "art deco", "art nouveau", "brutalist", "brutalistisk", "psychedelic",
  "vaporwave", "synthwave", "pixel", "8-bit", "glitch", "noir", "film noir",
  "comic", "manga", "anime", "fantasy", "medieval", "medeltida", "pirate",
  "space", "rymd", "underwater", "tropical", "tropisk", "arctic", "arktisk",
  "jungle", "djungel", "djungeln", "vietnam", "desert", "öken", "industrial",
  "industriell", "warehouse", "saloon", "barn", "rustic", "rustik", "bohemian",
  "boho", "hippie", "punk", "rave", "disco", "70-tal", "70-talet", "80-tal",
  "80-talet", "90-tal", "90-talet", "y2k", "militär", "kamouflage", "krig",
  "taktisk",
];

export type ScaffoldSerializeMode = "structural" | "inspirational";

export interface ScaffoldSerializeOptions {
  maxChars?: number;
  contextPolicy?: BuildSpecContextPolicy;
  forceFullDump?: boolean;
}

const PLACEHOLDER_REPLACEMENT_INSTRUCTIONS = [
  "**CRITICAL — Replace ALL placeholders before shipping.**",
  "Bracket placeholders like `[Butiksnamn]`, `[Företagsnamn]`, `[Produktnamn]`, `[Pris]`, `[Kundens namn]`, `[Roll]`, `[Företag]` MUST be replaced with real content derived from the user's prompt.",
  "Template tokens like `{{PRODUCT_NAME}}` MUST be replaced with the actual product/brand name from the brief.",
  "Scaffold sample data (demo person names, `example.com` emails, generic author names like \"Alex\", placeholder stats) should be rewritten to match the user's domain.",
  "Never leave literal brackets, curly-brace tokens, or obvious scaffold boilerplate in the final output.",
].join(" ");

const DEFAULT_LIGHTWEIGHT_SCAFFOLD_CHARS = 20_000;
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

/**
 * Detect whether the prompt describes a creative/unique theme that should
 * use inspirational (lightweight) scaffold injection instead of full files.
 */
const CREATIVE_THEME_STRONG_MIN_LEN = 10;

function escapeCreativeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function matchesCreativeKeyword(text: string, keyword: string): boolean {
  const pattern = new RegExp(
    `(^|[^\\p{L}\\p{N}])${escapeCreativeRegex(keyword)}([^\\p{L}\\p{N}]|$)`,
    "iu",
  );
  return pattern.test(text);
}

export function detectScaffoldMode(prompt: string, styleKeywords?: string[]): ScaffoldSerializeMode {
  const lower = prompt.toLowerCase();
  const kwHits = CREATIVE_THEME_KEYWORDS.filter((kw) => matchesCreativeKeyword(lower, kw));
  const strongPromptHit = kwHits.some((kw) => kw.length >= CREATIVE_THEME_STRONG_MIN_LEN);
  if (strongPromptHit || kwHits.length >= 2) return "inspirational";

  if (styleKeywords && styleKeywords.length > 0) {
    const styleLower = styleKeywords.map((s) => s.toLowerCase());
    const styleHits = CREATIVE_THEME_KEYWORDS.filter((kw) =>
      styleLower.some((s) => matchesCreativeKeyword(s, kw)),
    );
    const strongStyleHit = styleHits.some((kw) => kw.length >= CREATIVE_THEME_STRONG_MIN_LEN);
    if (strongStyleHit || styleHits.length >= 2) return "inspirational";
  }
  return "structural";
}

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
    const criticalFiles = selectCriticalScaffoldFiles(scaffold, "light");
    const criticalBlocks = renderSelectedScaffoldFiles(
      criticalFiles,
      Math.min(maxChars, 10_000),
    );

    return `## Scaffold: ${scaffold.label} (inspirational mode)\n\n${scaffold.description}${roleSplit}\n\nThe user's request describes a unique visual identity. Use the scaffold's file structure as a flexible starting point, but **create the visual design, layout, and page structure from scratch** based on the user's vision. You are not bound by the scaffold's existing layout, component patterns, or number of pages. If the user wants multiple pages, create them freely.\n\n${PLACEHOLDER_REPLACEMENT_INSTRUCTIONS}\n\nScaffold file paths (create these files with your own implementation):\n${filePaths}\n\n## Critical Structure Files (adapt these, don't ignore)\n\n${criticalBlocks}\n\n**IMPORTANT — Color adaptation:** The scaffold's \`@theme inline\` contains starter palette tokens that must be treated as placeholders. You MUST replace them with a vivid, on-theme palette derived from the user's request. Always emit a complete \`app/globals.css\` with adapted colors. If the output still looks default/neutral, you forgot to adapt the colors.${hints}`;
  }

  if (!FEATURES.useLightweightScaffoldSerialization || options.forceFullDump) {
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
  const criticalFiles = selectCriticalScaffoldFiles(scaffold, contextPolicy);
  const usedBeforeCritical =
    `## Scaffold: ${scaffold.label}\n\n${scaffold.description}${roleSplit}\n\nTreat this scaffold as a structural baseline, not a rigid template. Adapt structure, pages, and components to match what the user actually asked for. Use the file tree and critical files below as the main scaffold context. Files you omit are kept as-is.\n\n${PLACEHOLDER_REPLACEMENT_INSTRUCTIONS}\n\n**IMPORTANT — Color adaptation:** Replace the scaffold's neutral placeholder palette with a vivid, on-theme palette that fits the user's request. Always emit \`app/globals.css\` with adapted color tokens.\n\n${ctx.summary}\n\n## Scaffold File Tree\n\n${fileTree}\n\n## Critical Scaffold Files\n\n`;
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
  if (normalized.startsWith("app/") || normalized.startsWith("src/app/")) return 20;
  return 50;
}

function selectCriticalScaffoldFiles(
  scaffold: ScaffoldManifest,
  contextPolicy: BuildSpecContextPolicy,
): typeof scaffold.files {
  const maxFiles = contextPolicy === "light" ? 3 : 4;
  return [...scaffold.files]
    .sort((a, b) => {
      const scoreDelta = scoreCriticalFile(a.path) - scoreCriticalFile(b.path);
      if (scoreDelta !== 0) return scoreDelta;
      return a.path.localeCompare(b.path);
    })
    .slice(0, maxFiles);
}

function buildScaffoldFileTree(scaffold: ScaffoldManifest): string {
  return scaffold.files.map((file) => `- ${file.path}`).join("\n");
}

function renderSelectedScaffoldFiles(
  files: Array<{ path: string; content: string }>,
  maxChars: number,
): string {
  const blocks: string[] = [];
  let usedChars = 0;

  for (const file of files) {
    const block = `\`\`\`${inferLang(file.path)} file="${file.path}"\n${file.content}\n\`\`\``;
    if (usedChars + block.length > maxChars) {
      const remaining = Math.max(0, maxChars - usedChars - 200);
      if (remaining > 200 && usedChars === 0) {
        const truncated = file.content.slice(0, remaining);
        blocks.push(`\`\`\`${inferLang(file.path)} file="${file.path}"\n${truncated}\n// ... truncated\n\`\`\``);
      } else if (blocks.length > 0) {
        blocks.push(`_Additional critical scaffold files omitted for prompt budget: ${files.length - blocks.length}_`);
      }
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
      if (usedChars === 0) {
        const truncated = file.content.substring(0, maxChars - 200);
        blocks.push(`\`\`\`${inferLang(file.path)} file="${file.path}"\n${truncated}\n// ... truncated\n\`\`\``);
        usedChars = maxChars;
      }
      blocks.push(`_Additional scaffold files omitted for length: ${scaffold.files.length - blocks.length}_`);
      break;
    }

    blocks.push(block);
    usedChars += block.length;
  }

  return blocks.join("\n\n");
}
