import { describe, expect, it } from "vitest";
import {
  resolvePhaseModel,
  resolvePhaseThinking,
  getPhaseRoutingSummary,
  type GenerationPhase,
} from "./phase-routing";

describe("resolvePhaseModel", () => {
  it("uses GPT-5.6 Sol for Premium build phases; fixer pinned to gpt-5.6-sol without thinking", () => {
    // Ägarbeslut 2026-08-11: Premium fixer uses Sol (not Codex); thinking stays off.
    const planner = resolvePhaseModel("premium", "planner");
    const generator = resolvePhaseModel("premium", "generator");
    const fixer = resolvePhaseModel("premium", "fixer");
    const verifier = resolvePhaseModel("premium", "verifier");
    const deploy = resolvePhaseModel("premium", "deploy-assistant");

    expect(planner.modelId).toBe("gpt-5.6-sol");
    expect(generator.modelId).toBe("gpt-5.6-sol");
    expect(fixer.modelId).toBe("gpt-5.6-sol");
    expect(fixer.reason).toBe("manifest-phase-override");
    expect(verifier.modelId).toBe("gpt-5.6-sol");
    expect(deploy.modelId).toBe("gpt-5.6-sol");
    expect(planner.reason).toBe("premium-tier-unified");
  });

  it("uses full tier for planner/generator/fixer on pro; verifier/deploy on gpt-5.3-codex", () => {
    expect(resolvePhaseModel("pro", "planner").modelId).toBe("gpt-5.3-codex");
    expect(resolvePhaseModel("pro", "generator").modelId).toBe("gpt-5.3-codex");
    expect(resolvePhaseModel("pro", "fixer").modelId).toBe("gpt-5.3-codex");
    expect(resolvePhaseModel("pro", "fixer").reason).toBe("fixer-tier-primary");
    expect(resolvePhaseModel("pro", "verifier").modelId).toBe("gpt-5.3-codex");
    expect(resolvePhaseModel("pro", "deploy-assistant").modelId).toBe("gpt-5.3-codex");
  });

  it("uses full tier for planner/generator on max; fixer/verifier/deploy on gpt-5.3-codex", () => {
    expect(resolvePhaseModel("max", "planner").modelId).toBe("gpt-5.5");
    expect(resolvePhaseModel("max", "generator").modelId).toBe("gpt-5.5");
    expect(resolvePhaseModel("max", "fixer").modelId).toBe("gpt-5.3-codex");
    expect(resolvePhaseModel("max", "fixer").reason).toBe("manifest-phase-override");
    expect(resolvePhaseModel("max", "verifier").modelId).toBe("gpt-5.3-codex");
    expect(resolvePhaseModel("max", "deploy-assistant").modelId).toBe("gpt-5.3-codex");
  });

  it("uses full tier for planner/generator/fixer on codex; verifier/deploy on gpt-5.3-codex", () => {
    expect(resolvePhaseModel("codex", "planner").modelId).toBe("gpt-5.3-codex");
    expect(resolvePhaseModel("codex", "generator").modelId).toBe("gpt-5.3-codex");
    expect(resolvePhaseModel("codex", "fixer").modelId).toBe("gpt-5.3-codex");
    expect(resolvePhaseModel("codex", "verifier").modelId).toBe("gpt-5.3-codex");
    expect(resolvePhaseModel("codex", "deploy-assistant").modelId).toBe("gpt-5.3-codex");
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

  it("generator always uses full tier for OpenAI profiles", () => {
    expect(resolvePhaseModel("premium", "generator").modelId).toBe("gpt-5.6-sol");
    expect(resolvePhaseModel("pro", "generator").modelId).toBe("gpt-5.3-codex");
    expect(resolvePhaseModel("max", "generator").modelId).toBe("gpt-5.5");
    expect(resolvePhaseModel("codex", "generator").modelId).toBe("gpt-5.3-codex");
    expect(resolvePhaseModel("anthropic", "generator").modelId).toBe("claude-opus-4.8");
  });
});

describe("getPhaseRoutingSummary", () => {
  it("returns all 5 phases for Premium tier", () => {
    const summary = getPhaseRoutingSummary("premium");
    const phases: GenerationPhase[] = [
      "planner",
      "generator",
      "fixer",
      "verifier",
      "deploy-assistant",
    ];
    for (const phase of phases) {
      expect(summary).toHaveProperty(phase);
      expect(typeof summary[phase]).toBe("string");
    }
    expect(summary.planner).toBe("gpt-5.6-sol");
    expect(summary.generator).toBe("gpt-5.6-sol");
    expect(summary.fixer).toBe("gpt-5.6-sol");
    expect(summary.verifier).toBe("gpt-5.6-sol");
    expect(summary["deploy-assistant"]).toBe("gpt-5.6-sol");
  });

  it("splits pro tier: all phases use gpt-5.3-codex", () => {
    const summary = getPhaseRoutingSummary("pro");
    expect(summary.planner).toBe("gpt-5.3-codex");
    expect(summary.generator).toBe("gpt-5.3-codex");
    expect(summary.fixer).toBe("gpt-5.3-codex");
    expect(summary.verifier).toBe("gpt-5.3-codex");
    expect(summary["deploy-assistant"]).toBe("gpt-5.3-codex");
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
  it("Premium uses pro mode with high reasoning across build phases", () => {
    expect(resolvePhaseThinking("premium", "planner")).toEqual({
      phase: "planner",
      thinking: true,
      reasoningEffort: "high",
      reasoningMode: "pro",
      reason: "manifest-phase-thinking",
    });
    expect(resolvePhaseThinking("premium", "generator")).toEqual({
      phase: "generator",
      thinking: true,
      reasoningEffort: "high",
      reasoningMode: "pro",
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

  it("disables fixer/verifier thinking by default", () => {
    expect(resolvePhaseThinking("pro", "fixer").thinking).toBe(false);
    expect(resolvePhaseThinking("pro", "verifier").thinking).toBe(false);
    expect(resolvePhaseThinking("pro", "deploy-assistant").thinking).toBe(false);
  });

  it("premium fixer runs without thinking, medium effort (ägarbeslut 2026-08-11)", () => {
    expect(resolvePhaseThinking("premium", "fixer")).toEqual({
      phase: "fixer",
      thinking: false,
      reasoningEffort: "medium",
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
    expect(resolvePhaseThinking("anthropic", "verifier").thinking).toBe(false);
  });

  it("raises planner/generator reasoning effort for higher tiers", () => {
    expect(resolvePhaseThinking("max", "planner").reasoningEffort).toBe("high");
    expect(resolvePhaseThinking("codex", "generator").reasoningEffort).toBe("high");
    expect(resolvePhaseThinking("anthropic", "planner").reasoningEffort).toBe("high");
  });

  it("max tier verifier runs without thinking, medium reasoning effort", () => {
    expect(resolvePhaseThinking("max", "verifier")).toEqual({
      phase: "verifier",
      thinking: false,
      reasoningEffort: "medium",
      reason: "manifest-phase-thinking",
    });
  });
});
