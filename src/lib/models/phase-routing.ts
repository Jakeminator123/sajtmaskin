import type { CanonicalModelId, OwnModelId } from "./catalog";
import { canonicalModelIdToOwnModelId } from "./catalog";
import {
  getPhaseThinkingFromManifest,
  getPhaseRoutingFromManifest,
  type GenerationPhaseFromManifest,
  type ReasoningEffortFromManifest,
} from "@/lib/ai-models/load-manifest";

/**
 * Phase routing resolves which model handles each generation phase per tier.
 * `selected_build_model` means the tier's primary model; explicit IDs override.
 *
 * Max tier pins **fixer** to gpt-5.3-codex (better at targeted syntax repair
 * than gpt-5.4). Verifier and deploy-assistant also use gpt-5.3-codex for all
 * quality-line tiers. Fast tier uses one model throughout. Anthropic keeps a
 * single model across phases except deploy-assistant.
 */
const SELECTED_BUILD_MODEL_REF = "selected_build_model";

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

export type PhaseThinkingOverride = {
  phase: GenerationPhase;
  thinking: boolean;
  reasoningEffort: ReasoningEffortFromManifest;
  reason: string;
};

function resolvePhaseModelRef(
  selectedTier: CanonicalModelId,
  phase: GenerationPhaseFromManifest,
): string {
  const phaseRouting = getPhaseRoutingFromManifest();
  return phaseRouting[selectedTier][phase];
}

export function resolvePhaseModel(
  selectedTier: CanonicalModelId,
  phase: GenerationPhase,
): PhaseModelOverride {
  const baseModel = canonicalModelIdToOwnModelId(selectedTier);
  const phaseRef = resolvePhaseModelRef(selectedTier, phase);
  const selectedBuildModel = phaseRef === SELECTED_BUILD_MODEL_REF;
  const modelId = (selectedBuildModel ? baseModel : phaseRef) as OwnModelId;

  if (selectedBuildModel && selectedTier === "fast") {
    return { phase, modelId, reason: "fast-tier-no-downgrade" };
  }

  if (selectedBuildModel && selectedTier === "anthropic") {
    return { phase, modelId, reason: "anthropic-tier-unified" };
  }

  if (selectedBuildModel) {
    return {
      phase,
      modelId,
      reason: phase === "fixer" ? "fixer-tier-primary" : "full-tier",
    };
  }

  return { phase, modelId, reason: "manifest-phase-override" };
}

export function resolvePhaseThinking(
  selectedTier: CanonicalModelId,
  phase: GenerationPhase,
): PhaseThinkingOverride {
  const thinkingByTier = getPhaseThinkingFromManifest();
  const config = thinkingByTier[selectedTier][phase];
  return {
    phase,
    thinking: config.thinking,
    reasoningEffort: config.reasoningEffort,
    reason: "manifest-phase-thinking",
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
