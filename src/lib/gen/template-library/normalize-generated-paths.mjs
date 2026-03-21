/**
 * Rewrite machine-specific paths in committed template-library.generated.json.
 * Dossier/scaffold-pipeline normalization was removed with the research pipeline.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKSPACE_ROOT = path.resolve(__dirname, "../../../..");

function normalizeClonePath(value) {
  if (value == null || value === "") return null;
  const unix = value.replace(/\\/g, "/");
  const m = unix.match(/\/repo-cache\/([^/]+)\/?$/);
  if (!m) return null;
  return `scaffold-pipeline/repo-cache/${m[1]}`;
}

function normalizeSourceRoot(value) {
  if (!value) return "";
  const unix = value.replace(/\\/g, "/");
  if (unix.includes("scaffold-pipeline/discovery")) {
    const idx = unix.indexOf("scaffold-pipeline/discovery");
    return unix.slice(idx);
  }
  if (unix.includes("raw-discovery")) {
    return "";
  }
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
