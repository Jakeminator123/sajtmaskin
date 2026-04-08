import { describe, expect, it } from "vitest";
import {
  classifyFollowUpIntent,
  resolveFollowUpClarification,
  shouldIgnorePersistedScaffoldForMatch,
} from "./follow-up-clarification";

describe("follow-up clarification intent classification", () => {
  it("treats a detailed new-site brief as a clear redesign", () => {
    const message =
      "Hej, jag vill ha en hemsida som handlar om ett bageri pa Sveavagen. Jag vill ha mycket bilder, en 3D-animation pa startsidan och totalt tre sidor med sortiment och kontakt.";

    expect(classifyFollowUpIntent(message)).toBe("clear-redesign");
    expect(resolveFollowUpClarification(message)).toBeNull();
  });

  it("keeps short new-site requests ambiguous", () => {
    const message = "Bygg en ny hemsida for samma kund";

    expect(classifyFollowUpIntent(message)).toBe("ambiguous-redesign");
  });
});

describe("shouldIgnorePersistedScaffoldForMatch", () => {
  it("unlocks for clear-redesign in manual mode when no scaffold is pinned", () => {
    expect(
      shouldIgnorePersistedScaffoldForMatch({
        hasPreviousFiles: true,
        followUpIntent: "clear-redesign",
        message: "Redesign everything",
        scaffoldMode: "manual",
        scaffoldId: null,
      }),
    ).toBe(true);
  });

  it("does not unlock when user pinned a scaffold for this message", () => {
    expect(
      shouldIgnorePersistedScaffoldForMatch({
        hasPreviousFiles: true,
        followUpIntent: "clear-redesign",
        message: "Redesign everything",
        scaffoldMode: "manual",
        scaffoldId: "blog",
      }),
    ).toBe(false);
  });

  it("unlocks via supplement pattern when intent is neutral", () => {
    expect(
      shouldIgnorePersistedScaffoldForMatch({
        hasPreviousFiles: true,
        followUpIntent: "neutral",
        message: "Please do a full redesign of the landing experience.",
        scaffoldMode: "auto",
        scaffoldId: null,
      }),
    ).toBe(true);
  });
});
