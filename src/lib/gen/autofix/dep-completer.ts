import { getAllDossiers, getDossierById } from "@/lib/gen/dossiers/registry";
import { selectDossiersForRequest } from "@/lib/gen/dossiers/select";
import type { DossierEntry } from "@/lib/gen/dossiers/types";
import { isNodeCoreModule } from "@/lib/gen/validation/node-core-modules";
import platformPackageJson from "../../../../package.json";
import type { AutoFixEntry } from "./pipeline";

const PLATFORM_DECLARED_DEPENDENCIES: Readonly<Record<string, string>> = {
  ...platformPackageJson.dependencies,
  ...platformPackageJson.devDependencies,
};

/**
 * Return the dependency range used by the platform's warm pre-VM typecheck.
 *
 * The static JSON import is resolved from this module, not from the process
 * launch directory. That keeps production bundles and non-root invocations
 * deterministic. Missing declarations fail fast instead of silently reviving
 * a stale handwritten fallback.
 */
function platformDeclaredRange(packageName: string): string {
  const range = PLATFORM_DECLARED_DEPENDENCIES[packageName];
  if (!range?.trim()) {
    throw new Error(`Missing ${packageName} in the platform package.json`);
  }
  return range;
}

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
    // `(?<![@\w])` keeps this JS branch off CSS's `@import "…"`, which is a
    // different grammar: its specifier may be a relative path WITHOUT a `./`
    // prefix (`@import "theme/colors.css"`), so letting the JS branch claim it
    // turned a local folder name into an unknown-package warning. CSS is
    // handled by CSS_AT_IMPORT_RE below, which knows those rules. The
    // word-boundary half also stops `xyzimport "…"` from matching.
    String.raw`(?<![@\w])import\s+["']${PACKAGE_SOURCE_PATTERN}["']`,
    String.raw`require\s*\(\s*["']${PACKAGE_SOURCE_PATTERN}["']\s*\)`,
    String.raw`(?<![@\w])import\s*\(\s*["']${PACKAGE_SOURCE_PATTERN}["']\s*\)`,
  ].join("|"),
  "g",
);

/**
 * Named package `@import` in CSS / Tailwind v4.
 *
 * Supported forms (package string extracted; Tailwind suffixes ignored):
 * - `@import "pkg";` / `@import 'pkg';`
 * - `@import "pkg" layer(...)` / `source(...)` / `theme(...)`
 * - `@import url("pkg/dist/x.css");` / `@import url('pkg');`
 * - `@import url(pkg/dist/x.css);` — unquoted, which CSS allows
 *
 * Never treated as a package (caller filters via {@link isCssPackageImportSource}):
 * - Relative `@import "./x.css"` / `../y.css`
 * - Root-absolute `@import "/fonts/..."`
 * - Network/data URLs (`http:`, `https:`, `data:`, protocol-relative `//`)
 * - Bare `url(...)` without `@import`
 */
