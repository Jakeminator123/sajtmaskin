import { describe, it, expect } from "vitest";
import {
  consumeMandateStep,
  createArmedMandate,
  DEFAULT_FOLLOWUP_COUNT,
  describeMandate,
  isMandateActive,
  MAX_FOLLOWUP_COUNT,
  parseArmingDirective,
  parseStopDirective,
} from "./armed-mandate";

describe("parseArmingDirective", () => {
  it("returns null for ordinary messages (OpenClaw stays passive)", () => {
    expect(parseArmingDirective("kan du förklara vad en scaffold är?")).toBeNull();
    expect(parseArmingDirective("bygg en sajt åt mig")).toBeNull();
    expect(parseArmingDirective("")).toBeNull();
  });

  it("detects a follow-up mandate with an explicit count", () => {
    const directive = parseArmingDirective("gör 5 follow-ups och buggranska det suspekta");
    expect(directive).not.toBeNull();
    expect(directive?.mode).toBe("followups");
    expect(directive?.count).toBe(5);
  });

  it("arms three steps from the exact preview-repro phrase", () => {
    const directive = parseArmingDirective(
      "gör 3 follow-ups och buggranska. Första steget: skicka själv en builder-prompt som gör hero-rubriken tydligare. Om det räcker med en liten textändring, föreslå också en snabbändring.",
    );
    expect(directive).not.toBeNull();
    expect(directive?.mode).toBe("followups");
    expect(directive?.count).toBe(3);
    const mandate = createArmedMandate(directive!);
    expect(mandate.remaining).toBe(3);
  });

  it("detects follow-ups without a count → default", () => {
    const directive = parseArmingDirective("kör follow-ups och buggranska");
    expect(directive?.mode).toBe("followups");
    expect(directive?.count).toBe(DEFAULT_FOLLOWUP_COUNT);
  });

  it("clamps an excessive follow-up count to the ceiling", () => {
    const directive = parseArmingDirective("gör 99 follow-ups");
    expect(directive?.count).toBe(MAX_FOLLOWUP_COUNT);
  });

  it("clamps a follow-up count under 1 to the default", () => {
    const directive = parseArmingDirective("gör 0 follow-ups");
    expect(directive?.mode).toBe("followups");
    expect(directive?.count).toBe(DEFAULT_FOLLOWUP_COUNT);
    const mandate = createArmedMandate({ mode: "followups", count: 0, reason: "x" });
    expect(mandate.remaining).toBe(DEFAULT_FOLLOWUP_COUNT);
  });

  it("detects a review-next mandate", () => {
    const directive = parseArmingDirective(
      "granska nästa meddelande jag skapar och ta notis om allt",
    );
    expect(directive?.mode).toBe("review_next");
    expect(directive?.count).toBe(1);
  });

  it("does NOT arm on a bare/question mention of follow-ups (no imperative verb)", () => {
    expect(parseArmingDirective("kan du förklara follow-ups?")).toBeNull();
    expect(parseArmingDirective("vad är en follow-up egentligen")).toBeNull();
  });

  it("does NOT arm review-next on a bare 'nästa meddelande' mention (no verb)", () => {
    expect(parseArmingDirective("vad händer med nästa meddelande?")).toBeNull();
    expect(parseArmingDirective("nästa meddelande är nog viktigt")).toBeNull();
  });

  it.each([
    "Bygg en bokningssida där kunden kan kolla nästa lediga tid",
    "Lägg till en kalender så besökaren kan kolla nästa lediga tid och boka",
    "Skapa en banner som visar nästa meddelande",
    "Skapa en chatt där nästa meddelande visas överst",
    "Gör så att nästa meddelande laddas automatiskt",
    "Lägg till en knapp så användaren kan kolla nästa meddelande i inkorgen",
    "Skapa en hemsida för vår sms-tjänst där kunden ser nästa meddelande i kön",
    "Ok kolla nästa lediga tid och lägg till den i headern",
  ])("does NOT arm review-next on a build order that only mentions the directive words: %s", text => {
    expect(parseArmingDirective(text)).toBeNull();
  });

  it.each([
    "Kan du granska nästa meddelande jag skickar",
    "Snälla, kolla nästa meddelande jag skapar",
    "Granska nästa meddelande",
    "Hej, kan du granska nästa bygge?",
    "Okej, granska nästa version jag skapar",
    "Kan du snälla kolla nästa version",
    "Bra. Kolla nästa version jag gör",
    "Nästa meddelande: granska det",
  ])("arms review-next when the directive opens the message: %s", text => {
    expect(parseArmingDirective(text)?.mode).toBe("review_next");
  });

  it("does NOT arm on negation/abstention", () => {
    expect(parseArmingDirective("gör inga follow-ups")).toBeNull();
    expect(parseArmingDirective("nej, inte follow-ups nu")).toBeNull();
  });

  it("does NOT treat a stop message as an arming directive", () => {
    expect(parseArmingDirective("stopp")).toBeNull();
    expect(parseArmingDirective("Stopp. Granska bara tidigare follow-ups.")).toBeNull();
  });
});

