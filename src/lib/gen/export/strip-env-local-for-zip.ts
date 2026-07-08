import type { CodeFile } from "@/lib/gen/parser";

/**
 * Drop the generated placeholder `.env.local` at the ZIP/download boundary
 * (and, identically, at the deploy-file-assembly boundary — see
 * `isGeneratedEnvLocalPath` below).
 *
 * `buildCompleteProject` (via the shared `buildExportableProject`) injects a
 * placeholder `.env.local` so the SHARED verify / quality-gate lane can
 * typecheck/build an env-dependent project without a runtime-injected env. That
 * file is deliberately NOT meant to ship inside a downloadable ZIP: it is
 * gitignored boilerplate and could carry local-only values.
 *
 * Strip it ONLY at artifact boundaries (zip/download, Vercel deploy files) —
 * never in the shared builder and never in the verify lane. Removing it from
 * the shared builder (the approach in the superseded PR #282) regressed the
 * verify lane: an env-dependent project would pass live preview (which
 * injects its own `.env.local`) but fail/repair in the verify lane that
 * relies on the placeholder. Keeping the strip at each boundary fixes the
 * right layer without touching the shared builder.
 *
 * On the public export route, apply this AFTER
 * `sanitizeEnvSecretsForPublicExport`: that step redacts secret VALUES from
 * every `.env*` file; this step then removes the `.env.local` file entirely
 * from the artifact.
 */
export function stripGeneratedEnvLocalForZip(files: CodeFile[]): CodeFile[] {
  return files.filter((file) => !isGeneratedEnvLocalPath(file.path));
}

/**
 * Shared predicate so every artifact boundary (ZIP export, Vercel deploy file
 * assembly) agrees on what counts as the generated placeholder `.env.local` —
 * exported separately because the deploy pipeline works on `{ name, content }`
 * shapes rather than `CodeFile`.
 */
export function isGeneratedEnvLocalPath(path: string): boolean {
  return normalizePath(path) === ".env.local";
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/").trim();
}
