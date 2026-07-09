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

// ─────────────────────────────────────────────────────────────────────────
// #250 Codex P2 — false-positive guards
// ─────────────────────────────────────────────────────────────────────────
//
// Codex flagged four precision regressions in the #242 wiring. Each pair below
// pins the exact false-positive example from the review plus a gated positive
// that proves the capability still detects genuine requests.
describe("detectFollowUpCapabilities — #250 Codex P2 false-positive guards", () => {
  // 1. logo-cloud: bare Swedish "som syns i" / "används av" must need a logo cue.
  it("does NOT detect logo-cloud for 'en knapp som syns i menyn'", () => {
    const result = detectFollowUpCapabilities("lägg till en knapp som syns i menyn");
    expect(result.capabilityIds).not.toContain("logo-cloud");
  });

  it("does NOT detect logo-cloud for 'en regel som används av admins'", () => {
    const result = detectFollowUpCapabilities("lägg till en regel som används av admins");
    expect(result.capabilityIds).not.toContain("logo-cloud");
  });

  it("still detects logo-cloud when a media cue follows ('som syns i medier')", () => {
    const result = detectFollowUpCapabilities("lägg till en sektion som syns i medier");
    expect(result.capabilityIds).toContain("logo-cloud");
  });

  // 2. stepper: bare "flera steg" must be tied to a form/wizard/process flow.
  it("does NOT detect stepper for 'gör knappen flera steg större'", () => {
    const result = detectFollowUpCapabilities("gör knappen flera steg större");
    expect(result.capabilityIds).not.toContain("stepper");
  });

  it("still detects stepper for a genuine multi-step form ('formuläret till flera steg')", () => {
    const result = detectFollowUpCapabilities("gör om formuläret till flera steg");
    expect(result.capabilityIds).toContain("stepper");
  });

  // 3. cta-section: bare "cta" must not fire on a CTA *button* tweak.
  it("does NOT detect cta-section for 'gör CTA-knappen större'", () => {
    const result = detectFollowUpCapabilities("gör CTA-knappen större");
    expect(result.capabilityIds).not.toContain("cta-section");
  });

  it("still detects cta-section for a bottom CTA add ('lägg till en CTA längst ner')", () => {
    const result = detectFollowUpCapabilities("lägg till en CTA längst ner");
    expect(result.capabilityIds).toContain("cta-section");
  });

  // 4. stats-counter: the StatCounter analytics provider is not a KPI band.
  it("does NOT detect stats-counter for 'koppla på StatCounter'", () => {
    const result = detectFollowUpCapabilities("koppla på StatCounter");
    expect(result.capabilityIds).not.toContain("stats-counter");
  });

  it("still detects stats-counter for a genuine KPI band ('lägg till nyckeltal')", () => {
    const result = detectFollowUpCapabilities("lägg till nyckeltal som räknar upp");
    expect(result.capabilityIds).toContain("stats-counter");
  });
});

