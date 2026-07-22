/**
 * Follow-up prompt-log recording (best-effort). Extracted verbatim from
 * `chat-message-stream-post.ts`.
 */
import type { orchestratePromptMessage } from "@/lib/builder/promptOrchestration";
import type { prepareCredits } from "@/lib/credits/server";
import type { ChatWithMessages } from "@/lib/db/chat-repository-pg";
import { createPromptLog } from "@/lib/db/services/prompt-logs";
import type { normalizeRequestAttachments } from "@/lib/gen/request-metadata";
import type { CanonicalModelId } from "@/lib/models/catalog";
import type { ParsedChatRequestMeta } from "../parse-chat-request-meta";

type CreditCheck = Awaited<ReturnType<typeof prepareCredits>> & { ok: true };

export async function recordFollowUpPromptLog(params: {
  chatId: string;
  engineChat: ChatWithMessages;
  message: string;
  optimizedMessage: string;
  system: string | undefined;
  meta: unknown;
  sessionId: string;
  creditCheck: CreditCheck;
  metaAppProjectId: string | null;
  metaPromptAssistModel: string | null;
  metaPromptAssistDeep: boolean | null;
  metaPromptAssistMode: ParsedChatRequestMeta["promptAssistMode"];
  metaBuildIntent: string | null;
  metaBuildMethod: string | null;
  resolvedModelTier: CanonicalModelId;
  resolvedImageGenerations: boolean;
  resolvedThinking: boolean;
  requestAttachments: ReturnType<typeof normalizeRequestAttachments>;
  promptOrchestration: ReturnType<typeof orchestratePromptMessage>;
}): Promise<void> {
  const {
    chatId,
    engineChat,
    message,
    optimizedMessage,
    system,
    meta,
    sessionId,
    creditCheck,
    metaAppProjectId,
    metaPromptAssistModel,
    metaPromptAssistDeep,
    metaPromptAssistMode,
    metaBuildIntent,
    metaBuildMethod,
    resolvedModelTier,
    resolvedImageGenerations,
    resolvedThinking,
    requestAttachments,
    promptOrchestration,
  } = params;
  try {
    const metaPayload =
      meta && typeof meta === "object"
        ? (() => {
            const copy = { ...(meta as Record<string, unknown>) };
            delete copy.promptOriginal;
            delete copy.promptFormatted;
            copy.promptStrategy = promptOrchestration.strategyMeta.strategy;
            copy.promptType = promptOrchestration.strategyMeta.promptType;
            copy.promptSource = promptOrchestration.strategyMeta.promptSource;
            copy.promptBudgetTarget = promptOrchestration.strategyMeta.budgetTarget;
            copy.promptOptimizedLength = promptOrchestration.strategyMeta.optimizedLength;
            copy.promptReductionRatio = promptOrchestration.strategyMeta.reductionRatio;
            copy.promptStrategyReason = promptOrchestration.strategyMeta.reason;
            copy.promptComplexityScore = promptOrchestration.strategyMeta.complexityScore;
            return Object.keys(copy).length > 0 ? copy : null;
          })()
        : {
            promptStrategy: promptOrchestration.strategyMeta.strategy,
            promptType: promptOrchestration.strategyMeta.promptType,
            promptSource: promptOrchestration.strategyMeta.promptSource,
            promptBudgetTarget: promptOrchestration.strategyMeta.budgetTarget,
            promptOptimizedLength: promptOrchestration.strategyMeta.optimizedLength,
            promptReductionRatio: promptOrchestration.strategyMeta.reductionRatio,
            promptStrategyReason: promptOrchestration.strategyMeta.reason,
            promptComplexityScore: promptOrchestration.strategyMeta.complexityScore,
          };
    await createPromptLog({
      event: "follow_up",
      userId: creditCheck.user?.id ?? null,
      sessionId,
      appProjectId: metaAppProjectId || null,
      v0ProjectId: engineChat.project_id ?? null,
      chatId,
      promptOriginal: message,
      promptFormatted: optimizedMessage,
      systemPrompt: typeof system === "string" ? system.trim() || null : null,
      promptAssistModel: metaPromptAssistModel,
      promptAssistDeep: metaPromptAssistDeep,
      promptAssistMode: metaPromptAssistMode,
      buildIntent: metaBuildIntent,
      buildMethod: metaBuildMethod,
      modelTier: resolvedModelTier,
      imageGenerations: resolvedImageGenerations,
      thinking: resolvedThinking,
      attachmentsCount: requestAttachments.length,
      meta: metaPayload,
    });
  } catch (error) {
    console.warn("[prompt-log] Failed to record follow-up prompt log:", error);
  }
}
