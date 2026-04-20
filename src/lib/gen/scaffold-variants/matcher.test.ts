import { describe, expect, it } from "vitest";

import { lockedVariantForFollowUp, pickScaffoldVariant } from "./matcher";
import { getVariantsForScaffold } from "./registry";

describe("pickScaffoldVariant", () => {
  it("prefers the default variant when the prompt is underspecified", () => {
    const variant = pickScaffoldVariant({
      prompt: "Build a clean company website",
      scaffoldId: "landing-page",
      generationMode: "init",
      sessionSeed: "seed-1",
    });

    expect(variant?.id).toBe("corporate-grid");
  });

  it("matches scaffold-specific editorial blog signals", () => {
    const variant = pickScaffoldVariant({
      prompt: "Create a longform editorial blog for essays and magazine-style reading",
      scaffoldId: "blog",
      styleKeywords: ["editorial", "reading"],
      toneKeywords: ["thoughtful"],
      generationMode: "init",
      sessionSeed: "seed-2",
    });

    expect(variant?.id).toBe("editorial-serif");
  });

  it("does not escape the selected scaffold's variant pool", () => {
    const variant = pickScaffoldVariant({
      prompt: "Create a dark terminal-style developer product landing page",
      scaffoldId: "app-shell",
      styleKeywords: ["terminal", "developer"],
      toneKeywords: ["technical"],
      generationMode: "init",
      sessionSeed: "seed-3",
    });

    expect(variant?.scaffoldId).toBe("app-shell");
    expect(variant?.id).toBe("immersive-dark");
  });
});

describe("lockedVariantForFollowUp (P22)", () => {
  // Använd en faktisk variant från registry så testet inte beror på en mock.
  const landingVariants = getVariantsForScaffold("landing-page");
  const priorVariantId = landingVariants[0]?.id;

  it("locks to the prior variant on two clear-refine follow-ups in a row", () => {
    if (!priorVariantId) throw new Error("No landing-page variants registered");
    const first = lockedVariantForFollowUp({
      chatId: "chat-x",
      intent: "clear-refine",
      scaffoldId: "landing-page",
      priorVariantId,
    });
    const second = lockedVariantForFollowUp({
      chatId: "chat-x",
      intent: "clear-refine",
      scaffoldId: "landing-page",
      priorVariantId,
    });
    expect(first?.id).toBe(priorVariantId);
    expect(second?.id).toBe(priorVariantId);
    expect(first?.id).toBe(second?.id);
  });

  it("returns null on clear-redesign so the matcher can pick a new variant", () => {
    if (!priorVariantId) throw new Error("No landing-page variants registered");
    const result = lockedVariantForFollowUp({
      chatId: "chat-x",
      intent: "clear-redesign",
      scaffoldId: "landing-page",
      priorVariantId,
    });
    expect(result).toBeNull();
  });

  it("returns null when prior variant id is missing", () => {
    const result = lockedVariantForFollowUp({
      chatId: "chat-x",
      intent: "clear-refine",
      scaffoldId: "landing-page",
      priorVariantId: null,
    });
    expect(result).toBeNull();
  });

  it("returns null when prior variant id no longer resolves in the registry", () => {
    const result = lockedVariantForFollowUp({
      chatId: "chat-x",
      intent: "clear-refine",
      scaffoldId: "landing-page",
      priorVariantId: "this-variant-does-not-exist",
    });
    expect(result).toBeNull();
  });
});
