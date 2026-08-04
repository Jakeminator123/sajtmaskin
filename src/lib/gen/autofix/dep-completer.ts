import type { AutoFixEntry } from "./pipeline";
import {
  GENERATED_SITE_KNOWN_PACKAGES,
  GENERATED_SITE_SCOPED_PACKAGE_PREFIXES,
} from "@/lib/gen/data/generated-site-dependency-catalog";
import { getAllDossiers } from "@/lib/gen/dossiers/registry";
import { selectDossiersForRequest } from "@/lib/gen/dossiers/select";
import { isNodeCoreModule } from "@/lib/gen/validation/node-core-modules";

const PACKAGE_SOURCE_PATTERN = String.raw`((?:@[^/"']+\/[^"']+)|(?:[^"'./@][^"']*))`;

/**
 * Stale-lockfile protocol (prod incident 2026-07-31, chat 0d52e5c9 → radix-ui).
 *
 * When we mutate `package.json` (pin a missing dependency) while a lockfile
 * exists, the lockfile is now inaccurate. The preview host must run its package
 * manager WITHOUT `--frozen-lockfile` once (otherwise `pnpm install
 * --frozen-lockfile` against warm `node_modules` answers "Already up to date",
 * exit 0, installs nothing, and the new dependency fingerprint is stamped →
 * runtime shows a Next build-error overlay forever). We signal that by writing
 * this sentinel into the project files; the host reads it, runs one non-frozen
 * install, regenerates the lockfile, and returns it so it can be persisted back
 * into `engine_versions.files_json` (clearing this marker in the same write).
 *
 * This is NOT "delete the lockfile as a general fix" — the lockfile is kept and
 * regenerated; only the frozen mode is skipped for exactly one install.
 *
 * The path + JSON shape are a cross-process contract with
 * `preview-host/src/runtime.js` (`LOCKFILE_STALE_MARKER_PATH`,
 * `readStaleLockfileMarker`). Keep both sides in sync.
 */
export const LOCKFILE_STALE_MARKER_PATH = ".sajtmaskin/lockfile-stale.json";

export type LockfilePackageManager = "pnpm" | "yarn" | "npm";

/**
 * Detect which package manager's lockfile the file set carries, or null when
 * there is no lockfile (nothing to mark stale — a fresh `install` regenerates
 * from scratch anyway).
 */
export function detectLockfilePackageManager<T extends { path: string }>(
  files: readonly T[],
): LockfilePackageManager | null {
  const paths = new Set(files.map((f) => f.path.replace(/\\/g, "/")));
  if (paths.has("pnpm-lock.yaml") || paths.has("pnpm-lock.yml")) return "pnpm";
  if (paths.has("yarn.lock")) return "yarn";
  if (paths.has("package-lock.json")) return "npm";
  return null;
}

/** Build the stale-lockfile sentinel JSON body (host-readable shape). */
export function buildStaleLockfileMarkerContent(params: {
  reason: string;
  packageManager: LockfilePackageManager;
  mutatedAt?: string;
}): string {
  return JSON.stringify(
    {
      reason: params.reason,
      packageManager: params.packageManager,
      mutatedAt: params.mutatedAt ?? new Date().toISOString(),
    },
    null,
    2,
  );
}

/**
 * Add (or replace) the stale-lockfile sentinel in a file set. Returns a new
 * array; the original is not mutated. Callers only invoke this when they both
 * mutated `package.json` AND a lockfile is present (see
 * {@link detectLockfilePackageManager}).
 */
export function markLockfileStaleInFiles<T extends { path: string; content: string }>(
  files: readonly T[],
  params: { reason: string; packageManager: LockfilePackageManager; makeFile: (path: string, content: string) => T },
): T[] {
  const content = buildStaleLockfileMarkerContent({
    reason: params.reason,
    packageManager: params.packageManager,
  });
  const idx = files.findIndex(
    (f) => f.path.replace(/\\/g, "/") === LOCKFILE_STALE_MARKER_PATH,
  );
  if (idx >= 0) {
    const next = [...files];
    next[idx] = params.makeFile(LOCKFILE_STALE_MARKER_PATH, content);
    return next;
  }
  return [...files, params.makeFile(LOCKFILE_STALE_MARKER_PATH, content)];
}

/**
 * Static dependency sources in generated code. Supports:
 * - `import x from "pkg"`
 * - `import "pkg/styles.css"`
 * - `require("pkg")`
 * - `import("pkg")`
 *
 * Scoped npm packages are supported (`@scope/name`); path aliases like `@/…`
 * are excluded because the scoped pattern requires a non-slash scope segment.
 */
