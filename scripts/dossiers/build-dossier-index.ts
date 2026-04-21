/**
 * Build the dossier index from individual manifest.json files.
 *
 * Input:  data/dossiers/<id>/manifest.json (every dossier folder, except _raw, _index)
 * Output: data/dossiers/_index/master.json     — full curation register
 *         data/dossiers/_index/by-category.json — { "payments": ["..."], "auth": [...], ... }
 *
 * The index is what runtime + backoffice read. It is never hand-edited.
 *
 * Validation: every manifest must parse as JSON and have id matching the
 * directory name. Schema validation is light (full JSON Schema check is a
 * follow-up task — see docs/schemas/strict/dossier.schema.json).
 */

import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";

const WORKSPACE_ROOT = process.cwd();
const DOSSIER_ROOT = resolve(WORKSPACE_ROOT, "data", "dossiers");
const INDEX_ROOT = join(DOSSIER_ROOT, "_index");

const RESERVED_DIRS = new Set(["_raw", "_index", "_legacy"]);

interface DossierManifest {
  id: string;
  kind: "integration" | "ui-section";
  category: string;
  label: string;
  description: string;
  summary: string;
  providers?: Array<{ name: string; url?: string }>;
  envVars?: Array<{ key: string; required: boolean; purpose: string }>;
  dependencies: string[];
  files: Array<{ path: string; role: string; kind: string }>;
  exposes?: Array<{ name: string; type: string; import: string }>;
  scaffoldFit: { primary: string[]; compatible: string[] };
  complexity: "simple" | "medium" | "advanced";
  qualityScore?: number;
  sourceTemplateUrl?: string;
  sourceRepoUrl?: string;
  lastVerified: string;
  tags: string[];
  _source?: string;
  _status?: "draft" | "active";
}

interface IndexedDossier extends DossierManifest {
  _path: string;
  _instructionsExists: boolean;
  _envExampleExists: boolean;
  _filesPresent: number;
  _filesMissing: string[];
}

interface MasterIndex {
  generatedAt: string;
  totalDossiers: number;
  activeDossiers: number;
  draftDossiers: number;
  dossiers: IndexedDossier[];
  warnings: string[];
}

interface ByCategoryIndex {
  generatedAt: string;
  /** Active-only — runtime reads this. Drafts are listed in master.json for review. */
  categories: Record<string, string[]>;
}

function listDossierDirs(): string[] {
  if (!existsSync(DOSSIER_ROOT)) return [];
  return readdirSync(DOSSIER_ROOT, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !RESERVED_DIRS.has(entry.name))
    .map((entry) => entry.name);
}

function loadManifest(dossierId: string, warnings: string[]): IndexedDossier | null {
  const dir = join(DOSSIER_ROOT, dossierId);
  const manifestPath = join(dir, "manifest.json");

  if (!existsSync(manifestPath)) {
    warnings.push(`[${dossierId}] missing manifest.json`);
    return null;
  }

  let manifest: DossierManifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
  } catch (err) {
    warnings.push(`[${dossierId}] invalid JSON: ${err instanceof Error ? err.message : err}`);
    return null;
  }

  if (manifest.id !== dossierId) {
    warnings.push(`[${dossierId}] manifest.id "${manifest.id}" does not match directory name`);
  }

  const instructionsPath = join(dir, "instructions.md");
  const envExamplePath = join(dir, ".env.example");

  const filesMissing: string[] = [];
  let filesPresent = 0;
  for (const file of manifest.files ?? []) {
    const fullPath = join(dir, file.path);
    if (existsSync(fullPath)) filesPresent++;
    else filesMissing.push(file.path);
  }

  if (filesMissing.length > 0) {
    warnings.push(`[${dossierId}] ${filesMissing.length} declared file(s) missing: ${filesMissing.join(", ")}`);
  }

  if (!existsSync(instructionsPath)) {
    warnings.push(`[${dossierId}] missing instructions.md`);
  }

  if ((manifest.envVars?.length ?? 0) > 0 && !existsSync(envExamplePath)) {
    warnings.push(`[${dossierId}] declares envVars but no .env.example file`);
  }

  return {
    ...manifest,
    _path: `data/dossiers/${dossierId}`,
    _instructionsExists: existsSync(instructionsPath),
    _envExampleExists: existsSync(envExamplePath),
    _filesPresent: filesPresent,
    _filesMissing: filesMissing,
  };
}

function buildMasterIndex(): MasterIndex {
  const warnings: string[] = [];
  const dossiers: IndexedDossier[] = [];

  for (const id of listDossierDirs()) {
    const indexed = loadManifest(id, warnings);
    if (indexed) dossiers.push(indexed);
  }

  // sort: kind (integration first) then category then id
  dossiers.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "integration" ? -1 : 1;
    if (a.category !== b.category) return a.category.localeCompare(b.category);
    return a.id.localeCompare(b.id);
  });

  const activeCount = dossiers.filter((d) => (d._status ?? "active") === "active").length;
  const draftCount = dossiers.length - activeCount;

  return {
    generatedAt: new Date().toISOString(),
    totalDossiers: dossiers.length,
    activeDossiers: activeCount,
    draftDossiers: draftCount,
    dossiers,
    warnings,
  };
}

function buildByCategoryIndex(master: MasterIndex): ByCategoryIndex {
  // Only active dossiers — drafts are not exposed to runtime.
  const categories: Record<string, string[]> = {};
  for (const dossier of master.dossiers) {
    if ((dossier._status ?? "active") !== "active") continue;
    (categories[dossier.category] ??= []).push(dossier.id);
  }
  for (const cat of Object.keys(categories)) {
    categories[cat]!.sort();
  }
  return {
    generatedAt: master.generatedAt,
    categories,
  };
}

function main(): void {
  mkdirSync(INDEX_ROOT, { recursive: true });

  const master = buildMasterIndex();
  const byCategory = buildByCategoryIndex(master);

  writeFileSync(
    join(INDEX_ROOT, "master.json"),
    JSON.stringify(master, null, 2) + "\n",
    "utf-8",
  );
  writeFileSync(
    join(INDEX_ROOT, "by-category.json"),
    JSON.stringify(byCategory, null, 2) + "\n",
    "utf-8",
  );

  console.log(`[index] ${master.totalDossiers} total (${master.activeDossiers} active, ${master.draftDossiers} draft)`);
  if (master.warnings.length > 0) {
    console.log(`[index] ${master.warnings.length} warnings (drafts often have files: missing — that's expected):`);
    for (const warning of master.warnings.slice(0, 5)) console.log(`  - ${warning}`);
    if (master.warnings.length > 5) console.log(`  ... ${master.warnings.length - 5} more`);
  }
  console.log(`[index] Active categories: ${Object.keys(byCategory.categories).join(", ")}`);
}

main();
