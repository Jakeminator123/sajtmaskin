/**
 * Sync SHADCN_COMPONENTS against the official shadcn/ui registry.
 *
 * 1. Fetches https://ui.shadcn.com/r/index.json → list of registry:ui items
 * 2. For each item, fetches the component detail to extract PascalCase exports
 * 3. Compares against SHADCN_COMPONENTS in src/lib/gen/data/shadcn-components.ts
 * 4. Reports added / removed / changed entries
 *
 * Flags:
 *   --write   Overwrite shadcn-components.ts with the merged result
 *   --json    Print diff as JSON (for CI)
 *
 * Usage:
 *   npx tsx scripts/shadcn/sync-shadcn-registry.ts          # warn-only
 *   npx tsx scripts/shadcn/sync-shadcn-registry.ts --write   # update file
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const INDEX_URL = "https://ui.shadcn.com/r/index.json";
const DETAIL_BASE = "https://ui.shadcn.com/r/styles/radix-vega";
const COMPONENTS_PATH = join(
  process.cwd(),
  "src/lib/gen/data/shadcn-components.ts",
);

const WRITE = process.argv.includes("--write");
const JSON_OUTPUT = process.argv.includes("--json");

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface IndexItem {
  name: string;
  type: string;
}

interface DetailFile {
  path: string;
  content?: string;
  type: string;
}

interface DetailItem {
  name: string;
  type: string;
  files?: DetailFile[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseExistingMap(): Record<string, string> {
  const src = readFileSync(COMPONENTS_PATH, "utf-8");
  const map: Record<string, string> = {};
  const re = /^\s*(\w+):\s*"([^"]+)"/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    map[m[1]] = m[2];
  }
  return map;
}

function extractExports(content: string): string[] {
  const names: string[] = [];

  // Block export: export { Foo, Bar, Baz }
  const blockRe = /export\s*\{([^}]+)\}/g;
  let m: RegExpExecArray | null;
  while ((m = blockRe.exec(content)) !== null) {
    for (const token of m[1].split(",")) {
      const name = token.replace(/\s+as\s+\w+/, "").trim();
      if (name && /^[A-Z]/.test(name)) names.push(name);
    }
  }

  // Named export function/const: export function Foo / export const Foo
  const namedRe = /export\s+(?:function|const)\s+([A-Z]\w*)/g;
  while ((m = namedRe.exec(content)) !== null) {
    if (!names.includes(m[1])) names.push(m[1]);
  }

  return names;
}

async function fetchJSON<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log("Fetching shadcn registry index...");
  const index = await fetchJSON<IndexItem[]>(INDEX_URL);
  if (!index) {
    console.error("Failed to fetch registry index.");
    process.exit(1);
  }

  const uiItems = index.filter((i) => i.type === "registry:ui");
  console.log(`Found ${uiItems.length} registry:ui items.\n`);

  const registryMap: Record<string, string> = {};
  let fetchOk = 0;
  let fetchFail = 0;

  for (const item of uiItems) {
    const detail = await fetchJSON<DetailItem>(
      `${DETAIL_BASE}/${item.name}.json`,
    );
    if (!detail?.files?.length) {
      console.warn(`  [skip] ${item.name}: no files or fetch failed`);
      fetchFail++;
      continue;
    }

    const tsxFile = detail.files.find(
      (f) => f.content && (f.path.endsWith(".tsx") || f.path.endsWith(".ts")),
    );
    if (!tsxFile?.content) {
      console.warn(`  [skip] ${item.name}: no .tsx content`);
      fetchFail++;
      continue;
    }

    const exports = extractExports(tsxFile.content);
    if (exports.length === 0) {
      console.warn(`  [skip] ${item.name}: no PascalCase exports found`);
      fetchFail++;
      continue;
    }

    for (const exp of exports) {
      registryMap[exp] = item.name;
    }
    fetchOk++;
  }

  console.log(
    `\nFetched details: ${fetchOk} ok, ${fetchFail} skipped.\n`,
  );

  // ----- Diff -----

  const existing = parseExistingMap();
  const allKeys = new Set([...Object.keys(existing), ...Object.keys(registryMap)]);

  const added: Record<string, string> = {};
  const removed: Record<string, string> = {};
  const changed: Record<string, { from: string; to: string }> = {};

  for (const key of allKeys) {
    const inExisting = key in existing;
    const inRegistry = key in registryMap;

    if (!inExisting && inRegistry) {
      added[key] = registryMap[key];
    } else if (inExisting && !inRegistry) {
      removed[key] = existing[key];
    } else if (inExisting && inRegistry && existing[key] !== registryMap[key]) {
      changed[key] = { from: existing[key], to: registryMap[key] };
    }
  }

  const addedCount = Object.keys(added).length;
  const removedCount = Object.keys(removed).length;
  const changedCount = Object.keys(changed).length;
  const totalDiffs = addedCount + removedCount + changedCount;

  if (JSON_OUTPUT) {
    console.log(JSON.stringify({ added, removed, changed }, null, 2));
  } else {
    if (addedCount) {
      console.log(`NEW (${addedCount}):`);
      for (const [k, v] of Object.entries(added).sort(([a], [b]) => a.localeCompare(b))) {
        console.log(`  + ${k}: "${v}"`);
      }
      console.log();
    }
    if (removedCount) {
      console.log(`REMOVED from registry (${removedCount}):`);
      for (const [k, v] of Object.entries(removed).sort(([a], [b]) => a.localeCompare(b))) {
        console.log(`  - ${k}: "${v}"`);
      }
      console.log();
    }
    if (changedCount) {
      console.log(`CHANGED subpath (${changedCount}):`);
      for (const [k, v] of Object.entries(changed).sort(([a], [b]) => a.localeCompare(b))) {
        console.log(`  ~ ${k}: "${v.from}" → "${v.to}"`);
      }
      console.log();
    }
    if (totalDiffs === 0) {
      console.log("SHADCN_COMPONENTS is up to date — no changes needed.");
    } else {
      console.log(`Total: ${addedCount} new, ${removedCount} removed, ${changedCount} changed.`);
    }
  }

  // ----- Write -----

  if (WRITE && totalDiffs > 0) {
    const merged: Record<string, string> = { ...existing };

    for (const [k, v] of Object.entries(added)) merged[k] = v;
    for (const [k, v] of Object.entries(changed)) merged[k] = v.to;
    // Keep removed entries — they may be local overrides or deprecated components.
    // The report warns about them so a human can decide.

    const sorted = Object.keys(merged).sort((a, b) => a.localeCompare(b));
    const lines = sorted.map((k) => `  ${k}: "${merged[k]}",`);

    const output = `/**
 * shadcn/ui component registry for system prompt injection and post-processing.
 *
 * Keys   = exported component names (PascalCase, as used in JSX)
 * Values = import subpath under \`@/components/ui/\`
 *
 * Usage in prompt:  \`import { Button } from "@/components/ui/button"\`
 * Usage in postproc: validate that generated imports match known components.
 *
 * Keep sorted alphabetically by key for easy diffing on updates.
 * Run \`npm run shadcn:sync\` to check for upstream changes.
 */

export const SHADCN_COMPONENTS: Record<string, string> = {
${lines.join("\n")}
};
`;

    writeFileSync(COMPONENTS_PATH, output);
    console.log(`\nWrote ${sorted.length} entries to ${COMPONENTS_PATH}`);
  } else if (WRITE && totalDiffs === 0) {
    console.log("\n--write: nothing to change.");
  } else if (totalDiffs > 0) {
    console.log("\nRun with --write to update shadcn-components.ts.");
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
