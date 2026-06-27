import { describe, expect, it } from "vitest";
import { detectFollowUpCapabilities } from "./follow-up-capability-detection";

describe("detectFollowUpCapabilities — empty / unrelated", () => {
  it("returns no capabilities for an empty message", () => {
    const result = detectFollowUpCapabilities("");
    expect(result.capabilities).toEqual([]);
    expect(result.capabilityIds).toEqual([]);
    expect(result.tierByCapability).toEqual({});
    expect(result.wordCount).toBe(0);
  });

  it("returns no capabilities for a generic color tweak", () => {
    const result = detectFollowUpCapabilities("ändra färgen på knappen");
    expect(result.capabilities).toEqual([]);
    expect(result.capabilityIds).toEqual([]);
  });

  it("returns no capabilities for a layout edit", () => {
    const result = detectFollowUpCapabilities("Flytta CTA-knappen under rubriken");
    expect(result.capabilities).toEqual([]);
  });
});

describe("detectFollowUpCapabilities — visual-3d", () => {
  it("detects a generic 3D add-on (smoke run 2 prompt)", () => {
    const result = detectFollowUpCapabilities(
      "Skapa en 3d-kaffekopp som hoovrar och flyger ovanför",
    );
    expect(result.capabilityIds).toContain("visual-3d");
    // 9 words → just over the generic word budget but no behaviour markers,
    // so still escalates to `specific` (the prompt has noun-rich detail).
    // What matters most here: it MUST not be `beyond-dossier` — `three-fiber-canvas`
    // alone can host a hovering coffee cup mesh.
    expect(result.tierByCapability["visual-3d"]).not.toBe("beyond-dossier");
  });

  it("detects a short generic 3D add-on as `generic`", () => {
    const result = detectFollowUpCapabilities("lägg till en 3D-grej");
    expect(result.capabilityIds).toEqual(["visual-3d"]);
    expect(result.tierByCapability["visual-3d"]).toBe("generic");
  });

  it("escalates to `specific` when the prompt describes interaction behaviour", () => {
    const result = detectFollowUpCapabilities(
      "Bygg en 3d-canvas där man målar och animation skiftar nyanser medan man målar",
    );
    expect(result.capabilityIds).toContain("visual-3d");
    expect(result.tierByCapability["visual-3d"]).toBe("specific");
  });

  it("escalates to `beyond-dossier` for physics-simulation language", () => {
    const result = detectFollowUpCapabilities(
      "lägg till physics-simulation av studsande tomater",
    );
    expect(result.capabilityIds).toContain("visual-3d");
    expect(result.tierByCapability["visual-3d"]).toBe("beyond-dossier");
  });

  it("escalates to `beyond-dossier` when @react-three/rapier is named", () => {
    const result = detectFollowUpCapabilities(
      "vill ha en scen med @react-three/rapier rigidbodies",
    );
    expect(result.capabilityIds).toContain("visual-3d");
    expect(result.tierByCapability["visual-3d"]).toBe("beyond-dossier");
  });
});

describe("detectFollowUpCapabilities — contact-form", () => {
  it("detects 'kontaktform' as `contact-form`", () => {
    const result = detectFollowUpCapabilities("lägg till en kontaktform");
    expect(result.capabilityIds).toEqual(["contact-form"]);
    expect(result.tierByCapability["contact-form"]).toBe("generic");
  });

  it("detects 'kontaktformulär'", () => {
    const result = detectFollowUpCapabilities(
      "Vi behöver ett kontaktformulär längst ner på sidan",
    );
    expect(result.capabilityIds).toContain("contact-form");
  });

  it("detects English 'contact form'", () => {
    const result = detectFollowUpCapabilities("add a contact form at the bottom");
    expect(result.capabilityIds).toContain("contact-form");
  });
});

