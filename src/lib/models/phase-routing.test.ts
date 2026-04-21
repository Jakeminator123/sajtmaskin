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

    expect(planner.modelId).toBe("gpt-5.4-mini");
    expect(generator.modelId).toBe("gpt-5.4-mini");
    expect(fixer.modelId).toBe("gpt-5.4-mini");
    expect(verifier.modelId).toBe("gpt-5.4-mini");
    expect(deploy.modelId).toBe("gpt-5.4-mini");
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
    expect(resolvePhaseModel("codex", "planner").modelId).toBe("gpt-5.3-codex");
    expect(resolvePhaseModel("codex", "generator").modelId).toBe(
      "gpt-5.3-codex",
    );
    expect(resolvePhaseModel("codex", "fixer").modelId).toBe("gpt-5.3-codex");
    expect(resolvePhaseModel("codex", "verifier").modelId).toBe("gpt-5.3-codex");
    expect(resolvePhaseModel("codex", "deploy-assistant").modelId).toBe("gpt-5.3-codex");
  });

  it("anthropic tier uses Claude Opus for planner/generator and Sonnet for fixer/verifier", () => {
    const planner = resolvePhaseModel("anthropic", "planner");
    const verifier = resolvePhaseModel("anthropic", "verifier");
    const generator = resolvePhaseModel("anthropic", "generator");
    const fixer = resolvePhaseModel("anthropic", "fixer");

    expect(planner.modelId).toBe("claude-opus-4.6");
    expect(generator.modelId).toBe("claude-opus-4.6");
    expect(verifier.modelId).toBe("claude-sonnet-4.6");
    expect(fixer.modelId).toBe("claude-sonnet-4.6");
    expect(verifier.reason).toBe("anthropic-tier-unified");
  });

  it("generator always uses full tier for OpenAI profiles", () => {
    expect(resolvePhaseModel("pro", "generator").modelId).toBe("gpt-5.3-codex");
    expect(resolvePhaseModel("max", "generator").modelId).toBe("gpt-5.4");
    expect(resolvePhaseModel("codex", "generator").modelId).toBe(
      "gpt-5.3-codex",
    );
    expect(resolvePhaseModel("anthropic", "generator").modelId).toBe(
      "claude-opus-4.6",
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
    expect(summary.planner).toBe("gpt-5.4-mini");
    expect(summary.generator).toBe("gpt-5.4-mini");
  });

  it("splits pro tier: all phases use gpt-5.3-codex", () => {
    const summary = getPhaseRoutingSummary("pro");
    expect(summary.planner).toBe("gpt-5.3-codex");
    expect(summary.generator).toBe("gpt-5.3-codex");
    expect(summary.fixer).toBe("gpt-5.3-codex");
    expect(summary.verifier).toBe("gpt-5.3-codex");
    expect(summary["deploy-assistant"]).toBe("gpt-5.3-codex");
  });

  it("anthropic tier: opus for planner/generator, sonnet elsewhere", () => {
    const summary = getPhaseRoutingSummary("anthropic");
    expect(summary.planner).toBe("claude-opus-4.6");
    expect(summary.generator).toBe("claude-opus-4.6");
    expect(summary.fixer).toBe("claude-sonnet-4.6");
    expect(summary.verifier).toBe("claude-sonnet-4.6");
    expect(summary["deploy-assistant"]).toBe("claude-sonnet-4.6");
  });
});

describe("resolvePhaseThinking", () => {
  it("fast tier uses thinking on planner (low) and generator (medium) per manifest", () => {
    expect(resolvePhaseThinking("fast", "planner")).toEqual({
      phase: "planner",
      thinking: true,
      reasoningEffort: "low",
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

  it("max tier verifier runs without thinking, medium reasoning effort", () => {
    expect(resolvePhaseThinking("max", "verifier")).toEqual({
      phase: "verifier",
      thinking: false,
      reasoningEffort: "medium",
      reason: "manifest-phase-thinking",
    });
  });
});
