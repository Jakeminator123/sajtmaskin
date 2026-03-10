import type { KBMatch } from "./knowledge-base";

const REGISTRY_ENRICHABLE = new Set([
  "chart",
  "data-table",
  "sidebar",
  "form",
  "carousel",
  "command",
  "calendar",
  "input-otp",
  "table",
]);

const SNIPPET_TO_REGISTRY: Record<string, string[]> = {
  "shadcn-data-group": ["chart", "table"],
  "shadcn-navigation-group": ["sidebar", "command"],
  "shadcn-forms-group": ["form", "calendar", "input-otp"],
  "shadcn-interactive-group": ["carousel"],
  "shadcn-data-table": ["data-table"],
  "shadcn-form": ["form"],
  "shadcn-chart": ["chart"],
  "shadcn-sidebar": ["sidebar"],
};

function extractPropsFromSource(content: string): string {
  const exports = content.match(/export\s+(?:const|function)\s+(\w+)/g) || [];
  const names = exports.map((e) => e.replace(/export\s+(?:const|function)\s+/, ""));
  if (names.length === 0) return "";
  return `Exports: ${names.join(", ")}`;
}

/**
 * Enriches matched KB snippets with live component data from the shadcn registry.
 * Only fetches for complex components where knowing exact props matters.
 */
export async function enrichWithRegistry(
  matchedSnippets: KBMatch[],
): Promise<string> {
  const registryNames = new Set<string>();

  for (const match of matchedSnippets) {
    const mappings = SNIPPET_TO_REGISTRY[match.id];
    if (mappings) {
      for (const name of mappings) registryNames.add(name);
    }
  }

  if (registryNames.size === 0) return "";

  const enrichments: string[] = [];

  for (const name of registryNames) {
    if (!REGISTRY_ENRICHABLE.has(name)) continue;
    try {
      const { fetchRegistryItem } = await import("@/lib/shadcn-registry-service");
      const item = await fetchRegistryItem(name, "new-york-v4");
      if (!item?.files?.length) continue;

      const propsInfo = item.files
        .map((f) => {
          const p = extractPropsFromSource(
            typeof f === "string" ? f : (f as { content?: string }).content ?? "",
          );
          return p || null;
        })
        .filter(Boolean)
        .join("; ");

      const deps = (item as { registryDependencies?: string[] }).registryDependencies;
      const depLine = deps?.length ? `\nDependencies: ${deps.join(", ")}` : "";

      enrichments.push(
        `### ${item.name} (shadcn registry)\n${propsInfo}${depLine}`,
      );
    } catch {
      // Registry unavailable -- skip silently
    }
  }

  return enrichments.length > 0
    ? `## Component Registry Details\n\n${enrichments.join("\n\n")}`
    : "";
}