describe("parseStopDirective", () => {
  it("detects stop words", () => {
    for (const text of ["stopp", "Stoppa nu", "avbryt", "sluta", "stop please"]) {
      expect(parseStopDirective(text)).toBe(true);
    }
  });

  it("detects Swedish stop variants including avsluta and halt", () => {
    for (const text of ["avsluta", "Avsluta nu", "halt", "halt please"]) {
      expect(parseStopDirective(text)).toBe(true);
    }
  });

  it.each([
    "Stop now",
    "Stopp. Det räcker.",
    "Stopp. Fortsätt inte.",
    "Stop now. That is enough.",
    "Snälla avbryt körningen nu! Det räcker.",
    "Stopp. Gör inte fler ändringar.",
    "Stopp!\nDet räcker.",
    "Stopp。Det räcker。",
  ])("recognizes a leading stop sentence followed by an explanation: %s", text => {
    expect(parseStopDirective(text)).toBe(true);
  });

  it("ignores unrelated text", () => {
    expect(parseStopDirective("fortsätt gärna")).toBe(false);
    expect(parseStopDirective("Ja, bygg vidare")).toBe(false);
  });

  it.each([
    "Nej, stopp!",
    "nej stopp",
    "Okej stopp",
    "Stopp, det räcker",
    "Stopp - det räcker",
    "STOPP STOPP",
    "stop it",
    "Stoppa nu, jag vill ändra rubriken",
    "Stopp, tack, jag tar det härifrån",
    "Snälla, sluta!",
    "Snälla, stoppa nu",
    "Snälla, avbryt allt",
    "Please, stop",
    "please, halt",
    "Snälla, kan du sluta?",
    "No, stop!",
    "No stop",
    "Nä, stopp!",
    "Näe, sluta",
    "Nej nej, stopp!",
    "Nej men sluta!",
    "Nej. Stopp!",
    "Vänta, stopp!",
    "Hey, stop!",
    "Det blev fel. Sluta!",
  ])("recognizes everyday stop phrasings (regression vs preview): %s", text => {
    expect(parseStopDirective(text)).toBe(true);
  });

  it.each([
    "Kan ni stoppa?",
    "Could you stop?",
    "Can you stop it?",
    "Skulle du kunna stoppa?",
    "Kan du snälla sluta?",
    "STOPP?!",
    "Stopp, vad gör du?",
    "Wait, stop",
    "Oj, stopp",
    "Nämen sluta!",
    "Jag sa stopp!",
    "Stopp…",
  ])("recognizes polite questions and other everyday stops in both scopes: %s", text => {
    expect(parseStopDirective(text)).toBe(true);
    expect(parseStopDirective(text, "leading")).toBe(true);
  });

  it.each([
    "Stoppa nu, eller vänta?",
    "Jo, sluta med bilderna i headern",
    "Jakob, stopp är fel ord här",
  ])("does not read a question about stopping or an unrelated name as a stop: %s", text => {
    expect(parseStopDirective(text)).toBe(false);
    expect(parseStopDirective(text, "leading")).toBe(false);
  });

  it.each([
    "Lägg till en sekundär knapp i modalen, t.ex. Avbryt.",
    "Byt texten på knappen till något kortare, t.ex. Stopp.",
    "Change the button label to something short, e.g. Stop.",
    "Lägg till knappar. Avbryt, Spara och Skicka.",
    "Skapa ett formulär med knapparna:\nSkicka.\nAvbryt.",
    "Skapa en hemsida för vår rökavvänjning. Sluta nu! Vi hjälper dig.",
  ])("leading scope: a build order that names a stop word later is not a stop: %s", text => {
    expect(parseStopDirective(text, "leading")).toBe(false);
  });

  it.each(["Ja, avsluta det", "Okej, avsluta det", "Ok, avsluta", "Okej. Avsluta det."])(
    "leading scope: an affirmative answer to the builder is not a stop: %s",
    text => {
      expect(parseStopDirective(text, "leading")).toBe(false);
    },
  );

  it.each(["Ja, stoppa!", "Ja stopp", "Jo, stopp", "Okej stopp", "Det blev fel. Sluta!"])(
    "any scope: disarms on a stop the routing leaves alone: %s",
    text => {
      expect(parseStopDirective(text)).toBe(true);
      expect(parseStopDirective(text, "leading")).toBe(false);
    },
  );

  it("stays linear on very long input", () => {
    const started = Date.now();
    expect(parseStopDirective(`${"nej ".repeat(20_000)}${"stopp ".repeat(20_000)}x`)).toBe(false);
    expect(parseStopDirective(`${"nej ".repeat(20_000)}${"stopp ".repeat(20_000)}x`, "leading")).toBe(false);
    expect(parseStopDirective(". ".repeat(100_000))).toBe(false);
    expect(parseArmingDirective(`${"hej ".repeat(20_000)}${"kolla ".repeat(20_000)}x`)).toBeNull();
    expect(Date.now() - started).toBeLessThan(2_000);
  });

  it.each([
    "Kan du förklara hur jag ska stoppa buggar?",
    "sluta inte",
    "Stoppa inte autonomin",
    "Avbryt aldrig körningen",
    "Vad betyder stopp?",
    'Förklara kommandot "avbryt"',
    '"stopp"',
    "stoppa buggar",
    "åsluta",
    "slutaå",
    "sluta inte generera",
    "sluta inte med dina follow-ups",
    "avbryt inte det du gör",
    "don't stop generating",
    "Kan du förklara vad stop generating betyder?",
    "stop generating bugs",
    "Sluta inte. Fortsätt gärna.",
    "Stoppa buggar. Det räcker.",
    'Jag skrev "stopp". Det räcker.',
    '"stopp". Det räcker.',
    "Stopp? Vad betyder det?",
    "Stop now? What does that mean?",
    "stopp.nu",
    "Stopnow",
    "Stop nowå",
    "åStop now",
    "Stoppa autonominå. Det räcker.",
    "åstopp. Det räcker.",
    "stoppå. Det räcker.",
  ])("does not cancel on a negation, mention or unrelated object: %s", text => {
    expect(parseStopDirective(text)).toBe(false);
  });

  it.each([
    "Snälla avbryt körningen nu", "Kan du stoppa autonomin?", "sluta med follow-ups",
    "stoppa efter detta steg", "sluta med det där", "sluta generera",
    "sluta med dina follow-ups", "avbryt det du gör", "stop generating", "stopp, tack",
  ])(
    "recognizes an explicit stop of current work: %s", text => {
      expect(parseStopDirective(text)).toBe(true);
    },
  );
});