const CSS_AT_IMPORT_RE =
  /@import\s+(?:url\s*\(\s*)?(?:["']([^"']+)["']|([^"'()\s;]+)\s*\))/gi;

/** True when a CSS `@import` source looks like an npm package specifier. */
export function isCssPackageImportSource(source: string): boolean {
  const trimmed = source.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith(".") || trimmed.startsWith("/")) return false;
  if (trimmed.startsWith("//")) return false;
  // Protocol URLs (http:, https:, data:, …) — not npm packages.
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) return false;
  return true;
}

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
 * Keep majors aligned with `project-scaffold.ts` PACKAGE_JSON baseline —
 * `dep-completer.test.ts` enforces this automatically for all overlapping keys.
 *
 * NOTE: Sedan vi infört `dep-version-validator.ts` som kör mot live
 * npm-registret är denna tabell BARA en snabb fast-path för vanliga paket.
 * Om en post är stale (eller en major aldrig publicerats, t.ex. det historiska
 * `lucide-react: "^1"`-felet) så fångar validatorn det och bumpar till
 * `^latest`. Tabellen kan därmed vara mer "good enough" än "perfekt aktuell".
 */
const CANONICAL_PROJECT_DEPENDENCY_PINS = {
  "radix-ui": "1.6.7",
} as const satisfies Readonly<Record<string, string>>;

export const KNOWN_PACKAGES: Record<string, string> = {
  "recharts": "^2",
  "framer-motion": "^12",
  "motion": "^12",
  "@tanstack/react-table": "^8",
  "@tanstack/react-query": "^5",
  "@tanstack/react-virtual": "^3",
  "date-fns": "^4",
  "zod": "^4",
  "zustand": "^5",
  "jotai": "^2",
  "react-hook-form": "^7",
  "@hookform/resolvers": "^5",
  "@reduxjs/toolkit": "^2",
  "react-redux": "^9",
  "lucide-react": "0.577.0",
  "canvas-confetti": "^1.9",
  "react-error-boundary": "^6",
  "react-intersection-observer": "^10",
  "radix-ui": CANONICAL_PROJECT_DEPENDENCY_PINS["radix-ui"],
  "cmdk": "^1",
  "sonner": "^2",
  "vaul": "^1",
  "embla-carousel-react": "^8",
  "embla-carousel-autoplay": "^8",
  "@calcom/embed-react": "^1.5.3",
  "react-day-picker": "^9",
  "input-otp": "^1",
  "react-resizable-panels": "^4",
  "next-themes": "^0.4",
  // Prompt + variant addenda teach `@import "tw-animate-css"` in globals.css.
  // Deploy already pins it (`dependency-utils.ts`); preview dep-completer must
  // too or install misses the package (M#ma1 / chat 4cc467d2).
  "tw-animate-css": "^1.3.4",
  "@vercel/analytics": "^1.6.1",
  "nuqs": "^2",
  "swr": "^2",
  "axios": "^1",
  "lodash": "^4",
  "uuid": "^10",
  "nanoid": "^5",
  "sharp": "^0.33",
  "mapbox-gl": "^3",
  "react-map-gl": "^7",
  "three": "0.185.1",
  "@react-three/fiber": "9.6.0",
  "@react-three/drei": "10.7.7",
  "@react-three/rapier": "2.2.0",
  "gsap": "^3",
  "lottie-react": "^2",
  "react-icons": "^5",
  "react-hot-toast": "^2",
  "react-toastify": "^10",
  "react-spring": "^9",
  "react-use": "^17",
  "usehooks-ts": "^3",
  "@dnd-kit/core": "^6",
  "@dnd-kit/sortable": "^8",
  "react-beautiful-dnd": "^13",
  "prismjs": "^1",
  "highlight.js": "^11",
  "marked": "^15",
  "react-markdown": "^9",
  "next-mdx-remote": "^6",
  "remark-gfm": "^4",
  "rehype-highlight": "^7",
  "chart.js": "^4",
  "react-chartjs-2": "^5",
  "@visactor/react-vchart": "^2",
  "d3": "^7",
  "visx": "^3",
  "mathjs": "^13",
  "katex": "^0.16",
  "stripe": "^20",
  "@stripe/stripe-js": "^8",
  "@clerk/nextjs": "^6",
  "resend": "^6",
  // Dossier wave 1 (legacy import 2026-07-08): ably-realtime,
  // fal-image-generation (+ parked ai-tool-calling-chat). `ai` + the live
  // OpenAI chat packages are copied from the statically imported platform
  // package.json. The warm pre-VM typecheck reuses the platform node_modules,
  // while the authoritative VM installs these generated-project ranges; using
  // one declaration prevents a false-green precheck after a platform bump.
  // `acceptance-project.test.ts` guards the materialized project as well.
  "ably": "^2",
  "ai": platformDeclaredRange("ai"),
  "@ai-sdk/openai": platformDeclaredRange("@ai-sdk/openai"),
  "@ai-sdk/fal": "^3",
  "@ai-sdk/react": platformDeclaredRange("@ai-sdk/react"),
  // Dossier wave 2 (legacy import 2026-07-08, capability `database`):
  // postgres-drizzle is the sole live dossier (neon-postgres / mongodb-atlas
  // parked 2026-08-06). Majors verified against the npm registry 2026-07-08
  // (`npm view <pkg> version`). Parked rag-chat's stack was covered by the
  // same pins (ai / @ai-sdk/* above + drizzle/pg below).
  "drizzle-orm": "^0.45",
  "drizzle-kit": "^0.31",
  "pg": "^8",
  "@types/pg": "^8",
  "server-only": "0.0.1",
  // vercel-blob-media dossier (2026-09-02). Major verified against the npm
  // registry 2026-09-02 (`npm view @vercel/blob version` → 2.8.0).
  "@vercel/blob": "^2",
  // neon-postgres / mongodb-atlas (parked 2026-08-06) — the pins stay as an
  // import-scan fallback for legacy-version code, like ably/@ai-sdk/fal /
  // @paddle above.
  "@neondatabase/serverless": "^1",
  "mongodb": "^7",
  // paddle-billing (parked 2026-08-06) — the @paddle pin stays as an
  // import-scan fallback for legacy-version code, like ably/@ai-sdk/fal above.
  // Majors verified against the npm registry 2026-07-09
  // (`npm view <pkg> version`). @supabase/ssr is 0.x so we pin the minor.
  // NOTE: @supabase/ssr + @supabase/supabase-js are SHARED with the
  // supabase-auth dossier (provider sibling under the `auth` capability since
  // the 2026-07-22 merge) — one entry serves both.
  "@paddle/paddle-node-sdk": "^3",
  "@supabase/ssr": "^0.12",
  "@supabase/supabase-js": "^2",
  // Kept as a freehand-import pin after sanity-cms was parked 2026-09-02 (same
  // treatment as @paddle/paddle-node-sdk above). Major verified 2026-07-09.
  "next-sanity": "^13",
  // Remaining dossier-declared SDKs (2026-07-25). These were reachable through
  // `resolveCapabilityDependencies` (manifest fallback → "latest") but NOT
  // through the import scan, so generated code that imported them without the
  // capability being requested shipped a package.json without them → VM
  // "Module not found". `dep-completer.test.ts` now asserts the whole manifest
  // dependency union resolves here, and `generated-only-modules.ts` relies on
  // that invariant when it drops undecidable pre-VM TS2307s.
  // Majors verified against the npm registry 2026-07-25 (`npm view <pkg> version`).
  "@sentry/nextjs": "^10",
  "maplibre-gl": "^6",
  minisearch: "^7",
  // Pinned to the platform's own range so the generated site gets the major the
  // vercel-analytics dossier was verified against (repo: ^1.3.1).
  "@vercel/speed-insights": "^1.3.1",
  // Legacy/freehand import-scan fallbacks. Sajtmaskin does not need these
  // packages at runtime, but generated user code must still receive a
  // deterministic version when it imports them.
  tokenlens: "^1",
  "@xyflow/react": "^12",
};

/**
 * Scoped package prefixes where any sub-package maps to the same version.
 * E.g. `@radix-ui/react-dialog`, `@radix-ui/react-hover-card` etc. all resolve to `^1`.
 */
const SCOPED_PACKAGE_PREFIXES: Record<string, string> = {
  "@radix-ui/react-": "^1",
};

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
  selectedDossierIds?: string[] | null,
): Record<string, string> {
  const deps: Record<string, string> = {};
  const capabilities = normalizeCapabilityList(requestedCapabilities);
  if (capabilities.length === 0) return deps;

  const collect = (entry: DossierEntry) => {
    for (const rawPkg of entry.dependencies ?? []) {
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
  };

  // SM-006: the user's ACTUAL dossier picks take precedence. Re-selecting
  // from capabilities alone always lands on `defaultForCapability`, which
  // silently swapped e.g. a chosen supabase-auth for the clerk default and
  // injected the wrong provider's SDK stack. Capability re-selection stays
  // only as legacy fallback for capabilities no picked id covers (old
  // streams/evals without `selectedDossierIds` metadata).
  const pickedEntries = (selectedDossierIds ?? [])
    .map((id) => (typeof id === "string" ? getDossierById(id.trim().toLowerCase()) : null))
    .filter((entry): entry is DossierEntry => entry !== null);
  const coveredCapabilities = new Set(
    pickedEntries.map((entry) => entry.capability.toLowerCase()),
  );
  for (const entry of pickedEntries) collect(entry);

  const residualCapabilities = capabilities.filter(
    (capability) => !coveredCapabilities.has(capability),
  );
  if (residualCapabilities.length > 0) {
    const selection = selectDossiersForRequest({
      requestedCapabilities: residualCapabilities,
    });
    for (const selected of selection.selected) collect(selected.entry);
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

function normalizeCanonicalProjectDependencies(
  packageJson: Record<string, unknown>,
): Record<string, string> {
  const normalized: Record<string, string> = {};
  for (const section of ["dependencies", "devDependencies"] as const) {
    const rawSection = packageJson[section];
    if (!rawSection || typeof rawSection !== "object" || Array.isArray(rawSection)) continue;

    let nextSection: Record<string, unknown> | undefined;
    for (const [name, canonicalVersion] of Object.entries(
      CANONICAL_PROJECT_DEPENDENCY_PINS,
    )) {
      const currentVersion = (rawSection as Record<string, unknown>)[name];
      if (typeof currentVersion !== "string" || currentVersion === canonicalVersion) continue;
      nextSection ??= { ...(rawSection as Record<string, unknown>) };
      nextSection[name] = canonicalVersion;
      normalized[name] = canonicalVersion;
    }
    if (nextSection) packageJson[section] = nextSection;
  }
  return normalized;
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

/** JS/TS modules plus CSS (named `@import` packages, e.g. tw-animate-css). */
const PROJECT_CODE_FILE_RE = /\.(?:tsx?|jsx?|mjs|cjs|css)$/i;

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
 * This helper scans every code/CSS file for third-party imports and merges the
 * ones with a KNOWN version pin into the project's EXISTING `package.json`.
 * It preserves already-declared versions (dependencies or devDependencies)
 * except for the small explicit canonical-pin allowlist above. This keeps
 * template framework majors intact while preventing known-broken dependency
 * versions from bypassing the import scanner. Unknown packages are reported
 * but never pinned — guessing "latest" for an arbitrary specifier could break
 * an install that currently works.
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

  const normalizedDependencies = normalizeCanonicalProjectDependencies(pkg);

  const declared = new Set([
    ...Object.keys(toDependencyRecord(pkg.dependencies)),
    ...Object.keys(toDependencyRecord(pkg.devDependencies)),
  ]);

  const collected: Record<string, string> = {};
  const unknown = new Set<string>();
  for (const file of files) {
    if (!PROJECT_CODE_FILE_RE.test(file.path)) continue;
    // A pure stylesheet gets ONLY the CSS `@import` grammar: the JS pass's
    // `from "…"` arm would otherwise match prose in CSS comments and pin
    // packages the project never imports (bugbot on #813).
    const result = runDepCompleter(
      file.content,
      /\.css$/i.test(file.path) ? { grammar: "css" } : undefined,
    );
    for (const [name, version] of Object.entries(result.dependencies)) {
      if (declared.has(name)) continue;
      collected[name] = version;
    }
    for (const name of result.unknownPackages) {
      if (!declared.has(name)) unknown.add(name);
    }
  }

  if (
    Object.keys(collected).length === 0 &&
    Object.keys(normalizedDependencies).length === 0
  ) {
    return { files, pinnedDependencies: {}, unknownPackages: [...unknown] };
  }

  const { packageJson, mergedCount } = mergeMissingDependenciesIntoPackageJson(
    pkg,
    collected,
  );
  if (mergedCount === 0 && Object.keys(normalizedDependencies).length === 0) {
    return { files, pinnedDependencies: {}, unknownPackages: [...unknown] };
  }

  const nextFiles = [...files];
  nextFiles[pkgIdx] = {
    ...files[pkgIdx],
    content: JSON.stringify(packageJson, null, 2),
  };
  return {
    files: nextFiles,
    pinnedDependencies: { ...normalizedDependencies, ...collected },
    unknownPackages: [...unknown],
  };
}

function considerPackageSource(
  raw: string,
  seen: Set<string>,
  dependencies: Record<string, string>,
  unknownPackages: string[],
  options?: { knownOnly?: boolean },
): void {
  const pkg = normalizePackageName(raw);

  if (isBuiltinPackage(pkg)) return;

  if (pkg.startsWith("@/") || pkg.startsWith("~/") || pkg.startsWith(".")) return;

  const resolvedVersion = resolveExportableVersion(pkg);

  // `knownOnly` (CSS): an unresolvable specifier is dropped SILENTLY instead of
  // being reported as an unknown package — and without claiming the name in
  // `seen`, so a later JS import of the same name is still judged on its own.
  // See the CSS loop for why an unknown CSS specifier is not evidence.
  if (options?.knownOnly && !resolvedVersion) return;

  if (seen.has(pkg)) return;
  seen.add(pkg);

  if (resolvedVersion) {
    dependencies[pkg] = resolvedVersion;
  } else {
    unknownPackages.push(pkg);
  }
}

/**
 * Scan code (and CSS `@import`) for third-party import sources and produce a
 * dependency list.
 *
 * `grammar: "css"` skips the JS import pass entirely: a pure stylesheet has no
 * JS imports, but `IMPORT_SOURCE_RE`'s `from "…"` arm can still match prose in
 * a CSS comment — e.g. an "adapted from \"framer-motion\"" note — and pin a
 * package the project never uses. Callers that scan a whole-project BLOB
 * (mixed JS + CSS concatenated) keep the default: they cannot attribute
 * content per file, and that behaviour predates the CSS scanning.
 */
export function runDepCompleter(
  code: string,
  opts?: { grammar?: "all" | "css" },
): {
  dependencies: Record<string, string>;
  unknownPackages: string[];
  fixes: AutoFixEntry[];
  warnings: string[];
} {
  const dependencies: Record<string, string> = {};
  const unknownPackages: string[] = [];
  const seen = new Set<string>();

  if ((opts?.grammar ?? "all") !== "css") {
    IMPORT_SOURCE_RE.lastIndex = 0;
    for (const match of code.matchAll(IMPORT_SOURCE_RE)) {
      const raw = match.slice(1).find((group): group is string => typeof group === "string");
      if (!raw) continue;
      considerPackageSource(raw, seen, dependencies, unknownPackages);
    }
  }

  // CSS is scanned with `knownOnly`, i.e. as a strict allow-list against
  // KNOWN_PACKAGES. A CSS `@import` specifier is genuinely ambiguous in a way a
  // JS one is not: `@import "theme/colors.css"` and `@import url(ui/base.css)`
  // are RELATIVE FILE PATHS, but they carry no `./` for the prefix check to
  // catch, so their first segment would otherwise be treated as a package name.
  // The bug this scanning exists for (`tw-animate-css`) is always a package we
  // already know, so requiring a known pin costs nothing and removes the whole
  // class of false positives — including polluting `unknownPackages`, whose
  // warnings feed the repair prompt.
  CSS_AT_IMPORT_RE.lastIndex = 0;
  for (const match of code.matchAll(CSS_AT_IMPORT_RE)) {
    // Group 1 = quoted source, group 2 = unquoted `url(...)` source.
    const raw = match[1] ?? match[2];
    if (!raw || !isCssPackageImportSource(raw)) continue;
    considerPackageSource(raw, seen, dependencies, unknownPackages, { knownOnly: true });
  }

  const warnings = unknownPackages.map(
    (pkg) => `Unknown third-party package "${pkg}" — may need manual version pinning`,
  );

  return { dependencies, unknownPackages, fixes: [], warnings };
}
