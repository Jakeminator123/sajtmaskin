/**
 * Dossier registry — disk-backed, mtime-cached.
 *
 * Layout:
 *   data/dossiers/hard/<id>/manifest.json   (+ instructions.md, components/...)
 *   data/dossiers/soft/<id>/manifest.json   (+ instructions.md, components/...)
 *
 * No central master.json, no embeddings, no scaffold-recommendations.
 * The registry walks the two folders directly. mtime-cache makes hot-reload
 * cheap in dev; production reads happen once per server boot.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

import type { DossierClass, DossierEntry } from "./types";
import { validateDossierManifest } from "./validate-manifest";

const ROOT = resolve(process.cwd(), "data", "dossiers");
const CLASSES: readonly DossierClass[] = ["hard", "soft"] as const;

interface Cache<T> {
  mtimeMs: number;
  value: T;
}

const _entryCache = new Map<string, Cache<DossierEntry>>();
const _instrCache = new Map<string, Cache<string>>();
const _fileCache = new Map<string, Cache<string>>();
let _listCache: { signature: string; entries: DossierEntry[] } | null = null;

function dirMtime(p: string): number {
  if (!existsSync(p)) return 0;
  try {
    return statSync(p).mtimeMs;
  } catch {
    return 0;
  }
}

function fileMtime(p: string): number | null {
  if (!existsSync(p)) return null;
  try {
    return statSync(p).mtimeMs;
  } catch {
    return null;
  }
}

function listIds(klass: DossierClass): string[] {
  const dir = join(ROOT, klass);
  if (!existsSync(dir)) return [];
  try {
    // Sort explicitly: readdirSync returns filesystem-dependent order, which
    // makes downstream selection non-deterministic when two dossiers share a
    // capability and neither has defaultForCapability=true. select.ts sorts
    // again before picking, but buildCapabilityBulletList and any future
    // first-wins consumer relies on this layer being stable across machines.
    return readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isDirectory() && !d.name.startsWith("_"))
      .map((d) => d.name)
      .sort();
  } catch {
    return [];
  }
}

function loadEntry(klass: DossierClass, id: string): DossierEntry | null {
  const manifestPath = join(ROOT, klass, id, "manifest.json");
  const mtime = fileMtime(manifestPath);
  if (mtime === null) return null;
  const cacheKey = `${klass}/${id}`;
  const cached = _entryCache.get(cacheKey);
  if (cached && cached.mtimeMs === mtime) return cached.value;
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(manifestPath, "utf-8"));
  } catch (err) {
    console.warn(
      `[dossiers] invalid JSON in ${klass}/${id}/manifest.json — dossier excluded from pool. Error: ${
        err instanceof Error ? err.message : err
      }`,
    );
    return null;
  }
  // Fas 2·D: strict AJV validation. Dossiers that don't match
  // `docs/schemas/strict/dossier.schema.json` are REJECTED rather than
  // silently loaded with safe defaults. A malformed manifest can't sneak
  // into the prompt-injection pool anymore.
  const result = validateDossierManifest(parsed, { expectedId: id, class: klass });
  if (!result.valid) {
    console.warn(
      `[dossiers] ${klass}/${id}/manifest.json failed schema validation — dossier excluded from pool:\n  - ${result.errors.join(
        "\n  - ",
      )}`,
    );
    return null;
  }
  const data = result.data;
  const entry: DossierEntry = {
    class: klass,
    id,
    label: data.label,
    capability: data.capability,
    codeFidelity: data.codeFidelity,
    complexity: data.complexity,
    defaultForCapability: data.defaultForCapability === true,
    summary: data.summary,
    envVars: data.envVars,
    dependencies: data.dependencies,
    files: data.files,
    exposes: data.exposes,
    lastVerified: data.lastVerified,
    sourceRepoUrl: data.sourceRepoUrl,
    notes: data.notes,
    promptInstructionMode: data.promptInstructionMode,
  };
  _entryCache.set(cacheKey, { mtimeMs: mtime, value: entry });
  return entry;
}

/**
 * Returns all dossiers across hard/ + soft/. Cheap to call. The signature
 * combines directory mtimes (catches add/remove) with each manifest's mtime
 * (catches in-place edits) so the list invalidates when any manifest is
 * touched in dev — without needing a process restart.
 */
