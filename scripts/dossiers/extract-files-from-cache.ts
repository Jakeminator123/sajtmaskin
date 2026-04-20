/**
 * Auto-extract candidate files from _repo-cache into draft dossiers.
 *
 * For each draft dossier with a cloned repo:
 *   1. Scan repo for high-value files (api-route, layout, middleware, .env.example, package.json)
 *   2. Copy them into data/dossiers/<id>/components/ preserving directory structure
 *   3. Parse package.json → derive `dependencies` for the manifest
 *   4. Parse .env.example → derive `envVars` for the manifest
 *   5. Update manifest.json `files` array + `dependencies` + `envVars`
 *
 * Drafts only. Will NOT touch active dossiers or dossiers without _repo-cache.
 *
 * Output remains _status: "draft" — human still needs to:
 *   - Verify extracted files are actually the right ones
 *   - Write instructions.md properly
 *   - Set _status: "active"
 *
 * This script just removes the most repetitive part of curation.
 */

import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

const WORKSPACE_ROOT = process.cwd();
const DOSSIER_ROOT = resolve(WORKSPACE_ROOT, "data", "dossiers");
const REPO_CACHE = resolve(DOSSIER_ROOT, "_repo-cache");
const MASTER_PATH = resolve(DOSSIER_ROOT, "_index", "master.json");

interface MasterDossier {
  id: string;
  _status?: "draft" | "active";
  envVars?: Array<{ key: string; required: boolean; purpose: string }>;
  dependencies?: string[];
  files?: Array<{ path: string; role: string; kind: string }>;
}

interface MasterIndex {
  dossiers: MasterDossier[];
}

interface ExtractedFile {
  /** Path relative to repo root, e.g. "app/api/checkout/route.ts" */
  sourcePath: string;
  /** Path inside dossier, e.g. "components/api/checkout/route.ts" */
  destPath: string;
  role: "client" | "server" | "shared";
  kind: "component" | "api-route" | "hook" | "util" | "config" | "middleware";
}

/** File patterns to look for. Order = priority. Caps total at MAX_FILES. */
interface ExtractRule {
  match: RegExp;
  kind: ExtractedFile["kind"];
  role: ExtractedFile["role"];
  /** When set, the file's contents must also match this regex (for filtering). */
  contentMatch?: RegExp;
}

/**
 * Path prefix variants we accept:
 *   ""              standard
 *   "src/"          common alt
 *   "<workspace>/"  monorepo workspaces (frontend, landing, web, app, etc.)
 *   "src/<workspace>/"  src + workspace
 */
const PREFIX = "(?:[a-z][a-z0-9-]+\\/)?(?:src\\/)?(?:[a-z][a-z0-9-]+\\/)?";

const EXTRACT_RULES: ExtractRule[] = [
  // App Router middleware (auth pattern)
  { match: new RegExp(`^${PREFIX}middleware\\.tsx?$`), kind: "middleware", role: "server" },
  // App Router root layout (provider wrappers, fonts, theme)
  { match: new RegExp(`^${PREFIX}app\\/layout\\.tsx$`), kind: "config", role: "shared" },
  // App Router API routes — most valuable for integrations
  { match: new RegExp(`^${PREFIX}app\\/api\\/[^/]+\\/route\\.tsx?$`), kind: "api-route", role: "server" },
  { match: new RegExp(`^${PREFIX}app\\/api\\/[^/]+\\/[^/]+\\/route\\.tsx?$`), kind: "api-route", role: "server" },
  // Page Router API routes (older Next)
  { match: new RegExp(`^${PREFIX}pages\\/api\\/[^/]+\\.tsx?$`), kind: "api-route", role: "server" },
  // Provider wrappers (typical auth/cms/payment patterns)
  { match: new RegExp(`^${PREFIX}lib\\/(?:auth|stripe|supabase|clerk|cms|payments|sanity|drizzle|prisma|db)\\.tsx?$`), kind: "util", role: "shared" },
  // Sanity/CMS-specific config files
  { match: new RegExp(`^${PREFIX}sanity\\/(?:client|env|loader|live)\\.tsx?$`), kind: "config", role: "shared" },
  // Drizzle/Prisma schema/config
  { match: new RegExp(`^${PREFIX}(?:drizzle|prisma)\\/(?:schema|client|migrate)\\.tsx?$`), kind: "config", role: "shared" },
  { match: new RegExp(`^drizzle\\.config\\.tsx?$`), kind: "config", role: "shared" },
  // Generic lib/utils helpers
  { match: new RegExp(`^${PREFIX}(?:lib|utils)\\/[a-z-]+\\.tsx?$`), kind: "util", role: "shared" },
  // Hooks
  { match: new RegExp(`^${PREFIX}hooks\\/use[A-Z][a-z-]+\\.tsx?$`), kind: "hook", role: "client" },
  // Specific component files in /components
  { match: new RegExp(`^${PREFIX}components\\/[a-z-]+\\.tsx?$`), kind: "component", role: "client" },
];

