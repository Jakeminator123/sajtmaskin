/**
 * Gemensam persist + exit-spårning för plan-lägets init- och follow-up-tur.
 *
 * Ägaren för eventnamn och `outcome` är `plan-mode-trace.ts`. Den här filen
 * är bara persist-callbacken: samma assistentrad och samma exit-fält oavsett
 * vilken handler som kör planner-strömmen.
 */
import * as chatRepo from "@/lib/db/chat-repository-pg";
import {
  buildPlanModeAssistantMessage,
  type PlanModeAssistantMessageKind,
} from "@/lib/gen/plan/review";
import type { PlanModeResolvedContext } from "@/lib/gen/stream/plan-mode-stream";
import {
  recordPlanModeTurnExit,
  type PlanModeTurnExitOutcome,
} from "./plan-mode-trace";

export const PLAN_MODE_EXIT_OUTCOME_BY_KIND: Record<
  PlanModeAssistantMessageKind,
  PlanModeTurnExitOutcome
> = {
  plan: "plan_persisted",
  "planner-text": "planner_text_persisted",
  "planner-error": "planner_error_persisted",
  "planner-empty": "planner_empty_persisted",
};

export type PlanModePersistTraceOwner = {
  chatId: string;
  sessionId?: string | null;
  userId?: string | null;
  appProjectId?: string | null;
  modelTier?: string | null;
};

export async function persistPlanModeAssistantAndRecordExit(params: {
  chatId: string;
  traceOwner: PlanModePersistTraceOwner;
  planData: Record<string, unknown> | null;
  hasBlockers: boolean;
  context: PlanModeResolvedContext;
  promptStartedAt: number;
}): Promise<void> {
  const assistantMessage = buildPlanModeAssistantMessage({
    planData: params.planData,
    hasBlockers: params.hasBlockers,
    hasPlanArtifact: params.context.hasPlanArtifact,
    plannerText: params.context.accumulatedContent,
    upstreamErrorMessage: params.context.upstreamErrorMessage,
  });
  let persisted = false;
  let persistError: string | null = null;
  try {
    await chatRepo.addMessage(
      params.chatId,
      "assistant",
      assistantMessage.content,
      undefined,
      assistantMessage.uiParts,
    );
    persisted = true;
  } catch (error) {
    persistError = error instanceof Error ? error.message : String(error);
    console.warn("[plan] Failed to persist planner assistant summary:", error);
  }
  await recordPlanModeTurnExit({
    ...params.traceOwner,
    outcome: persisted
      ? PLAN_MODE_EXIT_OUTCOME_BY_KIND[assistantMessage.kind]
      : "persist_failed",
    assistantMessagePersisted: persisted,
    hasPlanArtifact: params.context.hasPlanArtifact,
    hasBlockers: params.hasBlockers,
    contentChars: params.context.accumulatedContent.length,
    upstreamError: params.context.upstreamErrorMessage,
    durationMs: Date.now() - params.promptStartedAt,
    persistError,
  });
}

/**
 * Planner-anropet kastade innan strömmen fanns. Persistera samma
 * `planner-error`-rad som en felande ström och skriv exit så entry inte
 * blir föräldralös.
 */
export async function persistPlanModePlannerInvocationFailure(params: {
  chatId: string;
  traceOwner: PlanModePersistTraceOwner;
  promptStartedAt: number;
  error: unknown;
}): Promise<void> {
  const upstreamErrorMessage =
    params.error instanceof Error ? params.error.message : String(params.error);
  await persistPlanModeAssistantAndRecordExit({
    chatId: params.chatId,
    traceOwner: params.traceOwner,
    planData: {},
    hasBlockers: true,
    context: {
      hasPlanArtifact: false,
      accumulatedContent: "",
      upstreamErrorMessage,
    },
    promptStartedAt: params.promptStartedAt,
  });
}