const IMPORT_SOURCE_RE = new RegExp(
  [
    String.raw`from\s+["']${PACKAGE_SOURCE_PATTERN}["']`,
    String.raw`import\s+["']${PACKAGE_SOURCE_PATTERN}["']`,
    String.raw`require\s*\(\s*["']${PACKAGE_SOURCE_PATTERN}["']\s*\)`,
    String.raw`import\s*\(\s*["']${PACKAGE_SOURCE_PATTERN}["']\s*\)`,
  ].join("|"),
  "g",
);

/**
 * Packages the preview runtime already ships (Next.js, React, tailwind, etc.).
 * These should NOT appear in the dependency list.
 */
const BUILTIN_PACKAGES = new Set([
  "react",
  "react-dom",
  "react/jsx-runtime",
  "next",
  "next/font",
  "next/font/google",
  "next/image",
  "next/link",
  "next/navigation",
  "next/headers",
  "next/server",
  "next/dynamic",
  "tailwindcss",
  "postcss",
  "autoprefixer",
  "typescript",
  "clsx",
  "tailwind-merge",
  "class-variance-authority",
]);

/**
 * Third-party packages frequently used by LLM-generated code.
 * Maps npm package name to latest known compatible version range.
 *
 * The table itself lives in `config/generated-site-dependencies.json`
 * (`knownPackages`) — one declarative owner for every generator version, since
 * `dependency-utils.ts` and `project-scaffold.ts` read the same file. Add or
 * bump packages there; the per-group provenance notes live on the loader in
 * `@/lib/gen/data/generated-site-dependency-catalog`.
 */
export const KNOWN_PACKAGES: Record<string, string> = GENERATED_SITE_KNOWN_PACKAGES;

/**
 * Scoped package prefixes where any sub-package maps to the same version.
 * E.g. `@radix-ui/react-dialog`, `@radix-ui/react-hover-card` etc. all resolve to `^1`.
 */
const SCOPED_PACKAGE_PREFIXES: Record<string, string> =
  GENERATED_SITE_SCOPED_PACKAGE_PREFIXES;

export function resolveKnownVersion(pkg: string): string | undefined {
  const direct = KNOWN_PACKAGES[pkg];
  if (direct) return direct;
  for (const [prefix, version] of Object.entries(SCOPED_PACKAGE_PREFIXES)) {
    if (pkg.startsWith(prefix)) return version;
  }
  return undefined;
}

/**
 * Package → version for every dossier dependency declared in the pinned form
 * the schema allows (`stripe@^14.0.0`). Pure so the mapping is testable without
 * the registry.
 */
export function buildDossierDeclaredVersions(
  dossiers: ReadonlyArray<{ dependencies?: readonly string[] }>,
): Map<string, string> {
  const versions = new Map<string, string>();
  for (const dossier of dossiers) {
    for (const raw of dossier.dependencies ?? []) {
      const { pkg, version } = parseManifestDependencySpec(raw);
      if (pkg && version) versions.set(pkg, version);
    }
  }
  return versions;
}

// Memoized on the registry array identity: `getAllDossiers()` returns the same
// cached array while no manifest changed, so this never re-walks the manifests
// on a hot path (`runDepCompleter` runs per file in the autofix pipeline).
let dossierVersionMemo: {
  entries: ReadonlyArray<unknown>;
  versions: Map<string, string>;
} | null = null;

function dossierDeclaredVersion(pkg: string): string | undefined {
  const entries = getAllDossiers();
  if (!dossierVersionMemo || dossierVersionMemo.entries !== entries) {
    dossierVersionMemo = { entries, versions: buildDossierDeclaredVersions(entries) };
  }
  return dossierVersionMemo.versions.get(pkg);
}

/**
 * The version the EXPORT path can pin for a package, i.e. what
 * `runDepCompleter` will write into the generated `package.json` when it sees
 * the import — the curated allowlist first, then a dossier manifest's own pin.
 *
 * This is the single resolver behind the manifest→export invariant that
 * `generated-only-modules.ts` leans on when it drops an undecidable pre-VM
 * `TS2307`: a dropped diagnostic is only safe while the VM is guaranteed to
 * install the package. Codex P1 on #610: the invariant used to exempt pinned
 * entries, so a pinned dossier dep outside `KNOWN_PACKAGES` was suppressed
 * pre-VM and then missing from `package.json` — the failure just moved to the
 * authoritative VM build.
 */
