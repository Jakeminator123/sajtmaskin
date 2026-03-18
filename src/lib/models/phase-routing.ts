import type { CanonicalModelId, OwnModelId } from "./catalog";
import { canonicalModelIdToOwnModelId } from "./catalog";

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

  switch (phase) {
    case "planner":
      return { phase, modelId: "gpt-4.1-mini", reason: "planner-downgrade" };
    case "verifier":
      return { phase, modelId: "gpt-4.1", reason: "verifier-downgrade" };
    case "deploy-assistant":
      return { phase, modelId: "gpt-4.1", reason: "deploy-assistant-downgrade" };
    case "generator":
    case "fixer":
      return { phase, modelId: baseModel, reason: "full-tier" };
  }
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
