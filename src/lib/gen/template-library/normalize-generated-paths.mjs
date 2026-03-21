/**
 * Rewrite machine-specific paths in committed template-library.generated.json.
 *
 * Strips absolute Windows/macOS paths from `clonePath` and `sourceRoot` so that
 * verify-generated-paths.mjs passes in CI. Legacy `scaffold-pipeline/` path
 * segments are also blanked — that directory no longer exists.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKSPACE_ROOT = path.resolve(__dirname, "../../../..");

function normalizeClonePath(value) {
  if (value == null || value === "") return null;
  const unix = value.replace(/\\/g, "/");
  if (/[A-Z]:[/\\]Users/i.test(unix) || unix.startsWith("/Users/")) return null;
  if (unix.includes("scaffold-pipeline/")) return null;
  return value;
}

function normalizeSourceRoot(value) {
  if (!value) return "";
  const unix = value.replace(/\\/g, "/");
  if (/[A-Z]:[/\\]Users/i.test(unix) || unix.startsWith("/Users/")) return "";
  if (unix.includes("scaffold-pipeline/")) return "";
  if (unix.includes("raw-discovery")) return "";
  return value;
}

function rewriteTemplateLibraryGenerated(filePath) {
  const raw = fs.readFileSync(filePath, "utf-8");
  const data = JSON.parse(raw);
  let changed = false;
  const nextRoot = normalizeSourceRoot(data.sourceRoot);
  if (data.sourceRoot !== nextRoot) {
    data.sourceRoot = nextRoot;
    changed = true;
  }
  for (const entry of data.entries ?? []) {
    const cp = entry.repo?.clonePath;
    if (typeof cp !== "string") continue;
    const n = normalizeClonePath(cp);
    if (n && n !== cp) {
      entry.repo.clonePath = n;
      changed = true;
    }
  }
  if (changed) {
    fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf-8");
  }
  return changed;
}

const catalogPath = path.join(
  WORKSPACE_ROOT,
  "src/lib/gen/template-library/template-library.generated.json",
);

const a = rewriteTemplateLibraryGenerated(catalogPath);
console.info(`[normalize-generated-paths] template-library.generated.json ${a ? "updated" : "unchanged"}`);
