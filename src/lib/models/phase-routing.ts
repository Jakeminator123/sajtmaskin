import type { CanonicalModelId, OwnModelId } from "./catalog";
import { canonicalModelIdToOwnModelId } from "./catalog";
import {
  getPhaseRoutingFromManifest,
  type GenerationPhaseFromManifest,
} from "@/lib/ai-models/load-manifest";

/**
 * For OpenAI-family build profiles (pro / max / codex), **fixer** uses the same
 * model as **generator** — it runs `runLlmFixer` / syntax repair and must not
 * downgrade quality vs the main CodeProject pass (users saw weak `gpt-4.1`
 * edits next to `gpt-5.4` main + AUTO-FIX).
 *
 * **Verifier** and **deploy-assistant** still use a smaller model for cost/latency
 * until those phases are wired to substantive codegen. Fast tier is unchanged.
 * Anthropic profile keeps one model across phases.
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

  if (
    (phase === "verifier" || phase === "deploy-assistant") &&
    modelId === "gpt-4.1"
  ) {
    return { phase, modelId, reason: "aux-openai-efficient" };
  }

  return { phase, modelId, reason: "manifest-phase-override" };
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
