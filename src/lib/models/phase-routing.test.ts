import { describe, expect, it } from "vitest";
import {
  resolvePhaseModel,
  resolvePhaseThinking,
  getPhaseRoutingSummary,
  type GenerationPhase,
} from "./phase-routing";

describe("resolvePhaseModel", () => {
  it("uses same model for all phases when fast tier", () => {
    const planner = resolvePhaseModel("fast", "planner");
    const generator = resolvePhaseModel("fast", "generator");
    const fixer = resolvePhaseModel("fast", "fixer");
    const verifier = resolvePhaseModel("fast", "verifier");
    const deploy = resolvePhaseModel("fast", "deploy-assistant");

    expect(planner.modelId).toBe("gpt-4.1");
    expect(generator.modelId).toBe("gpt-4.1");
    expect(fixer.modelId).toBe("gpt-4.1");
    expect(verifier.modelId).toBe("gpt-4.1");
    expect(deploy.modelId).toBe("gpt-4.1");
    expect(planner.reason).toBe("fast-tier-no-downgrade");
  });

  it("uses full tier for planner/generator/fixer on pro; verifier/deploy on gpt-5.3-codex", () => {
    expect(resolvePhaseModel("pro", "planner").modelId).toBe("gpt-5.3-codex");
    expect(resolvePhaseModel("pro", "generator").modelId).toBe("gpt-5.3-codex");
    expect(resolvePhaseModel("pro", "fixer").modelId).toBe("gpt-5.3-codex");
    expect(resolvePhaseModel("pro", "fixer").reason).toBe("fixer-tier-primary");
    expect(resolvePhaseModel("pro", "verifier").modelId).toBe("gpt-5.3-codex");
    expect(resolvePhaseModel("pro", "deploy-assistant").modelId).toBe(
      "gpt-5.3-codex",
    );
  });

  it("uses full tier for planner/generator on max; fixer/verifier/deploy on gpt-5.3-codex", () => {
    expect(resolvePhaseModel("max", "planner").modelId).toBe("gpt-5.4");
    expect(resolvePhaseModel("max", "generator").modelId).toBe("gpt-5.4");
    expect(resolvePhaseModel("max", "fixer").modelId).toBe("gpt-5.3-codex");
    expect(resolvePhaseModel("max", "fixer").reason).toBe("manifest-phase-override");
    expect(resolvePhaseModel("max", "verifier").modelId).toBe("gpt-5.3-codex");
    expect(resolvePhaseModel("max", "deploy-assistant").modelId).toBe("gpt-5.3-codex");
  });

  it("uses full tier for planner/generator/fixer on codex; verifier/deploy on gpt-5.3-codex", () => {
    expect(resolvePhaseModel("codex", "planner").modelId).toBe("gpt-5.3-codex-max");
    expect(resolvePhaseModel("codex", "generator").modelId).toBe(
      "gpt-5.3-codex-max",
    );
    expect(resolvePhaseModel("codex", "fixer").modelId).toBe("gpt-5.3-codex-max");
    expect(resolvePhaseModel("codex", "verifier").modelId).toBe("gpt-5.3-codex");
    expect(resolvePhaseModel("codex", "deploy-assistant").modelId).toBe("gpt-5.3-codex");
  });

  it("uses Claude Sonnet across all phases in anthropic tier", () => {
    const planner = resolvePhaseModel("anthropic", "planner");
    const verifier = resolvePhaseModel("anthropic", "verifier");
    const generator = resolvePhaseModel("anthropic", "generator");
    const fixer = resolvePhaseModel("anthropic", "fixer");

    expect(planner.modelId).toBe("claude-sonnet-4.6");
    expect(verifier.modelId).toBe("claude-sonnet-4.6");
    expect(generator.modelId).toBe("claude-sonnet-4.6");
    expect(fixer.modelId).toBe("claude-sonnet-4.6");
    expect(verifier.reason).toBe("anthropic-tier-unified");
  });

  it("generator always uses full tier for OpenAI profiles", () => {
    expect(resolvePhaseModel("pro", "generator").modelId).toBe("gpt-5.3-codex");
    expect(resolvePhaseModel("max", "generator").modelId).toBe("gpt-5.4");
    expect(resolvePhaseModel("codex", "generator").modelId).toBe(
      "gpt-5.3-codex-max",
    );
    expect(resolvePhaseModel("anthropic", "generator").modelId).toBe(
      "claude-sonnet-4.6",
    );
  });
});

describe("getPhaseRoutingSummary", () => {
  it("returns all 5 phases for fast tier", () => {
    const summary = getPhaseRoutingSummary("fast");
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
    expect(summary.planner).toBe("gpt-4.1");
    expect(summary.generator).toBe("gpt-4.1");
  });

  it("splits pro tier: all phases use gpt-5.3-codex", () => {
    const summary = getPhaseRoutingSummary("pro");
    expect(summary.planner).toBe("gpt-5.3-codex");
    expect(summary.generator).toBe("gpt-5.3-codex");
    expect(summary.fixer).toBe("gpt-5.3-codex");
    expect(summary.verifier).toBe("gpt-5.3-codex");
    expect(summary["deploy-assistant"]).toBe("gpt-5.3-codex");
  });

  it("uses Claude for core phases; deploy-assistant stays gpt-4.1 (manifest)", () => {
    const summary = getPhaseRoutingSummary("anthropic");
    expect(summary.planner).toBe("claude-sonnet-4.6");
    expect(summary.generator).toBe("claude-sonnet-4.6");
    expect(summary.fixer).toBe("claude-sonnet-4.6");
    expect(summary.verifier).toBe("claude-sonnet-4.6");
    expect(summary["deploy-assistant"]).toBe("gpt-4.1");
  });
});

describe("resolvePhaseThinking", () => {
  it("keeps planner/generator thinking enabled by default for fast tier", () => {
    expect(resolvePhaseThinking("fast", "planner")).toEqual({
      phase: "planner",
      thinking: true,
      reasoningEffort: "medium",
      reason: "manifest-phase-thinking",
    });
    expect(resolvePhaseThinking("fast", "generator")).toEqual({
      phase: "generator",
      thinking: true,
      reasoningEffort: "medium",
      reason: "manifest-phase-thinking",
    });
  });

  it("disables fixer/verifier thinking by default", () => {
    expect(resolvePhaseThinking("pro", "fixer").thinking).toBe(false);
    expect(resolvePhaseThinking("pro", "verifier").thinking).toBe(false);
    expect(resolvePhaseThinking("pro", "deploy-assistant").thinking).toBe(false);
  });

  it("raises planner/generator reasoning effort for higher tiers", () => {
    expect(resolvePhaseThinking("max", "planner").reasoningEffort).toBe("high");
    expect(resolvePhaseThinking("codex", "generator").reasoningEffort).toBe("high");
    expect(resolvePhaseThinking("anthropic", "planner").reasoningEffort).toBe("high");
  });
});
