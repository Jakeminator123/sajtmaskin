import { describe, expect, it } from "vitest";
import { CANONICAL_MODEL_IDS } from "./catalog";
import {
  resolvePhaseModel,
  resolvePhaseThinking,
  getPhaseRoutingSummary,
  type GenerationPhase,
} from "./phase-routing";

const PHASES: GenerationPhase[] = [
  "planner",
  "generator",
  "fixer",
  "verifier",
  "deploy-assistant",
];

const OPENAI_TIERS = ["pro", "max", "premium", "codex"] as const;

describe("resolvePhaseModel", () => {
  it("Hög (premium): Sol on build phases; Sol fixer; Terra verifier", () => {
    const planner = resolvePhaseModel("premium", "planner");
    const generator = resolvePhaseModel("premium", "generator");
    const fixer = resolvePhaseModel("premium", "fixer");
    const verifier = resolvePhaseModel("premium", "verifier");
    const deploy = resolvePhaseModel("premium", "deploy-assistant");

    expect(planner.modelId).toBe("gpt-5.6-sol");
    expect(generator.modelId).toBe("gpt-5.6-sol");
    expect(fixer.modelId).toBe("gpt-5.6-sol");
    expect(fixer.reason).toBe("manifest-phase-override");
    expect(verifier.modelId).toBe("gpt-5.6-terra");
    expect(verifier.reason).toBe("manifest-phase-override");
    expect(deploy.modelId).toBe("gpt-5.6-sol");
    expect(planner.reason).toBe("premium-tier-unified");
    expect(generator.reason).toBe("premium-tier-unified");
    expect(deploy.reason).toBe("premium-tier-unified");
  });

  it("Låg (pro): Sol planner/generator; Terra fixer + deploy; Luna verifier", () => {
    expect(resolvePhaseModel("pro", "planner")).toEqual({
      phase: "planner",
      modelId: "gpt-5.6-sol",
      reason: "full-tier",
    });
    expect(resolvePhaseModel("pro", "generator")).toEqual({
      phase: "generator",
      modelId: "gpt-5.6-sol",
      reason: "full-tier",
    });
    expect(resolvePhaseModel("pro", "fixer")).toEqual({
      phase: "fixer",
      modelId: "gpt-5.6-terra",
      reason: "manifest-phase-override",
    });
    expect(resolvePhaseModel("pro", "verifier")).toEqual({
      phase: "verifier",
      modelId: "gpt-5.6-luna",
      reason: "manifest-phase-override",
    });
    expect(resolvePhaseModel("pro", "deploy-assistant")).toEqual({
      phase: "deploy-assistant",
      modelId: "gpt-5.6-terra",
      reason: "manifest-phase-override",
    });
  });

  it("Mellan (max): Sol planner/generator/fixer/deploy; Terra verifier", () => {
    expect(resolvePhaseModel("max", "planner").modelId).toBe("gpt-5.6-sol");
    expect(resolvePhaseModel("max", "generator").modelId).toBe("gpt-5.6-sol");
    expect(resolvePhaseModel("max", "fixer").modelId).toBe("gpt-5.6-sol");
    expect(resolvePhaseModel("max", "fixer").reason).toBe("manifest-phase-override");
    expect(resolvePhaseModel("max", "verifier").modelId).toBe("gpt-5.6-terra");
    expect(resolvePhaseModel("max", "deploy-assistant").modelId).toBe("gpt-5.6-sol");
    expect(resolvePhaseModel("max", "planner").reason).toBe("full-tier");
  });

  it("codex mirrors Mellan (hidden compatibility tier)", () => {
    expect(resolvePhaseModel("codex", "planner").modelId).toBe("gpt-5.6-sol");
    expect(resolvePhaseModel("codex", "generator").modelId).toBe("gpt-5.6-sol");
    expect(resolvePhaseModel("codex", "fixer").modelId).toBe("gpt-5.6-sol");
    expect(resolvePhaseModel("codex", "verifier").modelId).toBe("gpt-5.6-terra");
    expect(resolvePhaseModel("codex", "deploy-assistant").modelId).toBe("gpt-5.6-sol");
  });

  it("anthropic tier uses Claude Opus 4.8 across all phases (Sonnet retired)", () => {
    const planner = resolvePhaseModel("anthropic", "planner");
    const verifier = resolvePhaseModel("anthropic", "verifier");
    const generator = resolvePhaseModel("anthropic", "generator");
    const fixer = resolvePhaseModel("anthropic", "fixer");

    expect(planner.modelId).toBe("claude-opus-4.8");
    expect(generator.modelId).toBe("claude-opus-4.8");
    expect(verifier.modelId).toBe("claude-opus-4.8");
    expect(fixer.modelId).toBe("claude-opus-4.8");
    expect(verifier.reason).toBe("anthropic-tier-unified");
  });

  it("OpenAI build profiles all generate with GPT-5.6 Sol", () => {
    expect(resolvePhaseModel("premium", "generator").modelId).toBe("gpt-5.6-sol");
    expect(resolvePhaseModel("pro", "generator").modelId).toBe("gpt-5.6-sol");
    expect(resolvePhaseModel("max", "generator").modelId).toBe("gpt-5.6-sol");
    expect(resolvePhaseModel("codex", "generator").modelId).toBe("gpt-5.6-sol");
    expect(resolvePhaseModel("anthropic", "generator").modelId).toBe("claude-opus-4.8");
  });
});

