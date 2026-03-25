import type { CanonicalModelId, OwnModelId } from "./catalog";
import { canonicalModelIdToOwnModelId } from "./catalog";

/**
 * For OpenAI-family build profiles (pro / max / codex), fixer / verifier /
 * deploy-assistant use a smaller default model to cut cost and latency while
 * planner + generator stay on the profile’s primary model. Fast tier is unchanged
 * (already on gpt-4.1). Anthropic profile keeps one model across phases — catalog
 * has no lighter sibling in `OWN_MODEL_IDS`.
 */
const OPENAI_AUXILIARY_PHASE_MODEL: OwnModelId = "gpt-4.1-mini";

export type GenerationPhase =
  | "planner"
  | "generator"
  | "fixer"
  | "verifier"
  | "deploy-assistant";

export type PhaseModelOverride = {
  phase: GenerationPhase;
  modelId: OwnModelId;
  reason: string;
};

export function resolvePhaseModel(
  selectedTier: CanonicalModelId,
  phase: GenerationPhase,
): PhaseModelOverride {
  const baseModel = canonicalModelIdToOwnModelId(selectedTier);

  if (selectedTier === "fast") {
    return { phase, modelId: baseModel, reason: "fast-tier-no-downgrade" };
  }

  if (selectedTier === "anthropic") {
    return { phase, modelId: baseModel, reason: "anthropic-tier-unified" };
  }

  if (phase === "planner" || phase === "generator") {
    return { phase, modelId: baseModel, reason: "full-tier" };
  }

  return {
    phase,
    modelId: OPENAI_AUXILIARY_PHASE_MODEL,
    reason: "aux-openai-efficient",
  };
}

export function getPhaseRoutingSummary(
  selectedTier: CanonicalModelId,
): Record<GenerationPhase, OwnModelId> {
  const phases: GenerationPhase[] = [
    "planner",
    "generator",
    "fixer",
    "verifier",
    "deploy-assistant",
  ];
  return Object.fromEntries(
    phases.map((phase) => [phase, resolvePhaseModel(selectedTier, phase).modelId]),
  ) as Record<GenerationPhase, OwnModelId>;
}
