/**
 * Prompt-loggraden för init-strömmen. Extraherad verbatim ur
 * `create-chat-stream-post.ts` (samma try/catch, samma fältordning) — bara
 * indenteringen är justerad till den nya funktionsnivån.
 */
import { createPromptLog } from "@/lib/db/services/prompt-logs";
import type { BriefTrace } from "@/lib/builder/site-brief-generation";
import type { ParsedChatRequestMeta } from "../parse-chat-request-meta";
import type {
  CreateChatCreditUser,
  CreateChatModelTier,
  CreateChatRequestAttachments,
  CreateChatRequestData,
  CreateChatStrategyMeta,
} from "./types";

export async function recordCreateChatPromptLog(params: {
  meta: CreateChatRequestData["meta"];
  strategyMeta: CreateChatStrategyMeta;
  serverAutoBrief: Record<string, unknown> | null;
  serverAutoBriefModel: string | null;
  serverAutoBriefTrace: BriefTrace | null;
  briefQuality: "full" | "server-auto" | "none";
  creditUser: CreateChatCreditUser;
  sessionId: string;
  metaAppProjectId: ParsedChatRequestMeta["appProjectId"];
  projectId: CreateChatRequestData["projectId"];
  message: string;
  optimizedMessage: string;
  trimmedSystemPrompt: string;
  parsedMeta: ParsedChatRequestMeta;
  metaBuildIntent: ParsedChatRequestMeta["buildIntent"];
  metaBuildMethod: ParsedChatRequestMeta["buildMethod"];
  resolvedModelTier: CreateChatModelTier;
  resolvedImageGenerations: boolean;
  resolvedThinking: boolean;
  requestAttachments: CreateChatRequestAttachments;
}): Promise<void> {
  const {
    meta,
    strategyMeta,
    serverAutoBrief,
    serverAutoBriefModel,
    serverAutoBriefTrace,
    briefQuality,
    creditUser,
    sessionId,
    metaAppProjectId,
    projectId,
    message,
    optimizedMessage,
    trimmedSystemPrompt,
    parsedMeta,
    metaBuildIntent,
    metaBuildMethod,
    resolvedModelTier,
    resolvedImageGenerations,
    resolvedThinking,
    requestAttachments,
  } = params;

  try {
    const metaPayload =
      meta && typeof meta === "object"
        ? (() => {
            const copy = { ...(meta as Record<string, unknown>) };
            delete copy.promptOriginal;
            delete copy.promptFormatted;
            copy.promptStrategy = strategyMeta.strategy;
            copy.promptType = strategyMeta.promptType;
            copy.promptSource = strategyMeta.promptSource;
            copy.promptBudgetTarget = strategyMeta.budgetTarget;
            copy.promptOptimizedLength = strategyMeta.optimizedLength;
            copy.promptReductionRatio = strategyMeta.reductionRatio;
            copy.promptStrategyReason = strategyMeta.reason;
            copy.promptComplexityScore = strategyMeta.complexityScore;
            copy.serverAutoBriefGenerated = Boolean(serverAutoBrief);
            copy.briefQuality = briefQuality;
            if (serverAutoBriefModel) copy.serverAutoBriefModel = serverAutoBriefModel;
            if (serverAutoBriefTrace) {
              copy.serverAutoBriefTraceId = serverAutoBriefTrace.traceId;
              copy.serverAutoBriefPromptHash = serverAutoBriefTrace.promptHash;
            }
            return Object.keys(copy).length > 0 ? copy : null;
          })()
        : {
            promptStrategy: strategyMeta.strategy,
            promptType: strategyMeta.promptType,
            promptSource: strategyMeta.promptSource,
            promptBudgetTarget: strategyMeta.budgetTarget,
            promptOptimizedLength: strategyMeta.optimizedLength,
            promptReductionRatio: strategyMeta.reductionRatio,
            promptStrategyReason: strategyMeta.reason,
            promptComplexityScore: strategyMeta.complexityScore,
            serverAutoBriefGenerated: Boolean(serverAutoBrief),
            briefQuality,
            ...(serverAutoBriefModel ? { serverAutoBriefModel } : {}),
            ...(serverAutoBriefTrace
              ? {
                  serverAutoBriefTraceId: serverAutoBriefTrace.traceId,
                  serverAutoBriefPromptHash: serverAutoBriefTrace.promptHash,
                }
              : {}),
          };
    const metaObj = meta && typeof meta === "object" ? (meta as Record<string, unknown>) : null;
    const promptOriginal =
      typeof metaObj?.promptOriginal === "string"
        ? String(metaObj.promptOriginal)
        : message ?? null;
    const promptFormatted =
      typeof metaObj?.promptFormatted === "string"
        ? String(metaObj.promptFormatted)
        : optimizedMessage ?? null;
    await createPromptLog({
      event: "create_chat",
      userId: creditUser?.id || null,
      sessionId,
      appProjectId: metaAppProjectId || null,
      v0ProjectId: projectId ?? null,
      chatId: null,
      promptOriginal,
      promptFormatted,
      systemPrompt: trimmedSystemPrompt || null,
      promptAssistModel: parsedMeta.promptAssistModel,
      promptAssistDeep: parsedMeta.promptAssistDeep,
      promptAssistMode: parsedMeta.promptAssistMode,
      buildIntent: metaBuildIntent,
      buildMethod: metaBuildMethod,
      modelTier: resolvedModelTier,
      imageGenerations: resolvedImageGenerations,
      thinking: resolvedThinking,
      attachmentsCount: requestAttachments.length,
      meta: metaPayload,
    });
  } catch (error) {
    console.warn("[prompt-log] Failed to record prompt log:", error);
  }
}
