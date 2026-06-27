import type { ShadcnRegistryItem } from "@/lib/shadcn/registry-types";
import {
  getPlacementInstruction,
  type PlacementOption,
} from "@/lib/builder/placement-utils";
import {
  buildShadcnDocsUrl as buildDocsUrlFromRegistry,
  getRegistryBaseUrl,
  resolveRegistryStyle,
} from "@/lib/shadcn/registry-url";

const REGISTRY_BASE_URL = getRegistryBaseUrl();
const DEFAULT_STYLE = resolveRegistryStyle(undefined, REGISTRY_BASE_URL);

function toPascalCase(value: string): string {
  return value
    .split(/[^a-zA-Z0-9]+/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

function getLanguageFromPath(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() || "tsx";
  if (ext === "ts") return "ts";
  if (ext === "tsx") return "tsx";
  if (ext === "js") return "js";
  if (ext === "jsx") return "jsx";
  if (ext === "css") return "css";
  if (ext === "json") return "json";
  return "tsx";
}

function truncateLines(code: string, maxLines: number) {
  const lines = code.split(/\r?\n/);
  if (lines.length <= maxLines) {
    return { text: code, isTruncated: false };
  }
  return {
    text: lines.slice(0, maxLines).join("\n"),
    isTruncated: true,
  };
}

export function rewriteRegistryImports(content: string, style: string = DEFAULT_STYLE): string {
  if (!content) return content;
  const prefix = `@/registry/${style}/`;
  let result = content.replaceAll(`${prefix}lib/utils`, "@/lib/utils");
  result = result.replaceAll(`${prefix}hooks/`, "@/lib/hooks/");
  result = result.replaceAll(prefix, "@/components/");
  return result;
}

export function mapRegistryFilePath(filePath: string): string {
  const normalized = filePath.replace(/^\/+/, "");
  const registryMatch = normalized.match(/^registry\/[^/]+\/(.+)$/);
  const withoutRegistry = registryMatch ? registryMatch[1] : normalized;
  if (withoutRegistry.startsWith("ui/")) {
    return `src/components/ui/${withoutRegistry.slice("ui/".length)}`;
  }
  if (withoutRegistry.startsWith("lib/")) {
    return `src/lib/${withoutRegistry.slice("lib/".length)}`;
  }
  if (withoutRegistry.startsWith("hooks/")) {
    return `src/lib/hooks/${withoutRegistry.slice("hooks/".length)}`;
  }
  if (withoutRegistry.startsWith("components/")) {
    return `src/components/${withoutRegistry.slice("components/".length)}`;
  }
  if (withoutRegistry.startsWith("blocks/")) {
    return `src/components/blocks/${withoutRegistry.slice("blocks/".length)}`;
  }
  return `src/components/blocks/${withoutRegistry}`;
}

export function resolveShadcnPreviewStyle(style?: string): string {
  return resolveRegistryStyle(style, REGISTRY_BASE_URL);
}

export function buildShadcnPreviewUrl(blockName: string, style?: string): string {
  const previewStyle = resolveShadcnPreviewStyle(style);
  return `${REGISTRY_BASE_URL}/view/${previewStyle}/${blockName}`;
}

/** Docs deep-link for a shadcn/ui component slug. */
export function buildShadcnDocsUrl(componentName: string): string {
  return buildDocsUrlFromRegistry(componentName, { baseUrl: REGISTRY_BASE_URL });
}

export function buildRegistryMarkdownPreview(
  item: ShadcnRegistryItem,
  options: { style?: string; maxLines?: number } = {},
): string {
  const style = options.style ?? DEFAULT_STYLE;
  const maxLines = options.maxLines ?? 120;
  const lines: string[] = [];

  lines.push(`# ${item.name || "block"}`);

  if (item.description) {
    lines.push(item.description);
  }

  if (item.registryDependencies?.length) {
    lines.push(`**Dependencies:** ${item.registryDependencies.join(", ")}`);
  }

  const files = item.files ?? [];
  if (files.length > 0) {
    lines.push("## Files");
    files.forEach((file) => {
      const targetPath = mapRegistryFilePath(file.path);
      const language = getLanguageFromPath(file.path);
      const rewritten = rewriteRegistryImports(file.content ?? "", style);
      const { text, isTruncated } = truncateLines(rewritten, maxLines);
      lines.push(`### ${targetPath}`);
      lines.push(`\`\`\`${language}`);
      lines.push(text || "// (empty)");
      if (isTruncated) {
        lines.push("// ... truncated");
      }
      lines.push("```");
    });
  }

  return lines.join("\n\n");
}

import type { DetectedSection } from "@/lib/builder/sectionAnalyzer";

/**
 * Hard ceiling on a single registry add-prompt. The block/component source code
 * IS the payload the model adapts, so we embed it in full whenever possible.
 * Above this size we fall back to a STRUCTURED prompt that still embeds as much
 * real source as fits and marks any dropped file loudly — never a silent
 * "paths only" prompt that forces the model to fabricate (and break) code.
 */
const MAX_PROMPT_CHARS = 60000;

/**
 * Loud, explicit placeholder substituted for a registry file's source when the
 * payload is too large to embed in full. The model must NEVER fabricate the
 * omitted code — silent guessing is what produced broken block insertions.
 */
const OMITTED_CONTENT_MARKER =
  '// CONTENT OMITTED — registry payload exceeded the prompt budget. Do NOT fabricate this file. Recreate it faithfully from the official shadcn/ui registry (same item + style), or skip it rather than guessing.';

interface RegistryFileLike {
  path: string;
  content?: string;
}

/** Render one registry file as prompt markdown (### path + fenced code body). */
function renderRegistryFileBlock(targetPath: string, language: string, body: string): string[] {
  return [`### ${targetPath}`, `\`\`\`${language} filename="${targetPath}"`, body, "```"];
}

/**
 * Build the "registry files" prompt section.
 *
 * - Default (`contentBudget = Infinity`): every file ships its FULL rewritten
 *   source — the normal path, byte-identical to the previous behavior.
 * - Oversized payload (finite budget): files are embedded in full until the
 *   budget is exhausted. The FIRST file is always embedded in full (so we never
 *   emit an all-omitted prompt), and any remaining file is rendered with its
 *   real target path + {@link OMITTED_CONTENT_MARKER} instead of being silently
 *   dropped. Returns the omitted target paths so callers can warn loudly.
 */
function buildRegistryFilesSection(
  files: RegistryFileLike[],
  style: string,
  contentBudget: number = Number.POSITIVE_INFINITY,
): { lines: string[]; omittedPaths: string[] } {
  const lines: string[] = [];
  const omittedPaths: string[] = [];
  const seenTargets = new Set<string>();
  let used = 0;
  for (const file of files) {
    const targetPath = mapRegistryFilePath(file.path);
    if (seenTargets.has(targetPath)) continue;
    seenTargets.add(targetPath);
    const language = getLanguageFromPath(file.path);
    const body = rewriteRegistryImports(file.content ?? "", style) || "// (empty)";
    const cost = targetPath.length + language.length + body.length + 32;
    if (used > 0 && used + cost > contentBudget) {
      omittedPaths.push(targetPath);
      lines.push(...renderRegistryFileBlock(targetPath, language, OMITTED_CONTENT_MARKER));
      continue;
    }
    used += cost;
    lines.push(...renderRegistryFileBlock(targetPath, language, body));
  }
  return { lines, omittedPaths };
}

/**
 * Assemble a final add-prompt from instructional scaffolding + registry files.
 * Embeds full source when it fits under {@link MAX_PROMPT_CHARS}; otherwise
 * keeps ALL scaffolding, embeds as much real source as fits, prepends a loud
 * omission warning, and logs a server-side warning. Never returns a silent
 * paths-only prompt that would force the model to guess missing code.
 */
function assembleRegistryAddPrompt(
  kind: "block" | "component",
  name: string,
  prelude: string[],
  postlude: string[],
  files: RegistryFileLike[],
  style: string,
): string {
  const full = buildRegistryFilesSection(files, style);
  const fullPrompt = [...prelude, ...full.lines, ...postlude].join("\n\n");
  if (fullPrompt.length <= MAX_PROMPT_CHARS) {
    return fullPrompt;
  }

  const overhead = [...prelude, ...postlude].join("\n\n").length + 800;
  const budget = Math.max(MAX_PROMPT_CHARS - overhead, 8000);
  const budgeted = buildRegistryFilesSection(files, style, budget);

  if (budgeted.omittedPaths.length === 0) {
    // Single oversized file (always embedded in full): nothing was dropped, so
    // there is nothing to fabricate — send the complete source rather than a
    // truncated guess, even though the prompt exceeds the soft ceiling.
    return fullPrompt;
  }

  console.warn(
    `[shadcn-prompt] ${kind} "${name}": payload ${fullPrompt.length} chars exceeds ${MAX_PROMPT_CHARS}; embedded ${
      files.length - budgeted.omittedPaths.length
    }/${files.length} file(s) in full, omitted source for: ${budgeted.omittedPaths.join(", ")}.`,
  );

  const warning = `WARNING: this ${kind}'s registry payload was too large to embed in full. ${budgeted.omittedPaths.length} file(s) are marked "CONTENT OMITTED" below (${budgeted.omittedPaths.join(
    ", ",
  )}). Do NOT invent their contents — recreate them faithfully from the official shadcn/ui registry or omit them. Never emit half-written code.`;

  return [warning, ...prelude, ...budgeted.lines, ...postlude].join("\n\n");
}

export function buildShadcnBlockPrompt(
  item: ShadcnRegistryItem,
  options: {
    style?: string;
    displayName?: string;
    description?: string;
    dependencyItems?: ShadcnRegistryItem[];
    placement?: PlacementOption;
    detectedSections?: DetectedSection[];
    /** Names of UI components already present in the v0 project (e.g. ["button","input","dialog"]) */
    existingUiComponents?: string[];
  } = {},
): string {
  const style = options.style ?? DEFAULT_STYLE;
  const blockName = item.name || "block";
  const displayName = options.displayName || blockName;
  const description = options.description || item.description;
  const placement = options.placement ?? "bottom";
  const detectedSections = options.detectedSections;
  const componentName = `${toPascalCase(blockName)}Block`;
  const files = item.files ?? [];

  const prelude: string[] = [];
  prelude.push(`Add the shadcn/ui block "${displayName}" to the existing site.`);
  if (description) {
    prelude.push(`Description: ${description}`);
  }
  // Placement-specific instructions
  if (placement !== "replace-section") {
    prelude.push("Do not replace existing pages or layout. Keep ALL existing content intact.");
  }
  prelude.push(getPlacementInstruction(placement, detectedSections));
  prelude.push(`Create the block components under \`src/components/blocks/${blockName}/\`.`);
  prelude.push("Use these import mappings:");
  prelude.push(`- \`@/registry/${style}/ui/*\` -> \`@/components/ui/*\``);
  prelude.push(`- \`@/registry/${style}/lib/utils\` -> \`@/lib/utils\``);
  prelude.push(`- \`@/registry/${style}/hooks/*\` -> \`@/lib/hooks/*\``);
  prelude.push(`- \`@/registry/${style}/blocks/*\` -> \`@/components/blocks/*\``);
  prelude.push(
    "Do not overwrite existing UI components, but CREATE any missing dependency components.",
  );
  if (item.registryDependencies?.length) {
    prelude.push(`Registry dependencies: ${item.registryDependencies.join(", ")}.`);
    prelude.push("Ensure these dependencies are added to package.json if missing.");
  }
  if (options.existingUiComponents && options.existingUiComponents.length > 0) {
    prelude.push(
      `Existing UI components in the project: ${options.existingUiComponents.join(", ")}.`,
    );
    prelude.push(
      "IMPORTANT: CREATE any dependency component NOT in the list above under src/components/ui/. Do NOT skip missing components — the block will break without them.",
    );
  } else {
    prelude.push(
      "IMPORTANT: Check if each required UI component exists under src/components/ui/. If ANY dependency file is missing, CREATE it with a minimal shadcn/ui implementation. Do NOT assume components exist.",
    );
  }
  prelude.push("Registry files (adapt paths/imports as noted):");

  const postlude: string[] = [];
  postlude.push("## Integration Notes:");
  postlude.push(
    `- If a file is a page component, convert it into a reusable section component (e.g. \`${componentName}\`) instead of creating a new route.`,
  );
  postlude.push(
    "- Keep existing content intact; only append the new section and required components.",
  );
  postlude.push("- Avoid introducing @v0/* imports.");
  postlude.push("## Styling Guidelines:");
  postlude.push("- Use Tailwind CSS for all styling (no inline styles or CSS modules)");
  postlude.push("- Match the existing site's color scheme and design tokens");
  postlude.push("- Ensure responsive design: mobile-first with sm:/md:/lg: breakpoints");
  postlude.push("- Add smooth transitions: transition-all duration-200");
  postlude.push("- Use proper spacing: py-16 md:py-24 for section padding");
  postlude.push("- Maintain visual consistency with existing components");
  postlude.push("- Support dark mode if the site uses it (dark: prefixes)");

  return assembleRegistryAddPrompt("block", blockName, prelude, postlude, files, style);
}

export function buildShadcnComponentPrompt(
  item: ShadcnRegistryItem,
  options: {
    style?: string;
    displayName?: string;
    description?: string;
    dependencyItems?: ShadcnRegistryItem[];
    placement?: PlacementOption;
    detectedSections?: DetectedSection[];
    /** Names of UI components already present in the v0 project (e.g. ["button","input","dialog"]) */
    existingUiComponents?: string[];
  } = {},
): string {
  const style = options.style ?? DEFAULT_STYLE;
  const componentName = item.name || "component";
  const displayName = options.displayName || componentName;
  const description = options.description || item.description;
  const placement = options.placement ?? "bottom";
  const detectedSections = options.detectedSections;
  const pascalName = `${toPascalCase(componentName)}Component`;
  const files = item.files ?? [];

  const prelude: string[] = [];
  prelude.push(`Add the shadcn/ui component "${displayName}" to the project.`);
  if (description) {
    prelude.push(`Description: ${description}`);
  }
  prelude.push("Do not remove or replace existing content.");
  prelude.push("Create or update the component files under `src/components/ui/`.");
  prelude.push("Use these import mappings:");
  prelude.push(`- \`@/registry/${style}/ui/*\` -> \`@/components/ui/*\``);
  prelude.push(`- \`@/registry/${style}/lib/utils\` -> \`@/lib/utils\``);
  prelude.push(`- \`@/registry/${style}/hooks/*\` -> \`@/lib/hooks/*\``);
  prelude.push(`- \`@/registry/${style}/blocks/*\` -> \`@/components/blocks/*\``);
  prelude.push(
    "Do not overwrite existing UI components, but CREATE any missing dependency components.",
  );
  if (item.registryDependencies?.length) {
    prelude.push(`Registry dependencies: ${item.registryDependencies.join(", ")}.`);
    prelude.push("Ensure these dependencies are added to package.json if missing.");
  }
  if (options.existingUiComponents && options.existingUiComponents.length > 0) {
    prelude.push(
      `Existing UI components in the project: ${options.existingUiComponents.join(", ")}.`,
    );
    prelude.push(
      "IMPORTANT: CREATE any dependency component NOT in the list above under src/components/ui/. Do NOT skip missing components.",
    );
  } else {
    prelude.push(
      "IMPORTANT: Check if each required UI component exists under src/components/ui/. If ANY dependency file is missing, CREATE it. Do NOT assume components exist.",
    );
  }
  prelude.push("Registry files (adapt paths/imports as noted):");

  const postlude: string[] = [];
  postlude.push("## Integration Notes:");
  postlude.push(
    `- Add a small demo section to the homepage using \`${pascalName}\` so the component is visible.`,
  );
  postlude.push(getPlacementInstruction(placement, detectedSections));
  postlude.push("- Keep existing content intact; only append the demo section.");
  postlude.push("- Avoid introducing @v0/* imports.");
  postlude.push("## Styling Guidelines:");
  postlude.push("- Use Tailwind CSS for all styling (no inline styles or CSS modules)");
  postlude.push("- Match the existing site's color scheme and design tokens");
  postlude.push("- Ensure responsive design: mobile-first with sm:/md:/lg: breakpoints");
  postlude.push("- Add smooth transitions: transition-all duration-200");
  postlude.push("- Use proper spacing: py-16 md:py-24 for section padding");
  postlude.push("- Maintain visual consistency with existing components");
  postlude.push("- Support dark mode if the site uses it (dark: prefixes)");

  return assembleRegistryAddPrompt("component", componentName, prelude, postlude, files, style);
}
