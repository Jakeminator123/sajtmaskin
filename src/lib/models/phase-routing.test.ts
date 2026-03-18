import { describe, expect, it } from "vitest";
import {
  resolvePhaseModel,
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

  it("uses full tier model for all phases when pro tier", () => {
    const planner = resolvePhaseModel("pro", "planner");
    const verifier = resolvePhaseModel("pro", "verifier");
    const generator = resolvePhaseModel("pro", "generator");
    const fixer = resolvePhaseModel("pro", "fixer");

    expect(planner.modelId).toBe("gpt-5.3-codex");
    expect(verifier.modelId).toBe("gpt-5.3-codex");
    expect(generator.modelId).toBe("gpt-5.3-codex");
    expect(fixer.modelId).toBe("gpt-5.3-codex");
  });

  it("uses full tier model for all phases when max tier", () => {
    const planner = resolvePhaseModel("max", "planner");
    const verifier = resolvePhaseModel("max", "verifier");
    const generator = resolvePhaseModel("max", "generator");

    expect(planner.modelId).toBe("gpt-5.4");
    expect(verifier.modelId).toBe("gpt-5.4");
    expect(generator.modelId).toBe("gpt-5.4");
  });

  it("uses full tier model for all phases when codex tier", () => {
    const planner = resolvePhaseModel("codex", "planner");
    const verifier = resolvePhaseModel("codex", "verifier");
    const generator = resolvePhaseModel("codex", "generator");

    expect(planner.modelId).toBe("gpt-5.1-codex-max");
    expect(verifier.modelId).toBe("gpt-5.1-codex-max");
    expect(generator.modelId).toBe("gpt-5.1-codex-max");
  });

  it("generator always uses full tier", () => {
    expect(resolvePhaseModel("pro", "generator").modelId).toBe("gpt-5.3-codex");
    expect(resolvePhaseModel("max", "generator").modelId).toBe("gpt-5.4");
    expect(resolvePhaseModel("codex", "generator").modelId).toBe(
      "gpt-5.1-codex-max",
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

  it("uses same model for all phases in pro tier", () => {
    const summary = getPhaseRoutingSummary("pro");
    expect(summary.planner).toBe("gpt-5.3-codex");
    expect(summary.generator).toBe("gpt-5.3-codex");
    expect(summary.fixer).toBe("gpt-5.3-codex");
    expect(summary.verifier).toBe("gpt-5.3-codex");
    expect(summary["deploy-assistant"]).toBe("gpt-5.3-codex");
  });
});
