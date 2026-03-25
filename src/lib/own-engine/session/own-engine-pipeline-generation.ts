/**
 * Own-engine pipeline + generation SSE — **route-only** import surface.
 * Kept separate from `own-engine-build-session.ts` so unit tests can import meta/contract helpers without loading `generation-stream` → DB-backed finalize chain.
 */
import type { BuildIntent } from "@/lib/builder/build-intent";
import type { RoutePlan } from "@/lib/gen/route-plan";
import type { CodeFile } from "@/lib/gen/parser";
import type { PipelineOptions } from "@/lib/gen/generation-pipeline";
import { createGenerationPipeline } from "@/lib/gen/generation-pipeline";
import { getAgentTools } from "@/lib/gen/agent-tools";
import type { ScaffoldManifest } from "@/lib/gen/scaffolds/types";
import {
  createOwnEngineGenerationStream,
  type GenerationStreamMeta,
} from "@/lib/providers/own-engine/generation-stream";

export type OwnEnginePipelineFragment = {
  prompt: string;
  systemPrompt: string;
  model: string;
  thinking: boolean;
  abortSignal: AbortSignal;
  chatHistory?: PipelineOptions["chatHistory"];
  referenceAttachments?: PipelineOptions["referenceAttachments"];
  maxSteps?: number;
  maxTokens?: number;
};

export type OwnEnginePipelineAndGenerationInput = {
  chatId: string;
  pipeline: OwnEnginePipelineFragment;
  meta: GenerationStreamMeta;
  engineModel: string;
  optimizedMessage: string;
  engineIntent: BuildIntent;
  routePlan: RoutePlan | null;
  resolvedScaffold: ScaffoldManifest | null;
  urlMap: Record<string, string>;
  commitCredits: () => Promise<void>;
  previousFiles?: CodeFile[];
};

/**
 * `createGenerationPipeline` + `createOwnEngineGenerationStream` with shared tool wiring.
 */
export function createOwnEnginePipelineAndGenerationStream(
  input: OwnEnginePipelineAndGenerationInput,
): ReadableStream<Uint8Array> {
  const tools = getAgentTools();
  const pipelineStream = createGenerationPipeline({
    prompt: input.pipeline.prompt,
    systemPrompt: input.pipeline.systemPrompt,
    model: input.pipeline.model,
    thinking: input.pipeline.thinking,
    abortSignal: input.pipeline.abortSignal,
    tools,
    maxSteps: input.pipeline.maxSteps ?? 2,
    chatHistory: input.pipeline.chatHistory,
    referenceAttachments: input.pipeline.referenceAttachments,
    maxTokens: input.pipeline.maxTokens,
  });
  return createOwnEngineGenerationStream({
    chatId: input.chatId,
    pipelineStream,
    abortSignal: input.pipeline.abortSignal,
    meta: input.meta,
    engineModel: input.engineModel,
    optimizedMessage: input.optimizedMessage,
    engineIntent: input.engineIntent,
    routePlan: input.routePlan,
    resolvedScaffold: input.resolvedScaffold,
    urlMap: input.urlMap,
    commitCredits: input.commitCredits,
    previousFiles: input.previousFiles,
  });
}
