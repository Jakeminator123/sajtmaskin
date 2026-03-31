import { previewUrlField } from "@/lib/api/preview-url-contract";
import { formatSSEEvent } from "@/lib/streaming";
import type { PromptStrategyMeta } from "@/lib/builder/promptOrchestration";
import { isBuildSpecEnabled, type BuildSpec } from "@/lib/gen/build-spec";
import type { ScaffoldManifest } from "@/lib/gen/scaffolds/types";
import type { PreGenerationContractContext } from "@/lib/gen/contract/pre-generation-contracts";
import type { ContractClarificationQuestion } from "@/lib/gen/contract/clarification";
import type { InferredCapabilities } from "@/lib/gen/capability-inference";
import type { CanonicalModelId } from "@/lib/models/catalog";

export type PreGenerationContractGateReadableParams = {
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
  /** New-chat stream only — follow-up omits these keys so SSE meta stays unchanged. */
  chatPrivacy?: string;
  scaffoldLabel?: string | null;
  capabilities?: InferredCapabilities;
};

/**
 * SSE sequence for the pre-generation contract gate (askClarifyingQuestion + awaitingInput).
 * Shared by POST /chats/stream and POST /chats/[chatId]/stream own-engine branches.
 */
export function createPreGenerationContractGateReadableStream(
  p: PreGenerationContractGateReadableParams,
): ReadableStream<Uint8Array> {
  const meta: Record<string, unknown> = {
    modelId: p.engineModel,
    modelTier: p.resolvedModelTier,
    buildProfileId: p.buildProfileId,
    buildProfileLabel: p.buildProfileLabel,
    enginePath: "own-engine",
    thinking: p.resolvedThinking,
    imageGenerations: p.resolvedImageGenerations,
    scaffoldId: p.resolvedScaffold?.id ?? null,
    scaffoldFamily: p.resolvedScaffold?.family ?? null,
    contractDataMode: p.preGenerationContracts.contracts.dataMode,
    contractDatabaseProvider: p.preGenerationContracts.contracts.databaseProvider ?? null,
    contractAuthProvider: p.preGenerationContracts.contracts.authProvider ?? null,
    contractPaymentProvider: p.preGenerationContracts.contracts.paymentProvider ?? null,
    contractIntegrations: p.preGenerationContracts.contracts.integrations,
    contractEnvVars: p.preGenerationContracts.contracts.envVars,
    unresolvedContractDecisions: p.preGenerationContracts.unresolvedDecisions,
    promptStrategy: p.strategyMeta.strategy,
    promptType: p.strategyMeta.promptType,
    promptBudgetTarget: p.strategyMeta.budgetTarget,
    promptOriginalLength: p.strategyMeta.originalLength,
    promptOptimizedLength: p.strategyMeta.optimizedLength,
    promptReductionRatio: p.strategyMeta.reductionRatio,
    promptStrategyReason: p.strategyMeta.reason,
    promptComplexityScore: p.strategyMeta.complexityScore,
    buildSpecEnabled: isBuildSpecEnabled(),
    buildSpec: p.buildSpec,
    systemPromptLength: 0,
    briefApplied: p.metaBriefApplied,
    customInstructionsLength: p.customInstructionsLength,
  };
  if ("chatPrivacy" in p) {
    meta.chatPrivacy = p.chatPrivacy;
  }
  if ("scaffoldLabel" in p) {
    meta.scaffoldLabel = p.scaffoldLabel ?? null;
  }
  if ("capabilities" in p) {
    meta.capabilities = p.capabilities;
  }

  return new ReadableStream({
    start(controller) {
      const enc = new TextEncoder();
      controller.enqueue(enc.encode(formatSSEEvent("chatId", { id: p.sseChatId })));
      controller.enqueue(enc.encode(formatSSEEvent("meta", meta)));
      controller.enqueue(
        enc.encode(
          formatSSEEvent("tool-call", {
            toolName: "askClarifyingQuestion",
            toolCallId: `contracts-${Date.now()}`,
            args: p.contractClarification,
          }),
        ),
      );
      controller.enqueue(enc.encode(formatSSEEvent("content", p.contractClarification.question)));
      controller.enqueue(
        enc.encode(
          formatSSEEvent("done", {
            chatId: p.sseChatId,
            versionId: null,
            messageId: p.assistantMessageId,
            ...previewUrlField(null),
            awaitingInput: true,
            awaitingInputPrompt: p.contractClarification.question,
            reason: "pre_generation_contracts",
          }),
        ),
      );
      controller.close();
    },
  });
}
