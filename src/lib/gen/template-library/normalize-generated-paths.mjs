/**
 * Rewrite machine-specific paths in committed generated artifacts to portable
 * repo-relative POSIX paths. Run from repo root:
 *   node src/lib/gen/template-library/normalize-generated-paths.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKSPACE_ROOT = path.resolve(__dirname, "../../../..");
const CANONICAL_DISCOVERY_CURRENT = "scaffold-pipeline/discovery/current";

function normalizeClonePath(value) {
  if (value == null || value === "") return null;
  const unix = value.replace(/\\/g, "/");
  const m = unix.match(/\/repo-cache\/([^/]+)\/?$/);
  if (!m) return null;
  return `scaffold-pipeline/repo-cache/${m[1]}`;
}

function normalizeSourceRoot(value) {
  if (!value) return CANONICAL_DISCOVERY_CURRENT;
  const unix = value.replace(/\\/g, "/");
  if (unix.includes("scaffold-pipeline/discovery")) {
    const idx = unix.indexOf("scaffold-pipeline/discovery");
    return unix.slice(idx);
  }
  if (unix.includes("raw-discovery")) {
    return CANONICAL_DISCOVERY_CURRENT;
  }
  return CANONICAL_DISCOVERY_CURRENT;
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

function walkDossierManifests(dossiersRoot) {
  let count = 0;
  if (!fs.existsSync(dossiersRoot)) return 0;
  for (const name of fs.readdirSync(dossiersRoot)) {
    const manifestPath = path.join(dossiersRoot, name, "manifest.json");
    if (!fs.existsSync(manifestPath)) continue;
    const raw = fs.readFileSync(manifestPath, "utf-8");
    const data = JSON.parse(raw);
    const cp = data.repo?.clonePath;
    if (typeof cp !== "string") continue;
    const n = normalizeClonePath(cp);
    if (n && n !== cp) {
      data.repo.clonePath = n;
      fs.writeFileSync(manifestPath, `${JSON.stringify(data, null, 2)}\n`, "utf-8");
      count += 1;
    }
  }
  return count;
}

const catalogPath = path.join(
  WORKSPACE_ROOT,
  "src/lib/gen/template-library/template-library.generated.json",
);
const dossiersRoot = path.join(WORKSPACE_ROOT, "scaffold-pipeline/dossiers");

const a = rewriteTemplateLibraryGenerated(catalogPath);
const b = walkDossierManifests(dossiersRoot);
console.info(
  `[normalize-generated-paths] template-library.generated.json ${a ? "updated" : "unchanged"}; dossier manifests updated: ${b}`,
);