// ─────────────────────────────────────────────────────────────────────────
// #250 Codex P2 — round 2 (re-review of the fix commit)
// ─────────────────────────────────────────────────────────────────────────
//
// The re-review surfaced two more false-positives (slider-gallery, scrolling
// logos) and four English/plural coverage gaps. Each is pinned here.
describe("detectFollowUpCapabilities — #250 Codex P2 round 2", () => {
  // FP: a gallery with a swipe/slider cue must route to carousel, not lightbox.
  it("routes 'image gallery with swipe navigation' to carousel, not gallery-lightbox", () => {
    const result = detectFollowUpCapabilities("add an image gallery with swipe navigation");
    expect(result.capabilityIds).toContain("carousel");
    expect(result.capabilityIds).not.toContain("gallery-lightbox");
  });

  it("still detects gallery-lightbox for a plain enlargeable gallery (no slider cue)", () => {
    const result = detectFollowUpCapabilities("add an image gallery with a lightbox");
    expect(result.capabilityIds).toContain("gallery-lightbox");
    expect(result.capabilityIds).not.toContain("carousel");
  });

  // FP: a scrolling logo strip is marquee, not the static logo-cloud.
  it("routes 'scrolling brand logos' to marquee, not logo-cloud", () => {
    const result = detectFollowUpCapabilities("add scrolling brand logos");
    expect(result.capabilityIds).toContain("marquee");
    expect(result.capabilityIds).not.toContain("logo-cloud");
  });

  // Coverage: English customer/client/partner logo phrasings.
  it("detects English 'customer logos' / 'client logos' / 'partner logos' as logo-cloud", () => {
    for (const prompt of [
      "add customer logos under the hero",
      "add client logos",
      "add partner logos",
    ]) {
      expect(detectFollowUpCapabilities(prompt).capabilityIds).toContain("logo-cloud");
    }
  });

  // Coverage: canonical "stats row" / "by the numbers" phrasing.
  it("detects 'stats row' and 'by the numbers strip' as stats-counter", () => {
    expect(detectFollowUpCapabilities("add a stats row").capabilityIds).toContain(
      "stats-counter",
    );
    expect(
      detectFollowUpCapabilities("add a by the numbers strip").capabilityIds,
    ).toContain("stats-counter");
  });

  // Coverage: plural "features section/grid" + "services grid".
  it("detects plural 'features section' and 'services grid' as feature-grid", () => {
    expect(detectFollowUpCapabilities("add a features section").capabilityIds).toContain(
      "feature-grid",
    );
    expect(detectFollowUpCapabilities("add a services grid").capabilityIds).toContain(
      "feature-grid",
    );
  });

  // Coverage: spaced "multi step" spelling.
  it("detects spaced 'multi step form' as stepper", () => {
    const result = detectFollowUpCapabilities("add a multi step form");
    expect(result.capabilityIds).toContain("stepper");
  });

  // FP residual: bare CTA + size adjective ("gör CTA större") is a refine.
  it("does NOT detect cta-section for 'gör CTA större'", () => {
    const result = detectFollowUpCapabilities("gör CTA större");
    expect(result.capabilityIds).not.toContain("cta-section");
  });
});

