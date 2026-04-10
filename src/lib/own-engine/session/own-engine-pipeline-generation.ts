/**
 * Own-engine pipeline + generation SSE — **route-only** import surface.
 * Kept separate from `own-engine-build-session.ts` so unit tests can import meta/contract helpers without loading `generation-stream` → DB-backed finalize chain.
 */
import type { BuildIntent } from "@/lib/builder/build-intent";
import type { BuildSpec } from "@/lib/gen/build-spec";
import type { OrchestrationContract } from "@/lib/gen/orchestration-contract";
import type { RoutePlan } from "@/lib/gen/route-plan";
import type { CodeFile } from "@/lib/gen/parser";
import type { PipelineOptions } from "@/lib/gen/generation-pipeline";
import { createGenerationPipeline } from "@/lib/gen/generation-pipeline";
import type { ReasoningEffort } from "@/lib/gen/engine";
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
  buildSpec: BuildSpec;
  routePlan: RoutePlan | null;
  orchestrationContract?: OrchestrationContract | null;
  resolvedScaffold: ScaffoldManifest | null;
  urlMap: Record<string, string>;
  commitCredits: () => Promise<void>;
  previousFiles?: CodeFile[];
  lineageHash?: string | null;
  targetVersionId?: string | null;
};

/**
 * `createGenerationPipeline` + `createOwnEngineGenerationStream` with shared tool wiring.
 */
export function createOwnEnginePipelineAndGenerationStream(
  input: OwnEnginePipelineAndGenerationInput,
): ReadableStream<Uint8Array> {
  const tools = getAgentTools();
  const effortByQuality: Record<string, ReasoningEffort> = {
    standard: "high",
    premium: "high",
    "release-candidate": "high",
  };
  const reasoningEffort = effortByQuality[input.buildSpec.qualityTarget] ?? "high";
  const pipelineStream = createGenerationPipeline({
    prompt: input.pipeline.prompt,
    systemPrompt: input.pipeline.systemPrompt,
    model: input.pipeline.model,
    thinking: input.pipeline.thinking,
    reasoningEffort,
    abortSignal: input.pipeline.abortSignal,
    tools,
    maxSteps: input.pipeline.maxSteps ?? 4,
    chatHistory: input.pipeline.chatHistory,
    referenceAttachments: input.pipeline.referenceAttachments,
    maxTokens: input.pipeline.maxTokens,
    meta: {
      chatId: input.chatId,
      versionId: input.targetVersionId ?? undefined,
      modelId: input.engineModel,
    },
  });
  return createOwnEngineGenerationStream({
    chatId: input.chatId,
    pipelineStream,
    abortSignal: input.pipeline.abortSignal,
    meta: input.meta,
    engineModel: input.engineModel,
    optimizedMessage: input.optimizedMessage,
    engineIntent: input.engineIntent,
    buildSpec: input.buildSpec,
    routePlan: input.routePlan,
    orchestrationContract: input.orchestrationContract ?? null,
    resolvedScaffold: input.resolvedScaffold,
    urlMap: input.urlMap,
    commitCredits: input.commitCredits,
    previousFiles: input.previousFiles,
    lineageHash: input.lineageHash,
    targetVersionId: input.targetVersionId,
  });
}
