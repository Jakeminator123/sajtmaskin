import { describe, expect, it } from "vitest";
import { orchestratePromptMessage } from "./promptOrchestration";

describe("promptOrchestration", () => {
  it("classifies first prompts from freeform entry as freeform", () => {
    const result = orchestratePromptMessage({
      message: "Bygg en modern frisorsajt med bokning och prislista.",
      buildMethod: "freeform",
      buildIntent: "website",
      isFirstPrompt: true,
    });

    expect(result.strategyMeta.promptType).toBe("freeform");
  });

  it("classifies first prompts from wizard and audit entry points correctly", () => {
    const wizardResult = orchestratePromptMessage({
      message: "Företaget jobbar med B2B-städning i Malmö.",
      buildMethod: "wizard",
      buildIntent: "website",
      isFirstPrompt: true,
    });
    const auditResult = orchestratePromptMessage({
      message: "Analysera den här sajten och ge förbättringar.",
      buildMethod: "audit",
      buildIntent: "website",
      isFirstPrompt: true,
    });

    expect(wizardResult.strategyMeta.promptType).toBe("wizard");
    expect(auditResult.strategyMeta.promptType).toBe("audit");
  });

  it("classifies category/template entry points as template", () => {
    const result = orchestratePromptMessage({
      message: "Utgå från en enkel restaurangmall.",
      buildMethod: "category",
      buildIntent: "template",
      isFirstPrompt: true,
    });

    expect(result.strategyMeta.promptType).toBe("template");
  });

  it("preserves explicit technical payloads without summarizing them", () => {
    const largeTechnicalPrompt = [
      "Lägg till AI-element: **Conversation**",
      "📍 Placering: Längst ner",
      "",
      "---",
      "",
      "Registry files:",
      "```tsx",
      "export function Demo() { return <div />; }",
      "```",
    ]
      .join("\n")
      .repeat(400);

    const result = orchestratePromptMessage({
      message: largeTechnicalPrompt,
      isFirstPrompt: false,
      promptSourceTechnical: true,
      promptSourcePreservePayload: true,
    });

    expect(result.finalMessage).toBe(largeTechnicalPrompt);
    expect(result.strategyMeta.strategy).toBe("direct");
    expect(result.strategyMeta.reason).toContain("preserve_registry_payload");
  });

  it("classifies explicit technical follow-ups as technical", () => {
    const result = orchestratePromptMessage({
      message: "Please apply this builder placement payload as-is.",
      isFirstPrompt: false,
      promptSourceTechnical: true,
    });

    expect(result.strategyMeta.promptType).toBe("followup_technical");
  });
});
