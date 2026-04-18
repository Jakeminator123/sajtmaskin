import { describe, expect, it } from "vitest";
import {
  classifyFollowUpIntent,
  resolveFollowUpClarification,
  shouldIgnorePersistedScaffoldForMatch,
} from "./follow-up-clarification";

describe("follow-up clarification intent classification", () => {
  it("treats a detailed new-site brief as a clear redesign when explicit redesign-intent is present (QW-3)", () => {
    // QW-3 kräver nu både >=200 tecken OCH explicit nybygg-/redesign-signal.
    // Den här prompten har "ny hemsida" + tydlig brief-struktur.
    const message =
      "Jag vill ha en helt ny hemsida som handlar om ett bageri pa Sveavagen. " +
      "Bygg om hela sajten med mycket bilder, en 3D-animation pa startsidan, " +
      "tre sidor med sortiment, om-oss, kontakt och ett kontaktformulär längst ner.";

    expect(classifyFollowUpIntent(message)).toBe("clear-redesign");
    expect(resolveFollowUpClarification(message)).toBeNull();
  });

  it("does NOT trigger redesign on legitimate add-section follow-ups (QW-3)", () => {
    // Innan QW-3 hade denna 169-teckens-prompt klassats som clear-redesign
    // pga längd + 'hemsida' + 'vill ha' + 2 requirement-matchningar →
    // scaffold-omval + delta-brief som bytte ut visuell identitet på en sajt
    // användaren bara ville utöka. Nu kräver QW-3 explicit redesign-keyword.
    const message =
      "Hej, jag vill ha en hemsida som handlar om ett bageri pa Sveavagen. " +
      "Jag vill ha mycket bilder, en 3D-animation pa startsidan och totalt tre sidor med sortiment och kontakt.";

    expect(classifyFollowUpIntent(message)).not.toBe("clear-redesign");
  });

  it("keeps short new-site requests ambiguous", () => {
    const message = "Bygg en ny hemsida for samma kund";

    expect(classifyFollowUpIntent(message)).toBe("ambiguous-redesign");
  });
});

describe("shouldIgnorePersistedScaffoldForMatch", () => {
  it("does not unlock in manual mode even for clear redesign", () => {
    expect(
      shouldIgnorePersistedScaffoldForMatch({
        hasPreviousFiles: true,
        followUpIntent: "clear-redesign",
        message: "Redesign everything",
        scaffoldMode: "manual",
        scaffoldId: null,
      }),
    ).toBe(false);
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
