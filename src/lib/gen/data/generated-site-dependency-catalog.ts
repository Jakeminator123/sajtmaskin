import catalog from "../../../../config/generated-site-dependencies.json";

/**
 * Loader for the generator's package-version catalog
 * (`config/generated-site-dependencies.json`).
 *
 * `package.json` in this repo carries three different roles: the app's own
 * runtime, the **generator's package store** (the versions GENERATED sites
 * get), and local tooling. This module owns role 2 so the versions live in ONE
 * declarative file instead of being hardcoded in `dep-completer.ts`,
 * `dependency-utils.ts` and `project-scaffold.ts` (signal-gate rule: change the
 * owner, not five consumers).
 *
 * Nothing here decides what Sajtmaskin itself installs — a package can be in
 * the catalog without being a repo dependency, and vice versa.
 */

/** npm package name → semver range, as written into a generated `package.json`. */
export type DependencyVersionCatalog = Readonly<Record<string, string>>;

/** Repo-relative path, for error messages and docs. */
export const GENERATED_SITE_DEPENDENCY_CATALOG_PATH =
  "config/generated-site-dependencies.json";

/**
 * The complete `package.json` that exported/downloaded projects ship
 * (`project-scaffold.ts` merges model output onto this).
 *
 * `engines.node` deliberately tracks the Vercel/preview-host lane (Node 22):
 * broader ranges can make Vercel pick or warn about runtime versions Next does
 * not support for exported projects.
 */
export const GENERATED_SITE_EXPORT_BASELINE: Readonly<Record<string, unknown>> =
  catalog.exportBaseline;

/**
 * Curated allowlist: third-party packages frequently used by LLM-generated
 * code, mapped to the range the export path pins.
 *
 * Majors stay aligned with {@link GENERATED_SITE_EXPORT_BASELINE} —
 * `dep-completer.test.ts` enforces that for every overlapping key.
 *
 * NOTE: since `dep-version-validator.ts` runs against the live npm registry,
 * this table is only a fast path for common packages. A stale entry (or a major
 * that never shipped, e.g. the historical `lucide-react: "^1"` bug) is caught
 * there and bumped to `^latest`, so entries may be "good enough" rather than
 * perfectly current.
 *
 * Provenance of the non-obvious groups (kept here because JSON has no
 * comments):
 * - `ai` + `@ai-sdk/*` are pinned to the same generation so a generated site
 *   always gets ONE consistent AI SDK major (ai-tool-calling-chat REVIEW
 *   requirement); together with `ably` they came from dossier wave 1
 *   (legacy import 2026-07-08).
 * - `drizzle-orm`/`drizzle-kit`/`pg`/`@types/pg`/`server-only`/
 *   `@neondatabase/serverless`/`mongodb`: dossier wave 2, capability
 *   `database`. The `rag-chat` wave added no new packages — its stack is fully
 *   covered by these plus the AI SDK entries (locked by `dep-completer.test.ts`).
 * - `@paddle/paddle-node-sdk` + `@supabase/ssr` + `@supabase/supabase-js`:
 *   capability `subscriptions` / `supabase-auth` (one entry serves both).
 *   `@supabase/ssr` is 0.x, so the minor is pinned.
 * - `next-sanity`: capability `cms` (dossier Fas D).
 * - `@sentry/nextjs`, `maplibre-gl`, `minisearch`, `@vercel/speed-insights`:
 *   remaining dossier-declared SDKs (2026-07-25). They were reachable through
 *   `resolveCapabilityDependencies` but NOT through the import scan, so code
 *   importing them without the capability being requested shipped a
 *   `package.json` without them → VM "Module not found".
 *   `@vercel/speed-insights` is pinned to the platform's own range so the
 *   generated site gets the major the vercel-analytics dossier was verified
 *   against.
 * - `tokenlens`, `@xyflow/react` (2026-08-04): tipped by the AI-elements
 *   catalog (`src/lib/builder/ai-elements-catalog.ts`) but previously missing
 *   here, so the export path could skip the version pin.
 */
export const GENERATED_SITE_KNOWN_PACKAGES: DependencyVersionCatalog =
  catalog.knownPackages;

/**
 * Scoped package prefixes where any sub-package maps to the same version.
 * E.g. `@radix-ui/react-dialog`, `@radix-ui/react-hover-card` etc. all resolve
 * to `^1`.
 */
export const GENERATED_SITE_SCOPED_PACKAGE_PREFIXES: DependencyVersionCatalog =
  catalog.scopedPackagePrefixes;

/**
 * shadcn/ui-related packages the deploy path guarantees are declared in the
 * generated `package.json` (unified `radix-ui` plus the legacy individual
 * primitives older scaffolds may still reference, and the core utilities).
 */
export const GENERATED_SITE_SHADCN_BASELINE_PACKAGES: readonly string[] =
  catalog.shadcnBaselinePackages;

/**
 * Fallback versions used when a shadcn-related package is detected in
 * generated code but is absent from the hosting repo's own `package.json`.
 * Keeps deploys working when generated code imports something the repo does
 * not use locally.
 */
export const GENERATED_SITE_SHADCN_FALLBACK_VERSIONS: DependencyVersionCatalog =
  catalog.shadcnFallbackVersions;
