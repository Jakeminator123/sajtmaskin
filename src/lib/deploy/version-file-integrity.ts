/**
 * Detect generated project files that cannot be parsed (e.g. invalid package.json).
 * Used by chat readiness so deploy blockers match pre-deploy preflight (K-007 alignment).
 */
export function findInvalidJsonConfigPaths(
  files: ReadonlyArray<{ path: string; content: string }>,
): string[] {
  const invalid: string[] = [];
  for (const file of files) {
    const name = file.path.replace(/^\/+/, "");
    if (name !== "package.json" && !name.endsWith("/package.json")) {
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
