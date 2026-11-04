import { describe, expect, it } from "vitest";
import {
  classifyComposerIntent,
  composerAllowsAgentBuild,
  hasScopedComposerChangeRestriction,
  isAgentProposalReference,
  isReadOnlyComposerRequest,
  resolveComposerRoute,
} from "./composer-route";
import { createArmedMandate, parseArmingDirective } from "@/lib/openclaw/debug/armed-mandate";

describe("autonomy mandate routing", () => {
  const text = "gör 5 follow-ups och buggranska";

  it("routes the mandate to the agent so its existing power gates can arm it", () => {
    expect(classifyComposerIntent(text)).toBe("agent");
    expect(resolveComposerRoute({ mode: "auto", text, hasChat: true, hasAttachments: false, agentAvailable: true, builderAwaitingReply: true })).toBe("agent");
    expect(createArmedMandate(parseArmingDirective(text)!).remaining).toBe(5);
    expect(isReadOnlyComposerRequest(text)).toBe(false);
    // Routing does not grant the ordinary direct-build permission. The hook's
    // explicitFollowupOrder + armedAutonomy gates still authorize a mandate.
    expect(composerAllowsAgentBuild({ mode: "auto", text })).toBe(false);
    expect(composerAllowsAgentBuild({ mode: "agent", text })).toBe(false);
  });

  it.each([
    { hasChat: false, hasAttachments: false, agentAvailable: true },
    { hasChat: true, hasAttachments: true, agentAvailable: true },
    { hasChat: true, hasAttachments: false, agentAvailable: false },
  ])("does not turn a mandate into an ordinary build when unreachable: %j", availability => {
    expect(resolveComposerRoute({ mode: "auto", text, ...availability })).toBe("blocked");
  });
});

describe("isReadOnlyComposerRequest", () => {
  it.each([
    "Byt rubriken till Välkommen, ändra inget annat",
    "Byt rubriken till Välkommen, ändra ingenting annat",
    "Ändra inget annat men byt rubriken till Välkommen",
  ])("allows only the new bounded order and signals revocation of older work: %s", text => {
    expect(hasScopedComposerChangeRestriction(text)).toBe(true);
    expect(isReadOnlyComposerRequest(text)).toBe(false);
    expect(composerAllowsAgentBuild({ mode: "auto", text })).toBe(true);
    expect(resolveComposerRoute({ mode: "auto", text, hasChat: true, hasAttachments: false, agentAvailable: true })).toBe("build");
    expect(composerAllowsAgentBuild({ mode: "agent", text })).toBe(false);
  });

  it.each(["Ändra inget annat", "Granska sidan, ändra inget annat", "Byt rubriken till X, ändra inget annat, ändra ingenting"])(
    "does not remove an absolute prohibition without a permitted bounded order: %s", text => {
      expect(isReadOnlyComposerRequest(text)).toBe(true);
      expect(composerAllowsAgentBuild({ mode: "auto", text })).toBe(false);
    },
  );

  it.each([
    "Ändra ingenting, granska bara startsidan",
    "Ändra inget",
    "Gör inga ändringar",
    "Gör ingenting",
    "Gör inget",
    "Gor inga andringar",
    "andra ingenting",
    "Do nothing",
    "Don't do anything",
    "Don’t do anything",
    "Bygg inte",
    "Granska och bygg inte om sajten",
    "Only review the site",
    "Review only",
    "Do not change anything",
    "Don't change the site",
    "Don’t change anything, just review",
  ])("skyddar «%s» före byggverb", (text) => {
    expect(isReadOnlyComposerRequest(text)).toBe(true);
    expect(classifyComposerIntent(text)).toBe("agent");
  });

  it.each([
    "Ändra inte färgerna men byt rubriken till Välkommen",
    "Don't change the colors but replace the title with Welcome",
    "Byt rubriken till Välkommen",
    "Bygg en sajt om recensioner",
    "Gör knappen större",
    "",
  ])("förbjuder inte komplett ändringsorder «%s»", (text) => {
    expect(isReadOnlyComposerRequest(text)).toBe(false);
  });
});

