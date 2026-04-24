import fs from "node:fs";
import path from "node:path";
import type { ScaffoldFile } from "./types";

const SCAFFOLDS_ROOT = path.join(process.cwd(), "src", "lib", "gen", "scaffolds");

/**
 * SAJ-40: known scaffold IDs from `registry.BASE_SCAFFOLDS`. Hardcoded here
 * (instead of importing the registry) to avoid a circular module-init cycle:
 * each `manifest.ts` calls `loadScaffoldFiles` while the registry imports
 * those manifests. When this list drifts from the registry, the registry
 * smoke check (`runScaffoldManifestChecks`) catches the missing-files error.
 */
const KNOWN_SCAFFOLD_IDS = new Set([
  "base-nextjs",
  "landing-page",
  "saas-landing",
  "portfolio",
  "blog",
  "dashboard",
  "auth-pages",
  "ecommerce",
  "app-shell",
]);

export function loadScaffoldFiles(scaffoldId: string): ScaffoldFile[] {
  const filesDir = path.join(SCAFFOLDS_ROOT, scaffoldId, "files");
  if (!fs.existsSync(filesDir)) {
    if (KNOWN_SCAFFOLD_IDS.has(scaffoldId)) {
      // Loud failure for known scaffolds: a missing files/ directory means
      // the runtime cwd (PATHS.uploads etc.) is wrong, the working tree is
      // partially deployed, or someone deleted the templates. Returning an
      // empty list here would silently strip every scaffold file from
      // serialization and let preflight blame the LLM.
      const message = `[scaffold] loadScaffoldFiles(${JSON.stringify(scaffoldId)}): files directory missing at ${filesDir}. Known scaffold IDs must ship a files/ directory; check process.cwd() (${process.cwd()}) and deployment integrity.`;
      console.error(message);
    }
    return [];
  }
  return collectFiles(filesDir, filesDir);
}

function collectFiles(dir: string, root: string): ScaffoldFile[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
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
