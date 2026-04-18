/**
 * Tier-3 SDK deny-list loader.
 *
 * Reads `config/integrations/tier3-sdk-deny.json` (single source of truth) and
 * exposes:
 *
 *  - `loadTier3DenyList()`       → categorised structure (mtime-cached)
 *  - `listTier3SdkModules()`     → flat module specifier list
 *                                  (consumed by `tier3-sdk-guard-fixer`)
 *  - `renderTier3F2DenyBlockLines()` → markdown bullet lines, one per
 *                                  category, used inside the dynamic
 *                                  "F2 / Design Stage Contract (HARD)" block
 *                                  in `system-prompt.ts`.
 *
 * Adding a new tier-3 SDK happens in one place (the JSON). Both the
 * autofix matcher and the LLM-facing prompt block update automatically.
 *
 * The loader uses `require()` for `node:fs` to keep Turbopack's static
 * analyser out of the file-system path, mirroring `static-core-loader.ts`.
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const PROJECT_ROOT = join(/* turbopackIgnore: true */ process.cwd());

function getDenyListPath(): string {
  return join(
    /* turbopackIgnore: true */ PROJECT_ROOT,
    "config",
    "integrations",
    "tier3-sdk-deny.json",
  );
}

export interface Tier3DenyCategory {
  label: string;
  modules: readonly string[];
}

export interface Tier3DenyList {
  categories: readonly Tier3DenyCategory[];
  /** Flat module list aggregated from all categories, preserving order. */
  modules: readonly string[];
  /** O(1) membership check for the flat module list. Built once per file load. */
  moduleSet: ReadonlySet<string>;
  /** Subset of `modules` that start with `@` (scoped); used for subpath matching. */
  scopedModules: readonly string[];
}

interface RawDenyJson {
  categories?: unknown;
}

interface RawCategory {
  label?: unknown;
  modules?: unknown;
}

type Cache = { mtimeMs: number; data: Tier3DenyList } | null;
let _cache: Cache = null;

function parseDenyJson(raw: string, sourcePath: string): Tier3DenyList {
  let parsed: RawDenyJson;
  try {
    parsed = JSON.parse(raw) as RawDenyJson;
  } catch {
    throw new Error(`[sajtmaskin] Invalid JSON: ${sourcePath}`);
  }

  const rawCategories = parsed.categories;
  if (!Array.isArray(rawCategories) || rawCategories.length === 0) {
    throw new Error(
      `[sajtmaskin] Tier-3 deny list at ${sourcePath} must contain a non-empty 'categories' array`,
    );
  }

  const categories: Tier3DenyCategory[] = [];
  const modules: string[] = [];
  const seen = new Set<string>();

  for (const entry of rawCategories as RawCategory[]) {
    const label = typeof entry.label === "string" ? entry.label.trim() : "";
    const rawModules = entry.modules;
    if (!label) {
      throw new Error(
        `[sajtmaskin] Tier-3 deny list category missing label in ${sourcePath}`,
      );
    }
    if (!Array.isArray(rawModules) || rawModules.length === 0) {
      throw new Error(
        `[sajtmaskin] Tier-3 deny list category '${label}' has no modules in ${sourcePath}`,
      );
    }
    const categoryModules: string[] = [];
    for (const mod of rawModules) {
      if (typeof mod !== "string" || !mod.trim()) {
        throw new Error(
          `[sajtmaskin] Tier-3 deny list category '${label}' contains a non-string/empty module in ${sourcePath}`,
        );
      }
      const normalized = mod.trim();
      if (seen.has(normalized)) {
        throw new Error(
          `[sajtmaskin] Tier-3 deny list contains duplicate module '${normalized}' in ${sourcePath}`,
        );
      }
      seen.add(normalized);
      categoryModules.push(normalized);
      modules.push(normalized);
    }
    categories.push({ label, modules: categoryModules });
  }

  const moduleSet = new Set(modules);
  const scopedModules = modules.filter((mod) => mod.startsWith("@"));
  return { categories, modules, moduleSet, scopedModules };
}

export function loadTier3DenyList(): Tier3DenyList {
  const path = getDenyListPath();
  if (!existsSync(/* turbopackIgnore: true */ path)) {
    throw new Error(
      `[sajtmaskin] Missing tier-3 deny list at ${path}. Expected JSON with a 'categories' array.`,
    );
  }
  const mtimeMs = statSync(/* turbopackIgnore: true */ path).mtimeMs;
  if (_cache && _cache.mtimeMs === mtimeMs) {
    return _cache.data;
  }
  const raw = readFileSync(/* turbopackIgnore: true */ path, "utf8");
  const data = parseDenyJson(raw, path);
  _cache = { mtimeMs, data };
  return data;
}

/** Flat list of every tier-3 SDK module specifier (consumed by autofix). */
export function listTier3SdkModules(): readonly string[] {
  return loadTier3DenyList().modules;
}

/**
 * Match a module specifier against the deny-list. Returns true for either an
 * exact module match (`"stripe"`) or a scoped subpath import
 * (`"@stripe/stripe-js/server"` matches `"@stripe/stripe-js"`).
 *
 * Uses the loader's pre-built Set + scoped subset so this is O(1) for exact
 * hits and O(scoped) for scoped subpaths — significantly faster than the
 * old per-call linear scan over all ~50 modules.
 */
export function isTier3SdkModule(specifier: string): boolean {
  const { moduleSet, scopedModules } = loadTier3DenyList();
  if (moduleSet.has(specifier)) return true;
  for (const mod of scopedModules) {
    if (specifier.startsWith(`${mod}/`)) return true;
  }
  return false;
}

/**
 * Render the per-category bullet lines for the dynamic F2 deny-list block
 * in `system-prompt.ts`. Each line is one category, e.g.:
 *
 *   "  - Payments: `stripe`, `@stripe/stripe-js`, `@stripe/react-stripe-js`"
 *
 * The caller controls the surrounding narrative ("FORBIDDEN in F2 …"); this
 * function only emits the data rows so the prompt and the autofix can never
 * drift apart.
 */
export function renderTier3F2DenyBlockLines(): string[] {
  const { categories } = loadTier3DenyList();
  return categories.map((category) => {
    const formatted = category.modules.map((mod) => `\`${mod}\``).join(", ");
    return `  - ${category.label}: ${formatted}`;
  });
}

/** Test-only: clears the mtime cache so unit tests can re-read the JSON. */
export function _resetTier3DenyCacheForTests(): void {
  _cache = null;
}
