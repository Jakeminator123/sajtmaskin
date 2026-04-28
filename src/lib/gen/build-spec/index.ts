/**
 * Barrel re-exports — public API of `@/lib/gen/build-spec`.
 *
 * Split out of the pre-OMTAG-03 monolith `build-spec.ts`. All consumers
 * continue to import from `@/lib/gen/build-spec` (or `./build-spec`)
 * unchanged — Node.js resolves the directory to `index.ts`.
 *
 * Internal-only helpers (`isEffectiveInit`, `SHELL_PAGE_FINGERPRINT`)
 * are intentionally NOT re-exported — only `isShellPageContent` has
 * external consumers (chat-message-stream-post.ts).
 */

export { isShellPageContent } from "./types";
export type {
  BuildSpec,
  BuildSpecCapabilityFlags,
  BuildSpecChangeScope,
  BuildSpecContextPolicy,
  BuildSpecGenerationMode,
  BuildSpecPreviewPolicy,
  BuildSpecQualityTarget,
  BuildSpecTokenBudgets,
  BuildSpecVerificationPolicy,
  RouteRealizationPolicy,
} from "./types";

export { deriveFollowUpContextPolicy } from "./policy-inference";
export { deriveBuildSpec } from "./builder";