describe("detectFollowUpCapabilities — payments", () => {
  it("detects 'stripe checkout'", () => {
    const result = detectFollowUpCapabilities("lägg till stripe-checkout på prissidan");
    expect(result.capabilityIds).toContain("payments");
  });

  it("detects 'betala med kort'", () => {
    const result = detectFollowUpCapabilities(
      "användaren ska kunna betala med kort i kassan",
    );
    expect(result.capabilityIds).toContain("payments");
  });
});

describe("detectFollowUpCapabilities — negated capabilities", () => {
  it("does not detect auth or payments when the user explicitly forbids them", () => {
    const result = detectFollowUpCapabilities(
      "Lägg till en flygande 3D-anka. Lägg inte till backend, API-routes, auth, betalning eller externa tjänster.",
    );

    expect(result.capabilityIds).toContain("visual-3d");
    expect(result.capabilityIds).not.toContain("auth");
    expect(result.capabilityIds).not.toContain("payments");
  });
});

describe("detectFollowUpCapabilities — assorted dossier capabilities", () => {
  it("detects 'kundomdömen' as `testimonials-section`", () => {
    const result = detectFollowUpCapabilities("lägg till kundomdömen under hero");
    expect(result.capabilityIds).toContain("testimonials-section");
  });

  it("detects 'pristabell' as `pricing-section`", () => {
    const result = detectFollowUpCapabilities("lägg till en pristabell med tre nivåer");
    expect(result.capabilityIds).toContain("pricing-section");
  });

  it("detects 'FAQ' as `faq-section`", () => {
    const result = detectFollowUpCapabilities("lägg till en FAQ längst ner");
    expect(result.capabilityIds).toContain("faq-section");
  });

  it("detects 'karusell' as `carousel`", () => {
    const result = detectFollowUpCapabilities("ha en karusell med produktbilder");
    expect(result.capabilityIds).toContain("carousel");
  });

  it("detects 'cmd+k' as `command-search`", () => {
    const result = detectFollowUpCapabilities("lägg till en cmd+k command-palette");
    expect(result.capabilityIds).toContain("command-search");
  });

  it("detects 'nyhetsbrev' as `newsletter-subscribe`", () => {
    const result = detectFollowUpCapabilities("ett nyhetsbrev-formulär i footern");
    expect(result.capabilityIds).toContain("newsletter-subscribe");
  });

  it("detects 'plausible' as `analytics`", () => {
    const result = detectFollowUpCapabilities("koppla på plausible analytics");
    expect(result.capabilityIds).toContain("analytics");
  });

  it("detects 'sentry' as `error-tracking`", () => {
    const result = detectFollowUpCapabilities("lägg till sentry för error-tracking");
    expect(result.capabilityIds).toContain("error-tracking");
  });

  it("detects 'ai-chatt' as `ai-chat`", () => {
    const result = detectFollowUpCapabilities("lägg till en ai-chatt-widget");
    expect(result.capabilityIds).toContain("ai-chat");
  });

  it("detects 'inloggning' as `auth`", () => {
    const result = detectFollowUpCapabilities("vi behöver inloggning med lösenord");
    expect(result.capabilityIds).toContain("auth");
  });

  it("detects 'marquee' as `marquee`", () => {
    const result = detectFollowUpCapabilities("ha en logo-marquee under hero");
    expect(result.capabilityIds).toContain("marquee");
  });
});

