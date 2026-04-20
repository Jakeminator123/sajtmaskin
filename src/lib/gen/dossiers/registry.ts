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
    return readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isDirectory() && !d.name.startsWith("_"))
      .map((d) => d.name);
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
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(readFileSync(manifestPath, "utf-8")) as Record<string, unknown>;
  } catch (err) {
    console.warn(
      `[dossiers] invalid JSON in ${manifestPath}: ${err instanceof Error ? err.message : err}`,
    );
    return null;
  }
  const entry: DossierEntry = {
    class: klass,
    id,
    label: typeof parsed.label === "string" ? parsed.label : id,
    capability: typeof parsed.capability === "string" ? parsed.capability : "uncategorized",
    codeFidelity:
      parsed.codeFidelity === "verbatim" || parsed.codeFidelity === "rewritable"
        ? parsed.codeFidelity
        : klass === "hard"
        ? "verbatim"
        : "rewritable",
    complexity:
      parsed.complexity === "simple" || parsed.complexity === "advanced" ? parsed.complexity : "medium",
    defaultForCapability: parsed.defaultForCapability === true,
    summary: typeof parsed.summary === "string" ? parsed.summary : "",
    envVars: Array.isArray(parsed.envVars) ? (parsed.envVars as DossierEntry["envVars"]) : undefined,
    dependencies: Array.isArray(parsed.dependencies)
      ? (parsed.dependencies as string[])
      : undefined,
    files: Array.isArray(parsed.files) ? (parsed.files as DossierEntry["files"]) : undefined,
    exposes: Array.isArray(parsed.exposes) ? (parsed.exposes as DossierEntry["exposes"]) : undefined,
    lastVerified: typeof parsed.lastVerified === "string" ? parsed.lastVerified : "",
    sourceRepoUrl: typeof parsed.sourceRepoUrl === "string" ? parsed.sourceRepoUrl : undefined,
    notes: typeof parsed.notes === "string" ? parsed.notes : undefined,
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
