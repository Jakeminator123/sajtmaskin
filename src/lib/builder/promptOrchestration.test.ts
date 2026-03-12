import { describe, expect, it } from "vitest";
import { orchestratePromptMessage } from "./promptOrchestration";

describe("promptOrchestration", () => {
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
