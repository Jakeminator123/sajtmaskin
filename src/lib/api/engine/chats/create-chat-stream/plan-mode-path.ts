/**
 * Plan Mode-vägen i init-strömmen. Extraherad verbatim ur
 * `create-chat-stream-post.ts` (`if (metaPlanMode) { … }`) — samma grenar,
 * ordning, tidiga returer och sidoeffekter; bara indenteringen är justerad.
 */
import { NextResponse } from "next/server";
import type { BuildIntent } from "@/lib/builder/build-intent";
import { isAppScaffold } from "@/lib/builder/build-intent";
import type { mergeDossierIdCapabilities } from "@/lib/builder/dossier-id-request";
import * as chatRepo from "@/lib/db/chat-repository-pg";
import type { inferCapabilities } from "@/lib/gen/capability-inference";
import { prepareGenerationContext } from "@/lib/gen/orchestrate";
import { buildPlanModeAssistantMessage } from "@/lib/gen/plan/review";
import type { pickScaffoldVariant } from "@/lib/gen/scaffold-variants";
import { MODEL_LABELS } from "@/lib/models/catalog";
import { resolveEngineModelId } from "@/lib/models/selection";
import {
  attachChatToPendingUsage,
  setLlmUsageContext,
} from "@/lib/observability/llm-usage";
import { withPromptToDoneMetricResponse } from "@/lib/observability/prompt-to-done-stream";
import {
  computePlanModePlannerPrompts,
  createPlanModePipelineStream,
  dumpPlanModePlannerPrompts,
  logPlanModeGenerationStart,
  resolvePlanModePlannerSettings,
} from "@/lib/own-engine/session/own-engine-plan-mode";
import { createOwnEnginePlanModeResponse } from "@/lib/providers/own-engine/plan-mode-response";
import { resolveAppProjectIdForRequest } from "@/lib/tenant";
import { debugLog } from "@/lib/utils/debug";
import { devLogAppend } from "@/lib/logging/devLog";
import type { ParsedChatRequestMeta } from "../parse-chat-request-meta";
import type {
  CreateChatBuildProfileId,
  CreateChatCommitCredits,
  CreateChatModelTier,
  CreateChatRequestAttachments,
  CreateChatRequestData,
  CreateChatStrategyMeta,
} from "./types";

