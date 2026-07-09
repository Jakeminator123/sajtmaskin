import type { PreviewStartContract } from "@/lib/gen/stream/preflight-contract";

/**
 * Verifier-finding shape used for build-breaking classification.
 * Mirrors `runVerifierPass` output without pulling that module in.
 */
export interface VerifierFinding {
  id: string;
  detail: string;
}

/**
 * Heuristics that mark a verifier finding as "render impossible — do
 * not let the VM start". Restricted to the narrow build-breaking class:
 *
 *   - finding-id `build-breaking-missing-imports` (the verifier already
 *     knows this category)
 *   - TS compiler errors that mean a referenced symbol cannot resolve
 *     (`TS2304` / `TS2307` / `TS2552`)
 *   - Free-form messages from server-verify like `Cannot find name X`,
 *     `Cannot find module Y`, `X is not exported from Y`
 *   - `undefined-jsx-symbol` and `autofix-preview-blocking`
 *   - `r3f-client-boundary` — a runtime-fatal R3F `<Canvas>` missing
 *     `"use client"` (passes typecheck, crashes the preview)
 *   - import name-resolution failures: `import-name-collision` and
 *     `build-*-import` finding ids, plus TS2440 / "conflicts with" /
 *     "shadows" / "collides with" / "no import for" / "is not imported"
 *     details (prod incident 2026-07-09: an `import-name-collision` finding
 *     — `Uint8Array` imported from `@/components/uint8-array` while used as
 *     the global typed array — stayed advisory and the version was promoted
 *     as "verified", though `/api/assistant` would have crashed in prod).
 *
 * Design quality findings (e.g. `navigation-placeholder-actions`,
 * `footer-dead-links`, motion-reduce / reduced-motion-stub), eslint
 * warnings, Product Postcheck rows and other "soft" signals are
 * intentionally NOT classified here — they stay advisory in F2.
 */
const BUILD_BREAKING_PATTERNS: readonly RegExp[] = [
  /\bTag mismatch for <[A-Z]\w*>/i,
  /\bCannot find name\b/i,
  /\bCannot find module\b/i,
  /\bis not exported from\b/i,
  /\bTS2304\b/,
  /\bTS2307\b/,
  /\bTS2552\b/,
  // Import name-resolution / collision class (all break the build).
  // `conflicts with` and `shadows` are anchored to an import/name-resolution
  // context word in the same sentence so verifier DESIGN copy ("hero conflicts
  // with footer rhythm", "the card shadows are too subtle") is never
  // misclassified as build-breaking. The context word may sit before OR after
  // the verb ("import of X conflicts with the global", "TS2440: Import
  // declaration conflicts with local declaration").
  /\bTS2440\b/,
  /\b(?:import(?:ed)?|global|identifier|declaration|binding|name|type)\b[^.]*\bconflicts with\b/i,
  /\bconflicts with\b[^.]*\b(?:import(?:ed)?|global|identifier|declaration|binding|name|type)\b/i,
  /\bshadows\b[^.]*\b(?:global|import(?:ed)?|binding|declaration|module|name|built-in)\b/i,
  /\bcollides with\b/i,
  /\bno import for\b/i,
  /\bis not imported\b/i,
];

// Import-related finding ids that always break the build. `import-name-collision`
// is the LLM verifier's own id; `build-invalid-import` / `build-missing-import`
// (and any `build-*-import` sibling) are the build-lane variants. Ids are
// LLM-emitted and can vary in casing, so matching is case-insensitive.
const BUILD_BREAKING_IMPORT_ID_RE = /^build-[a-z-]*import$/i;

/**
 * Import name-resolution finding ids that always break the build. Shared with
 * `verifier-pass.ts` (FORCE-BLOCKING promotion) so a finding the LLM drops in
 * the `quality` bucket is still routed to the blocking lane that this
 * classifier gates on — single source of truth for the id class.
 */
export function isBuildBreakingImportFindingId(id: string): boolean {
  const normalized = id.toLowerCase();
  if (normalized === "import-name-collision") return true;
  return BUILD_BREAKING_IMPORT_ID_RE.test(normalized);
}

export function isBuildBreakingFinding(finding: VerifierFinding): boolean {
  if (finding.id === "build-breaking-missing-imports") return true;
  if (finding.id === "undefined-jsx-symbol") return true;
  if (finding.id === "autofix-preview-blocking") return true;
  if (isBuildBreakingImportFindingId(finding.id)) return true;
  // `r3f-client-boundary` is a deterministic RUNTIME blocker: a React Three
  // Fiber `<Canvas>` in a file without `"use client"` passes typecheck but
  // crashes the preview in Next App Router (server-component / client-hook
  // error → dead preview). It must stay render-dead so F2 keeps gating it
  // (Codex #317 P1; matches the "R3F/WebGL boundary that kills the preview"
  // class the F2 contract explicitly still blocks).
  if (finding.id === "r3f-client-boundary") return true;
  if (!finding.detail) return false;
  return BUILD_BREAKING_PATTERNS.some((re) => re.test(finding.detail));
}

export function hasBuildBreakingVerifierFindings(
  findings: readonly VerifierFinding[] | undefined | null,
): boolean {
  if (!findings || findings.length === 0) return false;
  return findings.some(isBuildBreakingFinding);
}

/**
 * Own-engine: whether tier-2 live preview should start after finalize.
 * Compatibility preview is no longer a primary runtime path.
 *
 * SAJ-61 P0/c4: gates ALSO on build-breaking verifier findings. A
 * preview that boots against TypeScript-broken code shows a white
 * page or a red SSR overlay, which the user reads as "the platform
 * is broken". Surfacing "Preview blockerad av TypeScript/importfel"
 * via a status string is strictly better than that.
 *
 * The gate applies only to the build-breaking class (see
 * `isBuildBreakingFinding`). Quality findings, design warnings,
 * Product Postcheck and similar non-render-blocking signals do not
 * stop the preview — they are reported separately.
 */
export function shouldStartOwnEnginePreview(params: {
  isPreviewConfigured: boolean;
  previewStart: PreviewStartContract;
  parsedFileCount: number;
  /**
   * When true, a verifier blocking finding indicates the generated
   * code cannot render (missing imports / typecheck failure). Set this
   * via `hasBuildBreakingVerifierFindings(finalized.verifierBlockingFindings)`.
   */
  verifierHasBuildBreakingFindings?: boolean;
}): boolean {
  if (params.verifierHasBuildBreakingFindings === true) return false;
  return (
    params.isPreviewConfigured &&
    params.previewStart.canStartPreview &&
    params.parsedFileCount > 0
  );
}
