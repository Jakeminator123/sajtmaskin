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

const REGISTRY_BASE = "https://ui.shadcn.com/r/styles/radix-vega";
const REGISTRY_FALLBACK = "https://ui.shadcn.com/r/styles/new-york-v4";
const OUTPUT_DIR = join(process.cwd(), "data", "shadcn-examples");

const EXAMPLES_TO_FETCH = [
  // Calendar & date
  "calendar-demo",
  "date-picker-demo",
  "date-picker-with-range",

  // Search & command
  "combobox-demo",
  "command-demo",

  // Carousel
  "carousel-demo",

  // Charts — bar
  "chart-bar-default",
  "chart-bar-interactive",
  "chart-bar-stacked",

  // Charts — area
  "chart-area-default",
  "chart-area-interactive",
  "chart-area-stacked",

  // Charts — line
  "chart-line-default",
  "chart-line-interactive",
  "chart-line-multiple",

  // Charts — pie & donut
  "chart-pie-simple",
  "chart-pie-donut",
  "chart-pie-interactive",

  // Charts — radar & radial
  "chart-radar-default",
  "chart-radar-multiple",
  "chart-radial-simple",
  "chart-radial-text",
  "chart-radial-stacked",

  // Charts — tooltip patterns
  "chart-tooltip-default",

  // Forms
  "input-form",

  // App shell & navigation
  "sidebar-01",
  "sidebar-07",
  "sidebar-10",
  "dashboard-01",

  // Auth
  "login-01",
  "login-04",
  "signup-01",

  // Data table
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

async function fetchExample(name: string): Promise<{ item: RegistryItem; style: string } | null> {
  for (const [base, style] of [[REGISTRY_BASE, "radix-vega"], [REGISTRY_FALLBACK, "new-york-v4"]] as const) {
    const url = `${base}/${name}.json`;
    try {
      const res = await fetch(url);
      if (res.ok) {
        const item = (await res.json()) as RegistryItem;
        if (item.files?.some((f) => f.content)) return { item, style };
      }
    } catch {
      // try next
    }
  }
  console.warn(`  [skip] ${name}: not found in radix-vega or new-york-v4`);
  return null;
}

function extractCode(item: RegistryItem, style: string): string | null {
  const tsxFile = item.files?.find(
    (f) => f.content && (f.path.endsWith(".tsx") || f.path.endsWith(".ts")),
  );
  if (!tsxFile?.content) return null;
  const prefix = `@/registry/${style}/`;
  return tsxFile.content
    .replace(new RegExp(`${prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}lib/utils`, "g"), "@/lib/utils")
    .replace(new RegExp(`${prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}hooks/`, "g"), "@/lib/hooks/")
    .replace(new RegExp(`${prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}blocks/`, "g"), "@/components/blocks/")
    .replace(new RegExp(`${prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}examples/`, "g"), "@/components/examples/")
    .replace(new RegExp(`${prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "g"), "@/components/");
}

async function main() {
  console.log("Syncing shadcn examples...\n");

  if (!existsSync(OUTPUT_DIR)) {
    mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  let fetched = 0;
  let skipped = 0;

  for (const name of EXAMPLES_TO_FETCH) {
    const result = await fetchExample(name);
    if (!result) {
      skipped++;
      continue;
    }

    const code = extractCode(result.item, result.style);
    if (!code) {
      console.warn(`  [skip] ${name}: no .tsx content in files`);
      skipped++;
      continue;
    }

    const output = {
      name: result.item.name,
      title: result.item.title ?? name,
      description: result.item.description ?? "",
      dependencies: result.item.dependencies ?? [],
      code,
    };

    const outPath = join(OUTPUT_DIR, `${name}.json`);
    writeFileSync(outPath, JSON.stringify(output, null, 2) + "\n");
    console.log(`  [ok] ${name} (${code.split("\n").length} lines)`);
    fetched++;
  }

  console.log(`\nDone: ${fetched} fetched, ${skipped} skipped.`);
  if (fetched === 0) {
    console.error("[shadcn-examples] no examples fetched; registry/network likely unavailable.");
    process.exit(1);
  }
  console.log(`Output: ${OUTPUT_DIR}`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
