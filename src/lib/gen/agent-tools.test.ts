import { describe, expect, it } from "vitest";
import { getAgentTools } from "./agent-tools";

describe("getAgentTools", () => {
  it("includes integration/env tools by default", () => {
    const tools = getAgentTools();
    expect(tools).toHaveProperty("suggestIntegration");
    expect(tools).toHaveProperty("requestEnvVar");
  });

  it("can disable integration/env tools for follow-ups", () => {
    const tools = getAgentTools({ includeIntegrationSignals: false });
    expect(tools).not.toHaveProperty("suggestIntegration");
    expect(tools).not.toHaveProperty("requestEnvVar");
  });

  it("still supports plan artifact + clarifying question in plan mode", () => {
    const tools = getAgentTools({
      includePlanArtifact: true,
      includeClarifyingQuestion: true,
    });
    expect(tools).toHaveProperty("emitPlanArtifact");
    expect(tools).toHaveProperty("askClarifyingQuestion");
  });
});