describe("detectFollowUpCapabilities — interactive-game", () => {
  it("detects 'Pac-Man' as `interactive-game`", () => {
    const result = detectFollowUpCapabilities("lägg till ett Pac-Man på startsidan");
    expect(result.capabilityIds).toContain("interactive-game");
  });

  it("detects 'Snake' with hyphen form", () => {
    const result = detectFollowUpCapabilities("bygga ett snake-game");
    expect(result.capabilityIds).toContain("interactive-game");
  });

  it("detects 'platformer' in English", () => {
    const result = detectFollowUpCapabilities("add a tiny platformer demo to the hero");
    expect(result.capabilityIds).toContain("interactive-game");
  });

  it("detects 'tv-spel' compound", () => {
    const result = detectFollowUpCapabilities("bygg ett tv-spel för barnen");
    expect(result.capabilityIds).toContain("interactive-game");
  });

  it("detects 'bygg ett spel' add-verb form", () => {
    // ADD_VERB_PATTERNS in follow-up-capability-detection.ts already covers
    // `bygg(er|de)?` — so "bygg ett spel" triggers the add-verb guard AND
    // the interactive-game vocabulary pattern for "bygg ett spel".
    const result = detectFollowUpCapabilities("bygg ett spel där man samlar frukter");
    expect(result.capabilityIds).toContain("interactive-game");
  });

  it("vetoes 'spela upp musik' media playback", () => {
    const result = detectFollowUpCapabilities("lägg till en knapp som spelar upp musik");
    expect(result.capabilityIds).not.toContain("interactive-game");
  });

  it("vetoes 'gaming-news' sales page phrasing", () => {
    const result = detectFollowUpCapabilities(
      "bygg en gaming-news blog med senaste spel-nyheterna",
    );
    expect(result.capabilityIds).not.toContain("interactive-game");
  });

  it("vetoes 'gaming news' (space-separated) phrasing", () => {
    // Post-review: the veto used to require hyphen between gaming & news.
    const result = detectFollowUpCapabilities(
      "bygg en gaming news portal med recensioner",
    );
    expect(result.capabilityIds).not.toContain("interactive-game");
  });

  it("vetoes 'tv-spel butik' retail phrasing", () => {
    // Post-review: "tv-spel butik" (space before butik) is a retail
    // store, not a game build. Narrower veto now handles this case.
    const result = detectFollowUpCapabilities(
      "bygg en hemsida för en tv-spel butik med öppettider och lagerstatus",
    );
    expect(result.capabilityIds).not.toContain("interactive-game");
  });

  it("vetoes 'rollspel' and 'skådespel' compounds", () => {
    const resultA = detectFollowUpCapabilities("beskrivning av ett rollspel för teambuilding");
    const resultB = detectFollowUpCapabilities("en teater-sida med bilder från skådespelet");
    expect(resultA.capabilityIds).not.toContain("interactive-game");
    expect(resultB.capabilityIds).not.toContain("interactive-game");
  });

  it("detects game + visual-3d when the prompt describes both (dolphin Pac-Man)", () => {
    // Reviewer's canonical example: "bygg Pac-Man med delfiner". The
    // prompt carries an interactive-game signal ("Pac-Man"), and the
    // delfiner term is flavour, not a 3D cue. The dossier selector
    // downstream should only pick `interactive-game-loop` here; a
    // separate explicit "3D" token would be required to also light up
    // `visual-3d`.
    const result = detectFollowUpCapabilities("bygg Pac-Man med delfiner");
    expect(result.capabilityIds).toContain("interactive-game");
    expect(result.capabilityIds).not.toContain("visual-3d");
  });

  it("detects game AND visual-3d when the prompt explicitly asks for 3D", () => {
    const result = detectFollowUpCapabilities(
      "bygg ett 3D-arcade-game med fysik",
    );
    expect(result.capabilityIds).toContain("interactive-game");
    expect(result.capabilityIds).toContain("visual-3d");
  });
});

describe("detectFollowUpCapabilities — parallax disambiguation", () => {
  it("detects pointer-parallax when the prompt names the pointer", () => {
    const result = detectFollowUpCapabilities("ha en pointer-parallax på hero-bilden");
    expect(result.capabilityIds).toContain("parallax-pointer");
    expect(result.capabilityIds).not.toContain("parallax-scroll");
  });

  it("detects scroll-parallax when only `parallax` is named", () => {
    const result = detectFollowUpCapabilities("lägg till en parallax-effekt");
    expect(result.capabilityIds).toContain("parallax-scroll");
  });
});