const MAX_FILES = 5;
const MAX_FILE_BYTES = 30_000;

interface PackageJson {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

/** Walk a directory tree and return paths relative to root. Skips node_modules + .git. */
function walkRepo(repoRoot: string): string[] {
  const out: string[] = [];
  function walk(dir: string): void {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const name of entries) {
      if (name === "node_modules" || name === ".git" || name === ".next" || name === "dist" || name === "build") continue;
      const full = join(dir, name);
      let s;
      try {
        s = statSync(full);
      } catch {
        continue;
      }
      if (s.isDirectory()) {
        walk(full);
      } else {
        out.push(relative(repoRoot, full).replace(/\\/g, "/"));
      }
    }
  }
  walk(repoRoot);
  return out;
}

function selectFiles(repoRoot: string, allFiles: string[]): ExtractedFile[] {
  const selected: ExtractedFile[] = [];
  const seenPaths = new Set<string>();

  for (const rule of EXTRACT_RULES) {
    if (selected.length >= MAX_FILES) break;
    for (const path of allFiles) {
      if (selected.length >= MAX_FILES) break;
      if (seenPaths.has(path)) continue;
      if (!rule.match.test(path)) continue;
      const full = join(repoRoot, path);
      let size = 0;
      try {
        size = statSync(full).size;
      } catch {
        continue;
      }
      if (size === 0 || size > MAX_FILE_BYTES) continue;
      if (rule.contentMatch) {
        try {
          const content = readFileSync(full, "utf-8");
          if (!rule.contentMatch.test(content)) continue;
        } catch {
          continue;
        }
      }
      seenPaths.add(path);
      selected.push({
        sourcePath: path,
        destPath: `components/${path}`,
        role: rule.role,
        kind: rule.kind,
      });
    }
  }
  return selected;
}

function extractDependencies(repoRoot: string): { deps: string[]; envVars: Array<{ key: string; required: boolean; purpose: string }> } {
  const result = { deps: [] as string[], envVars: [] as Array<{ key: string; required: boolean; purpose: string }> };

  // package.json
  const pkgPath = join(repoRoot, "package.json");
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as PackageJson;
      const all = { ...(pkg.dependencies ?? {}) };
      // Filter out Next.js itself, react, react-dom — assumed by every scaffold
      const SKIP = new Set(["next", "react", "react-dom", "typescript", "@types/node", "@types/react", "@types/react-dom"]);
      result.deps = Object.keys(all)
        .filter((d) => !SKIP.has(d) && !d.startsWith("@types/") && !d.includes("eslint") && !d.includes("postcss") && !d.includes("tailwindcss"))
        .sort();
    } catch {
      // ignore
    }
  }

  // .env.example
  const envPaths = [".env.example", ".env.local.example", ".env.sample"];
  for (const candidate of envPaths) {
    const envPath = join(repoRoot, candidate);
    if (!existsSync(envPath)) continue;
    try {
      const lines = readFileSync(envPath, "utf-8").split(/\r?\n/);
      let lastComment = "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) {
          lastComment = "";
          continue;
        }
        if (trimmed.startsWith("#")) {
          lastComment = trimmed.replace(/^#+\s*/, "");
          continue;
        }
        const eqIdx = trimmed.indexOf("=");
        if (eqIdx === -1) continue;
        const key = trimmed.slice(0, eqIdx).trim();
        if (!/^[A-Z][A-Z0-9_]*$/.test(key)) continue;
        result.envVars.push({
          key,
          required: !key.startsWith("OPTIONAL_"),
          purpose: lastComment || `Required by source template (auto-extracted from ${candidate}).`,
        });
        lastComment = "";
      }
      break; // only first found .env.example
    } catch {
      // ignore
    }
  }

  return result;
}

