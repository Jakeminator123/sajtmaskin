/**
 * Detect generated project files that cannot be parsed as strict JSON.
 * Used by chat readiness so deploy blockers match pre-deploy preflight (K-007 alignment).
 *
 * Includes `package.json`, `components.json` (shadcn), `jsconfig.json`.
 * Omits `tsconfig.json` — it is often JSON-with-comments (JSONC) and would false-positive.
 */
const STRICT_JSON_BASENAMES = new Set(["package.json", "components.json", "jsconfig.json"]);

function matchesStrictJsonConfigPath(normalizedPath: string): boolean {
  if (STRICT_JSON_BASENAMES.has(normalizedPath)) return true;
  for (const base of STRICT_JSON_BASENAMES) {
    if (normalizedPath.endsWith(`/${base}`)) return true;
  }
  return false;
}

export function findInvalidJsonConfigPaths(
  files: ReadonlyArray<{ path: string; content: string }>,
): string[] {
  const invalid: string[] = [];
  for (const file of files) {
    const name = file.path.replace(/^\/+/, "");
    if (!matchesStrictJsonConfigPath(name)) {
      continue;
    }
    try {
      JSON.parse(file.content);
    } catch {
      invalid.push(file.path);
    }
  }
  return invalid;
}
