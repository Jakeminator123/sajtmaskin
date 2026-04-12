import fs from "node:fs";
import path from "node:path";
import type { ScaffoldFile } from "./types";

const SCAFFOLDS_ROOT = path.join(process.cwd(), "src", "lib", "gen", "scaffolds");

export function loadScaffoldFiles(scaffoldId: string): ScaffoldFile[] {
  const filesDir = path.join(SCAFFOLDS_ROOT, scaffoldId, "files");
  if (!fs.existsSync(filesDir)) return [];
  return collectFiles(filesDir, filesDir);
}

function collectFiles(dir: string, root: string): ScaffoldFile[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const result: ScaffoldFile[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      result.push(...collectFiles(full, root));
    } else {
      result.push({
        path: path.relative(root, full).replace(/\\/g, "/"),
        content: fs.readFileSync(full, "utf-8"),
      });
    }
  }
  return result;
}
