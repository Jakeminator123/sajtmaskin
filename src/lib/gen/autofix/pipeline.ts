/**
 * Fasad för den deterministiska autofix-pipelinen (Normalize).
 *
 * Implementationen ligger i `pipeline-steps/` sedan 2026-08-04 (mekanisk
 * uppdelning, oförändrad publik yta):
 *   pipeline-steps/types.ts                        → AutoFixEntry/Result/Context
 *   pipeline-steps/use-client-fixer.ts             → fixUseClient (internt)
 *   pipeline-steps/tailwind-font-arbitrary-fixer.ts→ fixTailwindFontArbitrary (internt)
 *   pipeline-steps/syntax-validation.ts            → validateSyntax + guardFixerSyntax
 *   pipeline-steps/single-pass.ts                  → runAutoFixSinglePass (internt)
 *   pipeline-steps/run-auto-fix.ts                 → runAutoFix (multi-pass)
 *   pipeline-steps/rebuild-content.ts              → rebuildContent
 *
 * Per-fil-fixarna nedan extraherades till `rules/` 2026-04-21 och
 * re-exporteras här för befintliga anropare (`repair-generated-files.ts`).
 */
export type { AutoFixContext, AutoFixEntry, AutoFixResult } from "./pipeline-steps/types";
export { guardFixerSyntax } from "./pipeline-steps/syntax-validation";
export { runAutoFix } from "./pipeline-steps/run-auto-fix";
export { rebuildContent } from "./pipeline-steps/rebuild-content";
export { fixMetadataClientConflict } from "./rules/metadata-client-conflict-fixer";
export { fixIconComponentValueMisuse } from "./rules/icon-component-value-fixer";
export { ensureTier2PreviewBasePathInNextConfig } from "./rules/tier2-preview-base-path-fixer";
