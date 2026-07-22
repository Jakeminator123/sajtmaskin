/**
 * Shared generation orchestration — single source of truth for context
 * preparation that own-engine consumers use.
 *
 * Resolves scaffold, builds system prompt context, and returns everything
 * needed so that callers never diverge in what signals reach the model.
 */
//
// Structural split (no behavior change): the implementation now lives in
// `src/lib/gen/orchestrate/`. This file is a thin facade that re-exports the
// exact public surface so existing importers keep working unchanged.

export type {
  FinalizedOrchestrationContext,
  OrchestrationBase,
  OrchestrationInput,
} from "./orchestrate/types";
export { filterDossierCapabilitiesForPrompt } from "./orchestrate/capability-prompt-filter";
export type {
  FollowUpCapabilityFloorDecision,
  FollowUpCapabilityFloorInput,
  FollowUpFreezeSurface,
  FollowUpRouteClampDecision,
  FollowUpRouteClampInput,
  FollowUpRouteFreezeDecision,
  FollowUpRouteFreezeInput,
  FollowUpScaffoldFreezeDecision,
  FollowUpScaffoldFreezeInput,
  FollowUpVariantFreezeDecision,
  FollowUpVariantFreezeInput,
} from "./orchestrate/follow-up-freeze";
export {
  detectFollowUpRouteDrift,
  enforceFollowUpCapabilityFloor,
  enforceFollowUpRouteFreeze,
  enforceFollowUpScaffoldFreeze,
  enforceFollowUpVariantFreeze,
  scopeF3DossierCapabilities,
} from "./orchestrate/follow-up-freeze";
export { resolveGenerationMode } from "./orchestrate/generation-mode";
export { resolveOrchestrationBase } from "./orchestrate/resolve-base";
export { finalizeOrchestrationPrompts } from "./orchestrate/finalize-prompts";
export { prepareGenerationContext } from "./orchestrate/prepare-generation-context";
export type {
  BuildIntentPromotionDecision,
  BuildIntentPromotionInput,
} from "./orchestrate/policy-helpers";
export {
  inheritQualityTargetFromPriorVersion,
  resolveBuildIntentPromotion,
} from "./orchestrate/policy-helpers";
export {
  buildGenerationInputPackage,
  writeOrchestrationDynamicDump,
} from "./orchestrate/generation-package";
