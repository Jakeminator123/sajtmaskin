import type { SuspenseRule } from "../transform";

const BLOCK_ENTIRELY = [
  /^\s*import\s+.*\s+from\s+["']next\/og["']/,
  /^\s*import\s+.*\s+from\s+["']server-only["']/,
  /^\s*import\s+.*\s+from\s+["']next\/headers["']/,
];

export const forbiddenImportStrip: SuspenseRule = {
  name: "forbidden-import-strip",
  transform(line) {
    const trimmed = line.trim();
    for (const re of BLOCK_ENTIRELY) {
      if (re.test(trimmed)) return `// ${trimmed} (stripped for preview compatibility)`;
    }
    return line;
  },
};
