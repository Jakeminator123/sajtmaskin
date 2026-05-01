import { beforeEach, describe, expect, it, vi } from "vitest";
import { detectFollowUpCapabilities } from "@/lib/builder/follow-up-capability-detection";
import {
  _resetLlmFallbackCacheForTests,
  classifyFollowUpIntent,
  classifyFollowUpIntentWithLlmFallback,
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

  // 2026-04-22 audit (rapport 05 + 06): Unicode-\b + "byt"-token regressionskydd.
  // Innan fixen: ASCII `\b` matchade inte före `ä/ö/å`, så "Ändra rubriken…"
  // föll till `neutral`. Nu plockas det upp som en riktig refine-prompt via
  // refine-regexet för "ändra" + specifik target "rubrik".
  it("classifies Swedish refine prompts with ä/ö/å as clear-refine", () => {
    expect(classifyFollowUpIntent("Ändra rubriken till Hej")).toBe("clear-refine");
  });

  it("classifies bare 'byt'-edits as clear-refine (not neutral)", () => {
    expect(classifyFollowUpIntent("Byt hero-bilden till en elefant")).toBe("clear-refine");
  });

  // 2026-04-22 follow-up audit — gap i refine-patterns:
  // "flytta" + engelska "change"/"move" saknades som refine-signaler,
  // vilket gjorde rena layout-/edit-prompter till neutral.
  it("classifies 'Flytta'-layout-edits as clear-refine", () => {
    expect(classifyFollowUpIntent("Flytta CTA-knappen under rubriken")).toBe("clear-refine");
  });

  it("classifies English 'change'-edits as clear-refine", () => {
    expect(classifyFollowUpIntent("Change the primary color to teal")).toBe("clear-refine");
  });

  it("classifies English 'move'-edits as clear-refine", () => {
    expect(classifyFollowUpIntent("Move the pricing section above FAQ")).toBe("clear-refine");
  });

  // Plan 06 (2026-04-24): capability-add must beat clear-refine when the
  // prompt asks to ADD a dossier-mappable feature. The smoke run 2 prompt
  // was the headline failure — it survived as `neutral` and produced an
  // empty 3D-shell. Now it routes through capability-add → orchestrate
  // sees `requestedDossierCapabilities: ['visual-3d']` → three-fiber-canvas
  // dossier is injected → package.json gets three/r3f deps (plan 07).
  it("classifies the smoke run 2 3D follow-up as capability-add", () => {
    expect(
      classifyFollowUpIntent("Skapa en 3d-kaffekopp som hoovrar och flyger ovanför"),
    ).toBe("capability-add");
  });

  it("classifies 'lägg till en kontaktform' as capability-add (not clear-refine)", () => {
    expect(classifyFollowUpIntent("lägg till en kontaktform")).toBe("capability-add");
  });

  it("classifies English 'add a contact form' as capability-add", () => {
    expect(classifyFollowUpIntent("add a contact form at the bottom")).toBe("capability-add");
  });

  it("classifies 'lägg till physics-simulation av studsande tomater' as capability-add", () => {
    expect(
      classifyFollowUpIntent("lägg till physics-simulation av studsande tomater"),
    ).toBe("capability-add");
  });

  it("does not flip 'ändra färgen på knappen' to capability-add (no capability noun)", () => {
    // Pre-existing Fix B classification (verb+noun design combo) takes this
    // through `clear-redesign` before capability-add even runs. The point of
    // the test is that capability-add does NOT swallow plain colour edits.
    expect(classifyFollowUpIntent("ändra färgen på knappen")).not.toBe("capability-add");
  });

  it("does not flip 'Move the pricing section above FAQ' to capability-add (move verb, no add)", () => {
    expect(classifyFollowUpIntent("Move the pricing section above FAQ")).toBe("clear-refine");
  });

  // Plan 11 / open-question #12: capability-modify must beat capability-add
  // when the prompt names a capability AND points at an existing on-page
  // element. Without this branch the LLM would re-inject the dossier shell
  // on top of the working scene file (chat `b71dafb3` smoke run B).
  it("classifies 'gör pricken till en 3d-kaffekopp …' as capability-modify (plan 11)", () => {
    expect(
      classifyFollowUpIntent(
        "gör pricken till en 3d-kaffekopp som häller kaffe när jag nuddar den med musen",
      ),
    ).toBe("capability-modify");
  });

  it("classifies 'byt ut bubblan mot en 3d-kaffekopp' as capability-modify (plan 11)", () => {
    expect(
      classifyFollowUpIntent("byt ut bubblan mot en 3d-kaffekopp"),
    ).toBe("capability-modify");
  });

  it("keeps fresh add prompts on capability-add even if they mention 3d (plan 11)", () => {
    // No modify-reference token → must remain capability-add so the
    // dossier shell still gets injected on a true add.
    expect(
      classifyFollowUpIntent("lägg till en 3d-kaffekopp som hoovrar ovanför"),
    ).toBe("capability-add");
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

  it("unlocks on major game/canvas follow-ups without requiring clear-redesign wording", () => {
    expect(
      shouldIgnorePersistedScaffoldForMatch({
        hasPreviousFiles: true,
        followUpIntent: "capability-add",
        message: "Gör ett Pac-Man-spel med delfiner, poäng och kollisioner.",
        scaffoldMode: "auto",
        scaffoldId: null,
      }),
    ).toBe(true);
  });

  it("keeps small visual-3d overlays on the current scaffold", () => {
    expect(
      shouldIgnorePersistedScaffoldForMatch({
        hasPreviousFiles: true,
        followUpIntent: "capability-add",
        message: "lägg till en 3d-kaffekopp som hoovrar ovanför hero",
        scaffoldMode: "auto",
        scaffoldId: null,
      }),
    ).toBe(false);
  });

  it("does not unlock on standalone score/leaderboard/collision copy", () => {
    expect(
      shouldIgnorePersistedScaffoldForMatch({
        hasPreviousFiles: true,
        followUpIntent: "clear-refine",
        message: "Lägg till en leaderboard-sektion och förbättra SEO-copy.",
        scaffoldMode: "auto",
        scaffoldId: null,
      }),
    ).toBe(false);
  });

  it("does not unlock major-change signals when the scaffold is explicitly pinned", () => {
    expect(
      shouldIgnorePersistedScaffoldForMatch({
        hasPreviousFiles: true,
        followUpIntent: "capability-add",
        message: "Bygg ett playable canvas game med score och collisions",
        scaffoldMode: "manual",
        scaffoldId: "landing-page",
      }),
    ).toBe(false);
  });
});

// 2026-05-01: end-to-end regressionsmatris som binder ihop
// `detectFollowUpCapabilities` + `classifyFollowUpIntent` +
// `shouldIgnorePersistedScaffoldForMatch` för fyra kanoniska 3D/game-fall.
// Skyddar mot framtida regex-konsolideringar som råkar förskjuta
// gränsen mellan capability-injection, scaffold-unlock och ren refine.
// Varje fall är en hel rad (intent + capability + scaffold-beslut), så
// bredare refaktorer av delade marker-grupper måste röra alla tre eller
// inget — inte bara halva spåret.
describe("follow-up signal regression matrix (3D / game / refine / modify)", () => {
  it("'lägg till en 3d-kaffekopp …' = capability-add + visual-3d, scaffold pinned", () => {
    const message = "lägg till en 3d-kaffekopp som hoovrar och flyger ovanför";
    const detection = detectFollowUpCapabilities(message);

    expect(classifyFollowUpIntent(message)).toBe("capability-add");
    expect(detection.capabilityIds).toContain("visual-3d");
    expect(detection.referencesExistingCapability).toBe(false);
    expect(
      shouldIgnorePersistedScaffoldForMatch({
        hasPreviousFiles: true,
        followUpIntent: "capability-add",
        message,
        scaffoldMode: "auto",
        scaffoldId: null,
      }),
    ).toBe(false);
  });

  it("'bygg Pac-Man-spel med score och collision' = scaffold unlocks (major-change)", () => {
    const message = "bygg ett Pac-Man-spel med score och collision";

    expect(
      shouldIgnorePersistedScaffoldForMatch({
        hasPreviousFiles: true,
        followUpIntent: "capability-add",
        message,
        scaffoldMode: "auto",
        scaffoldId: null,
      }),
    ).toBe(true);
  });

  it("'ändra rubriken' = clear-refine, no dossier capability, no scaffold unlock", () => {
    const message = "ändra rubriken";
    const detection = detectFollowUpCapabilities(message);

    expect(classifyFollowUpIntent(message)).toBe("clear-refine");
    expect(detection.capabilityIds).toEqual([]);
    expect(detection.referencesExistingCapability).toBe(false);
    expect(
      shouldIgnorePersistedScaffoldForMatch({
        hasPreviousFiles: true,
        followUpIntent: "clear-refine",
        message,
        scaffoldMode: "auto",
        scaffoldId: null,
      }),
    ).toBe(false);
  });

  it("'gör pricken till en 3d-kaffekopp …' = capability-modify + referencesExistingCapability", () => {
    // Notera: vokabulären idag kräver `3d`-prefix för att 'kaffekopp' ska
    // fånga visual-3d (`3d-?[\p{L}\p{N}_]+`-mönstret i
    // follow-up-capability-vocabulary.ts). Bare "kaffekopp" utan 3D är
    // medvetet utanför scope för denna regression — det är produktdesign,
    // inte tester. Dokumenterat så framtida refaktor inte tror att
    // testfallet täcker det bredare språket.
    const message =
      "gör pricken till en 3d-kaffekopp som häller kaffe när jag nuddar den med musen";
    const detection = detectFollowUpCapabilities(message);

    expect(classifyFollowUpIntent(message)).toBe("capability-modify");
    expect(detection.capabilityIds).toContain("visual-3d");
    expect(detection.referencesExistingCapability).toBe(true);
    expect(detection.modifyReferenceMatches).toContain("pricken");
  });
});

describe("classifyFollowUpIntentWithLlmFallback (P22)", () => {
  beforeEach(() => {
    _resetLlmFallbackCacheForTests();
  });

  it("returns regex result without calling LLM when prompt is short", async () => {
    const llmCaller = vi.fn();
    const result = await classifyFollowUpIntentWithLlmFallback("kort prompt", {
      llmCaller,
      bypassCache: true,
    });
    expect(result).toBe("neutral");
    expect(llmCaller).not.toHaveBeenCalled();
  });

  it("returns regex result without calling LLM when regex already classified", async () => {
    const llmCaller = vi.fn();
    const result = await classifyFollowUpIntentWithLlmFallback("byt till mörkt tema", {
      llmCaller,
      bypassCache: true,
    });
    expect(result).toBe("clear-redesign");
    expect(llmCaller).not.toHaveBeenCalled();
  });

  it("calls LLM and uses its label when regex is neutral on a 90-word prompt", async () => {
    const longNeutralPrompt = Array.from({ length: 90 })
      .map((_, idx) => `word${idx}`)
      .join(" ");
    expect(classifyFollowUpIntent(longNeutralPrompt)).toBe("neutral");

    const llmCaller = vi.fn().mockResolvedValue("clear-redesign");
    const result = await classifyFollowUpIntentWithLlmFallback(longNeutralPrompt, {
      llmCaller,
      bypassCache: true,
    });
    expect(llmCaller).toHaveBeenCalledTimes(1);
    expect(result).toBe("clear-redesign");
  });

  it("falls back to regex result when LLM throws", async () => {
    const longNeutralPrompt = Array.from({ length: 90 })
      .map((_, idx) => `word${idx}`)
      .join(" ");
    const llmCaller = vi.fn().mockRejectedValue(new Error("boom"));
    const result = await classifyFollowUpIntentWithLlmFallback(longNeutralPrompt, {
      llmCaller,
      bypassCache: true,
    });
    expect(result).toBe("neutral");
  });

  it("ignores garbage labels from the LLM and falls back to regex result", async () => {
    const longNeutralPrompt = Array.from({ length: 90 })
      .map((_, idx) => `word${idx}`)
      .join(" ");
    const llmCaller = vi.fn().mockResolvedValue("totally-not-a-mode");
    const result = await classifyFollowUpIntentWithLlmFallback(longNeutralPrompt, {
      llmCaller,
      bypassCache: true,
    });
    expect(result).toBe("neutral");
  });

  it("caches results per chatId+messageHash so the LLM only runs once", async () => {
    const longNeutralPrompt = Array.from({ length: 90 })
      .map((_, idx) => `word${idx}`)
      .join(" ");
    const llmCaller = vi.fn().mockResolvedValue("ambiguous-followup");

    const first = await classifyFollowUpIntentWithLlmFallback(longNeutralPrompt, {
      chatId: "chat-1",
      llmCaller,
    });
    const second = await classifyFollowUpIntentWithLlmFallback(longNeutralPrompt, {
      chatId: "chat-1",
      llmCaller,
    });

    expect(first).toBe("ambiguous-followup");
    expect(second).toBe("ambiguous-followup");
    expect(llmCaller).toHaveBeenCalledTimes(1);
  });
});