describe("arming directives inside build orders", () => {
  it.each([
    "Bygg en bokningssida där kunden kan kolla nästa lediga tid",
    "Lägg till en kalender så besökaren kan kolla nästa lediga tid och boka",
  ])("a build order that merely mentions 'kolla … nästa' stays a build in Auto: %s", text => {
    expect(parseArmingDirective(text)).toBeNull();
    expect(classifyComposerIntent(text)).toBe("build");
    expect(resolveComposerRoute({ mode: "auto", text, hasChat: true, hasAttachments: false, agentAvailable: true })).toBe("build");
  });

  it.each(["Nej, stopp!", "Stopp, det räcker", "Stoppa nu, jag vill ändra rubriken", "Snälla, sluta!", "No, stop!"])(
    "an everyday stop phrasing still reaches the agent in Auto: %s",
    text => {
      expect(classifyComposerIntent(text)).toBe("agent");
      expect(resolveComposerRoute({ mode: "auto", text, hasChat: true, hasAttachments: false, agentAvailable: true, builderAwaitingReply: true })).toBe("agent");
    },
  );

  it.each([
    "Skapa en chatt där nästa meddelande visas överst",
    "Gör så att nästa meddelande laddas automatiskt",
    "Lägg till en knapp så användaren kan kolla nästa meddelande i inkorgen",
  ])("a build order mentioning 'nästa meddelande' stays a build in Auto: %s", text => {
    expect(parseArmingDirective(text)).toBeNull();
    expect(resolveComposerRoute({ mode: "auto", text, hasChat: true, hasAttachments: false, agentAvailable: true })).toBe("build");
  });

  it("a first prompt that only mentions 'nästa meddelande' becomes a build, not blocked", () => {
    const text = "Skapa en hemsida för vår sms-tjänst där kunden ser nästa meddelande i kön";
    expect(
      resolveComposerRoute({ mode: "auto", text, hasChat: false, hasAttachments: false, agentAvailable: false, agentConfigured: true }),
    ).toBe("build");
  });
});

describe("isAgentProposalReference", () => {
  it.each(["byt ut", "gör om", "gor om"])("consumes the longest existing opener before checking its object: %s", opener => {
    for (const object of ["det", "den", "detta"]) {
      const text = `Gör punkt 2: ${opener} ${object}`;
      expect(isAgentProposalReference(text)).toBe(true);
      expect(composerAllowsAgentBuild({ mode: "auto", text })).toBe(false);
      expect(classifyComposerIntent(text)).toBe("agent");
      expect(resolveComposerRoute({ mode: "build", text, hasChat: true, hasAttachments: false, agentAvailable: true })).toBe("agent");
    }
  });

  it.each([
    "byt rubriken till Välkommen", "byt ut rubriken mot Välkommen",
    "gör knappen större", "gör om kontaktsektionen med telefon och e-post",
    "gor knappen större", "gor om kontaktsektionen med telefon och e-post",
  ])("preserves named objects for both members of each existing prefix pair: %s", instruction => {
    const text = `Gör punkt 2: ${instruction}`;
    expect(isAgentProposalReference(text)).toBe(false);
    expect(composerAllowsAgentBuild({ mode: "auto", text })).toBe(true);
    expect(resolveComposerRoute({ mode: "auto", text, hasChat: true, hasAttachments: false, agentAvailable: true })).toBe("build");
  });

  it.each([
    "Gör punkt 2: gör det", "Gör punkt 2: byt enligt ditt förslag", "Gör punkt 2: gör så",
    "Gör punkt 2: implementera detta", "Gör punkt 2: ändra den", "Gör punkt 2: gör något åt det",
    "Gör punkt 2: gör på samma sätt", "Apply suggestion 2: fix it", "Apply suggestion 2: change that",
    "Gör punkt 2: byt rubriken enligt ditt förslag",
  ])("keeps an anaphoric colon suffix dependent on the actual advice: %s", text => {
    expect(isAgentProposalReference(text)).toBe(true);
    expect(composerAllowsAgentBuild({ mode: "auto", text })).toBe(false);
    expect(resolveComposerRoute({ mode: "auto", text, hasChat: true, hasAttachments: false, agentAvailable: true })).toBe("agent");
  });

  it.each([
    "Gör punkt två och tre", "Gör punkt 2 och punkt 3", "Gör punkt 2, 3", "Gör punkt 2–3",
    "Gör punkt 2 eller tre", "Gör punkt två och gör punkt tre", "Apply suggestion 2 and 3",
    "Gör punkt två men behåll något annat", "Gör enligt ditt förslag och något mer",
  ])("recognizes unresolved reference intent before build routing: %s", text => {
    expect(isAgentProposalReference(text)).toBe(true);
    expect(composerAllowsAgentBuild({ mode: "auto", text })).toBe(false);
    for (const mode of ["auto", "build", "agent"] as const) {
      expect(resolveComposerRoute({ mode, text, hasChat: true, hasAttachments: false, agentAvailable: true })).toBe("agent");
      expect(resolveComposerRoute({ mode, text, hasChat: true, hasAttachments: false, agentAvailable: false, agentConfigured: true })).toBe("blocked");
    }
  });

  it.each([
    "Gör punkt två",
    "gör punkt 2 i ditt förslag",
    "Gör enligt ditt förslag",
    "Gör enligt ditt förslag och byt knapptexten till Boka",
    "Bygg enligt ditt förslag",
    "Snälla implementera förslag 2, tack",
    "Apply suggestion 2",
    "Please apply your suggestion!",
  ])("håller ofullständig referens «%s» hos agenten", (text) => {
    expect(isAgentProposalReference(text)).toBe(true);
    expect(classifyComposerIntent(text)).toBe("agent");
  });

  it.each([
    "Gör punkt två: byt rubriken till Välkommen",
    "Gör punkt 2: gör knappen större",
    "Gör punkt 2: lägg till en kontaktsektion med telefon och e-post",
    "Apply suggestion 2: add a contact section with phone and email",
    "Byt rubriken till Välkommen enligt ditt förslag",
    "Add suggestion 2 to the list of suggestions",
    "",
  ])("bevarar kompletta instruktionen «%s»", (text) => {
    expect(isAgentProposalReference(text)).toBe(false);
    if (text) expect(classifyComposerIntent(text)).toBe("build");
  });
});

