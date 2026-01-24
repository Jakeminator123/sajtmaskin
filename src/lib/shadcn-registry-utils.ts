import type { ShadcnRegistryItem } from "@/lib/shadcn-registry-types";

const DEFAULT_STYLE = "new-york";

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
  const trimmed = normalized.startsWith("blocks/") ? normalized.slice("blocks/".length) : normalized;
  return `src/components/blocks/${trimmed}`;
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

export function buildShadcnBlockPrompt(
  item: ShadcnRegistryItem,
  options: { style?: string; displayName?: string; description?: string } = {},
): string {
  const style = options.style ?? DEFAULT_STYLE;
  const blockName = item.name || "block";
  const displayName = options.displayName || blockName;
  const description = options.description || item.description;
  const componentName = `${toPascalCase(blockName)}Block`;

  const lines: string[] = [];
  lines.push(`Add the shadcn/ui block "${displayName}" to the existing site.`);
  if (description) {
    lines.push(`Description: ${description}`);
  }
  lines.push("Do not replace existing pages or layout.");
  lines.push(
    "Add it as a new section on the homepage (`app/page.tsx`) below existing content.",
  );
  lines.push(`Create the block components under \`src/components/blocks/${blockName}/\`.`);
  lines.push("Use these import mappings:");
  lines.push(`- \`@/registry/${style}/ui/*\` -> \`@/components/ui/*\``);
  lines.push(`- \`@/registry/${style}/lib/utils\` -> \`@/lib/utils\``);
  lines.push(`- \`@/registry/${style}/blocks/*\` -> \`@/components/blocks/*\``);
  if (item.registryDependencies?.length) {
    lines.push(`Registry dependencies: ${item.registryDependencies.join(", ")}.`);
  }

  lines.push("Registry files (adapt paths/imports as noted):");
  const files = item.files ?? [];
  files.forEach((file) => {
    const targetPath = mapRegistryFilePath(file.path);
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
  lines.push("- Keep existing content intact; only append the new section and required components.");
  lines.push("- Avoid introducing @v0/* imports.");

  return lines.join("\n\n");
}