describe("getPhaseRoutingSummary", () => {
  it("returns all 5 phases for Hög (premium)", () => {
    const summary = getPhaseRoutingSummary("premium");
    for (const phase of PHASES) {
      expect(summary).toHaveProperty(phase);
      expect(typeof summary[phase]).toBe("string");
    }
    expect(summary.planner).toBe("gpt-5.6-sol");
    expect(summary.generator).toBe("gpt-5.6-sol");
    expect(summary.fixer).toBe("gpt-5.6-sol");
    expect(summary.verifier).toBe("gpt-5.6-terra");
    expect(summary["deploy-assistant"]).toBe("gpt-5.6-sol");
  });

  it("splits Låg (pro): Sol build, Terra fixer/deploy, Luna verifier", () => {
    const summary = getPhaseRoutingSummary("pro");
    expect(summary.planner).toBe("gpt-5.6-sol");
    expect(summary.generator).toBe("gpt-5.6-sol");
    expect(summary.fixer).toBe("gpt-5.6-terra");
    expect(summary.verifier).toBe("gpt-5.6-luna");
    expect(summary["deploy-assistant"]).toBe("gpt-5.6-terra");
  });

  it("Mellan and hidden Kod Max share the same resolved models", () => {
    expect(getPhaseRoutingSummary("max")).toEqual({
      planner: "gpt-5.6-sol",
      generator: "gpt-5.6-sol",
      fixer: "gpt-5.6-sol",
      verifier: "gpt-5.6-terra",
      "deploy-assistant": "gpt-5.6-sol",
    });
    expect(getPhaseRoutingSummary("codex")).toEqual(getPhaseRoutingSummary("max"));
  });

  it("anthropic tier: Opus 4.8 across every phase (Sonnet retired)", () => {
    const summary = getPhaseRoutingSummary("anthropic");
    expect(summary.planner).toBe("claude-opus-4.8");
    expect(summary.generator).toBe("claude-opus-4.8");
    expect(summary.fixer).toBe("claude-opus-4.8");
    expect(summary.verifier).toBe("claude-opus-4.8");
    expect(summary["deploy-assistant"]).toBe("claude-opus-4.8");
  });
});

