import type { BuildProfileId, CanonicalModelId } from "@/lib/models/catalog";
import { resolvePhaseModel } from "@/lib/models/phase-routing";
import type { BuildSpec } from "@/lib/gen/build-spec";
import type { ScaffoldManifest } from "@/lib/gen/scaffolds";
import { createSSEHeaders } from "@/lib/streaming";
import { parsePlanResponse } from "@/lib/gen/plan/prompt";
import { enrichPlanArtifactForReview } from "@/lib/gen/plan/review";
import { createPlanModeStream } from "@/lib/gen/stream/plan-mode-stream";

type PlanArtifact = Record<string, unknown>;

type PromptStrategyMetaLike = {
  strategy?: string | null;
  promptType?: string | null;
  budgetTarget?: unknown;
  originalLength?: number | null;
  optimizedLength?: number | null;
  reductionRatio?: number | null;
  reason?: unknown;
  complexityScore?: unknown;
};

export function createOwnEnginePlanModeResponse(params: {
  pipelineStream: ReadableStream<Uint8Array>;
  chatId?: string;
  modelTier: CanonicalModelId;
  buildProfileId: BuildProfileId;
  buildProfileLabel: string;
  thinking: boolean;
  promptStrategyMeta: PromptStrategyMetaLike;
  buildSpec: BuildSpec;
  resolvedScaffold?: ScaffoldManifest | null;
  scaffoldMode: "auto" | "manual" | "off";
  persistAssistantSummary: (planData: PlanArtifact, hasBlockers: boolean) => Promise<void>;
  buildDonePayload: (planData: PlanArtifact, hasBlockers: boolean) => Record<string, unknown>;
  commitCredits: () => Promise<void>;
  commitCreditsPosition?: "before-done" | "after-done";
  onResolved?: (
    planData: PlanArtifact,
    hasBlockers: boolean,
    accumulatedContent: string,
  ) => Promise<void> | void;
  normalizeQuestionToolCallIds?: boolean;
}): Response {
  const {
    pipelineStream,
    chatId,
    modelTier,
    buildProfileId,
    buildProfileLabel,
    thinking,
    promptStrategyMeta,
    buildSpec,
    resolvedScaffold,
    scaffoldMode,
    persistAssistantSummary,
    buildDonePayload,
    commitCredits,
    commitCreditsPosition = "after-done",
    onResolved,
    normalizeQuestionToolCallIds = false,
  } = params;

  const planStream = createPlanModeStream({
    pipelineStream,
    chatId,
    meta: {
      modelId: resolvePhaseModel(modelTier, "planner").modelId,
      modelTier,
      buildProfileId,
      buildProfileLabel,
      enginePath: "plan-mode",
      thinking,
      planMode: true,
      scaffoldId: resolvedScaffold?.id ?? null,
      promptStrategy: promptStrategyMeta.strategy ?? null,
      promptType: promptStrategyMeta.promptType ?? null,
      promptBudgetTarget: promptStrategyMeta.budgetTarget ?? null,
      promptOriginalLength: promptStrategyMeta.originalLength ?? null,
      promptOptimizedLength: promptStrategyMeta.optimizedLength ?? null,
      promptReductionRatio: promptStrategyMeta.reductionRatio ?? null,
      promptStrategyReason: promptStrategyMeta.reason ?? null,
      promptComplexityScore: promptStrategyMeta.complexityScore ?? null,
      buildSpec,
    },
    enrichPlanArtifact: (toolArgs) =>
      enrichPlanArtifactForReview(toolArgs, {
        resolvedScaffold: resolvedScaffold ?? null,
        scaffoldMode,
      }),
    resolvePlanArtifact: (accumulatedContent, toolPlanArtifact) =>
      enrichPlanArtifactForReview(
        toolPlanArtifact ?? parsePlanResponse(accumulatedContent),
        {
          resolvedScaffold: resolvedScaffold ?? null,
          scaffoldMode,
        },
      ),
    persistAssistantSummary,
    buildDonePayload,
    commitCredits,
    commitCreditsPosition,
    onResolved,
    normalizeQuestionToolCallIds,
  });

  return new Response(planStream, {
    headers: createSSEHeaders(),
  });
}