export function getAllDossiers(): DossierEntry[] {
  const dirSig = `${dirMtime(ROOT)}:${dirMtime(join(ROOT, "hard"))}:${dirMtime(join(ROOT, "soft"))}`;
  const manifestParts: string[] = [];
  for (const klass of CLASSES) {
    for (const id of listIds(klass)) {
      const m = fileMtime(join(ROOT, klass, id, "manifest.json"));
      if (m !== null) manifestParts.push(`${klass}/${id}=${m}`);
    }
  }
  const signature = `${dirSig}|${manifestParts.sort().join(",")}`;
  if (_listCache && _listCache.signature === signature) return _listCache.entries;
  const out: DossierEntry[] = [];
  for (const klass of CLASSES) {
    for (const id of listIds(klass)) {
      const entry = loadEntry(klass, id);
      if (entry) out.push(entry);
    }
  }
  _listCache = { signature, entries: out };
  return out;
}

export function getDossierById(id: string): DossierEntry | null {
  return getAllDossiers().find((d) => d.id === id) ?? null;
}

export function getDossiersByCapability(capability: string): DossierEntry[] {
  const cap = capability.toLowerCase();
  return getAllDossiers().filter((d) => d.capability.toLowerCase() === cap);
}

/** Read instructions.md for a dossier; mtime-cached. Returns "" if missing. */
export function getDossierInstructions(klass: DossierClass, id: string): string {
  const path = join(ROOT, klass, id, "instructions.md");
  const mtime = fileMtime(path);
  if (mtime === null) return "";
  const key = `${klass}/${id}`;
  const cached = _instrCache.get(key);
  if (cached && cached.mtimeMs === mtime) return cached.value;
  const text = readFileSync(path, "utf-8");
  _instrCache.set(key, { mtimeMs: mtime, value: text });
  return text;
}

/**
 * Read a file inside a dossier directory; mtime-cached. Returns null if
 * missing or path-traversal is detected. Used for verbatim file injection.
 *
 * The traversal check uses `path.resolve` so that Windows separators and
 * symlink-style ".." segments are normalized before the prefix comparison.
 */
export function getDossierFileContent(
  klass: DossierClass,
  id: string,
  relPath: string,
): string | null {
  const norm = relPath.replace(/\\/g, "/");
  if (norm.includes("..") || norm.startsWith("/")) return null;
  const dir = resolve(ROOT, klass, id);
  const path = resolve(dir, ...norm.split("/"));
  if (path !== dir && !path.startsWith(dir + (process.platform === "win32" ? "\\" : "/"))) {
    return null;
  }
  const mtime = fileMtime(path);
  if (mtime === null) return null;
  const key = `${klass}/${id}/${norm}`;
  const cached = _fileCache.get(key);
  if (cached && cached.mtimeMs === mtime) return cached.value;
  let text: string;
  try {
    text = readFileSync(path, "utf-8");
  } catch {
    return null;
  }
  _fileCache.set(key, { mtimeMs: mtime, value: text });
  return text;
}

export interface DossierExposesInfo {
  dossierId: string;
  klass: DossierClass;
  capability: string;
  importPath: string;
}

/**
 * Returns dossier info if `importPath` matches any dossier's `exposes[].import`.
 * Used by cross-file-import-checker to identify stubs for dossier-exposed paths
 * and attach observability metadata instead of silently creating generic stubs.
 */
export function getDossierExposesByImportPath(importPath: string): DossierExposesInfo | null {
  for (const dossier of getAllDossiers()) {
    for (const expose of dossier.exposes ?? []) {
      if (expose.import === importPath) {
        return {
          dossierId: dossier.id,
          klass: dossier.class,
          capability: dossier.capability,
          importPath: expose.import,
        };
      }
    }
  }
  return null;
}

/** Build the {capability → [ids]} map. Used for backoffice listing. */
export function getCapabilityMap(): Record<string, string[]> {
  const map: Record<string, string[]> = {};
  for (const d of getAllDossiers()) {
    (map[d.capability] ??= []).push(d.id);
  }
  for (const cap of Object.keys(map)) map[cap].sort();
  return map;
}

/** Test helper / hot-reload — clear all caches. */
export function clearDossierRegistryCache(): void {
  _entryCache.clear();
  _instrCache.clear();
  _fileCache.clear();
  _listCache = null;
}

/**
 * Path-traversal helper exposed for tests. Returns true if `relPath`
 * resolves inside the dossier directory; false otherwise.
 */
export function isSafeDossierPath(klass: DossierClass, id: string, relPath: string): boolean {
  const norm = relPath.replace(/\\/g, "/");
  if (norm.includes("..") || norm.startsWith("/")) return false;
  const dir = resolve(ROOT, klass, id);
  const path = resolve(dir, ...norm.split("/"));
  const rel = path.slice(dir.length);
  return path.startsWith(dir) && (rel === "" || rel.startsWith("\\") || rel.startsWith("/"));
}
