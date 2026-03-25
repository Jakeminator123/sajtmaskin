/**
 * Shared own-engine stream assembly for POST /chats/stream and POST /chats/[chatId]/stream.
 * Routes keep auth, credits, and persistence; this module keeps generation SSE meta consistent.
 */
import type { PromptStrategyMeta } from "@/lib/builder/promptOrchestration";
import type { OrchestrationBase } from "@/lib/gen/orchestrate";
import type { GenerationStreamMeta } from "@/lib/providers/own-engine/generation-stream";
import type { CanonicalModelId } from "@/lib/models/catalog";

export type OwnEngineGenerationStreamMetaInput = {
  engineModel: string;
  resolvedModelTier: CanonicalModelId;
  buildProfileId: string;
  buildProfileLabel: string;
  resolvedThinking: boolean;
  resolvedImageGenerations: boolean;
  strategyMeta: PromptStrategyMeta;
  orchestrationBase: OrchestrationBase;
  engineSystemPromptLength: number;
  metaBriefApplied: boolean;
  customInstructionsLength: number;
  scaffoldId: string | null;
  scaffoldFamily: string | null;
} & (
  | { routeVariant: "new-chat"; chatPrivacy: string; scaffoldLabel: string | null }
  | { routeVariant: "follow-up" }
);

/**
 * Builds the `meta` object passed to `createOwnEngineGenerationStream`.
 * Follow-up responses intentionally omit `chatPrivacy` / `scaffoldLabel` (see pre-generation-contract-gate parity).
 */
export function buildOwnEngineGenerationStreamMeta(
  input: OwnEngineGenerationStreamMetaInput,
): GenerationStreamMeta {
  const { orchestrationBase: orch, strategyMeta: sm } = input;
  const meta: GenerationStreamMeta = {
    modelId: input.engineModel,
    modelTier: input.resolvedModelTier,
    buildProfileId: input.buildProfileId,
    buildProfileLabel: input.buildProfileLabel,
    enginePath: "own-engine",
    thinking: input.resolvedThinking,
    imageGenerations: input.resolvedImageGenerations,
    scaffoldId: input.scaffoldId,
    scaffoldFamily: input.scaffoldFamily,
    capabilities: orch.capabilities,
    contractDataMode: orch.preGenerationContracts.contracts.dataMode,
    contractDatabaseProvider: orch.preGenerationContracts.contracts.databaseProvider ?? null,
    contractAuthProvider: orch.preGenerationContracts.contracts.authProvider ?? null,
    contractPaymentProvider: orch.preGenerationContracts.contracts.paymentProvider ?? null,
    contractIntegrations: orch.preGenerationContracts.contracts.integrations,
    contractEnvVars: orch.preGenerationContracts.contracts.envVars,
    unresolvedContractDecisions: orch.preGenerationContracts.unresolvedDecisions,
    promptStrategy: sm.strategy,
    promptType: sm.promptType,
    promptBudgetTarget: sm.budgetTarget,
    promptOriginalLength: sm.originalLength,
    promptOptimizedLength: sm.optimizedLength,
    promptReductionRatio: sm.reductionRatio,
    promptStrategyReason: sm.reason,
    promptComplexityScore: sm.complexityScore,
    systemPromptLength: input.engineSystemPromptLength,
    briefApplied: input.metaBriefApplied,
    customInstructionsLength: input.customInstructionsLength,
  };
  if (input.routeVariant === "new-chat") {
    (meta as Record<string, unknown>).chatPrivacy = input.chatPrivacy;
    (meta as Record<string, unknown>).scaffoldLabel = input.scaffoldLabel;
  }
  return meta;
}
