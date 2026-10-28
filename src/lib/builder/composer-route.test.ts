import { describe, expect, it } from "vitest";
import { classifyComposerIntent, resolveComposerRoute } from "./composer-route";

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

  it("går alltid till byggmotorn utan chatt, med bilagor eller utan agent", () => {
    expect(resolveComposerRoute({ ...base, hasChat: false })).toBe("build");
    expect(resolveComposerRoute({ ...base, hasAttachments: true })).toBe("build");
    expect(resolveComposerRoute({ ...base, agentAvailable: false })).toBe("build");
    expect(resolveComposerRoute({ ...base, mode: "agent", hasChat: false })).toBe("build");
  });
});