describe("detectFollowUpCapabilities — multiple capabilities", () => {
  it("detects two capabilities when the prompt asks for both", () => {
    const result = detectFollowUpCapabilities(
      "lägg till en kontaktform och en pristabell med tre nivåer",
    );
    expect(result.capabilityIds).toContain("contact-form");
    expect(result.capabilityIds).toContain("pricing-section");
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Plan 11 / open-question #12: capability-modify vs capability-add
// ─────────────────────────────────────────────────────────────────────────
//
// Background: chat `b71dafb3` (Plan 01 smoke run B) generated a working
// `floating-coffee-overlay.tsx` on the init turn. The user then wrote
//
//   "gör pricken till en kaffekopp som häller kaffe när jag nuddar
//    den med musen"
//
// Capability detection fired `visual-3d` from "kaffekopp" — correctly —
// but the follow-up was classified as `capability-add`, which made
// `selectDossiersForRequest` re-inject the `three-fiber-canvas` dossier
// shell + an error-boundary on top of the working overlay file. The
// user's preview rendered an empty canvas where the working scene used
// to be.
//
// These tests assert the new `referencesExistingCapability` signal so
// the upstream pipeline can route the prompt through `capability-modify`
// (suppressing dossier-shell re-injection) instead.
describe("detectFollowUpCapabilities — plan 11 bug 3: capability-modify reference markers", () => {
  it("flags referencesExistingCapability when 'pricken' appears alongside a 3d capability noun", () => {
    // The user is mutating the existing 3D output ("pricken") into a new
    // form. The "3d-kaffekopp" token fires `visual-3d` detection AND
    // "pricken" is a MODIFY_REFERENCE_MARKERS hit — the combination must
    // route to capability-modify, not capability-add.
    const result = detectFollowUpCapabilities(
      "gör pricken till en 3d-kaffekopp som häller kaffe när jag nuddar den med musen",
    );
    expect(result.capabilityIds).toContain("visual-3d");
    expect(result.referencesExistingCapability).toBe(true);
    expect(result.modifyReferenceMatches.length).toBeGreaterThan(0);
  });

  it("flags referencesExistingCapability when 'bubblan' references the existing scene", () => {
    const result = detectFollowUpCapabilities(
      "byt ut bubblan mot en 3d-kaffekopp",
    );
    expect(result.capabilityIds).toContain("visual-3d");
    expect(result.referencesExistingCapability).toBe(true);
  });

  it("flags a bubble/circle placeholder complaint as a visual-3d modify request", () => {
    const result = detectFollowUpCapabilities(
      "Har som en bubbla, ingen hamburgare.. Den ska flyga omkring ovandför sajtens förstasida.. skapa en ha,mburgare som gör detta",
    );
    expect(result.capabilityIds).toContain("visual-3d");
    expect(result.referencesExistingCapability).toBe(true);
    expect(result.modifyReferenceMatches).toContain("bubbla");
  });

  it("flags referencesExistingCapability for 'den 3D-grejen' shorthand", () => {
    const result = detectFollowUpCapabilities(
      "ändra den 3D-grejen så den roterar långsammare",
    );
    expect(result.capabilityIds).toContain("visual-3d");
    expect(result.referencesExistingCapability).toBe(true);
  });

  it("does NOT flag referencesExistingCapability for a fresh capability-add prompt", () => {
    const result = detectFollowUpCapabilities(
      "lägg till en 3d-kaffekopp som hoovrar och flyger ovanför",
    );
    expect(result.capabilityIds).toContain("visual-3d");
    expect(result.referencesExistingCapability).toBe(false);
    expect(result.modifyReferenceMatches).toEqual([]);
  });

  it("does NOT flag referencesExistingCapability when the modify-reference appears without a capability noun", () => {
    // Bare "byt ut den" with no dossier-mappable noun is a refine intent
    // and must not trigger the capability-modify branch — otherwise we'd
    // suppress dossier injection on prompts that never named a
    // capability in the first place.
    const result = detectFollowUpCapabilities(
      "byt ut den mot något snyggare",
    );
    expect(result.capabilityIds).toEqual([]);
    expect(result.referencesExistingCapability).toBe(false);
  });

  it("flags referencesExistingCapability for English 'turn it into' phrasing", () => {
    const result = detectFollowUpCapabilities(
      "turn it into a 3d coffee cup that pours when I hover",
    );
    expect(result.capabilityIds).toContain("visual-3d");
    expect(result.referencesExistingCapability).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// #242 section capabilities — wire-up regression matrix
// ─────────────────────────────────────────────────────────────────────────
//
// #242 added six soft section dossiers + capability-map entries, but the
// follow-up detector never learned the phrases, so a follow-up like
// "lägg till kundloggor" injected no dossier. These assert each new section
// capability is detected from a realistic short add-prompt, plus the
// carousel/gallery-lightbox disambiguation (image/product-gallery moved off
// carousel) and the control case that genuine slider/carousel asks still map
// to `carousel`.
describe("detectFollowUpCapabilities — #242 section capabilities", () => {
  it("detects 'kundloggor' as `logo-cloud`", () => {
    const result = detectFollowUpCapabilities("lägg till kundloggor under hero");
    expect(result.capabilityIds).toContain("logo-cloud");
    expect(result.capabilityIds).not.toContain("marquee");
  });

  it("detects 'trusted by' logo row as `logo-cloud`", () => {
    const result = detectFollowUpCapabilities("add a trusted by logo strip");
    expect(result.capabilityIds).toContain("logo-cloud");
  });

  it("detects 'nyckeltal/statistik' as `stats-counter`", () => {
    const result = detectFollowUpCapabilities("lägg till nyckeltal/statistik");
    expect(result.capabilityIds).toContain("stats-counter");
    expect(result.capabilityIds).not.toContain("analytics");
  });

  it("detects 'feature cards' / 'tjänstekort' as `feature-grid`", () => {
    const result = detectFollowUpCapabilities("lägg till feature cards/tjänstekort");
    expect(result.capabilityIds).toContain("feature-grid");
  });

  it("detects a bottom 'CTA' as `cta-section`", () => {
    const result = detectFollowUpCapabilities("lägg till en CTA längst ner");
    expect(result.capabilityIds).toContain("cta-section");
  });

  it("does NOT detect cta-section for a layout move of an existing CTA button", () => {
    // Refine/move verb + short prompt → allowDetection gate suppresses it.
    const result = detectFollowUpCapabilities("Flytta CTA-knappen under rubriken");
    expect(result.capabilityIds).not.toContain("cta-section");
  });

  it("detects an enlargeable image gallery as `gallery-lightbox`", () => {
    const result = detectFollowUpCapabilities(
      "lägg till ett bildgalleri där man kan förstora bilder",
    );
    expect(result.capabilityIds).toContain("gallery-lightbox");
    expect(result.capabilityIds).not.toContain("carousel");
  });

  it("detects English 'image gallery' as `gallery-lightbox`, not `carousel`", () => {
    const result = detectFollowUpCapabilities("add an image gallery with a lightbox");
    expect(result.capabilityIds).toContain("gallery-lightbox");
    expect(result.capabilityIds).not.toContain("carousel");
  });

  it("detects a multi-step wizard as `stepper`", () => {
    const result = detectFollowUpCapabilities("gör formuläret till en multi-step wizard");
    expect(result.capabilityIds).toContain("stepper");
    expect(result.capabilityIds).not.toContain("contact-form");
  });

  it("control: an explicit 'bildkarusell' still maps to `carousel`", () => {
    const result = detectFollowUpCapabilities("lägg till en bildkarusell i hero");
    expect(result.capabilityIds).toContain("carousel");
    expect(result.capabilityIds).not.toContain("gallery-lightbox");
  });

  it("control: an explicit 'slider' still maps to `carousel`", () => {
    const result = detectFollowUpCapabilities("lägg till en slider med tre bilder");
    expect(result.capabilityIds).toContain("carousel");
    expect(result.capabilityIds).not.toContain("gallery-lightbox");
  });
});
