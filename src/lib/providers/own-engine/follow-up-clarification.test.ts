import { describe, expect, it } from "vitest";
import { detectFollowUpCapabilities } from "@/lib/builder/follow-up-capability-detection";
import { inferCapabilities } from "@/lib/gen/capability-inference";
import { inferPreGenerationContracts } from "@/lib/gen/contract/pre-generation-contracts";
import { deriveBuildSpec } from "@/lib/gen/build-spec";
import type { RoutePlan } from "@/lib/gen/route-plan";
import {
  classifyFollowUpClarificationAnswerIntent,
  classifyFollowUpIntent,
  collectFollowUpClarificationAnswer,
  hasDesignFollowUpSignal,
  persistFollowUpClarification,
  resolveFollowUpClarification,
  shouldIgnorePersistedScaffoldForMatch,
} from "./follow-up-clarification";

const duckRoutePlan: RoutePlan = {
  provenance: { primarySource: "prompt", sources: ["prompt"] },
  siteType: "one-page",
  reason: "test",
  routes: [{ path: "/", name: "Home", intent: "Keep root route", required: true }],
};

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

  // Bestämda/pluralformer av targets (knappen, texten, buttons …) måste räknas
  // som specifikt mål — annars blockerar isUnderspecifiedFollowUp codegen.
  it.each([
    "ändra knappen till Skicka",
    "ändra knapparna till grönt",
    "fixa knappen",
    "ändra texten till Hej",
    "fixa texten",
    "ändra bilden",
    "ändra headern",
    "ändra footern",
    "uppdatera footern",
    "ändra layouten",
    "ändra sektionen",
    "ändra logotypen",
    "ändra menyn",
    "uppdatera navigationen",
    "ändra paddingen",
    "ändra marginalerna",
    "fixa stavfelet",
    "ändra kontaktuppgifterna",
    "fix the buttons",
    "update the buttons",
    "gör headern mörkare",
    "byt ut hero-bilden",
    "lägg till en prissida",
    "flytta kontaktknappen till toppen",
    "ändra rubriken till Välkommen",
    "ta bort footern",
    "lägg till en FAQ-sektion",
    "fixa stavfelet i rubriken",
    "make the header sticky",
    "add a pricing page",
    // SM-053: svensk pluralbestämd form och engelsk plural saknades helt.
    "ändra layouterna",
    "fixa layouterna",
    "ändra logotyperna",
    "byt logotyperna",
    "fix the headers",
    "update the footers",
  ])("does NOT block a clear follow-up with a specific target: %s", (prompt) => {
    expect(classifyFollowUpIntent(prompt)).not.toBe("ambiguous-followup");
    expect(resolveFollowUpClarification(prompt)).toBeNull();
  });

  it("does NOT treat English adjective 'marginal' as a layout target", () => {
    // Bugbot: bare `marginal(?:…)?` lät "fix marginal issues" slippa förbi.
    expect(classifyFollowUpIntent("fix marginal issues")).toBe("ambiguous-followup");
    expect(resolveFollowUpClarification("fix marginal issues")?.reason).toBe(
      "followup_edit_underspecified",
    );
    expect(classifyFollowUpIntent("ändra marginalerna")).not.toBe("ambiguous-followup");
  });

  it.each([
    "förbättra den",
    "fixa designen",
    "fixa det",
    "can you improve it",
    "make it better",
    "polish the design",
  ])("still blocks a vague underspecified follow-up: %s", (prompt) => {
    expect(classifyFollowUpIntent(prompt)).toBe("ambiguous-followup");
    expect(resolveFollowUpClarification(prompt)?.reason).toBe(
      "followup_edit_underspecified",
    );
  });

  it("does NOT treat noun-without-verb as clear-redesign (Fix B)", () => {
    // "snyggare färgschema" har noun (färg) men inget redesign-verb -> faller
    // ner i andra grenar; ska inte plötsligt klassas som clear-redesign.
    expect(classifyFollowUpIntent("snyggare färgschema")).not.toBe("clear-redesign");
  });

  // QW-hover (prod chat 0d52e5c9, 2026-07-31): en hover-mikrointeraktion med
  // fokuspunkter klassades som clear-redesign via verb+noun-kombon
  // ("ändra" + "färger") och skrev om hela den importerade templaten.
  it("does NOT escalate an interaction-scoped color edit to clear-redesign (QW-hover)", () => {
    const prodPrompt =
      "Om jag hoovrar över dena ytavill jag att färgerna på text och ikoner ska ändra färger\n\n" +
      "Användarens markerade fokuspunkter i preview:\n" +
      "Källa: https://vm-fly-jakem.fly.dev/0d52e5c9\n" +
      "- Punkt 1: x=49.4%, y=319.0%, viewport=1322x1170\n" +
      "Prioritera ändringar nära dessa punkter.";

    expect(classifyFollowUpIntent(prodPrompt)).toBe("clear-refine");
  });

  it("does NOT escalate hover/click/scroll-scoped design combos to clear-redesign (QW-hover)", () => {
    expect(classifyFollowUpIntent("när man hovrar över kortet ska färgerna ändras")).not.toBe(
      "clear-redesign",
    );
    expect(classifyFollowUpIntent("byt bakgrundsfärg när man klickar på knappen")).not.toBe(
      "clear-redesign",
    );
    expect(
      classifyFollowUpIntent("change the theme colors on hover for the nav links"),
    ).not.toBe("clear-redesign");
  });

  it("suppresses the verb+noun combo when focus points are attached, without breaking explicit redesigns (QW-hover)", () => {
    const focusBlock =
      "\n\nAnvändarens markerade fokuspunkter i preview:\n- Punkt 1: x=10%, y=20%";
    // Svag kombo + fokuspunkt → riktad edit, inte redesign.
    expect(classifyFollowUpIntent(`ändra färgerna här${focusBlock}`)).not.toBe(
      "clear-redesign",
    );
    // Explicit redesign-fras trumfar alltid dämpningen.
    expect(classifyFollowUpIntent(`gör om hela layouten${focusBlock}`)).toBe(
      "clear-redesign",
    );
    expect(
      classifyFollowUpIntent("gör om hela layouten, och vid klick ska menyn öppnas"),
    ).toBe("clear-redesign");
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

  it("keeps explicit visual-only 3D follow-ups out of clear-redesign", () => {
    const message = [
      "Lägg till en tydligt synlig flygande 3D-anka ovanpå den befintliga sidan.",
      "Behåll nuvarande sida, layout, texter, navigation och sektioner.",
      "Ingen redesign och inga nya routes.",
      "Lägg inte till backend, API-routes, auth, betalning eller externa tjänster.",
    ].join(" ");

    expect(classifyFollowUpIntent(message)).toBe("capability-add");
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

  it("keeps the duck prompt visual-only across intent, capability, contracts and build spec", () => {
    const message = [
      "Lägg till en tydligt synlig flygande 3D-anka ovanpå den befintliga sidan.",
      "Behåll nuvarande sida, layout, texter, navigation och sektioner. Ingen redesign och inga nya routes.",
      "Skapa riktig Three/R3F-geometri, inte bild, SVG eller lucide-ikon.",
      "Lägg inte till backend, API-routes, auth, betalning eller externa tjänster.",
    ].join(" ");
    const caps = inferCapabilities(message);
    const contracts = inferPreGenerationContracts({
      prompt: message,
      buildIntent: "website",
      capabilities: caps,
    });
    const spec = deriveBuildSpec({
      prompt: message,
      buildIntent: "website",
      generationMode: "followUp",
      resolvedScaffold: { id: "landing-page", label: "Landing", description: "", allowedBuildIntents: ["website"], tags: [], promptHints: [], files: [] },
      routePlan: duckRoutePlan,
      preGenerationContracts: contracts,
      promptStrategyMeta: { strategy: "direct", promptType: "followup_technical" },
      capabilities: caps,
    });
    const detection = detectFollowUpCapabilities(message);

    expect(classifyFollowUpIntent(message)).toBe("capability-add");
    expect(detection.capabilityIds).toEqual(["visual-3d"]);
    expect(caps.needs3D).toBe(true);
    expect(caps.needsAuth).toBe(false);
    expect(caps.needsPayments).toBe(false);
    expect(caps.needsDatabase).toBe(false);
    expect(contracts.contracts.dataMode).toBe("none");
    expect(contracts.contracts.integrations).toEqual([]);
    expect(contracts.contracts.envVars).toEqual([]);
    expect(spec.changeScope).toBe("local-layout");
    expect(spec.referenceCategories).toEqual(["marketing-sites"]);
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

  it("keeps the frozen scaffold on game/canvas follow-ups (no auto-unlock; scaffold-freeze policy 2026-07-03)", () => {
    // A capability follow-up asking for a game must NOT rebase the whole site
    // onto another scaffold. The feature is added as a new route on the current
    // scaffold; only explicit clear-redesign wording unlocks a rematch.
    expect(
      shouldIgnorePersistedScaffoldForMatch({
        hasPreviousFiles: true,
        followUpIntent: "capability-add",
        message: "Gör ett Pac-Man-spel med delfiner, poäng och kollisioner.",
        scaffoldMode: "auto",
        scaffoldId: null,
      }),
    ).toBe(false);
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

  it("allows clear-redesign unlock when Scaffold: Av (off) is selected", () => {
    expect(
      shouldIgnorePersistedScaffoldForMatch({
        hasPreviousFiles: true,
        followUpIntent: "clear-redesign",
        message: "Redesign everything from scratch",
        scaffoldMode: "off",
        scaffoldId: null,
      }),
    ).toBe(true);
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

  it("'bygg Pac-Man-spel med score och collision' = scaffold STAYS frozen (freeze policy 2026-07-03)", () => {
    const message = "bygg ett Pac-Man-spel med score och collision";

    // Previously this unlocked a scaffold rematch (major-change). Policy change:
    // a game follow-up keeps the current scaffold; only explicit clear-redesign
    // wording ("gör om hela sajten") switches scaffold.
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

// Prod chat e8bd3ba6: the quick-reply answer to a follow-up scope
// clarification became the WHOLE next prompt — the user's original detailed
// follow-up was thrown away. The collector below recovers it from the
// persisted `followUpClarification` marker.
describe("collectFollowUpClarificationAnswer", () => {
  const originalPrompt =
    "Kan du fixa felet där sidan laddas om två gånger vid start? Det känns som ett hydration-problem i Next.js som behöver åtgärdas ordentligt.";
  const question = "Vad vill du att jag fokuserar på i nästa ändring?";
  const options = [
    "Layout och design",
    "Text och innehåll",
    "Ny sektion eller sida",
    "Tydlig redesign",
  ];

  function buildMarkerMessages() {
    return [
      { role: "user" as const, content: originalPrompt, ui_parts: null },
      {
        role: "assistant" as const,
        content: question,
        ui_parts: [
          {
            type: "tool:awaiting-input",
            toolName: "Klargörande fråga",
            state: "approval-requested",
            output: {
              question,
              options,
              kind: "scope",
              blocking: true,
              reason: "followup_edit_underspecified",
              awaitingInput: true,
              followUpClarification: true,
              sourceUserMessage: originalPrompt,
            },
          },
        ],
      },
    ];
  }

  it("consumes a quick-reply option and returns the original source prompt", () => {
    const result = collectFollowUpClarificationAnswer(
      buildMarkerMessages(),
      "Layout och design",
    );

    expect(result).toEqual({
      sourceUserMessage: originalPrompt,
      question,
      answer: "Layout och design",
      consumed: true,
    });
  });

  it("matches options with trimming and case-insensitivity (client sends verbatim)", () => {
    const result = collectFollowUpClarificationAnswer(
      buildMarkerMessages(),
      "  tydlig redesign  ",
    );

    expect(result?.answer).toBe("Tydlig redesign");
    expect(result?.sourceUserMessage).toBe(originalPrompt);
  });

  it("does NOT consume a free-typed reply that is not one of the options (new prompt)", () => {
    expect(
      collectFollowUpClarificationAnswer(
        buildMarkerMessages(),
        "Gör hero-sektionen större och byt bakgrundsbilden",
      ),
    ).toBeNull();
  });

  it("consumes a short scope paraphrase and recovers the original prompt (SM-041)", () => {
    const result = collectFollowUpClarificationAnswer(
      buildMarkerMessages(),
      "fokusera på layouten",
    );
    expect(result).toEqual({
      sourceUserMessage: originalPrompt,
      question,
      answer: "Layout och design",
      consumed: true,
    });
  });

  it("consumes a text-scope paraphrase", () => {
    const result = collectFollowUpClarificationAnswer(
      buildMarkerMessages(),
      "texten",
    );
    expect(result?.answer).toBe("Text och innehåll");
    expect(result?.sourceUserMessage).toBe(originalPrompt);
  });

  it("consumes the plural text-scope paraphrase 'texterna'", () => {
    const result = collectFollowUpClarificationAnswer(
      buildMarkerMessages(),
      "texterna",
    );
    expect(result?.answer).toBe("Text och innehåll");
    expect(result?.sourceUserMessage).toBe(originalPrompt);
  });

  it("does NOT consume 'texterna' when it also carries a new instruction", () => {
    expect(
      collectFollowUpClarificationAnswer(
        buildMarkerMessages(),
        "texterna med en varmare ton",
      ),
    ).toBeNull();
    expect(
      collectFollowUpClarificationAnswer(
        buildMarkerMessages(),
        "texterna i footern",
      ),
    ).toBeNull();
  });

  it("consumes 'ny sida' as the new-section option, not a new prompt", () => {
    const result = collectFollowUpClarificationAnswer(
      buildMarkerMessages(),
      "ny sida",
    );
    expect(result?.answer).toBe("Ny sektion eller sida");
    expect(result?.sourceUserMessage).toBe(originalPrompt);
  });

  it("does NOT consume a short new edit that is not a scope paraphrase", () => {
    expect(
      collectFollowUpClarificationAnswer(buildMarkerMessages(), "gör footern blå"),
    ).toBeNull();
  });

  it("does NOT consume a paraphrase that also names a specific target", () => {
    expect(
      collectFollowUpClarificationAnswer(
        buildMarkerMessages(),
        "förfina hero-sektionen",
      ),
    ).toBeNull();
  });

  it("does NOT consume a lone yes/no or a long new brief", () => {
    expect(collectFollowUpClarificationAnswer(buildMarkerMessages(), "ja")).toBeNull();
    expect(
      collectFollowUpClarificationAnswer(
        buildMarkerMessages(),
        "Gör om från grunden med mörk editorial stil, ny layout och en bagerisajt med meny",
      ),
    ).toBeNull();
  });

  it("does NOT consume a new page order phrased as 'jag vill ha en ny sida'", () => {
    expect(
      collectFollowUpClarificationAnswer(
        buildMarkerMessages(),
        "jag vill ha en ny sida",
      ),
    ).toBeNull();
    expect(
      collectFollowUpClarificationAnswer(
        buildMarkerMessages(),
        "jag behöver en ny sida",
      ),
    ).toBeNull();
    expect(
      collectFollowUpClarificationAnswer(buildMarkerMessages(), "gör en ny sida"),
    ).toBeNull();
    expect(
      collectFollowUpClarificationAnswer(buildMarkerMessages(), "ska ha en ny sida"),
    ).toBeNull();
    expect(
      collectFollowUpClarificationAnswer(buildMarkerMessages(), "behövs en ny sida"),
    ).toBeNull();
  });

  it("does NOT consume 'ny design' as the layout option (new visual direction)", () => {
    expect(
      collectFollowUpClarificationAnswer(buildMarkerMessages(), "ny design"),
    ).toBeNull();
  });

  it("does NOT consume when a DIFFERENT later user message superseded the question", () => {
    const messages = [
      ...buildMarkerMessages(),
      { role: "user" as const, content: "Gör footern blå i stället", ui_parts: null },
      { role: "assistant" as const, content: "Klart!", ui_parts: null },
    ];

    expect(
      collectFollowUpClarificationAnswer(messages, "Layout och design"),
    ).toBeNull();
  });

  it("consumes again when the identical reply was already persisted (failed codegen → retry)", () => {
    // Retry-semantik (bugbot på denna diff): handlern persisterar user-raden
    // före codegen, så en failad generering lämnar alternativtexten i
    // historiken. En identisk re-send ska fortfarande återfå originalprompten.
    const messages = [
      ...buildMarkerMessages(),
      { role: "user" as const, content: "Layout och design", ui_parts: null },
      { role: "assistant" as const, content: "Klart!", ui_parts: null },
    ];

    const result = collectFollowUpClarificationAnswer(messages, "Layout och design");
    expect(result?.consumed).toBe(true);
    expect(result?.sourceUserMessage).toBe(originalPrompt);
  });

  it("ignores contract-clarification markers (separate flow)", () => {
    const messages = [
      { role: "user" as const, content: originalPrompt, ui_parts: null },
      {
        role: "assistant" as const,
        content: "Vilken auth?",
        ui_parts: [
          {
            type: "tool:awaiting-input",
            output: {
              contractClarification: true,
              kind: "auth",
              question: "Vilken auth?",
              options: ["Ingen auth ännu", "Clerk"],
              blocking: true,
              reason: "auth",
            },
          },
        ],
      },
    ];

    expect(
      collectFollowUpClarificationAnswer(messages, "Ingen auth ännu"),
    ).toBeNull();
  });

  it("returns null for an empty current reply", () => {
    expect(collectFollowUpClarificationAnswer(buildMarkerMessages(), "")).toBeNull();
    expect(collectFollowUpClarificationAnswer(buildMarkerMessages(), null)).toBeNull();
  });

  it("roundtrips: persistFollowUpClarification writes a marker the collector can consume", async () => {
    const clarification = resolveFollowUpClarification("Kan du förbättra den lite?");
    expect(clarification).not.toBeNull();

    const persisted: Array<{
      role: string;
      content: string;
      uiParts?: Array<Record<string, unknown>>;
    }> = [];
    await persistFollowUpClarification({
      chatId: "chat_1",
      message: originalPrompt,
      clarification: clarification!,
      addMessage: async (_chatId, role, content, _parent, uiParts) => {
        persisted.push({ role, content, uiParts });
        return null;
      },
    });

    expect(persisted).toHaveLength(2);
    const messages = persisted.map((entry) => ({
      role: entry.role as "user" | "assistant",
      content: entry.content,
      ui_parts: entry.uiParts ?? null,
    }));
    const result = collectFollowUpClarificationAnswer(
      messages,
      clarification!.options[0],
    );

    expect(result).toEqual({
      sourceUserMessage: originalPrompt,
      question: clarification!.question,
      answer: clarification!.options[0],
      consumed: true,
    });
  });
});

describe("classifyFollowUpClarificationAnswerIntent", () => {
  const ambiguousRedesignPrompt = "Jag vill ha en ny hemsida, kan du bygga om den?";

  it("answer-first: redesign-alternativet ger clear-redesign trots ambiguous originalprompt", () => {
    expect(
      classifyFollowUpClarificationAnswerIntent(
        "Gör en tydlig redesign i samma projekt",
        ambiguousRedesignPrompt,
      ),
    ).toBe("clear-redesign");
  });

  it("answer-first: 'Starta om från en ny grund' ger clear-redesign", () => {
    expect(
      classifyFollowUpClarificationAnswerIntent(
        "Starta om från en ny grund",
        ambiguousRedesignPrompt,
      ),
    ).toBe("clear-redesign");
  });

  it("answer-first: 'Förfina nuvarande design' ger clear-refine", () => {
    expect(
      classifyFollowUpClarificationAnswerIntent(
        "Förfina nuvarande design",
        ambiguousRedesignPrompt,
      ),
    ).toBe("clear-refine");
  });

  it("faller tillbaka på originalprompten när svaret är neutralt", () => {
    // "Layout och design" klassar neutral; originalet bär refine-signal.
    expect(
      classifyFollowUpClarificationAnswerIntent(
        "Layout och design",
        "Byt hero-bilden och förbättra texten",
      ),
    ).toBe("clear-refine");
  });

  it("returnerar aldrig ambiguous — resolverad fråga får inte återuppstå", () => {
    const result = classifyFollowUpClarificationAnswerIntent(
      "Ny sektion eller sida",
      ambiguousRedesignPrompt,
    );
    expect(result).not.toMatch(/^ambiguous-/);
    expect(result).toBe("neutral");
  });
});

describe("collectFollowUpClarificationAnswer — retry efter persisterad svarsrad", () => {
  const marker = (question: string, options: string[], sourceUserMessage: string) => ({
    role: "assistant" as const,
    content: question,
    ui_parts: [
      {
        type: "tool:awaiting-input",
        output: {
          question,
          options,
          kind: "scope",
          blocking: true,
          reason: "followup_redesign_ambiguous",
          awaitingInput: true,
          followUpClarification: true,
          sourceUserMessage,
        },
      },
    ],
  });

  const original = "Fixa hydration-felet i src/app/page.tsx enligt felmeddelandet i konsolen";
  const options = [
    "Förfina nuvarande design",
    "Gör en tydlig redesign i samma projekt",
    "Starta om från en ny grund",
  ];

  it("konsumerar igen när en identisk svarsrad redan persisterats (failad codegen → retry)", () => {
    const messages = [
      { role: "user" as const, content: original, ui_parts: null },
      marker("Vill du förfina eller göra en redesign?", options, original),
      // Turn 2 persisterade user-raden men genereringen föll — retry skickar samma alternativ.
      { role: "user" as const, content: "Förfina nuvarande design", ui_parts: null },
    ];
    const result = collectFollowUpClarificationAnswer(messages, "Förfina nuvarande design");
    expect(result).toEqual({
      sourceUserMessage: original,
      question: "Vill du förfina eller göra en redesign?",
      answer: "Förfina nuvarande design",
      consumed: true,
    });
  });

  it("konsumerar inte när ett ANNAT user-meddelande kommit efter markören", () => {
    const messages = [
      { role: "user" as const, content: original, ui_parts: null },
      marker("Vill du förfina eller göra en redesign?", options, original),
      { role: "user" as const, content: "Gör footern blå", ui_parts: null },
    ];
    expect(
      collectFollowUpClarificationAnswer(messages, "Förfina nuvarande design"),
    ).toBeNull();
  });

  it("konsumerar 'kan du förfina den' (hövlig parafras, inte ny beställning)", () => {
    const messages = [
      { role: "user" as const, content: original, ui_parts: null },
      marker("Vill du förfina eller göra en redesign?", options, original),
    ];
    const result = collectFollowUpClarificationAnswer(messages, "kan du förfina den");
    expect(result?.answer).toBe("Förfina nuvarande design");
    expect(result?.sourceUserMessage).toBe(original);
  });

  it("konsumerar en kort förfina-parafras och återställer originalprompten (SM-041)", () => {
    const messages = [
      { role: "user" as const, content: original, ui_parts: null },
      marker("Vill du förfina eller göra en redesign?", options, original),
    ];
    const result = collectFollowUpClarificationAnswer(messages, "förfina den");
    expect(result).toEqual({
      sourceUserMessage: original,
      question: "Vill du förfina eller göra en redesign?",
      answer: "Förfina nuvarande design",
      consumed: true,
    });
  });

  it("konsumerar 'gör en redesign' som redesign-alternativet", () => {
    const messages = [
      { role: "user" as const, content: original, ui_parts: null },
      marker("Vill du förfina eller göra en redesign?", options, original),
    ];
    const result = collectFollowUpClarificationAnswer(messages, "gör en redesign");
    expect(result?.answer).toBe("Gör en tydlig redesign i samma projekt");
    expect(result?.sourceUserMessage).toBe(original);
  });

  it("konsumerar 'starta om' som start-om-alternativet", () => {
    const messages = [
      { role: "user" as const, content: original, ui_parts: null },
      marker("Vill du förfina eller göra en redesign?", options, original),
    ];
    const result = collectFollowUpClarificationAnswer(messages, "starta om");
    expect(result?.answer).toBe("Starta om från en ny grund");
  });

  it("konsumerar inte förfina-parafras som också pekar ut ett konkret mål", () => {
    const messages = [
      { role: "user" as const, content: original, ui_parts: null },
      marker("Vill du förfina eller göra en redesign?", options, original),
    ];
    expect(
      collectFollowUpClarificationAnswer(messages, "förfina hero-sektionen"),
    ).toBeNull();
  });

  it("konsumerar inte en negerad parafras", () => {
    const messages = [
      { role: "user" as const, content: original, ui_parts: null },
      marker("Vill du förfina eller göra en redesign?", options, original),
    ];
    expect(
      collectFollowUpClarificationAnswer(messages, "förfina inte"),
    ).toBeNull();
  });
});
