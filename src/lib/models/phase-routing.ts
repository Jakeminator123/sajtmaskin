import type { CanonicalModelId, OwnModelId } from "./catalog";
import { canonicalModelIdToOwnModelId } from "./catalog";

/**
 * For OpenAI-family build profiles (pro / max / codex), **fixer** uses the same
 * model as **generator** — it runs `runLlmFixer` / syntax repair and must not
 * downgrade quality vs the main CodeProject pass (users saw weak `gpt-4.1-mini`
 * edits next to `gpt-5.4` main + AUTO-FIX).
 *
 * **Verifier** and **deploy-assistant** still use a smaller model for cost/latency
 * until those phases are wired to substantive codegen. Fast tier is unchanged.
 * Anthropic profile keeps one model across phases.
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

  if (phase === "planner" || phase === "generator" || phase === "fixer") {
    return {
      phase,
      modelId: baseModel,
      reason: phase === "fixer" ? "fixer-tier-primary" : "full-tier",
    };
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
