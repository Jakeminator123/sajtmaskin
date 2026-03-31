/**
 * Shared own-engine stream assembly for POST /chats/stream and POST /chats/[chatId]/stream.
 * Routes keep auth, credits, and persistence; this module keeps generation SSE meta consistent.
 */
import type { PromptStrategyMeta } from "@/lib/builder/promptOrchestration";
import { isBuildSpecEnabled, type BuildSpec } from "@/lib/gen/build-spec";
import type { ContractClarificationQuestion } from "@/lib/gen/contract-clarification";
import type { InferredCapabilities } from "@/lib/gen/capability-inference";
import type { OrchestrationBase } from "@/lib/gen/orchestrate";
import type { PreGenerationContractContext } from "@/lib/gen/pre-generation-contracts";
import type { ScaffoldManifest } from "@/lib/gen/scaffolds/types";
import type { GenerationStreamMeta } from "@/lib/providers/own-engine/generation-stream";
import type { PreGenerationContractGateReadableParams } from "@/lib/providers/own-engine/pre-generation-contract-gate";
import type { CanonicalModelId } from "@/lib/models/catalog";

type OwnEngineContractGateCommon = {
  sseChatId: string;
  assistantMessageId: string | null;
  contractClarification: ContractClarificationQuestion;
  preGenerationContracts: PreGenerationContractContext;
  engineModel: string;
  resolvedModelTier: CanonicalModelId;
  buildProfileId: string;
  buildProfileLabel: string;
  resolvedThinking: boolean;
  resolvedImageGenerations: boolean;
  resolvedScaffold: ScaffoldManifest | null;
  strategyMeta: PromptStrategyMeta;
  buildSpec: BuildSpec;
  metaBriefApplied: boolean;
  customInstructionsLength: number;
};

export type OwnEngineContractGateParamsInput = OwnEngineContractGateCommon &
  (
    | {
        routeVariant: "new-chat";
        chatPrivacy: string;
        scaffoldLabel: string | null;
        capabilities: InferredCapabilities;
      }
    | { routeVariant: "follow-up" }
  );

/**
 * Params for `createPreGenerationContractGateReadableStream`.
 * New-chat adds `chatPrivacy` / `scaffoldLabel` / `capabilities`; follow-up omits them (SSE parity).
 */
export function buildPreGenerationContractGateParams(
  input: OwnEngineContractGateParamsInput,
): PreGenerationContractGateReadableParams {
  const {
    sseChatId,
    assistantMessageId,
    contractClarification,
    preGenerationContracts,
    engineModel,
    resolvedModelTier,
    buildProfileId,
    buildProfileLabel,
    resolvedThinking,
    resolvedImageGenerations,
    resolvedScaffold,
    strategyMeta,
    buildSpec,
    metaBriefApplied,
    customInstructionsLength,
  } = input;

  const base: PreGenerationContractGateReadableParams = {
    sseChatId,
    assistantMessageId,
    contractClarification,
    preGenerationContracts,
    engineModel,
    resolvedModelTier,
    buildProfileId,
    buildProfileLabel,
    resolvedThinking,
    resolvedImageGenerations,
    resolvedScaffold,
    strategyMeta,
    buildSpec,
    metaBriefApplied,
    customInstructionsLength,
  };

  if (input.routeVariant === "new-chat") {
    return {
      ...base,
      chatPrivacy: input.chatPrivacy,
      scaffoldLabel: input.scaffoldLabel,
      capabilities: input.capabilities,
    };
  }

  return base;
}

export type OwnEngineGenerationStreamMetaInput = {
  engineModel: string;
  resolvedModelTier: CanonicalModelId;
  buildProfileId: string;
  buildProfileLabel: string;
  resolvedThinking: boolean;
  resolvedImageGenerations: boolean;
  strategyMeta: PromptStrategyMeta;
  orchestrationBase: OrchestrationBase;
  buildSpec: BuildSpec;
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
    buildSpecEnabled: isBuildSpecEnabled(),
    buildSpec: input.buildSpec,
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