function copyExtractedFiles(repoRoot: string, dossierDir: string, files: ExtractedFile[]): void {
  for (const f of files) {
    const src = join(repoRoot, f.sourcePath);
    const dest = join(dossierDir, f.destPath);
    mkdirSync(dirname(dest), { recursive: true });
    copyFileSync(src, dest);
  }
}

function copyEnvExample(repoRoot: string, dossierDir: string): boolean {
  for (const candidate of [".env.example", ".env.local.example", ".env.sample"]) {
    const src = join(repoRoot, candidate);
    if (existsSync(src)) {
      copyFileSync(src, join(dossierDir, ".env.example"));
      return true;
    }
  }
  return false;
}

function updateManifest(
  dossierDir: string,
  files: ExtractedFile[],
  deps: string[],
  envVars: Array<{ key: string; required: boolean; purpose: string }>,
  envExampleCopied: boolean,
): void {
  const manifestPath = join(dossierDir, "manifest.json");
  if (!existsSync(manifestPath)) return;
  const manifest = JSON.parse(readFileSync(manifestPath, "utf-8")) as Record<string, unknown>;
  manifest.files = files.map((f) => ({ path: f.destPath, role: f.role, kind: f.kind }));
  manifest.dependencies = deps;
  if (envVars.length > 0) {
    manifest.envVars = envVars;
  }
  // Tagga manifest med extraction-meta så kuratör ser status
  manifest._extractedAt = new Date().toISOString();
  manifest._extractedFromCache = true;
  manifest._envExampleCopied = envExampleCopied;
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf-8");
}

function main(): void {
  if (!existsSync(MASTER_PATH)) {
    console.error(`Missing ${MASTER_PATH}. Run npm run dossiers:index first.`);
    process.exit(1);
  }
  const master: MasterIndex = JSON.parse(readFileSync(MASTER_PATH, "utf-8"));
  const drafts = master.dossiers.filter((d) => (d._status ?? "active") === "draft");

  console.log(`[extract] ${drafts.length} drafts to consider`);

  let processed = 0;
  let extracted = 0;
  let noCache = 0;
  let noFiles = 0;

  for (const d of drafts) {
    const repoDir = join(REPO_CACHE, d.id);
    if (!existsSync(repoDir)) {
      noCache++;
      continue;
    }
    processed++;

    const allFiles = walkRepo(repoDir);
    const files = selectFiles(repoDir, allFiles);
    const { deps, envVars } = extractDependencies(repoDir);

    if (files.length === 0) {
      console.log(`[extract] ${d.id}: no candidate files (repo has ${allFiles.length} files but none matched rules)`);
      noFiles++;
      continue;
    }

    const dossierDir = join(DOSSIER_ROOT, d.id);
    copyExtractedFiles(repoDir, dossierDir, files);
    const envExampleCopied = copyEnvExample(repoDir, dossierDir);
    updateManifest(dossierDir, files, deps, envVars, envExampleCopied);

    console.log(`[extract] ${d.id}: ${files.length} files, ${deps.length} deps, ${envVars.length} env vars${envExampleCopied ? ", .env.example" : ""}`);
    extracted++;
  }

  console.log(``);
  console.log(`[extract] Done.`);
  console.log(`[extract]   ${extracted} drafts populated with files + deps + env`);
  console.log(`[extract]   ${noFiles} drafts had repo but no matching files (rare patterns / not Next App Router)`);
  console.log(`[extract]   ${noCache} drafts have no _repo-cache (sourceRepoUrl missing or clone failed)`);
  console.log(``);
  console.log(`[extract] Next: review extracted files in data/dossiers/<id>/components/ + write instructions.md, then change _status to "active".`);
  console.log(`[extract] Run npm run dossiers:rebuild to refresh master + recommendations.`);
}

main();