describe("composerAllowsAgentBuild", () => {
  it.each(["auto", "build"] as const)("tillåter positiv komplett order i %s", (mode) => {
    expect(composerAllowsAgentBuild({ mode, text: "Byt rubriken till Välkommen" })).toBe(true);
    expect(
      composerAllowsAgentBuild({ mode, text: "Ändra inte färgerna men byt rubriken till Välkommen" }),
    ).toBe(true);
  });

  it.each(["auto", "build", "agent"] as const)("nekar fråga, negation, referens och osäker text i %s", (mode) => {
    for (const text of ["Vad tycker du?", "Ändra inget", "Bygg inte", "Gör punkt två", "Apply suggestion 2", "Blåare knappar", ""]) {
      expect(composerAllowsAgentBuild({ mode, text })).toBe(false);
    }
  });

  it("Fråga ger aldrig byggmandat", () => {
    expect(composerAllowsAgentBuild({ mode: "agent", text: "Byt rubriken till Välkommen" })).toBe(false);
  });

  it.each([
    "Gör ingenting", "Gör inget", "Gör inga ändringar", "Do nothing", "Don’t do anything", "andra ingenting",
  ])("nekar byggmandat för uttryckligt no-op «%s»", (text) => {
    for (const mode of ["auto", "build", "agent"] as const) {
      expect(composerAllowsAgentBuild({ mode, text })).toBe(false);
    }
  });
});

describe("classifyComposerIntent", () => {
  it.each([
    "Vad tycker du om startsidan?",
    "Är det tydligt vad mitt företag erbjuder?",
    "hur lång tid tar previewen",
    "Kan du förklara vad versionerna betyder?",
    "Granska sajten innan publicering",
    "Kolla igenom mobilversionen och säg vad som är fel",
    "Vilka sidor finns på sajten",
    "What can be improved on the hero?",
  ])("klassar «%s» som fråga/granskning", (text) => {
    expect(classifyComposerIntent(text)).toBe("agent");
  });

  it.each([
    "Byt knapptexten till Boka tid",
    "Lägg till en kontaktsida med karta",
    "Ändra färgen på knappen till blå",
    "Gör hero-rubriken tydligare",
    "ta bort nyhetsbrevet i sidfoten",
    "Add a testimonials section under the hero",
    "Uppdatera öppettiderna till 9–17",
  ])("klassar «%s» som byggorder", (text) => {
    expect(classifyComposerIntent(text)).toBe("build");
  });

  it("låter en inledande byggorder vinna över en avslutande fråga utan frågetecken", () => {
    expect(classifyComposerIntent("Byt rubriken och säg till när det är klart")).toBe("build");
  });

  it("låter ett avslutande frågetecken vinna över ett ändringsverb", () => {
    expect(classifyComposerIntent("Kan du göra knappen större?")).toBe("agent");
  });

  it("träffar inte «andra» som ändringsverb, inte heller i början av meningen", () => {
    expect(classifyComposerIntent("Den andra sidan känns tom")).toBe("unsure");
    expect(classifyComposerIntent("Andra sidan ser konstig ut")).toBe("unsure");
  });

  it("lämnar rena beskrivningar som oklara", () => {
    expect(classifyComposerIntent("Blåare knappar och mer luft")).toBe("unsure");
    expect(classifyComposerIntent("")).toBe("unsure");
  });
});

