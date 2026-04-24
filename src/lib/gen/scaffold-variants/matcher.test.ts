import { describe, expect, it } from "vitest";

import { lockedVariantForFollowUp, pickScaffoldVariant } from "./matcher";
import { getVariantsForScaffold } from "./registry";

describe("pickScaffoldVariant", () => {
  it("picks corporate-grid when the prompt carries strong b2b/consulting keywords", () => {
    const variant = pickScaffoldVariant({
      prompt:
        "Build a professional b2b consulting corporate landing page for an enterprise agency",
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

  it("plan-11 bug 2: falls back to the scaffold default variant when prior variant id is missing on a follow-up", () => {
    // Plan 11 / open-question #8 regression: previously this returned
    // `null`, releasing the matcher into a fresh keyword/embedding pick
    // and causing `corporate-grid → warm-local` flips mid-chat. Now we
    // anchor to the scaffold's default so the look stays stable across
    // turns even when the prior variant id is lost from the snapshot.
    const result = lockedVariantForFollowUp({
      chatId: "chat-x",
      intent: "clear-refine",
      scaffoldId: "landing-page",
      priorVariantId: null,
    });
    expect(result).not.toBeNull();
    expect(result?.scaffoldId).toBe("landing-page");
    // Determinism: a second call with identical inputs returns the same variant.
    const second = lockedVariantForFollowUp({
      chatId: "chat-x",
      intent: "clear-refine",
      scaffoldId: "landing-page",
      priorVariantId: null,
    });
    expect(second?.id).toBe(result?.id);
  });

  it("plan-11 bug 2: still returns null on clear-redesign even when prior variant id is missing", () => {
    // Redesign intent must keep its escape hatch — fallback only fires
    // for stable-style intents (clear-refine / capability-add / neutral).
    const result = lockedVariantForFollowUp({
      chatId: "chat-x",
      intent: "clear-redesign",
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
