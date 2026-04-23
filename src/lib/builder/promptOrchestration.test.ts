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

  // Regression for SAJ-12 (handoff B4): freeform/kostnadsfri buildMethod no
  // longer short-circuits follow-ups into "freeform" — the !isFirstPrompt
  // gate now runs before the buildMethod-derived branches.
  it("classifies freeform-launched follow-ups as followup_general (B4 regression)", () => {
    const result = orchestratePromptMessage({
      message: "Byt färg på hero-knappen till grön tack.",
      buildMethod: "freeform",
      buildIntent: "website",
      isFirstPrompt: false,
    });

    expect(result.strategyMeta.promptType).toBe("followup_general");
  });

  it("classifies kostnadsfri-launched follow-ups as followup_general (B4 regression)", () => {
    const result = orchestratePromptMessage({
      message: "Lägg till en kontaktsektion under hero.",
      buildMethod: "kostnadsfri",
      buildIntent: "website",
      isFirstPrompt: false,
    });

    expect(result.strategyMeta.promptType).toBe("followup_general");
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

  // ────────────────────────────────────────────────────────────────────
  // Plan 03 (short): promptSource discriminator — auto_repair vs user
  // ────────────────────────────────────────────────────────────────────

  it("marks autofix-triggered passes as promptSource=auto_repair with auto_repair reason (plan 03)", () => {
    // Synthetic auto-fix prompt mirrors what `useAutoFix.ts` (client) builds
    // via `buildAutoFixPrompt`. The client also sets
    // `promptSourceKind: "autofix"` + `preservePayload: true`. Without the
    // plan-03 fix this would surface as `followup_technical` with reason
    // `preserve_registry_payload` ("Registry-data bevarad oförändrad"), so
    // the user could not tell it apart from a follow-up they typed.
    const result = orchestratePromptMessage({
      message:
        "AUTO-FIX REQUEST — TARGETED REPAIR\n\nIssues detected: typecheck failed (exit 1).\n\nRules:\n1. Make the smallest change that fixes the listed issues.",
      isFirstPrompt: false,
      promptSourceKind: "autofix",
      promptSourceTechnical: true,
      promptSourcePreservePayload: true,
    });

    expect(result.strategyMeta.promptSource).toBe("auto_repair");
    expect(result.strategyMeta.reason).toBe("auto_repair");
  });

  it("keeps user-driven followup_technical as promptSource=user (plan 03)", () => {
    // Real user-driven follow-up that classifies as technical because of the
    // `tsx`/`typescript` heuristic. Must NOT be re-labelled as auto_repair.
    const result = orchestratePromptMessage({
      message:
        "Lägg till en kontaktform med valideringsfält i tsx — använd react-hook-form och visa typescript-typer i exemplet.",
      isFirstPrompt: false,
    });

    expect(result.strategyMeta.promptType).toBe("followup_technical");
    expect(result.strategyMeta.promptSource).toBe("user");
    expect(result.strategyMeta.reason).not.toBe("auto_repair");
  });

  it("keeps user-driven followup_general as promptSource=user (plan 03)", () => {
    // Reuses the smoke-confirmed phrasing from plan 01 that classifies as
    // followup_general. Must stay user-driven and not pick up auto_repair.
    const result = orchestratePromptMessage({
      message: "Lägg till en kontaktsektion under hero.",
      buildMethod: "freeform",
      buildIntent: "website",
      isFirstPrompt: false,
    });

    expect(result.strategyMeta.promptType).toBe("followup_general");
    expect(result.strategyMeta.promptSource).toBe("user");
    expect(result.strategyMeta.reason).not.toBe("auto_repair");
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