describe("resolvePhaseThinking", () => {
  it("never ships reasoningMode: pro on any tier or phase", () => {
    for (const tier of CANONICAL_MODEL_IDS) {
      for (const phase of PHASES) {
        expect(
          resolvePhaseThinking(tier, phase).reasoningMode,
          `${tier}/${phase}`,
        ).not.toBe("pro");
      }
    }
  });

  it("every OpenAI-tier verifier is thinking:false / low", () => {
    for (const tier of OPENAI_TIERS) {
      expect(resolvePhaseThinking(tier, "verifier")).toEqual({
        phase: "verifier",
        thinking: false,
        reasoningEffort: "low",
        reason: "manifest-phase-thinking",
      });
    }
  });

  it("Hög generator is xhigh / standard; planner is high / standard", () => {
    expect(resolvePhaseThinking("premium", "planner")).toEqual({
      phase: "planner",
      thinking: true,
      reasoningEffort: "high",
      reasoningMode: "standard",
      reason: "manifest-phase-thinking",
    });
    expect(resolvePhaseThinking("premium", "generator")).toEqual({
      phase: "generator",
      thinking: true,
      reasoningEffort: "xhigh",
      reasoningMode: "standard",
      reason: "manifest-phase-thinking",
    });
  });

  it("omits GPT-5.6-only reasoning mode for a non-5.6 Premium env override", () => {
    const previous = process.env.SAJTMASKIN_MODEL_PREMIUM;
    process.env.SAJTMASKIN_MODEL_PREMIUM = "gpt-5.5";
    try {
      expect(resolvePhaseModel("premium", "planner").modelId).toBe("gpt-5.5");
      expect(resolvePhaseThinking("premium", "planner")).toEqual({
        phase: "planner",
        thinking: true,
        reasoningEffort: "high",
        reason: "manifest-phase-thinking",
      });
    } finally {
      if (previous === undefined) {
        delete process.env.SAJTMASKIN_MODEL_PREMIUM;
      } else {
        process.env.SAJTMASKIN_MODEL_PREMIUM = previous;
      }
    }
  });

  it("disables fixer/verifier/deploy thinking on Låg", () => {
    expect(resolvePhaseThinking("pro", "fixer").thinking).toBe(false);
    expect(resolvePhaseThinking("pro", "verifier").thinking).toBe(false);
    expect(resolvePhaseThinking("pro", "deploy-assistant").thinking).toBe(false);
  });

  it("Hög fixer runs without thinking, high effort", () => {
    expect(resolvePhaseThinking("premium", "fixer")).toEqual({
      phase: "fixer",
      thinking: false,
      reasoningEffort: "high",
      reason: "manifest-phase-thinking",
    });
  });

  it("anthropic tier disables thinking on fixer/verifier (Opus cost control)", () => {
    expect(resolvePhaseThinking("anthropic", "fixer")).toEqual({
      phase: "fixer",
      thinking: false,
      reasoningEffort: "medium",
      reason: "manifest-phase-thinking",
    });
    expect(resolvePhaseThinking("anthropic", "verifier")).toEqual({
      phase: "verifier",
      thinking: false,
      reasoningEffort: "medium",
      reason: "manifest-phase-thinking",
    });
  });

  it("effort ladder is medium → high → xhigh on the generator (standard mode)", () => {
    expect(resolvePhaseThinking("pro", "generator")).toMatchObject({
      thinking: true,
      reasoningEffort: "medium",
      reasoningMode: "standard",
    });
    expect(resolvePhaseThinking("max", "generator")).toMatchObject({
      thinking: true,
      reasoningEffort: "high",
      reasoningMode: "standard",
    });
    expect(resolvePhaseThinking("codex", "generator")).toMatchObject({
      thinking: true,
      reasoningEffort: "high",
      reasoningMode: "standard",
    });
    expect(resolvePhaseThinking("premium", "generator")).toMatchObject({
      thinking: true,
      reasoningEffort: "xhigh",
      reasoningMode: "standard",
    });
    expect(resolvePhaseThinking("anthropic", "planner").reasoningEffort).toBe("high");
  });

  it("Låg planner and generator both run at medium / standard", () => {
    expect(resolvePhaseThinking("pro", "generator")).toEqual({
      phase: "generator",
      thinking: true,
      reasoningEffort: "medium",
      reasoningMode: "standard",
      reason: "manifest-phase-thinking",
    });
    expect(resolvePhaseThinking("pro", "planner")).toEqual({
      phase: "planner",
      thinking: true,
      reasoningEffort: "medium",
      reasoningMode: "standard",
      reason: "manifest-phase-thinking",
    });
  });

  it("fixer effort is medium on Låg/Mellan/Kod Max and high on Hög; thinking stays off", () => {
    expect(resolvePhaseThinking("pro", "fixer")).toMatchObject({
      thinking: false,
      reasoningEffort: "medium",
    });
    expect(resolvePhaseThinking("max", "fixer")).toMatchObject({
      thinking: false,
      reasoningEffort: "medium",
    });
    expect(resolvePhaseThinking("codex", "fixer")).toMatchObject({
      thinking: false,
      reasoningEffort: "medium",
    });
    expect(resolvePhaseThinking("premium", "fixer")).toMatchObject({
      thinking: false,
      reasoningEffort: "high",
    });
  });

  it("deploy-assistant is thinking:false (Låg low, others medium)", () => {
    expect(resolvePhaseThinking("pro", "deploy-assistant")).toEqual({
      phase: "deploy-assistant",
      thinking: false,
      reasoningEffort: "low",
      reason: "manifest-phase-thinking",
    });
    expect(resolvePhaseThinking("max", "deploy-assistant")).toMatchObject({
      thinking: false,
      reasoningEffort: "medium",
    });
    expect(resolvePhaseThinking("premium", "deploy-assistant")).toMatchObject({
      thinking: false,
      reasoningEffort: "medium",
    });
  });
});
