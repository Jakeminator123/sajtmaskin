import { describe, expect, it } from "vitest";
import { MAX_CHAT_MESSAGE_CHARS } from "./promptLimits";
import { buildSectionAwareHandoff, orchestratePromptMessage } from "./promptOrchestration";

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

  it("keeps full prompt body when over soft target but under hard cap (preserved strategy)", () => {
    const soft = 75_000;
    const body = `${"paragraph one with enough content.\n\n".repeat(2600)}UNIQUE_TAIL_MARKER_XYZ`;
    expect(body.length).toBeGreaterThan(soft);
    const result = orchestratePromptMessage({
      message: body,
      buildMethod: "freeform",
      buildIntent: "website",
      isFirstPrompt: true,
      hardCap: MAX_CHAT_MESSAGE_CHARS,
    });
    expect(result.strategyMeta.strategy).toBe("preserved");
    expect(result.finalMessage).toContain("UNIQUE_TAIL_MARKER_XYZ");
    expect(result.finalMessage).toContain("Full text preserved");
  });

  it("uses section-aware handoff when content exceeds hard cap", () => {
    const cap = 8000;
    const chunk = "LINE_A\nLINE_B\nLINE_C\n\n";
    const body = chunk.repeat(400);
    expect(body.length).toBeGreaterThan(cap);
    const handoff = buildSectionAwareHandoff(body, cap);
    expect(handoff.length).toBeLessThanOrEqual(cap);
    expect(handoff).toContain("[System: Middle truncated");
    expect(handoff).toContain("LINE_A");
  });
});
