import { describe, expect, it } from "vitest";
import { resolveProgressPartState } from "./stream-handlers";

describe("resolveProgressPartState", () => {
  // Prod 2026-08-08 (chat 1b906aa1, flugfiske-sajten): modellen skickade en
  // avhuggen package.json på 6 rader, ändringsskyddet återställde den och
  // dep-completer hade redan pinnat `maplibre-gl`. Versionen sparades,
  // typecheck gav exit 0 och previewen startade — men slutsteget stämplades
  // "fel" i rött och bad användaren försöka igen. Skyddet som gör sitt jobb
  // är inte ett misslyckat steg.
  it("behandlar ändringsskyddets revert som ett slutfört steg, inte ett fel", () => {
    expect(resolveProgressPartState("element_guard", "reverted")).toBe("output-available");
  });

  it("markerar äkta fel som fel", () => {
    expect(resolveProgressPartState("generation", "error")).toBe("output-error");
    expect(resolveProgressPartState("generation", "gave-up")).toBe("output-error");
    expect(resolveProgressPartState("preview", "build-failed")).toBe("output-error");
  });

  it("markerar slutförda faser som slutförda", () => {
    expect(resolveProgressPartState("generation", "done")).toBe("output-available");
    expect(resolveProgressPartState("verify", "passed")).toBe("output-available");
    for (const phase of ["boot-queued", "ready", "build-verified"]) {
      expect(resolveProgressPartState("preview", phase)).toBe("output-available");
    }
  });

  // `build-failed` är bara ett fel för preview-steget; samma ord från ett
  // annat steg får inte tyst ärva den betydelsen.
  it("begränsar preview-specifika faser till preview-steget", () => {
    expect(resolveProgressPartState("generation", "build-failed")).toBe("input-streaming");
    expect(resolveProgressPartState("generation", "ready")).toBe("input-streaming");
  });

  it("visar pågående faser som pågående", () => {
    expect(resolveProgressPartState("generation", "streaming")).toBe("input-streaming");
    expect(resolveProgressPartState("preview", "starting")).toBe("input-streaming");
  });

  it("stämplar fix-failed som fel så verifieringsraden inte spinner", () => {
    // Saknad severity = fail-closed Blocker. Annars blir steget en evig spinner.
    expect(resolveProgressPartState("verifier", "fix-failed")).toBe("output-error");
    expect(resolveProgressPartState("verifier", "fix-failed", {})).toBe("output-error");
  });

  it("stämplar blockerande fix-failed som fel", () => {
    expect(
      resolveProgressPartState("verifier", "fix-failed", { severity: "blocking" }),
    ).toBe("output-error");
  });

  it("stämplar rådgivande fix-failed som slutfört, inte fel", () => {
    expect(
      resolveProgressPartState("verifier", "fix-failed", { severity: "advisory" }),
    ).toBe("output-available");
  });

  it("gissar inte advisory från meddelandetext", () => {
    expect(
      resolveProgressPartState("verifier", "fix-failed", {
        steps: ["Ett rådgivande verifieringsfynd kunde inte lagas."],
      }),
    ).toBe("output-error");
  });

  it("stämplar verifier-fixerns terminala faser som slutförda så de inte spinner", () => {
    expect(resolveProgressPartState("verifier", "fixed")).toBe("output-available");
    expect(resolveProgressPartState("verifier", "fix-partial")).toBe("output-available");
  });

  it("stämplar tsc-skipped som slutförd så QG tar över utan spinner", () => {
    expect(resolveProgressPartState("validate_syntax", "tsc-skipped")).toBe("output-available");
  });
});
