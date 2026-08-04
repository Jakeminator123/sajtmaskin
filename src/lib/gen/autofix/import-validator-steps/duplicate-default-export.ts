import type { AutoFixEntry } from "../pipeline";

/**
 * Remove duplicate `export default` statements, keeping only the last one.
 * GPT-5.x sometimes emits both `export default function Foo()` and a trailing
 * `export default Foo;` in the same file.
 */
export function fixDuplicateDefaultExport(code: string): { code: string; fixes: AutoFixEntry[] } {
  const EXPORT_DEFAULT_RE = /^export\s+default\b/;
  const lines = code.split("\n");
  const defaultExportLines: number[] = [];

  for (let i = 0; i < lines.length; i++) {
    if (EXPORT_DEFAULT_RE.test(lines[i].trim())) {
      defaultExportLines.push(i);
    }
  }

  if (defaultExportLines.length <= 1) {
    return { code, fixes: [] };
  }

  const linesToRemove = new Set(defaultExportLines.slice(0, -1));
  const kept = lines.filter((_, i) => !linesToRemove.has(i));
  return {
    code: kept.join("\n"),
    fixes: [{
      fixer: "duplicate-default-export-fixer",
      description: `Removed ${linesToRemove.size} duplicate export default statement(s)`,
    }],
  };
}
