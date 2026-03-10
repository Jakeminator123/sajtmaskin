import type { SuspenseRule } from "../transform";

const BARE_PATH_RE = /from\s+["']((?:components|lib|app|hooks)\/[^"']+)["']/g;

export const relativeImportFix: SuspenseRule = {
  name: "relative-import-fix",
  transform(line) {
    if (!line.includes("from")) return line;
    return line.replace(BARE_PATH_RE, (_match, p: string) => `from "@/${p}"`);
  },
};
