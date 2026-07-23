import fs from "node:fs";
import nodePath from "node:path";
import type { CodeFile } from "../parser";

export interface UiComponent {
  filename: string;
  content: string;
}

const UI_IMPORT_RE = /@\/components\/ui\/([a-z][a-z0-9-]*)/g;

const PROJECT_ROOT = nodePath.resolve(/* turbopackIgnore: true */ process.cwd());
const SEARCH_ROOTS = [
  nodePath.join(PROJECT_ROOT, "src", "components", "ui"),
  nodePath.join(PROJECT_ROOT, "components", "ui"),
] as const;

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
    if (!fs.existsSync(/* turbopackIgnore: true */ root)) continue;
    for (const entry of fs.readdirSync(/* turbopackIgnore: true */ root, { withFileTypes: true })) {
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
    const raw = fs.readFileSync(/* turbopackIgnore: true */ fullPath, "utf-8");
    return ensureClientDirectiveForVendoredUi(raw);
  } catch {
    return null;
  }
}

/**
 * A React `"use client"` directive is only honored as the very first statement
 * of a module. Allow a leading BOM and blank lines, but nothing else before it.
 */
function startsWithUseClientDirective(content: string): boolean {
  const stripped = content.replace(/^\uFEFF/, "").replace(/^\s+/, "");
  return /^["']use client["']\s*;?/.test(stripped);
}

/**
 * Radix `Slot` (imported from `radix-ui`) and any module-scope `createContext`
 * call run at import-evaluation time, which is illegal in a React Server
 * Component. Several vendored shadcn primitives (`button`, `badge`, `card`,
 * `input`, …) import `Slot` for the `asChild` prop WITHOUT a `"use client"`
 * directive. When a generated site imports one into its server tree
 * (`app/layout.tsx` → `site-header.tsx` → `button.tsx`), Next.js throws
 * `createContext only works in Client Components` and the whole page 500s.
 *
 * The F2 quality gate is typecheck-only, so this runtime/RSC-boundary failure
 * is never caught — a "verified"/promoted version still crashes. These
 * primitives are always safe as client components (leaf UI, serializable
 * props), so we prepend the directive to the COPY shipped into the generated
 * project. The platform's own `src/components/ui/*` source files are untouched.
 */
const NEEDS_CLIENT_DIRECTIVE_RE = /from\s+["']radix-ui["']|from\s+["']@radix-ui\/|\bcreateContext\b/;

export function ensureClientDirectiveForVendoredUi(content: string): string {
  if (startsWithUseClientDirective(content)) return content;
  if (!NEEDS_CLIENT_DIRECTIVE_RE.test(content)) return content;
  return `"use client";\n\n${content}`;
}