export async function runCreateChatPlanModePath(params: {
  req: Request;
  attachSessionCookie: (response: Response) => Response;
  sessionId: string;
  requestStartedAt: number;
  resolvedModelTier: CreateChatModelTier;
  resolvedThinking: boolean;
  metaBuildIntent: ParsedChatRequestMeta["buildIntent"];
  parsedMeta: ParsedChatRequestMeta;
  message: string;
  optimizedMessage: string;
  initCapabilities: ReturnType<typeof inferCapabilities>;
  initCapabilityDetection: ReturnType<typeof mergeDossierIdCapabilities>;
  effectiveBrief: Record<string, unknown> | null;
  trimmedSystemPrompt: string;
  preMatchVariant: ReturnType<typeof pickScaffoldVariant> | null;
  strategyMeta: CreateChatStrategyMeta;
  requestAttachments: CreateChatRequestAttachments;
  metaAppProjectId: ParsedChatRequestMeta["appProjectId"];
  projectId: CreateChatRequestData["projectId"];
  buildProfileId: CreateChatBuildProfileId;
  commitCreditsOnce: CreateChatCommitCredits;
}): Promise<Response> {
  const {
    req,
    attachSessionCookie,
    sessionId,
    requestStartedAt,
    resolvedModelTier,
    resolvedThinking,
    metaBuildIntent,
    parsedMeta,
    message,
    optimizedMessage,
    initCapabilities,
    initCapabilityDetection,
    effectiveBrief,
    trimmedSystemPrompt,
    preMatchVariant,
    strategyMeta,
    requestAttachments,
    metaAppProjectId,
    projectId,
    buildProfileId,
    commitCreditsOnce,
  } = params;

  const plannerSettings = resolvePlanModePlannerSettings(
    resolvedModelTier,
    resolvedThinking,
  );
  const planModel = plannerSettings.modelId;
  let engineIntent: BuildIntent =
    metaBuildIntent === "template" || metaBuildIntent === "website" || metaBuildIntent === "app"
      ? (metaBuildIntent as BuildIntent)
      : "website";
  if (engineIntent === "website" && parsedMeta.scaffoldMode === "manual" && isAppScaffold(parsedMeta.scaffoldId)) {
    engineIntent = "app";
  }
  const planOrchestrationStartedAt = Date.now();
  const planOrchestration = await prepareGenerationContext({
    prompt: optimizedMessage,
    rawPrompt: message,
    // 2026-04-22 follow-up audit: plan mode saknade tidigare samma
    // rå-signalpaket som huvudflödet fick i fix 07#1 — route-plan,
    // BuildSpec, contracts, capability- och scaffold-match drevs av
    // wrappad `optimizedMessage` i plan-LLM:n medan senare codegen
    // fick rå `message`. Det riskerade planner-vs-codegen-drift när
    // filkontext/bilagor i wrappen drog klassifiering åt annat håll.
    routePlanPrompt: message,
    buildSpecPrompt: message,
    contractsPrompt: message,
    scaffoldMatchPrompt: message,
    capabilitiesPrompt: message,
    capabilities: initCapabilities,
    requestedDossierCapabilities: initCapabilityDetection.capabilityIds,
    requestedCapabilityTiers: initCapabilityDetection.tierByCapability,
    buildIntent: engineIntent,
    scaffoldMode: parsedMeta.scaffoldMode,
    scaffoldId: parsedMeta.scaffoldId,
    // Byggval (init controls): spegla huvudflödet så plan-läge får
    // samma route-plan, variantmatchning och BuildSpec som vanlig init.
    pageCountHint: parsedMeta.pageCountHint,
    styleKeywordsHint: parsedMeta.styleKeywordsHint.length
      ? parsedMeta.styleKeywordsHint
      : undefined,
    complexityHint: parsedMeta.complexityHint,
    brief: effectiveBrief,
    themeColors: parsedMeta.themeColors,
    // Samma paritet för custom instructions (bär även Byggvals
    // komplexitet/färgläge/ton-direktiv) — annars planerar plan-läget
    // utan direktiv som codegen sedan får.
    customInstructions: trimmedSystemPrompt || undefined,
    // Pinna samma pre-match-variant som huvudflödet (pre-matchen läser
    // styleKeywordsHint) så plan-orkestreringen inte async-väljer en
    // annan variant än brief-hints/codegen.
    persistedVariantId: preMatchVariant?.id ?? null,
    promptStrategyMeta: strategyMeta,
    // Bug 04#3 (2026-04-22 audit): plan mode skickade tidigare inte
    // engineModelId/lifecycleStage. Det gav divergent BuildSpec mellan
    // planerings-LLM (200k-baseline, default livscykel) och faktisk
    // codegen (1M-fönster + F2/F3). Spegla samma fält som huvudflödet.
    engineModelId: resolveEngineModelId(resolvedModelTier),
    lifecycleStage: parsedMeta.lifecycleStage,
  });
  debugLog("orchestration", "Plan mode orchestration prepared", {
    durationMs: Date.now() - planOrchestrationStartedAt,
    qualityTarget: planOrchestration.buildSpec.qualityTarget,
    contextPolicy: planOrchestration.buildSpec.contextPolicy,
    scaffoldId: planOrchestration.resolvedScaffold?.id ?? null,
  });

  const { planPreamble, planSystemPrompt } = computePlanModePlannerPrompts(planOrchestration);
  dumpPlanModePlannerPrompts(
    planPreamble,
    planOrchestration,
    planSystemPrompt,
    "POST /api/engine/chats/stream",
  );
  logPlanModeGenerationStart({
    planModel,
    promptLength: optimizedMessage.length,
    scaffoldId: planOrchestration.resolvedScaffold?.id ?? null,
    resolvedThinking: plannerSettings.thinking,
  });

  const pipelineStream = createPlanModePipelineStream({
    optimizedMessage,
    planSystemPrompt,
    planModel,
    plannerThinking: plannerSettings.thinking,
    plannerReasoningEffort: plannerSettings.reasoningEffort,
    plannerReasoningMode: plannerSettings.reasoningMode,
    abortSignal: req.signal,
    referenceAttachments: [
      ...planOrchestration.variantTemplateReferenceAttachments,
      ...requestAttachments,
    ],
  });

  const projectIdForChat = await resolveAppProjectIdForRequest(
    req,
    { appProjectId: metaAppProjectId, projectId },
    { sessionId },
  );
  if (!projectIdForChat) {
    return attachSessionCookie(
      NextResponse.json(
        {
          error:
            "Plan mode requires a valid app project id. Create or resolve a project before retrying.",
        },
        { status: 400 },
      ),
    );
  }
  const plannerChatDbStartedAt = Date.now();
  const plannerChat = await chatRepo.createChat(
    projectIdForChat,
    planModel,
    planSystemPrompt,
    planOrchestration.resolvedScaffold?.id,
  );
  await chatRepo.addMessage(plannerChat.id, "user", message);
  // Tredje chat-skapande vägen (utöver own-engine och kontraktsgrinden):
  // brief och scaffold-embeddings har redan kört, och planner-strömmen
  // loggar mer förbrukning efter detta.
  setLlmUsageContext({ chatId: plannerChat.id });
  attachChatToPendingUsage(sessionId, plannerChat.id);
  debugLog("engine", "Chat DB bootstrap complete", {
    durationMs: Date.now() - plannerChatDbStartedAt,
    mode: "plan",
    chatId: plannerChat.id,
  });
  devLogAppend("in-progress", {
    type: "site.chatId",
    chatId: plannerChat.id,
  });

  const planModeResponse = createOwnEnginePlanModeResponse({
    pipelineStream,
    chatId: plannerChat.id,
    modelTier: resolvedModelTier,
    buildProfileId,
    buildProfileLabel: MODEL_LABELS[resolvedModelTier],
    thinking: plannerSettings.thinking,
    promptStrategyMeta: strategyMeta,
    buildSpec: planOrchestration.buildSpec,
    resolvedScaffold: planOrchestration.resolvedScaffold,
    scaffoldMode: parsedMeta.scaffoldMode,
    onResolved: (planData, hasBlockers, accumulatedContent) => {
      const blockerCount = Array.isArray(planData?.blockers)
        ? (planData.blockers as unknown[]).length
        : 0;
      const stepCount = Array.isArray(planData?.steps)
        ? (planData.steps as unknown[]).length
        : 0;
      const assumptionCount = Array.isArray(planData?.assumptions)
        ? (planData.assumptions as unknown[]).length
        : 0;

      devLogAppend("in-progress", {
        type: "plan.generation.done",
        parsed: planData !== null,
        steps: stepCount,
        blockers: blockerCount,
        assumptions: assumptionCount,
        awaitingInput: hasBlockers,
        contentLength: accumulatedContent.length,
      });
    },
    // Samma persist-kontrakt som follow-up-turen (plan-mode-turn.ts):
    // en icke-plan-utdata ska persistera sin egen text, inte en påhittad
    // plansummering.
    persistAssistantSummary: async (planData, hasBlockers, context) => {
      const assistantMessage = buildPlanModeAssistantMessage({
        planData,
        hasBlockers,
        hasPlanArtifact: context.hasPlanArtifact,
        plannerText: context.accumulatedContent,
        upstreamErrorMessage: context.upstreamErrorMessage,
      });
      try {
        await chatRepo.addMessage(
          plannerChat.id,
          "assistant",
          assistantMessage.content,
          undefined,
          assistantMessage.uiParts,
        );
      } catch (error) {
        console.warn("[plan] Failed to persist planner assistant summary:", error);
      }
    },
    buildDonePayload: (planData, hasBlockers) => ({
      chatId: plannerChat.id,
      planArtifact: planData,
      awaitingInput: hasBlockers,
      planMode: true,
    }),
    commitCredits: commitCreditsOnce,
    commitCreditsPosition: "before-done",
  });
  debugLog("engine", "Create chat pre-stream complete", {
    durationMs: Date.now() - requestStartedAt,
    mode: "plan",
    chatId: plannerChat.id,
  });
  return attachSessionCookie(
    withPromptToDoneMetricResponse(planModeResponse, {
      kind: "init",
      promptStartedAt: requestStartedAt,
      signal: req.signal,
      chatId: plannerChat.id,
    }),
  );
}
