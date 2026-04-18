import { describe, expect, it } from "vitest";
import {
  classifyFollowUpIntent,
  hasDesignFollowUpSignal,
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

  // Fix B: verb+noun-kombination triggar clear-redesign på milda men tydliga
  // design-prompts. Lösa enskilda verb (utan design-noun) ska INTE triggas.
  it("treats verb+noun design combos as clear-redesign (Fix B)", () => {
    expect(classifyFollowUpIntent("byt till mörkt tema")).toBe("clear-redesign");
    expect(classifyFollowUpIntent("ändra bakgrunden till coolare")).toBe("clear-redesign");
    expect(classifyFollowUpIntent("ny stil på hero")).toBe("clear-redesign");
    expect(classifyFollowUpIntent("gör om designen")).toBe("clear-redesign");
  });

  it("does NOT treat verb-without-design-noun as clear-redesign (Fix B)", () => {
    expect(classifyFollowUpIntent("ändra rubriken till Hej")).not.toBe("clear-redesign");
    expect(classifyFollowUpIntent("byt logotypen mot en ny SVG")).not.toBe("clear-redesign");
    expect(classifyFollowUpIntent("ny kontaktuppgift i footern")).not.toBe("clear-redesign");
  });

  it("does NOT treat noun-without-verb as clear-redesign (Fix B)", () => {
    // "snyggare färgschema" har noun (färg) men inget redesign-verb -> faller
    // ner i andra grenar; ska inte plötsligt klassas som clear-redesign.
    expect(classifyFollowUpIntent("snyggare färgschema")).not.toBe("clear-redesign");
  });
});

describe("hasDesignFollowUpSignal (Fix A)", () => {
  it("matches design keywords with reasonable inflections", () => {
    expect(hasDesignFollowUpSignal("byt till mörkt tema")).toBe(true);
    expect(hasDesignFollowUpSignal("ändra bakgrunden till coolare")).toBe(true);
    expect(hasDesignFollowUpSignal("ny stil på hero")).toBe(true);
    expect(hasDesignFollowUpSignal("lägg till animation i bakgrunden")).toBe(true);
    expect(hasDesignFollowUpSignal("snyggare färgschema")).toBe(true);
    expect(hasDesignFollowUpSignal("ljusare look")).toBe(true);
  });

  it("does not match unrelated text-only edits", () => {
    expect(hasDesignFollowUpSignal("uppdatera priserna i hero-sektionen")).toBe(false);
    expect(hasDesignFollowUpSignal("rätta stavfelet i rubriken")).toBe(false);
    expect(hasDesignFollowUpSignal("")).toBe(false);
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
