import fs from "node:fs";
import nodePath from "node:path";
import type { CodeFile } from "./parser";

const UI_IMPORT_RE = /@\/components\/ui\/([a-z][a-z0-9-]*)/g;

const CWD = process.cwd();
const SEARCH_ROOTS = [
  nodePath.resolve(CWD, "src/components/ui"),
  nodePath.resolve(CWD, "components/ui"),
] as const;

export interface UiComponent {
  filename: string;
  content: string;
}

type UiComponentFileIndex = Map<string, string>;

/**
 * Scan generated files for `@/components/ui/*` imports and resolve matching
 * `.tsx` sources from the host project's component directory tree.
 *
 * Separated from `project-scaffold.ts` so the dynamic `fs.readFileSync`
 * paths are never statically reachable from App Route bundles (Turbopack
 * would otherwise flag the broad file pattern).
 */
export function collectRequiredUiComponents(files: CodeFile[]): UiComponent[] {
  const needed = new Set<string>();
  for (const file of files) {
    for (const match of file.content.matchAll(UI_IMPORT_RE)) {
      needed.add(match[1]);
    }
  }

  const fileIndex = buildUiComponentFileIndex();
  const resolved = new Map<string, UiComponent>();
  const queue = [...needed];

  while (queue.length > 0) {
    const name = queue.shift();
    if (!name || resolved.has(name)) continue;

    const content = readUiComponent(name, fileIndex);
    if (!content) continue;

    resolved.set(name, { filename: `${name}.tsx`, content });

    for (const match of content.matchAll(UI_IMPORT_RE)) {
      const dependency = match[1];
      if (!resolved.has(dependency)) {
        queue.push(dependency);
      }
    }
  }

  return Array.from(resolved.values());
}

function buildUiComponentFileIndex(): UiComponentFileIndex {
  const index: UiComponentFileIndex = new Map();

  for (const root of SEARCH_ROOTS) {
    if (!fs.existsSync(root)) continue;
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith(".tsx")) continue;
      const key = entry.name.slice(0, -4);
      if (!index.has(key)) {
        index.set(key, `${root}/${entry.name}`);
      }
    }
  }

  return index;
}

function readUiComponent(name: string, fileIndex: UiComponentFileIndex): string | null {
  const fullPath = fileIndex.get(name);
  if (!fullPath) return null;
  try {
    return fs.readFileSync(fullPath, "utf-8");
  } catch {
    return null;
  }
}
