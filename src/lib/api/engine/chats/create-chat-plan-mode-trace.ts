/**
 * Init-turens plan-läge: samma entry/exit-kontrakt som follow-up-turen.
 *
 * Chat-raden finns redan (create-chat-stream-post.ts har mintat id och
 * persisterat user-raden). Pipeline skapas här, efter entry, så ett kastande
 * planner-anrop fortfarande kan lämna en matchande exit.
 */
import type { BuildSpec } from "@/lib/gen/build-spec";
import type { ScaffoldManifest } from "@/lib/gen/scaffolds";
import type { BuildProfileId, CanonicalModelId } from "@/lib/models/catalog";
import {
  createPlanModePipelineStream,
  resolvePlanModePlannerSettings,
} from "@/lib/own-engine/session/own-engine-plan-mode";
import { createOwnEnginePlanModeResponse } from "@/lib/providers/own-engine/plan-mode-response";
import {
  persistPlanModeAssistantAndRecordExit,
  persistPlanModePlannerInvocationFailure,
} from "./chat-message-stream/plan-mode-persist";
import { recordPlanModeTurnEntry } from "./chat-message-stream/plan-mode-trace";

/** Init har ingen follow-up-klassificerare; återanvänd befintligt ordförråd. */
export const CREATE_CHAT_PLAN_MODE_FOLLOW_UP_INTENT = "neutral";

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

export async function startTracedCreateChatPlanModeResponse(params: {
  chatId: string;
  sessionId: string;
  userId: string | null;
  appProjectId: string | null;
  modelTier: CanonicalModelId;
  buildProfileId: BuildProfileId;
  buildProfileLabel: string;
  plannerSettings: ReturnType<typeof resolvePlanModePlannerSettings>;
  planModel: string;
  message: string;
  optimizedMessage: string;
  planSystemPrompt: string;
  abortSignal: AbortSignal;
  referenceAttachments: Parameters<
    typeof createPlanModePipelineStream
  >[0]["referenceAttachments"];
  promptStrategyMeta: PromptStrategyMetaLike;
  buildSpec: BuildSpec;
  resolvedScaffold?: ScaffoldManifest | null;
  variantTemplateId?: string | null;
  scaffoldMode: "auto" | "manual" | "off";
  promptSourceKind: string | null;
  commitCredits: () => Promise<void>;
  promptStartedAt: number;
  onResolved?: (
    planData: Record<string, unknown>,
    hasBlockers: boolean,
    accumulatedContent: string,
  ) => Promise<void> | void;
}): Promise<Response> {
  const {
    chatId,
    sessionId,
    userId,
    appProjectId,
    modelTier,
    buildProfileId,
    buildProfileLabel,
    plannerSettings,
    planModel,
    message,
    optimizedMessage,
    planSystemPrompt,
    abortSignal,
    referenceAttachments,
    promptStrategyMeta,
    buildSpec,
    resolvedScaffold,
    variantTemplateId,
    scaffoldMode,
    promptSourceKind,
    commitCredits,
    promptStartedAt,
    onResolved,
  } = params;

  const traceOwner = {
    chatId,
    sessionId,
    userId,
    appProjectId,
    modelTier,
  };

  // Skrivs FÖRE planner-anropet: samma fönster som follow-up-turen.
  await recordPlanModeTurnEntry({
    ...traceOwner,
    plannerModel: planModel,
    plannerThinking: plannerSettings.thinking,
    scaffoldId: resolvedScaffold?.id ?? null,
    followUpIntent: CREATE_CHAT_PLAN_MODE_FOLLOW_UP_INTENT,
    promptSourceKind,
    hasFollowUpBase: false,
    previousFilesCount: 0,
    promptChars: message.length,
    optimizedPromptChars: optimizedMessage.length,
  });

  try {
    const pipelineStream = createPlanModePipelineStream({
      optimizedMessage,
      planSystemPrompt,
      planModel,
      plannerThinking: plannerSettings.thinking,
      plannerReasoningEffort: plannerSettings.reasoningEffort,
      plannerReasoningMode: plannerSettings.reasoningMode,
      abortSignal,
      referenceAttachments,
    });

    return createOwnEnginePlanModeResponse({
      pipelineStream,
      chatId,
      modelTier,
      buildProfileId,
      buildProfileLabel,
      thinking: plannerSettings.thinking,
      promptStrategyMeta,
      buildSpec,
      resolvedScaffold,
      variantTemplateId,
      scaffoldMode,
      persistAssistantSummary: async (planData, hasBlockers, context) => {
        await persistPlanModeAssistantAndRecordExit({
          chatId,
          traceOwner,
          planData,
          hasBlockers,
          context,
          promptStartedAt,
        });
      },
      buildDonePayload: (planData, hasBlockers) => ({
        chatId,
        planArtifact: planData,
        awaitingInput: hasBlockers,
        planMode: true,
      }),
      commitCredits,
      commitCreditsPosition: "before-done",
      onResolved,
    });
  } catch (error) {
    await persistPlanModePlannerInvocationFailure({
      chatId,
      traceOwner,
      promptStartedAt,
      error,
    });
    throw error;
  }
}