export function resolveExportableVersion(pkg: string): string | undefined {
  return resolveKnownVersion(pkg) ?? dossierDeclaredVersion(pkg);
}

/**
 * Reduce an import specifier to its npm package name (`ably/promises` → `ably`,
 * `@supabase/ssr/dist/x` → `@supabase/ssr`). Exported because the pre-VM
 * typecheck needs the exact same normalization to map a `TS2307` module
 * specifier back to a package (`generated-only-modules.ts`).
 */
export function normalizePackageName(source: string): string {
  if (source.startsWith("@")) {
    const parts = source.split("/");
    return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : source;
  }
  return source.split("/")[0];
}

/**
 * Packages the preview/VM runtime already ships — plus Node core modules, which
 * have no npm package at all — so they are never pinned into the generated
 * `package.json`. Exported for the dossier-dependency coverage invariant
 * (`dep-completer.test.ts`) and the pre-VM module classifier.
 */
export function isBuiltinPackage(pkg: string): boolean {
  if (BUILTIN_PACKAGES.has(pkg)) return true;
  if (isNodeCoreModule(pkg)) return true;
  for (const b of BUILTIN_PACKAGES) {
    if (pkg.startsWith(`${b}/`)) return true;
  }
  return false;
}

function normalizeCapabilityList(requestedCapabilities: string[] | null | undefined): string[] {
  if (!Array.isArray(requestedCapabilities) || requestedCapabilities.length === 0) return [];
  return Array.from(
    new Set(
      requestedCapabilities
        .map((entry) => entry.trim().toLowerCase())
        .filter(Boolean),
    ),
  );
}

/**
 * Split a dossier manifest `dependencies` entry into package + optional version.
 * The schema allows a semver-pinned form (`stripe@^14.0.0`), so consumers must
 * never treat the raw entry as a package name — exported so the manifest→package
 * mapping has exactly one parser (also used by the pre-VM module classifier and
 * the allowlist-coverage invariant).
 */
export function parseManifestDependencySpec(raw: string): {
  pkg: string;
  version: string | null;
} {
  const trimmed = raw.trim();
  if (!trimmed) return { pkg: "", version: null };
  if (trimmed.startsWith("@")) {
    const match = trimmed.match(/^(@[^/\s]+\/[^@\s]+)(?:@(.+))?$/);
    return { pkg: match?.[1] ?? trimmed, version: match?.[2] ?? null };
  }
  const match = trimmed.match(/^([^@\s]+)(?:@(.+))?$/);
  return { pkg: match?.[1] ?? trimmed, version: match?.[2] ?? null };
}

export function resolveCapabilityDependencies(
  requestedCapabilities: string[] | null | undefined,
): Record<string, string> {
  const deps: Record<string, string> = {};
  const capabilities = normalizeCapabilityList(requestedCapabilities);
  if (capabilities.length === 0) return deps;

  const selection = selectDossiersForRequest({ requestedCapabilities: capabilities });
  for (const selected of selection.selected) {
    for (const rawPkg of selected.entry.dependencies ?? []) {
      const { pkg, version: manifestVersion } = parseManifestDependencySpec(rawPkg);
      if (!pkg) continue;
      if (isBuiltinPackage(pkg)) continue;
      const version = resolveKnownVersion(pkg);
      if (version) {
        deps[pkg] = version;
      } else {
        // Manifest dependencies are curated runtime contract. If the central
        // allowlist lacks a version, use the manifest range when present;
        // otherwise let dep-version-validator resolve `latest` to ^<version>.
        deps[pkg] = manifestVersion?.trim() || "latest";
      }
    }
  }
  return deps;
}

function toDependencyRecord(input: unknown): Record<string, string> {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  return Object.fromEntries(
    Object.entries(input as Record<string, unknown>).filter(
      ([, value]) => typeof value === "string" && value.trim().length > 0,
    ),
  ) as Record<string, string>;
}

export function mergeMissingDependenciesIntoPackageJson(
  packageJson: Record<string, unknown>,
  missingDependencies: Record<string, string>,
): { packageJson: Record<string, unknown>; mergedCount: number } {
  const nextPackageJson = { ...packageJson };
  const dependencies = toDependencyRecord(nextPackageJson.dependencies);
  let mergedCount = 0;
  for (const [name, version] of Object.entries(missingDependencies)) {
    if (dependencies[name]) continue;
    dependencies[name] = version;
    mergedCount += 1;
  }
  if (mergedCount > 0) {
    nextPackageJson.dependencies = dependencies;
  }
  return { packageJson: nextPackageJson, mergedCount };
}

