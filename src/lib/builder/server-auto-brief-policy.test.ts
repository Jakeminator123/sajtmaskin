import { describe, expect, it } from "vitest";
import { shouldRunServerAutoBrief } from "./server-auto-brief-policy";

describe("shouldRunServerAutoBrief", () => {
  it("returns false when client already sent a brief", () => {
    expect(
      shouldRunServerAutoBrief({
        hasClientBrief: true,
        promptSourceTechnical: false,
        promptSourcePreservePayload: false,
        promptType: "freeform",
        orchestrationReason: "within_budget",
        prompt: "Bygg en hemsida",
        buildIntent: "website",
      }),
    ).toBe(false);
  });

  it("skips when meta marks prompt as technical", () => {
    expect(
      shouldRunServerAutoBrief({
        hasClientBrief: false,
        promptSourceTechnical: true,
        promptSourcePreservePayload: false,
        promptType: "freeform",
        orchestrationReason: "within_budget",
        prompt: "Bygg en hemsida",
        buildIntent: "website",
      }),
    ).toBe(false);
  });

  it("skips when meta requests payload preservation", () => {
    expect(
      shouldRunServerAutoBrief({
        hasClientBrief: false,
        promptSourceTechnical: false,
        promptSourcePreservePayload: true,
        promptType: "freeform",
        orchestrationReason: "within_budget",
        prompt: "Bygg en hemsida",
        buildIntent: "website",
      }),
    ).toBe(false);
  });

  it("skips audit prompts", () => {
    expect(
      shouldRunServerAutoBrief({
        hasClientBrief: false,
        promptSourceTechnical: false,
        promptSourcePreservePayload: false,
        promptType: "audit",
        orchestrationReason: "within_budget",
        prompt: "Bygg en hemsida",
        buildIntent: "website",
      }),
    ).toBe(false);
  });

  it("skips follow-up prompts", () => {
    for (const promptType of ["followup_general", "followup_technical"] as const) {
      expect(
        shouldRunServerAutoBrief({
          hasClientBrief: false,
          promptSourceTechnical: false,
          promptSourcePreservePayload: false,
          promptType,
          orchestrationReason: "within_budget",
          prompt: "Bygg en hemsida",
          buildIntent: "website",
        }),
      ).toBe(false);
    }
  });

  it("skips technical / registry preserve paths", () => {
    for (const orchestrationReason of [
      "technical_content_preserved",
      "preserve_registry_payload",
    ] as const) {
      expect(
        shouldRunServerAutoBrief({
          hasClientBrief: false,
          promptSourceTechnical: false,
          promptSourcePreservePayload: false,
          promptType: "freeform",
          orchestrationReason,
          prompt: "Bygg en hemsida",
          buildIntent: "website",
        }),
      ).toBe(false);
    }
  });

  it("runs for typical freeform init when env flag is off", () => {
    const prev = process.env.SAJTMASKIN_DISABLE_SERVER_AUTO_BRIEF;
    delete process.env.SAJTMASKIN_DISABLE_SERVER_AUTO_BRIEF;
    try {
      expect(
        shouldRunServerAutoBrief({
          hasClientBrief: false,
          promptSourceTechnical: false,
          promptSourcePreservePayload: false,
          promptType: "freeform",
          orchestrationReason: "within_budget",
          prompt: "Bygg en hemsida med hero och kontaktsektion.",
          buildIntent: "website",
        }),
      ).toBe(true);
    } finally {
      if (prev === undefined) delete process.env.SAJTMASKIN_DISABLE_SERVER_AUTO_BRIEF;
      else process.env.SAJTMASKIN_DISABLE_SERVER_AUTO_BRIEF = prev;
    }
  });

  it("respects SAJTMASKIN_DISABLE_SERVER_AUTO_BRIEF=1", () => {
    const prev = process.env.SAJTMASKIN_DISABLE_SERVER_AUTO_BRIEF;
    process.env.SAJTMASKIN_DISABLE_SERVER_AUTO_BRIEF = "1";
    try {
      expect(
        shouldRunServerAutoBrief({
          hasClientBrief: false,
          promptSourceTechnical: false,
          promptSourcePreservePayload: false,
          promptType: "freeform",
          orchestrationReason: "within_budget",
          prompt: "Bygg en hemsida",
          buildIntent: "website",
        }),
      ).toBe(false);
    } finally {
      if (prev === undefined) delete process.env.SAJTMASKIN_DISABLE_SERVER_AUTO_BRIEF;
      else process.env.SAJTMASKIN_DISABLE_SERVER_AUTO_BRIEF = prev;
    }
  });

  it("skips auto-brief for already structured website prompts", () => {
    expect(
      shouldRunServerAutoBrief({
        hasClientBrief: false,
        promptSourceTechnical: false,
        promptSourcePreservePayload: false,
        promptType: "freeform",
        orchestrationReason: "within_budget",
        prompt:
          "Skapa en professionell hemsida med hero-sektion, om oss, kontakt, CTA och en varm grön färgpalett för en veterinärklinik i Malmö.",
        buildIntent: "website",
      }),
    ).toBe(false);
  });
});
