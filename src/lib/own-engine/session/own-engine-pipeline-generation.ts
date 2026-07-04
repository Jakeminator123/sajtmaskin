/**
 * Own-engine pipeline + generation SSE — **route-only** import surface.
 * Kept separate from `own-engine-build-session.ts` so unit tests can import meta/contract helpers without loading `generation-stream` → DB-backed finalize chain.
 */
import type { BuildIntent } from "@/lib/builder/build-intent";
import type { BuildSpec } from "@/lib/gen/build-spec";
import type { OrchestrationContract } from "@/lib/gen/orchestration-contract";
import type { RoutePlan } from "@/lib/gen/route-plan";
import type { CodeFile } from "@/lib/gen/parser";
import { createGenerationPipeline, type PipelineOptions } from "@/lib/gen/engine";
import { getAgentTools } from "@/lib/gen/agent-tools";
import type { ScaffoldManifest } from "@/lib/gen/scaffolds/types";
import { resolvePhaseThinking } from "@/lib/models/phase-routing";
import type { CanonicalModelId } from "@/lib/models/catalog";
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
  resolvedTier: CanonicalModelId;
  pipeline: OwnEnginePipelineFragment;
  meta: GenerationStreamMeta;
  engineModel: string;
  optimizedMessage: string;
  rawPrompt?: string;
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
  includeIntegrationSignals?: boolean;
  /** F3 only: parent F2 version id (forwarded into `engine_versions.parent_version_id`). */
  lifecycleParentVersionId?: string | null;
  /** F3 loop-breaker: tool-only rounds already produced by this F3 kick. */
  f3PriorToolOnlyRounds?: number | null;
  /** Providers from the consumed F3 marker (forwarded on silent rounds). */
  f3PriorSuggestedProviders?: string[] | null;
};

/**
 * `createGenerationPipeline` + `createOwnEngineGenerationStream` with shared tool wiring.
 */
export function createOwnEnginePipelineAndGenerationStream(
  input: OwnEnginePipelineAndGenerationInput,
): ReadableStream<Uint8Array> {
  const tools = getAgentTools({
    includeIntegrationSignals: input.includeIntegrationSignals !== false,
  });
  const generatorThinking = resolvePhaseThinking(input.resolvedTier, "generator");
  // Server-side enforcement: if the manifest declares the generator phase
  // does not support reasoning for this tier (e.g. `fast` tier on
  // gpt-5.4-fast where reasoning is unsupported), force `thinking=false`
  // even when the client requested it. This prevents the provider from
  // silently dropping reasoning deltas, leaving the UI to display an
  // empty "thinking" panel forever.
  const requestedThinking = input.pipeline.thinking ?? false;
  const effectiveThinking = requestedThinking && generatorThinking.thinking;
  // Captured at stream end via `onAccumulatedThinking`, then handed to
  // `finalizeAndSaveVersion` so the chain-of-thought is persisted on the
  // assistant message row alongside the final files.
  const accumulatedThinkingRef: { current: string | null } = { current: null };
  const pipelineStream = createGenerationPipeline({
    prompt: input.pipeline.prompt,
    systemPrompt: input.pipeline.systemPrompt,
    model: input.pipeline.model,
    thinking: effectiveThinking,
    reasoningEffort: generatorThinking.reasoningEffort,
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
    onAccumulatedThinking: (thinkingText) => {
      accumulatedThinkingRef.current = thinkingText;
    },
  });
  return createOwnEngineGenerationStream({
    chatId: input.chatId,
    pipelineStream,
    abortSignal: input.pipeline.abortSignal,
    // Reflect the *effective* thinking flag in `meta` so the builder UI
    // can grey out the reasoning toggle when the server downgraded it.
    meta: { ...input.meta, thinking: effectiveThinking },
    engineModel: input.engineModel,
    optimizedMessage: input.optimizedMessage,
    rawPrompt: input.rawPrompt,
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
    lifecycleParentVersionId: input.lifecycleParentVersionId,
    f3PriorToolOnlyRounds: input.f3PriorToolOnlyRounds,
    f3PriorSuggestedProviders: input.f3PriorSuggestedProviders,
    accumulatedThinkingRef,
  });
}
