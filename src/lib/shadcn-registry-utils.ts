import type { ShadcnRegistryItem } from "@/lib/shadcn-registry-types";
import { getRegistryBaseUrl, getRegistryStyle } from "@/lib/v0/v0-url-parser";

const DEFAULT_STYLE = getRegistryStyle();
const REGISTRY_BASE_URL = getRegistryBaseUrl();

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
    return `src/hooks/${withoutRegistry.slice("hooks/".length)}`;
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
  if (!style) return DEFAULT_STYLE;
  if (style.endsWith("-v4")) return style;
  return `${style}-v4`;
}

export function buildShadcnPreviewUrl(blockName: string, style?: string): string {
  const previewStyle = resolveShadcnPreviewStyle(style);
  return `${REGISTRY_BASE_URL}/view/${previewStyle}/${blockName}`;
}

export function buildShadcnPreviewImageUrl(
  blockName: string,
  theme: "light" | "dark",
  style?: string,
): string {
  const previewStyle = resolveShadcnPreviewStyle(style);
  return `${REGISTRY_BASE_URL}/r/styles/${previewStyle}/${blockName}-${theme}.png`;
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

// Placement types (imported from ShadcnBlockPicker)
export type PlacementOption =
  | "top"
  | "bottom"
  | "after-hero"
  | "after-features"
  | "before-footer"
  | "replace-section";

// Get placement instruction text for the prompt
function getPlacementInstruction(placement: PlacementOption): string {
  switch (placement) {
    case "top":
      return "Add it as a NEW SECTION at the VERY TOP of the homepage (`app/page.tsx`), BEFORE all existing content including the hero section.";
    case "after-hero":
      return "Add it as a NEW SECTION on the homepage (`app/page.tsx`) IMMEDIATELY AFTER the hero section. Look for the hero section (usually the first major section with a headline and CTA) and place this component directly after it.";
    case "after-features":
      return "Add it as a NEW SECTION on the homepage (`app/page.tsx`) AFTER the features/benefits section. If there is no features section, place it after the second major section on the page.";
    case "before-footer":
      return "Add it as a NEW SECTION on the homepage (`app/page.tsx`) at the BOTTOM of the page content, just BEFORE the footer. This should be the last content section before any footer component.";
    case "bottom":
      return "Add it as a NEW SECTION on the homepage (`app/page.tsx`) at the very END of the page, after all other content including the footer.";
    case "replace-section":
      return "REPLACE an existing section on the homepage (`app/page.tsx`) with this component. Identify the most similar existing section and replace it entirely.";
    default:
      return "Add it as a new section on the homepage (`app/page.tsx`) below existing content.";
  }
}

export function buildShadcnBlockPrompt(
  item: ShadcnRegistryItem,
  options: {
    style?: string;
    displayName?: string;
    description?: string;
    dependencyItems?: ShadcnRegistryItem[];
    placement?: PlacementOption;
  } = {},
): string {
  const MAX_PROMPT_CHARS = 12000;
  const style = options.style ?? DEFAULT_STYLE;
  const blockName = item.name || "block";
  const displayName = options.displayName || blockName;
  const description = options.description || item.description;
  const placement = options.placement ?? "bottom";
  const componentName = `${toPascalCase(blockName)}Block`;
  const lines: string[] = [];
  lines.push(`Add the shadcn/ui block "${displayName}" to the existing site.`);
  if (description) {
    lines.push(`Description: ${description}`);
  }

  // Placement-specific instructions
  if (placement !== "replace-section") {
    lines.push("Do not replace existing pages or layout. Keep ALL existing content intact.");
  }
  lines.push(getPlacementInstruction(placement));
  lines.push(`Create the block components under \`src/components/blocks/${blockName}/\`.`);
  lines.push("Use these import mappings:");
  lines.push(`- \`@/registry/${style}/ui/*\` -> \`@/components/ui/*\``);
  lines.push(`- \`@/registry/${style}/lib/utils\` -> \`@/lib/utils\``);
  lines.push(`- \`@/registry/${style}/blocks/*\` -> \`@/components/blocks/*\``);
  lines.push(
    "Only create dependency files that are missing; do not overwrite existing UI components.",
  );
  if (item.registryDependencies?.length) {
    lines.push(`Registry dependencies: ${item.registryDependencies.join(", ")}.`);
    lines.push(
      "Assume common shadcn/ui primitives already exist; only add minimal missing pieces.",
    );
  }

  lines.push("Registry files (adapt paths/imports as noted):");
  const files = item.files ?? [];
  const seenTargets = new Set<string>();
  files.forEach((file) => {
    const targetPath = mapRegistryFilePath(file.path);
    if (seenTargets.has(targetPath)) return;
    seenTargets.add(targetPath);
    const language = getLanguageFromPath(file.path);
    const rewritten = rewriteRegistryImports(file.content ?? "", style);
    lines.push(`### ${targetPath}`);
    lines.push(`\`\`\`${language} filename="${targetPath}"`);
    lines.push(rewritten || "// (empty)");
    lines.push("```");
  });

  lines.push("Notes:");
  lines.push(
    `- If a file is a page component, convert it into a reusable section component (e.g. \`${componentName}\`) instead of creating a new route.`,
  );
  lines.push(
    "- Keep existing content intact; only append the new section and required components.",
  );
  lines.push("- Avoid introducing @v0/* imports.");

  const fullPrompt = lines.join("\n\n");
  if (fullPrompt.length <= MAX_PROMPT_CHARS) {
    return fullPrompt;
  }

  const slimLines: string[] = [];
  slimLines.push(`Add the shadcn/ui block "${displayName}" to the existing site.`);
  if (description) {
    slimLines.push(`Description: ${description}`);
  }
  // Placement-specific instructions (slim version)
  if (placement !== "replace-section") {
    slimLines.push("Do not replace existing pages or layout. Keep ALL existing content intact.");
  }
  slimLines.push(getPlacementInstruction(placement));
  slimLines.push(`Create the block components under \`src/components/blocks/${blockName}/\`.`);
  slimLines.push("Use these import mappings:");
  slimLines.push(`- \`@/registry/${style}/ui/*\` -> \`@/components/ui/*\``);
  slimLines.push(`- \`@/registry/${style}/lib/utils\` -> \`@/lib/utils\``);
  slimLines.push(`- \`@/registry/${style}/blocks/*\` -> \`@/components/blocks/*\``);
  if (item.registryDependencies?.length) {
    slimLines.push(`Registry dependencies: ${item.registryDependencies.join(", ")}.`);
    slimLines.push(
      "Assume common shadcn/ui primitives already exist; only add minimal missing pieces.",
    );
  }
  if (files.length > 0) {
    const slimTargets = new Set<string>();
    slimLines.push("Registry files (paths only, content omitted to keep prompt short):");
    files.forEach((file) => {
      const targetPath = mapRegistryFilePath(file.path);
      if (slimTargets.has(targetPath)) return;
      slimTargets.add(targetPath);
      slimLines.push(`- ${targetPath}`);
    });
  }
  slimLines.push("Notes:");
  slimLines.push(
    `- If a file is a page component, convert it into a reusable section component (e.g. \`${componentName}\`) instead of creating a new route.`,
  );
  slimLines.push(
    "- Keep existing content intact; only append the new section and required components.",
  );
  slimLines.push("- Avoid introducing @v0/* imports.");
  slimLines.push("- If any dependency is missing, add the minimal shadcn/ui version.");

  return slimLines.join("\n\n");
}