const PROJECT_CODE_FILE_RE = /\.(?:tsx?|jsx?|mjs|cjs)$/i;

/**
 * Deterministic project-wide dependency completion for imported repos
 * (v0 templates / ZIP / GitHub imports).
 *
 * Imported repos skip `buildCompleteProject` (verbatim policy — no baseline
 * force-pins, no scaffold deps), so a follow-up that introduces a new import
 * (e.g. `@clerk/nextjs`) without emitting `package.json` used to leave the
 * template's own `package.json` untouched. The preview host fingerprints only
 * `package.json` + lockfiles, so install was skipped and the runtime 500:ade
 * on the missing module (prod chat 0d52e5c9, 2026-07-31).
 *
 * This helper scans every code file for third-party imports and merges the
 * ones with a KNOWN version pin into the project's EXISTING `package.json`.
 * It never touches already-declared versions (dependencies or
 * devDependencies), so template framework majors and lockfile identities stay
 * intact. Unknown packages are reported but never pinned — guessing "latest"
 * for an arbitrary specifier could break an install that currently works.
 */
export function completeProjectDependencies<
  T extends { path: string; content: string },
>(
  files: T[],
): {
  files: T[];
  pinnedDependencies: Record<string, string>;
  unknownPackages: string[];
} {
  const pkgIdx = files.findIndex((file) => file.path === "package.json");
  if (pkgIdx === -1) {
    return { files, pinnedDependencies: {}, unknownPackages: [] };
  }

  let pkg: Record<string, unknown>;
  try {
    const parsed = JSON.parse(files[pkgIdx].content) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { files, pinnedDependencies: {}, unknownPackages: [] };
    }
    pkg = parsed as Record<string, unknown>;
  } catch {
    return { files, pinnedDependencies: {}, unknownPackages: [] };
  }

  const declared = new Set([
    ...Object.keys(toDependencyRecord(pkg.dependencies)),
    ...Object.keys(toDependencyRecord(pkg.devDependencies)),
  ]);

  const collected: Record<string, string> = {};
  const unknown = new Set<string>();
  for (const file of files) {
    if (!PROJECT_CODE_FILE_RE.test(file.path)) continue;
    const result = runDepCompleter(file.content);
    for (const [name, version] of Object.entries(result.dependencies)) {
      if (declared.has(name)) continue;
      collected[name] = version;
    }
    for (const name of result.unknownPackages) {
      if (!declared.has(name)) unknown.add(name);
    }
  }

  if (Object.keys(collected).length === 0) {
    return { files, pinnedDependencies: {}, unknownPackages: [...unknown] };
  }

  const { packageJson, mergedCount } = mergeMissingDependenciesIntoPackageJson(
    pkg,
    collected,
  );
  if (mergedCount === 0) {
    return { files, pinnedDependencies: {}, unknownPackages: [...unknown] };
  }

  const nextFiles = [...files];
  nextFiles[pkgIdx] = {
    ...files[pkgIdx],
    content: JSON.stringify(packageJson, null, 2),
  };
  return {
    files: nextFiles,
    pinnedDependencies: collected,
    unknownPackages: [...unknown],
  };
}

/**
 * Scan code for third-party import sources and produce a dependency list.
 */
export function runDepCompleter(code: string): {
  dependencies: Record<string, string>;
  unknownPackages: string[];
  fixes: AutoFixEntry[];
  warnings: string[];
} {
  const dependencies: Record<string, string> = {};
  const unknownPackages: string[] = [];
  const seen = new Set<string>();

  IMPORT_SOURCE_RE.lastIndex = 0;
  for (const match of code.matchAll(IMPORT_SOURCE_RE)) {
    const raw = match.slice(1).find((group): group is string => typeof group === "string");
    if (!raw) continue;
    const pkg = normalizePackageName(raw);

    if (seen.has(pkg)) continue;
    seen.add(pkg);

    if (isBuiltinPackage(pkg)) continue;

    if (pkg.startsWith("@/") || pkg.startsWith("~/") || pkg.startsWith(".")) continue;

    const resolvedVersion = resolveExportableVersion(pkg);
    if (resolvedVersion) {
      dependencies[pkg] = resolvedVersion;
    } else {
      unknownPackages.push(pkg);
    }
  }

  const warnings = unknownPackages.map(
    (pkg) => `Unknown third-party package "${pkg}" — may need manual version pinning`,
  );

  return { dependencies, unknownPackages, fixes: [], warnings };
}