describe("resolveComposerRoute", () => {
  const base = {
    mode: "auto" as const,
    text: "Vad tycker du om startsidan?",
    hasChat: true,
    hasAttachments: false,
    agentAvailable: true,
  };

  it("skickar frågor till agenten i auto-läge", () => {
    expect(resolveComposerRoute(base)).toBe("agent");
  });

  it("skickar byggordrar till byggmotorn i auto-läge", () => {
    expect(resolveComposerRoute({ ...base, text: "Byt rubriken till Välkommen" })).toBe("build");
  });

  it("skickar oklar text till agenten i auto-läge — men till byggmotorn när agenten inte kan bygga", () => {
    expect(resolveComposerRoute({ ...base, text: "Blåare knappar" })).toBe("agent");
    expect(resolveComposerRoute({ ...base, text: "Blåare knappar", agentCanBuild: true })).toBe(
      "agent",
    );
    expect(resolveComposerRoute({ ...base, text: "Blåare knappar", agentCanBuild: false })).toBe(
      "build",
    );
    // Frågor går fortfarande till agenten även utan byggbefogenhet.
    expect(resolveComposerRoute({ ...base, agentCanBuild: false })).toBe("agent");
  });

  it("respekterar tvingat läge åt båda håll", () => {
    expect(resolveComposerRoute({ ...base, mode: "build" })).toBe("build");
    expect(
      resolveComposerRoute({ ...base, mode: "agent", text: "Byt rubriken till Välkommen" }),
    ).toBe("agent");
  });

  it("håller svar på byggmotorns motfråga/plan i samma flöde, med Fråga som uttryckligt undantag", () => {
    expect(resolveComposerRoute({ ...base, text: "Ja gärna", builderAwaitingReply: true })).toBe("build");
    expect(resolveComposerRoute({ ...base, builderAwaitingReply: true })).toBe("build");
    expect(resolveComposerRoute({ ...base, mode: "agent", builderAwaitingReply: true })).toBe("agent");
  });

  it("bevarar legacy när agent inte är konfigurerad", () => {
    expect(resolveComposerRoute({ ...base, hasChat: false })).toBe("build");
    expect(resolveComposerRoute({ ...base, hasAttachments: true })).toBe("build");
    expect(resolveComposerRoute({ ...base, agentAvailable: false })).toBe("build");
    expect(resolveComposerRoute({ ...base, agentConfigured: false, agentAvailable: false })).toBe("build");
  });

  it.each([
    { agentAvailable: false },
    { hasChat: false },
    { hasAttachments: true },
  ])("blockerar agentärenden när agentvägen saknas: %j", (unavailable) => {
    expect(resolveComposerRoute({ ...base, ...unavailable, mode: "agent" })).toBe("blocked");
    for (const mode of ["auto", "agent", "build"] as const) {
      for (const text of ["Ändra inget", "Bygg inte", "Gör punkt två", "Apply suggestion 2"]) {
        expect(resolveComposerRoute({ ...base, ...unavailable, mode, text })).toBe("blocked");
      }
    }
  });

  it.each(["auto", "agent", "build"] as const)("skickar no-change/referens till nåbar agent även i %s", (mode) => {
    for (const text of ["Ändra inget", "Gör punkt två", "Apply suggestion 2"]) {
      expect(resolveComposerRoute({ ...base, mode, text, agentCanBuild: false, builderAwaitingReply: true })).toBe("agent");
    }
  });

  it("blockerar automatisk fråga när konfigurerad agent ännu inte är tillgänglig", () => {
    expect(resolveComposerRoute({ ...base, agentConfigured: true, agentAvailable: false })).toBe("blocked");
  });

  it.each([
    "Gör ingenting", "Gör inget", "Gör inga ändringar", "Do nothing", "Don’t do anything", "andra ingenting",
  ])("skickar uttryckligt no-op «%s» till agent eller blockerar", (text) => {
    for (const mode of ["auto", "build", "agent"] as const) {
      expect(resolveComposerRoute({ ...base, mode, text })).toBe("agent");
      expect(resolveComposerRoute({ ...base, mode, text, agentAvailable: false })).toBe("blocked");
    }
  });

  it.each([
    { agentAvailable: false },
    { hasChat: false },
    { hasAttachments: true },
  ])("bevarar komplett byggorder när agentvägen saknas: %j", (unavailable) => {
    expect(resolveComposerRoute({ ...base, ...unavailable, agentConfigured: true, text: "Byt rubriken till Välkommen" })).toBe("build");
  });

  it("bevarar byggmotorns väntande svar även när agenten inte är redo", () => {
    expect(resolveComposerRoute({ ...base, agentConfigured: true, agentAvailable: false, builderAwaitingReply: true })).toBe("build");
  });
});
