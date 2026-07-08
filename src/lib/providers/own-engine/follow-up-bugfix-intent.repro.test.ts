import { describe, expect, it } from "vitest";

import { classifyFollowUpIntent } from "./follow-up-clarification";
import {
  hasNegatedRedesignIntent,
} from "@/lib/builder/prompt-negation";

/**
 * BUGG A (follow-up bugfix överlever inte) — reproduktion.
 *
 * Prod-fall (chat e298da50): en explicit bugfix-prompt av typen
 *   "Fixa buildfelet ... apiVersion ... Rör inte designen"
 * ledde till att redesign-rader injicerades och den riktade fixen tappades.
 *
 * Rotorsak A2 (verifierad i kod): `hasNegatedRedesignIntent` kände inte igen
 * plain "design"/"designen"/"utseendet"/"layouten" som redesign-term, så
 * negationen "Rör inte designen" bet inte. En prompt som råkar para ett
 * redesign-verb ("byt"/"gör om"/"ändra") med ett design-noun klassades då som
 * `clear-redesign` (→ redesign-injektion i chat-message-stream-post.ts) trots
 * att användaren uttryckligen bad oss lämna designen orörd.
 */
describe("BUGG A — negation of a plain 'design'/'utseende'/'layout' redesign target", () => {
  it("suppresses redesign when the user says 'Rör inte designen'", () => {
    expect(hasNegatedRedesignIntent("Rör inte designen")).toBe(true);
  });

  it("suppresses redesign for 'ändra inte utseendet'", () => {
    expect(hasNegatedRedesignIntent("ändra inte utseendet")).toBe(true);
  });

  it("suppresses redesign for 'rör inte layouten'", () => {
    expect(hasNegatedRedesignIntent("rör inte layouten")).toBe(true);
  });

  it("suppresses redesign for the English 'do not change the design'", () => {
    expect(hasNegatedRedesignIntent("do not change the design")).toBe(true);
  });

  it("still does NOT suppress a genuine redesign request without negation", () => {
    // "gör om designen" is a real redesign ask — no negation window, so the
    // fix must not over-suppress it.
    expect(hasNegatedRedesignIntent("gör om designen helt")).toBe(false);
  });
});

describe("BUGG A — a 'don't touch the design' bugfix prompt must not become clear-redesign", () => {
  // This prompt currently trips `hasRedesignVerbNounCombo` ("byt" + "designen")
  // and, because the negation misses "designen", classifies as clear-redesign —
  // injecting the aggressive redesign lines onto an explicit bugfix request.
  const bugfixPrompt = "Byt apiVersion i Stripe-checkouten men rör inte designen";

  it("does not classify the bugfix prompt as clear-redesign", () => {
    expect(classifyFollowUpIntent(bugfixPrompt)).not.toBe("clear-redesign");
  });

  it("classifies the bugfix prompt as a refine (targeted edit)", () => {
    expect(classifyFollowUpIntent(bugfixPrompt)).toBe("clear-refine");
  });
});
