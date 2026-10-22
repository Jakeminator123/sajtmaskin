import type { CanonicalModelId, OwnModelId } from "./catalog";
import { aliasRetiredModelId, canonicalModelIdToOwnModelId } from "./catalog";
import {
  getPhaseThinkingFromManifest,
  getPhaseRoutingFromManifest,
  type GenerationPhaseFromManifest,
  type ReasoningEffortFromManifest,
  type ReasoningModeFromManifest,
} from "@/lib/ai-models/load-manifest";
import {
  clampOpenAIReasoningEffort,
  supportsOpenAIReasoningMode,
} from "@/lib/models/openai-capabilities";

/**
 * Phase routing resolves which model handles each generation phase per tier.
 * `selected_build_model` means the tier's primary model; explicit IDs override.
 *
 * Tier ladder: Låg (`pro`), Mellan (`max`) and Hög (`premium`) all build
 * with GPT-6.1 Sol; they differ by generator effort (medium/high/xhigh,
 * always `reasoningMode: "standard"`) and by fixer effort. Extra hög (`ultra`)
 * builds planner and generator with GPT-6 Astra. Sol takes every side phase.
 * Fixers run without a thinking stream but honor the manifest effort.
 * `codex` mirrors Mellan; it and Anthropic (one model across phases) are hidden
 * from the UI. The concrete values live in the manifest, not here.
 */
const SELECTED_BUILD_MODEL_REF = "selected_build_model";

export type GenerationPhase = "planner" | "generator" | "fixer" | "verifier" | "deploy-assistant";

export type PhaseModelOverride = {
  phase: GenerationPhase;
  modelId: OwnModelId;
  reason: string;
};

export type PhaseThinkingOverride = {
  phase: GenerationPhase;
  thinking: boolean;
  reasoningEffort: ReasoningEffortFromManifest;
  reasoningMode?: ReasoningModeFromManifest;
  reason: string;
};

function resolvePhaseModelRef(
  selectedTier: CanonicalModelId,
  phase: GenerationPhaseFromManifest,
): string {
  const phaseRouting = getPhaseRoutingFromManifest();
  const tierRouting = phaseRouting[selectedTier];
  if (!tierRouting) {
    throw new Error(
      `[phase-routing] Unknown tier "${selectedTier}" — manifest.phaseRouting.defaultByTier has no entry. Known tiers: ${Object.keys(phaseRouting).join(", ")}`,
    );
  }
  return tierRouting[phase];
}

export function resolvePhaseModel(
  selectedTier: CanonicalModelId,
  phase: GenerationPhase,
): PhaseModelOverride {
  const baseModel = canonicalModelIdToOwnModelId(selectedTier);
  const phaseRef = resolvePhaseModelRef(selectedTier, phase);
  const selectedBuildModel = phaseRef === SELECTED_BUILD_MODEL_REF;
  const modelId = aliasRetiredModelId(selectedBuildModel ? baseModel : phaseRef) as OwnModelId;

  if (selectedBuildModel && selectedTier === "premium") {
    return { phase, modelId, reason: "premium-tier-unified" };
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
  const tierConfig = thinkingByTier[selectedTier];
  if (!tierConfig) {
    throw new Error(
      `[phase-routing] Unknown tier "${selectedTier}" — manifest.phaseRouting.thinkingByTier has no entry. Known tiers: ${Object.keys(thinkingByTier).join(", ")}`,
    );
  }
  const config = tierConfig[phase];
  if (!config) {
    throw new Error(
      `[phase-routing] Tier "${selectedTier}" has no thinking-config for phase "${phase}". Known phases: ${Object.keys(tierConfig).join(", ")}`,
    );
  }
  const phaseModelId = resolvePhaseModel(selectedTier, phase).modelId;
  const supportsReasoningMode = supportsOpenAIReasoningMode(phaseModelId);
  return {
    phase,
    thinking: config.thinking,
    reasoningEffort: clampOpenAIReasoningEffort(phaseModelId, config.reasoningEffort),
    ...(config.reasoningMode && supportsReasoningMode
      ? { reasoningMode: config.reasoningMode }
      : {}),
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
