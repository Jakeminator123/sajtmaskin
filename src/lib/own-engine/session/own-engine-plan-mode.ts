/**
 * Shared plan-mode planner wiring for POST /chats/stream and POST /chats/[chatId]/stream.
 */
import { buildPlannerSystemPrompt } from "@/lib/gen/plan-prompt";
import {
  createGenerationPipeline,
  type PipelineOptions,
} from "@/lib/gen/generation-pipeline";
import { getAgentTools } from "@/lib/gen/agent-tools";
import { PROMPT_DUMP_CATEGORY, writeLatestPromptDump } from "@/lib/gen/prompt-dump";
import { resolvePhaseModel } from "@/lib/models/phase-routing";
import type { CanonicalModelId } from "@/lib/models/catalog";
import { debugLog } from "@/lib/utils/debug";
import { devLogAppend } from "@/lib/logging/devLog";

export type PlanModePlannerOrchestrationSlice = {
  dynamicContext: string;
  resolvedScaffold: { id: string } | null;
};

export type PlanModeDumpRoute =
  | "POST /api/v0/chats/stream"
  | "POST /api/v0/chats/[chatId]/stream";

export function computePlanModePlannerPrompts(
  planOrchestration: PlanModePlannerOrchestrationSlice,
): { planPreamble: string; planSystemPrompt: string } {
  const planPreamble = buildPlannerSystemPrompt();
  const planSystemPrompt = `${planPreamble}\n\n---\n\n${planOrchestration.dynamicContext}`;
  return { planPreamble, planSystemPrompt };
}

export function dumpPlanModePlannerPrompts(
  planPreamble: string,
  planOrchestration: PlanModePlannerOrchestrationSlice,
  planSystemPrompt: string,
  route: PlanModeDumpRoute,
): void {
  writeLatestPromptDump(
    PROMPT_DUMP_CATEGORY.planModePlanner,
    {
      "planner-preamble.md": planPreamble,
      "dynamic-context.md": planOrchestration.dynamicContext,
      "full-system.md": planSystemPrompt,
    },
    { route, planMode: true },
  );
}

export function resolvePlanModePlannerModelId(resolvedModelTier: CanonicalModelId): string {
  return resolvePhaseModel(resolvedModelTier, "planner").modelId;
}

export function logPlanModeGenerationStart(params: {
  planModel: string;
  promptLength: number;
  scaffoldId: string | null;
  resolvedThinking: boolean;
}): void {
  debugLog("plan", "Plan mode activated (unified orchestration)", {
    model: params.planModel,
    promptLength: params.promptLength,
    thinking: params.resolvedThinking,
    scaffold: params.scaffoldId,
  });
  devLogAppend("in-progress", {
    type: "plan.generation.start",
    model: params.planModel,
    promptLength: params.promptLength,
    scaffold: params.scaffoldId,
  });
}

export function createPlanModePipelineStream(params: {
  optimizedMessage: string;
  planSystemPrompt: string;
  planModel: string;
  resolvedThinking: boolean;
  abortSignal: AbortSignal;
  chatHistory?: PipelineOptions["chatHistory"];
  referenceAttachments?: PipelineOptions["referenceAttachments"];
}): ReadableStream<Uint8Array> {
  return createGenerationPipeline({
    prompt: params.optimizedMessage,
    systemPrompt: params.planSystemPrompt,
    model: params.planModel,
    thinking: params.resolvedThinking,
    abortSignal: params.abortSignal,
    tools: getAgentTools(),
    maxSteps: 2,
    chatHistory: params.chatHistory,
    referenceAttachments: params.referenceAttachments,
  });
}
