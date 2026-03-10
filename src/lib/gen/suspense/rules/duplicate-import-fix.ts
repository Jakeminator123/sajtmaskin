import type { SuspenseRule, StreamContext } from "../transform";

/**
 * Removes duplicate import lines within a single stream.
 *
 * Uses a factory so each stream gets a fresh Set — call
 * `createDuplicateImportRule()` once per SuspenseLineProcessor /
 * TransformStream instance.
 */

const IMPORT_PREFIX = "import ";
const FROM_KEYWORD = " from ";

export function createDuplicateImportRule(): SuspenseRule {
  const seen = new Set<string>();

  return {
    name: "duplicate-import-fix",

    transform(line: string, _context: StreamContext): string {
      const trimmed = line.trim();
      if (trimmed.startsWith(IMPORT_PREFIX) && trimmed.includes(FROM_KEYWORD)) {
        if (seen.has(trimmed)) return "";
        seen.add(trimmed);
      }
      return line;
    },
  };
}