describe("mandate lifecycle", () => {
  it("creates and consumes a bounded mandate", () => {
    const mandate = createArmedMandate({ mode: "followups", count: 2, reason: "x" }, 1000);
    expect(mandate.remaining).toBe(2);
    expect(isMandateActive(mandate)).toBe(true);

    const after1 = consumeMandateStep(mandate);
    expect(after1?.remaining).toBe(1);
    expect(isMandateActive(after1)).toBe(true);

    const after2 = consumeMandateStep(after1);
    expect(after2).toBeNull();
    expect(isMandateActive(after2)).toBe(false);
  });

  it("consumeMandateStep clears the mandate when the last step is consumed", () => {
    const mandate = createArmedMandate({ mode: "review_next", count: 1, reason: "x" }, 1000);
    expect(mandate.remaining).toBe(1);
    expect(consumeMandateStep(mandate)).toBeNull();
    expect(consumeMandateStep(null)).toBeNull();
  });

  it("describeMandate reflects state", () => {
    expect(describeMandate(null)).toMatch(/ingen aktiv/i);
    expect(describeMandate(createArmedMandate({ mode: "review_next", count: 1, reason: "" }))).toMatch(
      /granskar nästa/i,
    );
    expect(
      describeMandate(createArmedMandate({ mode: "followups", count: 3, reason: "" })),
    ).toMatch(/3 follow-up/i);
  });
});

describe("describeMandate", () => {
  it("describes review_next as a passive mode (user sends the next message)", () => {
    const label = describeMandate(
      createArmedMandate({ mode: "review_next", count: 1, reason: "granska nästa" }),
    );
    expect(label).toBe("Armerad: granskar nästa meddelande du skickar");
    // Must not imply the agent drives/builds on its own.
    expect(label).not.toMatch(/svar|följer upp|auto|bygg/i);
  });

  it("describes followups with the remaining step count", () => {
    expect(
      describeMandate(createArmedMandate({ mode: "followups", count: 5, reason: "gör 5" })),
    ).toBe("Armerad: 5 follow-up(s) kvar");
  });
});
