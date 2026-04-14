/**
 * Sync shadcn component examples from the official registry.
 *
 * Fetches example items from ui.shadcn.com/r/ and saves them as compact
 * JSON files in data/shadcn-examples/. These are used at generation time
 * to give the LLM verified usage patterns for relevant components.
 *
 * Usage: npx tsx scripts/shadcn/sync-shadcn-examples.ts
 */

import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const REGISTRY_BASE = "https://ui.shadcn.com/r/styles/new-york-v4";
const OUTPUT_DIR = join(process.cwd(), "data", "shadcn-examples");

const EXAMPLES_TO_FETCH = [
  "calendar-demo",
  "date-picker-demo",
  "date-picker-with-range",
  "combobox-demo",
  "command-demo",
  "carousel-demo",
  "chart-bar-default",
  "chart-area-default",
  "input-form",
  "sidebar-07",
  "data-table-demo",
];

interface RegistryFile {
  path: string;
  content?: string;
  type: string;
}

interface RegistryItem {
  name: string;
  type: string;
  title?: string;
  description?: string;
  dependencies?: string[];
  registryDependencies?: string[];
  files?: RegistryFile[];
}

async function fetchExample(name: string): Promise<RegistryItem | null> {
  const url = `${REGISTRY_BASE}/${name}.json`;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.warn(`  [skip] ${name}: HTTP ${res.status}`);
      return null;
    }
    return (await res.json()) as RegistryItem;
  } catch (err) {
    console.warn(`  [skip] ${name}: ${err instanceof Error ? err.message : "fetch failed"}`);
    return null;
  }
}

function extractCode(item: RegistryItem): string | null {
  const tsxFile = item.files?.find(
    (f) => f.content && (f.path.endsWith(".tsx") || f.path.endsWith(".ts")),
  );
  if (!tsxFile?.content) return null;
  return tsxFile.content
    .replace(/@\/registry\/new-york-v4\/ui\//g, "@/components/ui/")
    .replace(/@\/registry\/new-york-v4\/hooks\//g, "@/lib/hooks/")
    .replace(/@\/registry\/new-york-v4\/lib\/utils/g, "@/lib/utils")
    .replace(/@\/registry\/new-york-v4\/blocks\//g, "@/components/blocks/")
    .replace(/@\/registry\/new-york-v4\/examples\//g, "@/components/examples/")
    .replace(/@\/registry\/new-york-v4\//g, "@/components/");
}

async function main() {
  console.log("Syncing shadcn examples...\n");

  if (!existsSync(OUTPUT_DIR)) {
    mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  let fetched = 0;
  let skipped = 0;

  for (const name of EXAMPLES_TO_FETCH) {
    const item = await fetchExample(name);
    if (!item) {
      skipped++;
      continue;
    }

    const code = extractCode(item);
    if (!code) {
      console.warn(`  [skip] ${name}: no .tsx content in files`);
      skipped++;
      continue;
    }

    const output = {
      name: item.name,
      title: item.title ?? name,
      description: item.description ?? "",
      dependencies: item.dependencies ?? [],
      code,
    };

    const outPath = join(OUTPUT_DIR, `${name}.json`);
    writeFileSync(outPath, JSON.stringify(output, null, 2) + "\n");
    console.log(`  [ok] ${name} (${code.split("\n").length} lines)`);
    fetched++;
  }

  console.log(`\nDone: ${fetched} fetched, ${skipped} skipped.`);
  console.log(`Output: ${OUTPUT_DIR}`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
