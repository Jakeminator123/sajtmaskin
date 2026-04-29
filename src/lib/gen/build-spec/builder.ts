/**
 * `deriveBuildSpec` — the top-level orchestrator that assembles the
 * BuildSpec from its derived-field inputs.
 *
 * Split out of `build-spec.ts` (OMTAG-03 wave-rest) — no behavior change.
 * Peer helpers live in `./policy-inference.ts`, `./route-realization.ts`,
 * `./style-pack.ts`, `./token-budgets.ts`, `./references.ts`. The public
 * API is re-exported through `./index.ts`.
 */

import type { BuildIntent } from "@/lib/builder/build-intent";
import type { InferredCapabilities } from "../capability-inference";
import type { PreGenerationContractContext } from "../contract/pre-generation-contracts";
import type { RoutePlan } from "../route-plan";
import type { ScaffoldManifest } from "../scaffolds/types";
import {
  inferChangeScope,
  inferContextPolicy,
  inferPreviewPolicy,
  inferQualityTarget,
  inferVerificationPolicy,
  type BuildSpecBriefSignals,
  type PromptStrategyMetaForBuildSpec,
} from "./policy-inference";
import {
  buildRoutePlanSummary,
  deriveRouteRealizationPolicy,
} from "./route-realization";
import { inferStylePack } from "./style-pack";
import { tokenBudgetsForContextPolicy } from "./token-budgets";
import {
  deriveCapabilityFlags,
  deriveForbiddenPatterns,
  deriveReferenceCategories,
} from "./references";
import type {
  BuildSpec,
  BuildSpecGenerationMode,
  BuildSpecPreviewPolicy,
} from "./types";

type DeriveBuildSpecParams = {
  prompt: string;
  buildIntent: BuildIntent;
  generationMode: BuildSpecGenerationMode;
  resolvedScaffold: ScaffoldManifest | null;
  routePlan: RoutePlan;
  preGenerationContracts: PreGenerationContractContext;
  promptStrategyMeta?: PromptStrategyMetaForBuildSpec | null;
  capabilities?: InferredCapabilities | null;
  brief?: BuildSpecBriefSignals;
  /**
   * True when this is the first real code generation in a chat that already
   * has a persistedScaffoldId (e.g. after a contract-gate turn).
   * Treated as effective-init for route realization deferral.
   */
  isFirstCodeGeneration?: boolean;
  /**
   * Route paths whose existing file content is a deferred shell page.
   * On follow-up, routes in this list that the user didn't explicitly
   * target are preserved as shells.
   */
  existingShellRoutePaths?: string[];
  /**
   * Explicit caller-controlled `previewPolicy` override.
   * F3 (`fidelity3`) is ONLY entered via this override — never auto-promoted
   * by prompt heuristics or buildIntent shape. Set by the F3 trigger route
   * (`POST /api/engine/chats/[chatId]/finalize-design`).
   */
  previewPolicyOverride?: BuildSpecPreviewPolicy;
  /**
   * Optional input-context capacity (in tokens) of the model that will
   * actually consume this generation. When provided, `tokenBudgets` are
   * scaled relative to a 200k baseline so a 1M-window model can use a
   * proportionally bigger `systemContextTokens` slice without us having
   * to invent per-tier numbers per provider.
   *
   * Omit (or pass <= 0) to use the legacy default budgets unchanged.
   */
  modelContextWindowTokens?: number;
};

export function deriveBuildSpec(params: DeriveBuildSpecParams): BuildSpec {
  const {
    prompt,
    buildIntent,
    generationMode,
    resolvedScaffold,
    routePlan,
    preGenerationContracts,
    promptStrategyMeta = null,
    capabilities = null,
    brief = null,
    isFirstCodeGeneration,
    existingShellRoutePaths,
    previewPolicyOverride,
    modelContextWindowTokens,
  } = params;

  const capabilityFlags = deriveCapabilityFlags(capabilities);
  const capabilityHeavy = capabilityFlags.heavy;
  const routeRealization = deriveRouteRealizationPolicy({
    generationMode,
    buildIntent,
    prompt,
    routePlan,
    isFirstCodeGeneration,
    existingShellRoutePaths,
  });

  const changeScope = inferChangeScope({
    prompt,
    generationMode,
    routePlan,
    preGenerationContracts,
  });
  const previewPolicy = previewPolicyOverride ?? inferPreviewPolicy();
  const qualityTarget = inferQualityTarget({
    prompt,
    buildIntent,
    generationMode,
    resolvedScaffold,
    routePlan,
    routeRealization,
    preGenerationContracts,
    previewPolicy,
    isFirstCodeGeneration,
    brief,
  });
  const verificationPolicy = inferVerificationPolicy({
    generationMode,
    changeScope,
    previewPolicy,
    capabilityHeavy,
  });
  const { policy: contextPolicy, score: contextPolicyScore } = inferContextPolicy({
    prompt,
    generationMode,
    changeScope,
    buildIntent,
    routePlan,
    routeRealization,
    preGenerationContracts,
    promptStrategyMeta,
    capabilityHeavy,
    isFirstCodeGeneration,
    brief,
  });

  const styleResult = inferStylePack(prompt, buildIntent, resolvedScaffold, changeScope, brief);

  return {
    buildIntent,
    generationMode,
    changeScope,
    scaffoldId: resolvedScaffold?.id ?? null,
    routePlanSummary: buildRoutePlanSummary(routePlan),
    stylePack: styleResult.primary,
    stylePackSecondary: styleResult.secondary,
    qualityTarget,
    previewPolicy,
    verificationPolicy,
    contextPolicy,
    contextPolicyScore,
    referenceCategories: deriveReferenceCategories(
      resolvedScaffold,
      routePlan,
      preGenerationContracts,
    ),
    forbiddenPatterns: deriveForbiddenPatterns({
      buildIntent,
      generationMode,
      changeScope,
      previewPolicy,
    }),
    tokenBudgets: tokenBudgetsForContextPolicy(contextPolicy, modelContextWindowTokens),
    capabilityFlags,
    routeRealization,
  };
}
