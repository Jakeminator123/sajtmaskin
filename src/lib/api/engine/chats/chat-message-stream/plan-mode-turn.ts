/**
 * Plan-mode turn of the follow-up stream handler. Extracted verbatim from
 * `chat-message-stream-post.ts`.
 */
import type { BuildIntent } from "@/lib/builder/build-intent";
import { isAppScaffold } from "@/lib/builder/build-intent";
import type { FollowUpCapabilityDetection } from "@/lib/builder/follow-up-capability-detection";
import type { orchestratePromptMessage } from "@/lib/builder/promptOrchestration";
import type { ChatWithMessages } from "@/lib/db/chat-repository-pg";
import * as chatRepo from "@/lib/db/chat-repository-pg";
import type { FollowUpIntentMode } from "@/lib/gen/follow-up-intent-types";
import { prepareGenerationContext } from "@/lib/gen/orchestrate";
import type { CodeFile } from "@/lib/gen/parser";
import {
  buildPlanSummaryMessage,
  buildPlanUiPart,
} from "@/lib/gen/plan/review";
import type {
  normalizeRequestAttachments,
  summarizeDesignReferences,
} from "@/lib/gen/request-metadata";
import type { ScaffoldMode } from "@/lib/gen/scaffolds/types";
import { previewUrlField } from "@/lib/api/preview-url-contract";
import { withPromptToDoneMetricResponse } from "@/lib/observability/prompt-to-done-stream";
import { resolveEngineModelId } from "@/lib/models/selection";
import type { BuildProfileId, CanonicalModelId } from "@/lib/models/catalog";
import { MODEL_LABELS } from "@/lib/models/catalog";
import {
  computePlanModePlannerPrompts,
  createPlanModePipelineStream,
  dumpPlanModePlannerPrompts,
  logPlanModeGenerationStart,
  resolvePlanModePlannerSettings,
} from "@/lib/own-engine/session/own-engine-plan-mode";
import { createOwnEnginePlanModeResponse } from "@/lib/providers/own-engine/plan-mode-response";
import { debugLog } from "@/lib/utils/debug";
import { buildFollowUpOrchestrationInput } from "../follow-up-orchestration-input";
import { buildBoundedChatHistory } from "../follow-up-history";
import type { createCommitCreditsOnce } from "../credits-handler";
import type { ParsedChatRequestMeta } from "../parse-chat-request-meta";

