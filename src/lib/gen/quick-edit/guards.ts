/**
 * Quick-edit path guards. Edits here are explicit and user-directed (the user
 * picked the file/element), so we trust the path but still reject anything that
 * could escape the project. Structural/dependency files are NOT blocked at this
 * layer — they are allowed to be edited, but the preview patch lane routes them
 * to a full restart instead of a hot patch (see preview-host runtime).
 */
export function normalizeQuickEditPath(rawPath: string): string {
  return rawPath.replace(/\\/g, "/").trim();
}

export function isQuickEditSafePath(rawPath: string): boolean {
  const path = normalizeQuickEditPath(rawPath);
  if (!path) return false;
  if (path.startsWith("/")) return false;
  if (/^[a-zA-Z]:/.test(path)) return false;
  if (path.split("/").some((segment) => segment === "..")) return false;
  return true;
}

const STRUCTURAL_EXACT = new Set([
  "package.json",
  "package-lock.json",
  "pnpm-lock.yaml",
  "pnpm-lock.yml",
  "yarn.lock",
]);

/**
 * Mirrors the preview-host structural gate. Used for telemetry / response hints
 * so callers can tell when an edit will force a full preview restart rather
 * than a hot patch.
 */
export function isStructuralQuickEditPath(rawPath: string): boolean {
  const path = normalizeQuickEditPath(rawPath).toLowerCase();
  if (!path) return false;
  if (STRUCTURAL_EXACT.has(path)) return true;
  if (/^next\.config\.(?:js|cjs|mjs|ts)$/.test(path)) return true;
  if (/^tsconfig(?:\.[\w.-]+)?\.json$/.test(path)) return true;
  if (path === ".env" || path.startsWith(".env.")) return true;
  if (/^(?:postcss|tailwind)\.config\.[\w.-]+$/.test(path)) return true;
  return false;
}

/**
 * Essential project files that must never be deleted via a quick-edit
 * `delete_file` op. Removing any of these would break the runnable Next
 * project (home/layout/styles) or the build itself (structural config). The
 * preview "−" page control only ever deletes sub-route page subtrees, but this
 * guard is the hard backstop regardless of caller.
 */
const UNDELETABLE_EXACT = new Set([
  "app/page.tsx",
  "src/app/page.tsx",
  "app/layout.tsx",
  "src/app/layout.tsx",
  "app/globals.css",
  "src/app/globals.css",
  "app/icon.svg",
  "src/app/icon.svg",
  "next-env.d.ts",
  "lib/utils.ts",
]);

export function isDeletableQuickEditPath(rawPath: string): boolean {
  const normalized = normalizeQuickEditPath(rawPath);
  if (!isQuickEditSafePath(normalized)) return false;
  if (isStructuralQuickEditPath(normalized)) return false;
  if (UNDELETABLE_EXACT.has(normalized)) return false;
  return true;
}
