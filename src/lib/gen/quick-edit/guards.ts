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
