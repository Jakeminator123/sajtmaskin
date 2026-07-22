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

describe("detectFollowUpCapabilities — init mode", () => {
  it("accepts first-turn noun phrases without an add verb", () => {
    expect(
      detectFollowUpCapabilities("En enkel sajt med sökfunktion", {
        mode: "init",
      }).capabilityIds,
    ).toContain("site-search");
    expect(
      detectFollowUpCapabilities(
        "En hemsida för café med en karta",
        { mode: "init" },
      ).capabilityIds,
    ).toContain("map-display");
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
  it("detects 'karusell' as `carousel`", () => {
    const result = detectFollowUpCapabilities("ha en karusell med produktbilder");
    expect(result.capabilityIds).toContain("carousel");
  });

  it("detects 'cmd+k' as `command-palette`", () => {
    const result = detectFollowUpCapabilities("lägg till en cmd+k command-palette");
    expect(result.capabilityIds).toContain("command-palette");
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

describe("detectFollowUpCapabilities — parallax (parked 2026-07-22)", () => {
  it("does NOT detect any parallax capability — parallax is freehand guidance now", () => {
    // The parallax dossier pair was parked; a parallax ask is an ordinary
    // content/design edit, never a dossier injection.
    for (const prompt of [
      "ha en pointer-parallax på hero-bilden",
      "lägg till en parallax-effekt",
    ]) {
      const result = detectFollowUpCapabilities(prompt);
      expect(result.capabilityIds).not.toContain("parallax-pointer");
      expect(result.capabilityIds).not.toContain("parallax-scroll");
    }
  });
});

describe("detectFollowUpCapabilities — multiple capabilities", () => {
  it("detects two capabilities when the prompt asks for both", () => {
    const result = detectFollowUpCapabilities(
      "lägg till en kontaktform och en sökfunktion på sajten",
    );
    expect(result.capabilityIds).toContain("contact-form");
    expect(result.capabilityIds).toContain("site-search");
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
// Section capabilities after the 2026-07-22 taxonomy: the #242 content-
// section dossiers (logo-cloud/stats-counter/feature-grid/cta-section/
// stepper/marquee/faq/pricing/testimonials) were PARKED — those phrases are
// ordinary content edits now. What remains here is the carousel vs
// gallery-lightbox disambiguation, which still routes to real dossiers.
// ─────────────────────────────────────────────────────────────────────────
describe("detectFollowUpCapabilities — media section capabilities", () => {
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

  // FP guard (Codex P2 round 2): a gallery with a swipe/slider cue must route
  // to carousel, not the click-to-enlarge lightbox.
  it("routes 'image gallery with swipe navigation' to carousel, not gallery-lightbox", () => {
    const result = detectFollowUpCapabilities("add an image gallery with swipe navigation");
    expect(result.capabilityIds).toContain("carousel");
    expect(result.capabilityIds).not.toContain("gallery-lightbox");
  });

  it("does NOT detect any capability for parked section phrases (content edits now)", () => {
    // Former #242 section-dossier phrases — after parking these are plain
    // content edits and must not select any dossier capability at all.
    for (const prompt of [
      "lägg till kundloggor under hero",
      "lägg till nyckeltal som räknar upp",
      "lägg till feature cards/tjänstekort",
      "lägg till en CTA längst ner",
      "add a multi step form",
      "add scrolling brand logos",
    ]) {
      const ids = detectFollowUpCapabilities(prompt).capabilityIds;
      for (const parked of [
        "logo-cloud",
        "stats-counter",
        "feature-grid",
        "cta-section",
        "stepper",
        "marquee",
        "faq-section",
        "pricing-section",
        "testimonials-section",
      ]) {
        expect(ids).not.toContain(parked);
      }
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Sök & karta — new key-free soft dossiers (2026-07-22): local-site-search
// (`site-search`), maplibre-map (`map-display`) + the command-search →
// command-palette rename (cmdk-command-palette).
// ─────────────────────────────────────────────────────────────────────────
describe("detectFollowUpCapabilities — site-search / map-display / command-palette", () => {
  it("detects 'sök på sajten' as site-search", () => {
    const result = detectFollowUpCapabilities("lägg till sök på sajten");
    expect(result.capabilityIds).toContain("site-search");
  });

  it("detects 'sökfunktion' as site-search", () => {
    const result = detectFollowUpCapabilities("vi vill ha en sökfunktion på sidan");
    expect(result.capabilityIds).toContain("site-search");
  });

  it("detects a hitta-hit map ask as map-display", () => {
    const result = detectFollowUpCapabilities("lägg till en karta som visar hitta hit");
    expect(result.capabilityIds).toContain("map-display");
  });

  it("detects 'visa vår adress på en karta' as map-display (init noun phrase)", () => {
    // No add verb — the phrase is a first-turn noun request, so init mode
    // (which skips the add-verb gate) is the realistic entry point.
    const result = detectFollowUpCapabilities("visa vår adress på en karta", {
      mode: "init",
    });
    expect(result.capabilityIds).toContain("map-display");
  });

  it("detects a 'cmd+k command-palette' ask as command-palette", () => {
    const result = detectFollowUpCapabilities("lägg till en cmd+k command-palette");
    expect(result.capabilityIds).toContain("command-palette");
  });

  it("detects a BARE 'cmd+k' / 'ctrl+k' ask (literal plus sign)", () => {
    // Test-sync finding 2026-07-22: the old pattern class lacked `+`, so the
    // most common literal spelling never matched on its own.
    expect(
      detectFollowUpCapabilities("lägg till cmd+k för snabbnavigering").capabilityIds,
    ).toContain("command-palette");
    expect(
      detectFollowUpCapabilities("lägg till ctrl+k för snabbnavigering").capabilityIds,
    ).toContain("command-palette");
  });

  it("detects bare English 'login' as auth (test-sync gap: 'add supabase login')", () => {
    const result = detectFollowUpCapabilities("add supabase login");
    expect(result.capabilityIds).toContain("auth");
  });

  // Sitemaps/heatmaps are not maps of places (map-display veto).
  it("does NOT detect map-display for sitemap/heatmap asks", () => {
    expect(
      detectFollowUpCapabilities("lägg till en sitemap för sajten").capabilityIds,
    ).not.toContain("map-display");
    expect(
      detectFollowUpCapabilities("add a heatmap of user clicks").capabilityIds,
    ).not.toContain("map-display");
  });

  // The palette is app navigation, not content search (site-search veto).
  it("does NOT detect site-search for a 'command palette' ask", () => {
    const result = detectFollowUpCapabilities("add a command palette");
    expect(result.capabilityIds).not.toContain("site-search");
    expect(result.capabilityIds).toContain("command-palette");
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
// subscriptions — hard dossier promoted from legacy import (2026-07-09):
// paddle-billing. INTENTIONALLY separate from one-off `payments` (Stripe);
// the vocabulary vetoes keep it off one-off payment intent and off newsletter
// "prenumerera på nyhetsbrev".
// ─────────────────────────────────────────────────────────────────────────
describe("detectFollowUpCapabilities — subscriptions", () => {
  it("detects 'prenumerationer med paddle' as subscriptions", () => {
    const result = detectFollowUpCapabilities(
      "lägg till prenumerationer med paddle på prissidan",
    );
    expect(result.capabilityIds).toContain("subscriptions");
  });

  it("detects 'återkommande betalning' as subscriptions (not payments)", () => {
    const result = detectFollowUpCapabilities(
      "vi vill ha återkommande betalning för medlemmarna",
    );
    expect(result.capabilityIds).toContain("subscriptions");
    expect(result.capabilityIds).not.toContain("payments");
  });

  it("detects 'medlemskap' as subscriptions", () => {
    const result = detectFollowUpCapabilities("lägg till ett medlemskap med månadsavgift");
    expect(result.capabilityIds).toContain("subscriptions");
  });

  it("detects English 'recurring subscription billing'", () => {
    const result = detectFollowUpCapabilities("add recurring subscription billing for members");
    expect(result.capabilityIds).toContain("subscriptions");
  });

  it("detects an English 'subscription plan with Paddle' ask", () => {
    const result = detectFollowUpCapabilities("we want a subscription plan with Paddle");
    expect(result.capabilityIds).toContain("subscriptions");
  });

  // Veto: a one-off payment is `payments` (Stripe), never `subscriptions`.
  it("does NOT detect subscriptions for a one-off payment ask", () => {
    const result = detectFollowUpCapabilities(
      "lägg till stripe-checkout för en engångsbetalning, inte prenumeration",
    );
    expect(result.capabilityIds).not.toContain("subscriptions");
    expect(result.capabilityIds).toContain("payments");
  });

  // Veto: "prenumerera på nyhetsbrev" is a newsletter signup, not billing.
  it("does NOT detect subscriptions for a newsletter signup", () => {
    const result = detectFollowUpCapabilities(
      "lägg till ett nyhetsbrev där man kan prenumerera",
    );
    expect(result.capabilityIds).not.toContain("subscriptions");
    expect(result.capabilityIds).toContain("newsletter-subscribe");
  });

  // Control: a plain Stripe checkout stays `payments`, does not leak into
  // the new `subscriptions` capability.
  it("keeps a plain stripe-checkout ask on payments only", () => {
    const result = detectFollowUpCapabilities("lägg till stripe-checkout på prissidan");
    expect(result.capabilityIds).toContain("payments");
    expect(result.capabilityIds).not.toContain("subscriptions");
  });

  // Veto (Codex P2 dossier-batch): a bare "subscribe form" is an email signup,
  // not recurring billing — the bare English "subscribe" token was removed from
  // the subscriptions pattern so it no longer competes with newsletter-subscribe.
  it("does NOT detect subscriptions for a plain 'subscribe form'", () => {
    const result = detectFollowUpCapabilities("add a subscribe form to the footer");
    expect(result.capabilityIds).not.toContain("subscriptions");
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

// ─────────────────────────────────────────────────────────────────────────
// Auth after the 2026-07-22 merge: `supabase-auth` is no longer a separate
// capability — clerk-auth (default) and supabase-auth are provider SIBLINGS
// under one `auth` capability. Detection always emits `auth`; the provider
// choice ("logga in med supabase") is resolved later in select.ts via the
// supabase-auth manifest relevanceKeywords against the raw prompt. Exactly
// one auth dossier is ever selected, so no root-middleware collision.
// ─────────────────────────────────────────────────────────────────────────
describe("detectFollowUpCapabilities — auth (merged capability)", () => {
  it("routes generic Swedish 'inloggning' to auth", () => {
    const result = detectFollowUpCapabilities("vi behöver inloggning med lösenord");
    expect(result.capabilityIds).toContain("auth");
    expect(result.capabilityIds).not.toContain("supabase-auth");
  });

  it("routes generic 'logga in' to auth", () => {
    const result = detectFollowUpCapabilities(
      "lägg till så att användare kan logga in och se sina sidor",
    );
    expect(result.capabilityIds).toContain("auth");
    expect(result.capabilityIds).not.toContain("supabase-auth");
  });

  it("routes generic English 'login/sign in' to auth", () => {
    const result = detectFollowUpCapabilities("add a login page with sign-in and sign-up");
    expect(result.capabilityIds).toContain("auth");
    expect(result.capabilityIds).not.toContain("supabase-auth");
  });

  it("detects a supabase login ask as auth (provider resolved later via keywords)", () => {
    const result = detectFollowUpCapabilities(
      "lägg till supabase login så att medlemmar kan logga in",
    );
    expect(result.capabilityIds).toContain("auth");
    expect(result.capabilityIds).not.toContain("supabase-auth");
  });

  it("detects 'supabase auth' as auth, never a separate supabase-auth capability", () => {
    const result = detectFollowUpCapabilities("add supabase auth with magic links");
    expect(result.capabilityIds).toContain("auth");
    expect(result.capabilityIds).not.toContain("supabase-auth");
  });

  it("detects Swedish 'supabase-inloggning' as auth", () => {
    const result = detectFollowUpCapabilities("vi vill ha supabase-inloggning för medlemmar");
    expect(result.capabilityIds).toContain("auth");
    expect(result.capabilityIds).not.toContain("supabase-auth");
  });

  it("detects '<auth cue> med/with supabase' phrasing as auth", () => {
    const swedish = detectFollowUpCapabilities("lägg till inloggning med supabase");
    expect(swedish.capabilityIds).toContain("auth");
    expect(swedish.capabilityIds).not.toContain("supabase-auth");

    const english = detectFollowUpCapabilities("add sign-in with supabase");
    expect(english.capabilityIds).toContain("auth");
    expect(english.capabilityIds).not.toContain("supabase-auth");
  });

  it("does NOT detect auth for a Supabase DATABASE ask (no auth cue)", () => {
    // "supabase" alone is a BaaS/database choice, not an auth ask — and the
    // database vocabulary vetoes competing BaaS providers, so nothing fires.
    const result = detectFollowUpCapabilities("spara bokningarna i supabase");
    expect(result.capabilityIds).not.toContain("supabase-auth");
    expect(result.capabilityIds).not.toContain("auth");
  });

  it("suppresses auth when the user explicitly negates it", () => {
    const result = detectFollowUpCapabilities(
      "bygg en landningssida, lägg inte till supabase-inloggning eller auth",
    );
    expect(result.capabilityIds).not.toContain("supabase-auth");
    expect(result.capabilityIds).not.toContain("auth");
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Legacy import final wave — capability `rag-chat` (2026-07-09). The core
// invariant: rag-chat must NOT compete with ai-chat (openai-chat owns generic
// chatbots). Explicit retrieval intent → rag-chat ONLY (both dossiers ship an
// /api/chat route — double-injection would collide); bare "chatbot" → ai-chat.
// ─────────────────────────────────────────────────────────────────────────
describe("detectFollowUpCapabilities — rag-chat", () => {
  // THE locked pair from the promotion brief.
  it("routes a bare 'chatbot' to ai-chat, never rag-chat", () => {
    const result = detectFollowUpCapabilities("lägg till en chatbot");
    expect(result.capabilityIds).toContain("ai-chat");
    expect(result.capabilityIds).not.toContain("rag-chat");
  });

  it("routes 'chatbot som svarar från våra dokument' to rag-chat, not ai-chat", () => {
    const result = detectFollowUpCapabilities(
      "lägg till en chatbot som svarar från våra dokument",
    );
    expect(result.capabilityIds).toContain("rag-chat");
    expect(result.capabilityIds).not.toContain("ai-chat");
  });

  it("detects an explicit 'rag' ask", () => {
    const result = detectFollowUpCapabilities("lägg till rag-chat på sajten");
    expect(result.capabilityIds).toContain("rag-chat");
    expect(result.capabilityIds).not.toContain("ai-chat");
  });

  it("detects 'kunskapsbas-chat'", () => {
    const result = detectFollowUpCapabilities("vi vill ha en kunskapsbas-chat");
    expect(result.capabilityIds).toContain("rag-chat");
    expect(result.capabilityIds).not.toContain("ai-chat");
  });

  it("detects 'chatta med våra dokument'", () => {
    const result = detectFollowUpCapabilities(
      "lägg till att besökare kan chatta med våra dokument",
    );
    expect(result.capabilityIds).toContain("rag-chat");
  });

  it("detects 'dokument-Q&A'", () => {
    const result = detectFollowUpCapabilities("bygg en dokument-Q&A på hjälpsidan");
    expect(result.capabilityIds).toContain("rag-chat");
    expect(result.capabilityIds).not.toContain("ai-chat");
  });

  it("detects English 'chatbot that answers from our documents' as rag-chat", () => {
    const result = detectFollowUpCapabilities(
      "add a chatbot that answers from our documents",
    );
    expect(result.capabilityIds).toContain("rag-chat");
    expect(result.capabilityIds).not.toContain("ai-chat");
  });

  // Vector-store asks: the `database` capability vetoes them on purpose
  // (its veto comment points here) — they must land on rag-chat instead.
  it("routes a vector-store ask to rag-chat, not database", () => {
    const result = detectFollowUpCapabilities(
      "lägg till en vektor-databas för semantisk sökning",
    );
    expect(result.capabilityIds).toContain("rag-chat");
    expect(result.capabilityIds).not.toContain("database");
  });

  // Control: an explicitly simple chatbot must stay ai-chat (same guard as
  // ai-tool-calling — "svarar på vanliga frågor" is not a retrieval clause).
  it("does NOT detect rag-chat for an explicitly simple chatbot", () => {
    const result = detectFollowUpCapabilities(
      "vi vill ha en enkel chatbot som svarar på vanliga frågor",
    );
    expect(result.capabilityIds).not.toContain("rag-chat");
    expect(result.capabilityIds).toContain("ai-chat");
  });

  // Control: an ai-chat widget ask stays ai-chat.
  it("does NOT detect rag-chat for 'lägg till en ai-chatt-widget'", () => {
    const result = detectFollowUpCapabilities("lägg till en ai-chatt-widget");
    expect(result.capabilityIds).not.toContain("rag-chat");
    expect(result.capabilityIds).toContain("ai-chat");
  });

  // Tool-calling and RAG stay separate capabilities: a tool-calling ask with
  // no retrieval clause must not light up rag-chat.
  it("does NOT detect rag-chat for a plain tool-calling ask", () => {
    const result = detectFollowUpCapabilities(
      "lägg till en ai-chat med tool-calling mot vårt api",
    );
    expect(result.capabilityIds).toContain("ai-tool-calling");
    expect(result.capabilityIds).not.toContain("rag-chat");
  });
});