// ─────────────────────────────────────────────────────────────────────────
// dashboard-charts — soft dossier promoted from legacy import (2026-07-08)
// ─────────────────────────────────────────────────────────────────────────
describe("detectFollowUpCapabilities — dashboard-charts", () => {
  it("detects 'lägg till ett diagram' as dashboard-charts", () => {
    const result = detectFollowUpCapabilities("lägg till ett diagram över försäljningen");
    expect(result.capabilityIds).toContain("dashboard-charts");
  });

  it("detects an English chart ask ('add a line chart')", () => {
    const result = detectFollowUpCapabilities("add a line chart with monthly revenue");
    expect(result.capabilityIds).toContain("dashboard-charts");
  });

  it("detects a dashboard page ask ('lägg till en dashboard-sida med grafer')", () => {
    const result = detectFollowUpCapabilities("lägg till en dashboard-sida med grafer");
    expect(result.capabilityIds).toContain("dashboard-charts");
  });

  // Veto: analytics-provider hookups route to `analytics`, not a chart section.
  it("does NOT detect dashboard-charts for 'koppla på Google Analytics'", () => {
    const result = detectFollowUpCapabilities("koppla på Google Analytics");
    expect(result.capabilityIds).not.toContain("dashboard-charts");
  });

  // Veto: flow/org diagrams are structural drawings, not data charts.
  it("does NOT detect dashboard-charts for 'rita ett flödesschema'", () => {
    const result = detectFollowUpCapabilities("rita ett flödesschema för processen");
    expect(result.capabilityIds).not.toContain("dashboard-charts");
  });

  // Codex/VADE P2 PR #422: spaced English forms must also be vetoed — the bare
  // `chart` noun would otherwise match "flow chart" / "org chart".
  it("does NOT detect dashboard-charts for spaced 'flow chart' / 'org chart'", () => {
    expect(
      detectFollowUpCapabilities("add a flow chart for onboarding").capabilityIds,
    ).not.toContain("dashboard-charts");
    expect(
      detectFollowUpCapabilities("add an org chart for the team").capabilityIds,
    ).not.toContain("dashboard-charts");
    expect(
      detectFollowUpCapabilities("add an organizational chart").capabilityIds,
    ).not.toContain("dashboard-charts");
  });

  // Bugbot PR #422: a size tweak of an existing chart is a refine, not an add.
  it("does NOT detect dashboard-charts for 'gör diagrammet större'", () => {
    const result = detectFollowUpCapabilities("gör diagrammet större");
    expect(result.capabilityIds).not.toContain("dashboard-charts");
  });

  it("does NOT detect dashboard-charts for 'gör grafen bredare'", () => {
    const result = detectFollowUpCapabilities("gör grafen bredare");
    expect(result.capabilityIds).not.toContain("dashboard-charts");
  });

  // Bugbot PR #422: an explicit chart-library choice must not pull in VisActor.
  it("does NOT detect dashboard-charts for a Chart.js integration ask", () => {
    const result = detectFollowUpCapabilities("integrera Chart.js på sidan");
    expect(result.capabilityIds).not.toContain("dashboard-charts");
  });

  it("does NOT detect dashboard-charts for 'använd recharts för graferna'", () => {
    const result = detectFollowUpCapabilities("använd recharts för graferna");
    expect(result.capabilityIds).not.toContain("dashboard-charts");
  });

  // Codex P2 round 2 (PR #422): an intensity adverb between the noun and the
  // size adjective must not defeat the refine-guard.
  it("does NOT detect dashboard-charts for adverbial size tweaks", () => {
    expect(
      detectFollowUpCapabilities("gör diagrammet mycket större").capabilityIds,
    ).not.toContain("dashboard-charts");
    expect(
      detectFollowUpCapabilities("gör grafen lite bredare").capabilityIds,
    ).not.toContain("dashboard-charts");
    expect(
      detectFollowUpCapabilities("make the chart way bigger").capabilityIds,
    ).not.toContain("dashboard-charts");
    expect(
      detectFollowUpCapabilities("make the chart a bit smaller").capabilityIds,
    ).not.toContain("dashboard-charts");
  });

  // Codex P2 round 2 (PR #422): spaced/hyphenated Chart.js spellings are still
  // an explicit library choice — must not inject VisActor.
  it("does NOT detect dashboard-charts for spaced 'chart js' spellings", () => {
    expect(
      detectFollowUpCapabilities("lägg till chart js på sidan").capabilityIds,
    ).not.toContain("dashboard-charts");
    expect(
      detectFollowUpCapabilities("add chart-js to the page").capabilityIds,
    ).not.toContain("dashboard-charts");
  });

  // Guard sanity: the widened lookaheads must not eat real adds that happen to
  // contain an adverb or "js" further on in the sentence.
  it("still detects real chart adds despite the widened guards", () => {
    expect(
      detectFollowUpCapabilities("lägg till ett diagram med mycket data").capabilityIds,
    ).toContain("dashboard-charts");
    expect(
      detectFollowUpCapabilities("add a chart showing js framework popularity").capabilityIds,
    ).toContain("dashboard-charts");
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Dossier wave 1 — hard integration capabilities promoted from legacy import
// (2026-07-08): realtime (ably-realtime), image-generation
// (fal-image-generation), ai-tool-calling (ai-tool-calling-chat).
// ─────────────────────────────────────────────────────────────────────────
describe("detectFollowUpCapabilities — realtime", () => {
  it("detects 'realtidschat' as realtime", () => {
    const result = detectFollowUpCapabilities(
      "lägg till en realtidschat mellan besökarna",
    );
    expect(result.capabilityIds).toContain("realtime");
  });

  it("detects an explicit Ably/websocket ask", () => {
    const result = detectFollowUpCapabilities("koppla på ably för live-notiser");
    expect(result.capabilityIds).toContain("realtime");
  });

  it("detects English 'real-time notifications'", () => {
    const result = detectFollowUpCapabilities("add real-time notifications for new orders");
    expect(result.capabilityIds).toContain("realtime");
  });

  it("detects presence ('vem som är online')", () => {
    const result = detectFollowUpCapabilities(
      "visa vem som är online, vi vill ha närvaro-status i chatten",
    );
    expect(result.capabilityIds).toContain("realtime");
  });

  // Veto: real-time ANALYTICS is an analytics/dashboard ask, not messaging infra.
  it("does NOT detect realtime for 'real-time analytics dashboard'", () => {
    const result = detectFollowUpCapabilities("add a real-time analytics dashboard");
    expect(result.capabilityIds).not.toContain("realtime");
  });

  it("does NOT detect realtime for 'realtidsstatistik över besökare'", () => {
    const result = detectFollowUpCapabilities(
      "lägg till realtidsstatistik över besökare på sidan",
    );
    expect(result.capabilityIds).not.toContain("realtime");
  });

  // Veto exercise: a genuine live-updates phrase is suppressed when the
  // surrounding ask is a realtime DASHBOARD (analytics/statistics surface).
  it("vetoes live-uppdateringar when tied to a realtime dashboard", () => {
    const result = detectFollowUpCapabilities(
      "lägg till live-uppdateringar på realtids-dashboarden",
    );
    expect(result.capabilityIds).not.toContain("realtime");
  });
});

describe("detectFollowUpCapabilities — image-generation", () => {
  it("detects 'AI-bildgenerator' as image-generation", () => {
    const result = detectFollowUpCapabilities("lägg till en AI-bildgenerator på sidan");
    expect(result.capabilityIds).toContain("image-generation");
  });

  it("detects a visitor-facing generation ask", () => {
    const result = detectFollowUpCapabilities(
      "användare ska kunna generera bilder från en textprompt",
    );
    expect(result.capabilityIds).toContain("image-generation");
  });

  it("detects English 'text-to-image' and Fal model names", () => {
    expect(
      detectFollowUpCapabilities("add a text-to-image tool").capabilityIds,
    ).toContain("image-generation");
    expect(
      detectFollowUpCapabilities("lägg till fal flux-schnell för bildgenerering").capabilityIds,
    ).toContain("image-generation");
  });

  // Veto: galleries/lightboxes SHOW images — they do not generate them.
  it("does NOT detect image-generation for a gallery/lightbox ask", () => {
    const result = detectFollowUpCapabilities(
      "lägg till ett bildgalleri där man kan förstora bilder",
    );
    expect(result.capabilityIds).not.toContain("image-generation");
    expect(result.capabilityIds).toContain("gallery-lightbox");
  });

  it("does NOT detect image-generation for a photo carousel ask", () => {
    const result = detectFollowUpCapabilities("lägg till en karusell med foton");
    expect(result.capabilityIds).not.toContain("image-generation");
  });

  it("does NOT detect image-generation for stock/hero imagery requests", () => {
    const result = detectFollowUpCapabilities(
      "lägg till stock-bilder och en hero-bild på startsidan",
    );
    expect(result.capabilityIds).not.toContain("image-generation");
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Dossier wave 2 — capability `database` (2026-07-08): postgres-drizzle
// (default) + neon-postgres + mongodb-atlas share the capability; provider
// disambiguation happens later in select.ts via manifest relevanceKeywords.
// Detection only needs to say "the user wants a database".
// ─────────────────────────────────────────────────────────────────────────
describe("detectFollowUpCapabilities — database", () => {
  it("detects a generic Swedish database ask ('spara ... i en databas')", () => {
    const result = detectFollowUpCapabilities(
      "lägg till så att bokningar sparas i en databas",
    );
    expect(result.capabilityIds).toContain("database");
  });

  it("detects an explicit MongoDB ask", () => {
    const result = detectFollowUpCapabilities("lägg till mongodb för produkterna");
    expect(result.capabilityIds).toContain("database");
  });

  it("detects an explicit Neon ask (DB-flavoured compound)", () => {
    const result = detectFollowUpCapabilities(
      "vi vill ha neon postgres som databas för medlemmarna",
    );
    expect(result.capabilityIds).toContain("database");
  });

  it("detects an English database ask ('store orders in a database')", () => {
    const result = detectFollowUpCapabilities(
      "add a feature to store orders in a database",
    );
    expect(result.capabilityIds).toContain("database");
  });

  // Veto: vector stores belong to the coming rag-chat capability.
  it("does NOT detect database for a vector-store ask", () => {
    const result = detectFollowUpCapabilities(
      "lägg till en vektor-databas för semantisk sökning",
    );
    expect(result.capabilityIds).not.toContain("database");
  });

  // Veto: visitor tracking is an analytics ask even when phrased with "databas".
  it("does NOT detect database for a tracking ask ('spåra besökare i en databas')", () => {
    const result = detectFollowUpCapabilities(
      "lägg till så att vi kan spåra besökare i en databas",
    );
    expect(result.capabilityIds).not.toContain("database");
    expect(result.capabilityIds).toContain("analytics");
  });

  // Veto: explicit competing ORM/BaaS choice must not inject our stack
  // (Chart.js precedent from dashboard-charts).
  it("does NOT detect database for an explicit Prisma choice", () => {
    const result = detectFollowUpCapabilities(
      "lägg till en databas med prisma som orm",
    );
    expect(result.capabilityIds).not.toContain("database");
  });

  // Design word "neon" must not be read as the Neon database provider.
  it("does NOT detect database for neon styling asks", () => {
    const result = detectFollowUpCapabilities("gör hero-sektionen i neon-stil");
    expect(result.capabilityIds).not.toContain("database");
  });

  // Negation guard: "utan databas" suppresses the capability.
  it("does NOT detect database when the user explicitly forbids a backend", () => {
    const result = detectFollowUpCapabilities(
      "lägg till en bokningssektion, utan databas eller backend",
    );
    expect(result.capabilityIds).not.toContain("database");
  });

  // Bugbot (wave 2 pre-PR pass): a negated PROVIDER must not suppress the
  // capability — "inte postgres" is a provider preference, and the explicit
  // MongoDB ask in the same prompt must still reach the dossier selector
  // (which resolves mongo via relevanceKeywords).
  it("still detects database when only a provider is negated ('mongodb, inte postgres')", () => {
    const result = detectFollowUpCapabilities(
      "lägg till mongodb för ordrarna, inte postgres",
    );
    expect(result.capabilityIds).toContain("database");
  });

  it("still detects database for 'använd mongodb utan drizzle'", () => {
    const result = detectFollowUpCapabilities(
      "vi vill ha mongodb utan drizzle för produktdatan",
    );
    expect(result.capabilityIds).toContain("database");
  });
});

describe("detectFollowUpCapabilities — ai-tool-calling", () => {
  it("detects 'tool-calling' as ai-tool-calling (not plain ai-chat)", () => {
    const result = detectFollowUpCapabilities(
      "lägg till en ai-chat med tool-calling mot vårt api",
    );
    expect(result.capabilityIds).toContain("ai-tool-calling");
    expect(result.capabilityIds).not.toContain("ai-chat");
  });

  it("detects an assistant that uses tools ('assistent som använder verktyg')", () => {
    const result = detectFollowUpCapabilities(
      "vi behöver en ai-assistent som använder verktyg för att slå upp ordersstatus",
    );
    expect(result.capabilityIds).toContain("ai-tool-calling");
    expect(result.capabilityIds).not.toContain("ai-chat");
  });

  it("detects English 'function calling' chat", () => {
    const result = detectFollowUpCapabilities(
      "add a chatbot with function-calling so it can execute tools",
    );
    expect(result.capabilityIds).toContain("ai-tool-calling");
    expect(result.capabilityIds).not.toContain("ai-chat");
  });

  // Veto/control: a plain conversational chatbot stays ai-chat.
  it("does NOT detect ai-tool-calling for a plain chatbot ask", () => {
    const result = detectFollowUpCapabilities("lägg till en ai-chatt-widget");
    expect(result.capabilityIds).not.toContain("ai-tool-calling");
    expect(result.capabilityIds).toContain("ai-chat");
  });

  it("does NOT detect ai-tool-calling for an explicitly simple chatbot", () => {
    const result = detectFollowUpCapabilities(
      "vi vill ha en enkel chatbot som svarar på vanliga frågor",
    );
    expect(result.capabilityIds).not.toContain("ai-tool-calling");
    expect(result.capabilityIds).toContain("ai-chat");
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Dossier Fas D — capability `cms` (2026-07-09): sanity-cms (default).
// Detection only says "the user wants a headless CMS"; Sanity is the
// capability default in select.ts.
// ─────────────────────────────────────────────────────────────────────────
describe("detectFollowUpCapabilities — cms", () => {
  it("detects 'lägg till ett cms' as cms", () => {
    const result = detectFollowUpCapabilities("lägg till ett cms för blogginläggen");
    expect(result.capabilityIds).toContain("cms");
  });

  it("detects an explicit Sanity ask ('koppla på sanity')", () => {
    const result = detectFollowUpCapabilities("koppla på sanity för innehållet");
    expect(result.capabilityIds).toContain("cms");
  });

  it("detects 'innehållshantering'", () => {
    const result = detectFollowUpCapabilities(
      "vi behöver innehållshantering för nyhetssidan",
    );
    expect(result.capabilityIds).toContain("cms");
  });

  it("detects English 'headless CMS'", () => {
    const result = detectFollowUpCapabilities("add a headless cms for the blog posts");
    expect(result.capabilityIds).toContain("cms");
  });

  it("detects an edit-content-without-code ask", () => {
    const result = detectFollowUpCapabilities(
      "gör så att vi kan redigera innehållet utan kod",
    );
    expect(result.capabilityIds).toContain("cms");
  });

  it("detects an editors-can-publish ask", () => {
    const result = detectFollowUpCapabilities(
      "lägg till så att redaktörerna kan publicera nyheter själva",
    );
    expect(result.capabilityIds).toContain("cms");
  });

  // Veto: an explicit competing CMS choice must not inject the Sanity dossier
  // (Chart.js precedent from dashboard-charts).
  it("does NOT detect cms for an explicit WordPress choice", () => {
    const result = detectFollowUpCapabilities("lägg till wordpress som cms för bloggen");
    expect(result.capabilityIds).not.toContain("cms");
  });

  it("does NOT detect cms for an explicit Contentful choice", () => {
    const result = detectFollowUpCapabilities("lägg till ett cms med contentful");
    expect(result.capabilityIds).not.toContain("cms");
  });

  // "sanity check" is an ordinary English phrase, not the Sanity provider.
  it("does NOT detect cms for 'gör en sanity check på formuläret'", () => {
    const result = detectFollowUpCapabilities("gör en sanity check på formuläret");
    expect(result.capabilityIds).not.toContain("cms");
  });

  // A plain content tweak is a refine, never a CMS integration ask.
  it("does NOT detect cms for an ordinary content edit", () => {
    const result = detectFollowUpCapabilities("ändra innehållet i hero-sektionen");
    expect(result.capabilityIds).not.toContain("cms");
  });

  // Negation guard: "utan cms" suppresses the capability.
  it("does NOT detect cms when the user explicitly forbids one", () => {
    const result = detectFollowUpCapabilities(
      "bygg en enkel statisk blogg utan cms eller backend",
    );
    expect(result.capabilityIds).not.toContain("cms");
  });
});
