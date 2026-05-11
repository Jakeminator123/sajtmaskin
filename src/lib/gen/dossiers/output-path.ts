/**
 * Dossier path → user-project output path mapping.
 *
 * Background (rotorsak — Jakob 2026-05-01):
 *   Dossiers stage all files under a `components/` folder on disk:
 *
 *     data/dossiers/<class>/<id>/components/<rel-path>
 *
 *   Earlier code unconditionally stripped the `components/` prefix at emit
 *   time, putting every file at user-project root. That created a path
 *   mismatch with the import the manifest exposes:
 *
 *     manifest path           : components/three-canvas-shell.tsx
 *     verbatim emit path (was): three-canvas-shell.tsx        ← root
 *     manifest exposes import : @/components/three-canvas-shell
 *     scaffold tsconfig       : "@/*": ["./*"]
 *     resolved import target  : components/three-canvas-shell.tsx
 *
 *   The verbatim file ended up at the wrong location, the import looked at
 *   the right one, and the LLM was forced to bridge the gap by emitting a
 *   second 2-line stub that dropped half the safety contract. Symptom: the
 *   `three-fiber-canvas` ThreeCanvasShell rendered as half-finished file in
 *   user projects, which broke 3D mounts and the inspector.
 *
 * Mapping rules (only apply when the dossier path starts with `components/`):
 *   1. `components/api/<route>/route.ts`        → `app/api/<route>/route.ts`
 *      (Next.js App Router API routes belong under `app/api/`.)
 *   2. `components/middleware.ts`               → `middleware.ts`
 *      `components/instrumentation.ts`          → `instrumentation.ts`
 *      `components/sentry.<env>.config.ts`      → `sentry.<env>.config.ts`
 *      (Next.js root-level convention files.)
 *   3. `components/lib/<rel>`                   → `lib/<rel>`
 *      (SDK init helpers — imported via `@/lib/...`.)
 *   4. Everything else                          → keep `components/<rel>`
 *      (UI components — imported via `@/components/...`.)
 */

const ROOT_LEVEL_FILES = new Set([
  "middleware.ts",
  "instrumentation.ts",
]);

const SENTRY_CONFIG_RE = /^sentry\.(client|server|edge)\.config\.ts$/;

/**
 * Maps a dossier-internal `path` from `manifest.json#files[].path` to the
 * file path that lands in the generated user project.
 *
 * Idempotent: paths that don't start with `components/` are returned
 * unchanged, so it's safe to call multiple times in the pipeline.
 */
export function mapDossierPathToOutput(dossierPath: string): string {
  if (!dossierPath.startsWith("components/")) {
    return dossierPath;
  }
  const rest = dossierPath.slice("components/".length);

  if (rest.startsWith("api/")) {
    return `app/${rest}`;
  }

  if (ROOT_LEVEL_FILES.has(rest) || SENTRY_CONFIG_RE.test(rest)) {
    return rest;
  }

  if (rest.startsWith("lib/")) {
    return rest;
  }

  return dossierPath;
}