/** Plan-mode follow-up turn — runs the planner pipeline and returns the SSE response. */
export async function runPlanModeTurn(params: {
  chatId: string;
  engineChat: ChatWithMessages;
  message: string;
  optimizedMessage: string;
  followUpIntentMessage: string;
  metaBuildIntent: string | null;
  metaScaffoldMode: ScaffoldMode;
  parsedMeta: ParsedChatRequestMeta;
  resolvedImageGenerations: boolean;
  resolvedModelTier: CanonicalModelId;
  resolvedThinking: boolean;
  buildProfileId: BuildProfileId;
  designReferences: ReturnType<typeof summarizeDesignReferences>;
  persistedScaffoldId: string | null;
  /** Chat started from a verbatim repo import (`edit_kind="imported_repo"`). */
  importedRepoMode: boolean;
  previousFiles: CodeFile[];
  hasFollowUpBase: boolean;
  ignorePersistedScaffoldForMatch: boolean;
  promptOrchestration: ReturnType<typeof orchestratePromptMessage>;
  existingRoutePaths: string[];
  existingShellRoutePaths: string[];
  followUpCapabilityDetection: FollowUpCapabilityDetection;
  followUpIntent: FollowUpIntentMode;
  requestAttachments: ReturnType<typeof normalizeRequestAttachments>;
  commitCreditsOnce: ReturnType<typeof createCommitCreditsOnce>;
  promptStartedAt: number;
  req: Request;
  attachSessionCookie: (response: Response) => Response;
}): Promise<Response> {
  const {
    chatId,
    engineChat,
    message,
    optimizedMessage,
    followUpIntentMessage,
    metaBuildIntent,
    metaScaffoldMode,
    parsedMeta,
    resolvedImageGenerations,
    resolvedModelTier,
    resolvedThinking,
    buildProfileId,
    designReferences,
    persistedScaffoldId,
    importedRepoMode,
    previousFiles,
    hasFollowUpBase,
    ignorePersistedScaffoldForMatch,
    promptOrchestration,
    existingRoutePaths,
    existingShellRoutePaths,
    followUpCapabilityDetection,
    followUpIntent,
    requestAttachments,
    commitCreditsOnce,
    promptStartedAt,
    req,
    attachSessionCookie,
  } = params;
  await chatRepo.addMessage(engineChat.id, "user", message);

  let planEngineIntent: BuildIntent =
    metaBuildIntent === "template" ||
    metaBuildIntent === "website" ||
    metaBuildIntent === "app"
      ? (metaBuildIntent as BuildIntent)
      : "website";
  if (planEngineIntent === "website" && parsedMeta.scaffoldMode === "manual" && isAppScaffold(parsedMeta.scaffoldId)) {
    planEngineIntent = "app";
  }
  const planOrchestrationStartedAt = Date.now();
  const planOrchestration = await prepareGenerationContext(
    buildFollowUpOrchestrationInput({
      mode: "plan",
      optimizedMessage,
      message: followUpIntentMessage,
      buildIntent: planEngineIntent,
      parsedMeta,
      resolvedImageGenerations,
      designReferences,
      persistedScaffoldId,
      importedRepoMode,
      previousFilesCount: previousFiles.length,
      hasFollowUpBase,
      ignorePersistedScaffoldForMatch,
      promptStrategyMeta: promptOrchestration.strategyMeta,
      existingRoutePaths,
      existingShellRoutePaths,
      previousFilePaths: hasFollowUpBase
        ? previousFiles.map((file) => file.path)
        : [],
      followUpCapabilityDetection,
      followUpIntent,
      orchestrationSnapshot:
        engineChat.orchestration_snapshot as Record<string, unknown> | null,
      engineModelId: resolveEngineModelId(resolvedModelTier),
    }),
  );
  debugLog("orchestration", "Follow-up plan orchestration prepared", {
    chatId,
    durationMs: Date.now() - planOrchestrationStartedAt,
    qualityTarget: planOrchestration.buildSpec.qualityTarget,
    contextPolicy: planOrchestration.buildSpec.contextPolicy,
    scaffoldId: planOrchestration.resolvedScaffold?.id ?? null,
  });
  const planResolvedScaffold = planOrchestration.resolvedScaffold;
  // Imported-repo chats never persist a scaffold id (see codegen-turn).
  if (
    planResolvedScaffold &&
    !importedRepoMode &&
    (!persistedScaffoldId || ignorePersistedScaffoldForMatch)
  ) {
    try {
      await chatRepo.updateChatScaffoldId(chatId, planResolvedScaffold.id);
    } catch {
      /* best-effort persist */
    }
  }

  const { planPreamble, planSystemPrompt } = computePlanModePlannerPrompts(planOrchestration);
  dumpPlanModePlannerPrompts(
    planPreamble,
    planOrchestration,
    planSystemPrompt,
    "POST /api/engine/chats/[chatId]/stream",
  );
  const planChatHistory = buildBoundedChatHistory(engineChat.messages);
  const plannerSettings = resolvePlanModePlannerSettings(
    resolvedModelTier,
    resolvedThinking,
  );
  const planModel = plannerSettings.modelId;
  logPlanModeGenerationStart({
    planModel,
    promptLength: optimizedMessage.length,
    scaffoldId: planResolvedScaffold?.id ?? null,
    resolvedThinking: plannerSettings.thinking,
  });
  const planPipelineStream = createPlanModePipelineStream({
    optimizedMessage,
    planSystemPrompt,
    planModel,
    plannerThinking: plannerSettings.thinking,
    plannerReasoningEffort: plannerSettings.reasoningEffort,
    abortSignal: req.signal,
    chatHistory: planChatHistory,
    referenceAttachments: requestAttachments,
  });

  return attachSessionCookie(withPromptToDoneMetricResponse(createOwnEnginePlanModeResponse({
    pipelineStream: planPipelineStream,
    chatId,
    modelTier: resolvedModelTier,
    buildProfileId,
    buildProfileLabel: MODEL_LABELS[resolvedModelTier],
    thinking: plannerSettings.thinking,
    promptStrategyMeta: promptOrchestration.strategyMeta,
    buildSpec: planOrchestration.buildSpec,
    resolvedScaffold: planResolvedScaffold,
    scaffoldMode: metaScaffoldMode,
    persistAssistantSummary: async (planData, hasBlockers) => {
      try {
        const storedPlanPart = buildPlanUiPart(planData);
        await chatRepo.addMessage(
          chatId,
          "assistant",
          buildPlanSummaryMessage(planData, hasBlockers),
          undefined,
          storedPlanPart ? [storedPlanPart] : undefined,
        );
      } catch (error) {
        console.warn("[plan] Failed to persist planner assistant summary:", error);
      }
    },
    buildDonePayload: (planData, hasBlockers) => ({
      chatId,
      versionId: null,
      messageId: null,
      ...previewUrlField(null),
      awaitingInput: hasBlockers,
      planArtifact: planData,
      planMode: true,
    }),
    commitCredits: commitCreditsOnce,
    commitCreditsPosition: "before-done",
    normalizeQuestionToolCallIds: true,
  }), {
    kind: "followup",
    promptStartedAt,
    signal: req.signal,
    chatId,
  }));
}
