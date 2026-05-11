import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./scaffold-search", () => ({
  searchScaffoldsWithDiagnostics: vi.fn(),
}));

import { searchScaffoldsWithDiagnostics } from "./scaffold-search";
import { getScaffoldById } from "./registry";
import { matchScaffold, matchScaffoldAuto } from "./matcher";

const mockedSearchScaffoldsWithDiagnostics = vi.mocked(searchScaffoldsWithDiagnostics);

describe("matchScaffold", () => {
  beforeEach(() => {
    mockedSearchScaffoldsWithDiagnostics.mockReset();
  });

  it("prefers portfolio for photography gallery prompts with strong visual direction", () => {
    const prompt =
      "Skapa en vacker och harmonisk hemsida för en fotostudio med sex fotografier från Palma och en separat Gallery-sida.";

    expect(matchScaffold(prompt, "website")?.id).toBe("portfolio");
  });

  it("does not route named restaurant prompts to an ecommerce-like scaffold", () => {
    const prompt =
      "Jag vill ha en hemsida för restaurangen Marias matrestaurang med meny, om oss, bokning och kontakt.";

    expect(matchScaffold(prompt, "website")?.id).toBe("landing-page");
  });

  it("does not route restaurant prompts with product-like words to ecommerce", () => {
    const prompt =
      "Bygg en varm hemsida för en restaurang med meny, produkter som rätter och boka bord. Gult och rött tema.";

    const result = matchScaffold(prompt, "website");
    expect(result?.id).not.toBe("ecommerce");
  });

  it("does not route hotel or spa prompts to ecommerce", () => {
    const prompt =
      "Skapa en sajt för ett boutiquehotell med rum, spa, restaurang och bokning.";

    expect(matchScaffold(prompt, "website")?.id).not.toBe("ecommerce");
  });

  it("does not route café prompts to ecommerce", () => {
    const prompt =
      "Jag vill ha en hemsida för mitt café med meny, öppettider och om oss.";

    expect(matchScaffold(prompt, "website")?.id).not.toBe("ecommerce");
  });

  it("still selects ecommerce when strong ecommerce intent is present alongside hospitality", () => {
    const prompt =
      "Bygg en webshop för en restaurang som säljer produkter online med varukorg och checkout.";

    expect(matchScaffold(prompt, "website")?.id).toBe("ecommerce");
  });

  it("does not over-promote generic company gallery sites to portfolio", () => {
    const prompt =
      "Bygg en företagshemsida för ett konsultbolag med galleri, tjänster, testimonials och kontakt.";

    expect(matchScaffold(prompt, "website")?.id).toBe("landing-page");
  });

  it("keeps website intent on content scaffolds for app-like cinematic marketing prompts", () => {
    const prompt =
      'Jag vill ha en hemsida som är mycket app-lik med en massa coola 3dsaker och filmisk neon-känsla för en UFO-komedi.';

    const result = matchScaffold(prompt, "website");
    expect(result?.id).not.toBe("app-shell");
    expect(result?.id).not.toBe("dashboard");
  });

  // Game-intent gate: interactive-game prompts belong on base-nextjs
  // (website intent) or app-shell (app intent), not landing-page /
  // portfolio / saas-landing. The marketing-scaffold chrome (hero,
  // features, pricing, testimonials) directly competes with the
  // playable area and confuses the codegen LLM.
  it("routes a Pac-Man prompt to base-nextjs, not landing-page", () => {
    expect(matchScaffold("Bygg Pac-Man med delfiner", "website")?.id).toBe(
      "base-nextjs",
    );
  });

  it("routes a Snake-game prompt to base-nextjs for website intent", () => {
    expect(matchScaffold("Bygg ett snake-game på startsidan", "website")?.id).toBe(
      "base-nextjs",
    );
  });

  it("routes a platformer prompt to base-nextjs", () => {
    expect(matchScaffold("Bygg en platformer med pixelgrafik", "website")?.id).toBe(
      "base-nextjs",
    );
  });

  it("routes a tv-spel prompt to base-nextjs", () => {
    expect(matchScaffold("Bygg ett tv-spel för barnen", "website")?.id).toBe(
      "base-nextjs",
    );
  });

  it("routes a mini-game prompt to app-shell when intent is app", () => {
    expect(matchScaffold("Bygg ett mini-game", "app")?.id).toBe("app-shell");
  });

  it("does NOT reroute a gaming-news blog prompt to base-nextjs", () => {
    // "gaming-news" + "blog" is a content site, not a game build.
    // The sync matcher's GAME_SYNC_PATTERN must not match "gaming-news"
    // alone — a real game noun or verb is required.
    const result = matchScaffold(
      "Bygg en gaming-news blog med senaste spel-nyheterna",
      "website",
    );
    expect(result?.id).not.toBe("base-nextjs");
  });

  it("does NOT reroute a 'gaming news' (space-separated) blog to base-nextjs", () => {
    // Post-review regression guard: the veto used to require a hyphen
    // between "gaming" and "news"/"blog". Space-separated phrases now
    // match too.
    const result = matchScaffold(
      "Bygg en gaming news portal med recensioner",
      "website",
    );
    expect(result?.id).not.toBe("base-nextjs");
  });

  it("does NOT reroute a 'tv-spel butik' retail prompt to base-nextjs", () => {
    // "tv-spel butik" (space between tv-spel and butik) is a retail
    // store, not a game build. `GAME_SYNC_PATTERN` still matches
    // `tv-spel`, but `GAME_SYNC_VETO_PATTERN` must vetoa it.
    const result = matchScaffold(
      "Bygg en hemsida för en tv-spel butik med öppettider och lagerstatus",
      "website",
    );
    expect(result?.id).not.toBe("base-nextjs");
    expect(result?.id).not.toBe("app-shell");
  });

  it("does NOT reroute 'rollspel' team-building prompts to base-nextjs", () => {
    const result = matchScaffold(
      "Beskrivning av ett rollspel för teambuilding",
      "website",
    );
    expect(result?.id).not.toBe("base-nextjs");
    expect(result?.id).not.toBe("app-shell");
  });

  it("lowers confidence when semantic fallback is unavailable for a generic default", async () => {
    mockedSearchScaffoldsWithDiagnostics.mockResolvedValue({
      results: [],
      diagnostics: {
        attempted: false,
        available: false,
        failed: false,
        unavailableReason: "missing_api_key",
        errorMessage: null,
        durationMs: null,
      },
    });

    const result = await matchScaffoldAuto(
      "Bygg en företagshemsida för ett konsultbolag med tjänster, kontakt och om oss.",
      "website",
    );

    expect(result.scaffold?.id).toBe("landing-page");
    expect(result.meta.selectionConfidence).toBe("low");
    expect(result.meta.semanticUnavailableReason).toBe("missing_api_key");
  });

  it("prefers embedding over a generic keyword landing pick when similarity clears the floor", async () => {
    const portfolio = getScaffoldById("portfolio");
    expect(portfolio).toBeTruthy();
    mockedSearchScaffoldsWithDiagnostics.mockResolvedValue({
      results: [{ scaffold: portfolio!, score: 0.52 }],
      diagnostics: {
        attempted: true,
        available: true,
        failed: false,
        unavailableReason: null,
        errorMessage: null,
        durationMs: 12,
      },
    });

    const result = await matchScaffoldAuto(
      "Bygg en enkel företagshemsida med tjänster, om oss och kontakt.",
      "website",
    );

    expect(result.scaffold?.id).toBe("portfolio");
    expect(result.meta.selectionMethod).toBe("embedding");
    expect(result.meta.embeddingOverrideReason).toBe("generic_keyword_override");
  });

  it("does not override a generic keyword pick when embedding score is below generic threshold", async () => {
    const portfolio = getScaffoldById("portfolio");
    expect(portfolio).toBeTruthy();
    mockedSearchScaffoldsWithDiagnostics.mockResolvedValue({
      results: [{ scaffold: portfolio!, score: 0.4 }],
      diagnostics: {
        attempted: true,
        available: true,
        failed: false,
        unavailableReason: null,
        errorMessage: null,
        durationMs: 11,
      },
    });

    const result = await matchScaffoldAuto(
      "Bygg en enkel företagshemsida med tjänster, om oss och kontakt.",
      "website",
    );

    expect(result.scaffold?.id).toBe("landing-page");
    expect(result.meta.selectionMethod).toBe("default");
  });

  it("uses brief query context to boost scaffold keyword matching", async () => {
    mockedSearchScaffoldsWithDiagnostics.mockResolvedValue({
      results: [],
      diagnostics: {
        attempted: true,
        available: true,
        failed: false,
        unavailableReason: null,
        errorMessage: null,
        durationMs: 7,
      },
    });

    const result = await matchScaffoldAuto("Bygg en hemsida", "website", {
      queryContext: {
        briefPages: [
          { name: "Login", purpose: "User authentication and sign in" },
          { name: "Signup", purpose: "Create account" },
        ],
      },
    });

    expect(result.scaffold?.id).toBe("auth-pages");
    expect(result.meta.keywordScores["auth-pages"]).toBeGreaterThanOrEqual(2);
  });

  it("does not let embedding pick portfolio when buildIntent is app", async () => {
    const portfolio = getScaffoldById("portfolio");
    expect(portfolio).toBeTruthy();
    mockedSearchScaffoldsWithDiagnostics.mockResolvedValue({
      results: [{ scaffold: portfolio!, score: 0.72 }],
      diagnostics: {
        attempted: true,
        available: true,
        failed: false,
        unavailableReason: null,
        errorMessage: null,
        durationMs: 10,
      },
    });

    const result = await matchScaffoldAuto(
      "Bygg en app med ett galleri för mina projekt och bilder.",
      "app",
    );

    expect(result.scaffold?.id).not.toBe("portfolio");
  });

  it("reports selectionMethod=agreement when keyword and embedding converge on the same scaffold", async () => {
    const saas = getScaffoldById("saas-landing");
    expect(saas).toBeTruthy();
    mockedSearchScaffoldsWithDiagnostics.mockResolvedValue({
      results: [{ scaffold: saas!, score: 0.62 }],
      diagnostics: {
        attempted: true,
        available: true,
        failed: false,
        unavailableReason: null,
        errorMessage: null,
        durationMs: 9,
      },
    });

    const result = await matchScaffoldAuto(
      "Bygg en SaaS-landningssida med pricing-tiers och kundportal-CTA.",
      "website",
    );

    expect(result.scaffold?.id).toBe("saas-landing");
    expect(result.meta.selectionMethod).toBe("agreement");
    expect(result.meta.selectionConfidence).toBe("high");
    expect(result.meta.embeddingOverrideReason).toBeNull();
    expect(result.meta.embeddingTopResult?.id).toBe("saas-landing");
  });

  it("agreement uses medium confidence when embedding score is between min and 0.55", async () => {
    const saas = getScaffoldById("saas-landing");
    expect(saas).toBeTruthy();
    mockedSearchScaffoldsWithDiagnostics.mockResolvedValue({
      results: [{ scaffold: saas!, score: 0.42 }],
      diagnostics: {
        attempted: true,
        available: true,
        failed: false,
        unavailableReason: null,
        errorMessage: null,
        durationMs: 9,
      },
    });

    const result = await matchScaffoldAuto(
      "Bygg en SaaS-landningssida med pricing-tiers och kundportal-CTA.",
      "website",
    );

    expect(result.scaffold?.id).toBe("saas-landing");
    expect(result.meta.selectionMethod).toBe("agreement");
    expect(result.meta.selectionConfidence).toBe("medium");
  });

  it("does not let embedding pick auth-pages without auth keywords", async () => {
    const auth = getScaffoldById("auth-pages");
    expect(auth).toBeTruthy();
    mockedSearchScaffoldsWithDiagnostics.mockResolvedValue({
      results: [{ scaffold: auth!, score: 0.92 }],
      diagnostics: {
        attempted: true,
        available: true,
        failed: false,
        unavailableReason: null,
        errorMessage: null,
        durationMs: 8,
      },
    });

    const result = await matchScaffoldAuto(
      "Skapa en landningssida för vårt bageri med meny och öppettider.",
      "website",
    );

    expect(result.scaffold?.id).not.toBe("auth-pages");
  });
});

describe("matchScaffold with SAJTMASKIN_SCAFFOLD_KEYWORD_MATCH=off", () => {
  beforeEach(() => {
    mockedSearchScaffoldsWithDiagnostics.mockReset();
  });

  afterEach(() => {
    delete process.env.SAJTMASKIN_SCAFFOLD_KEYWORD_MATCH;
  });

  it("defaults to intent baseline and lets embeddings steer selection", async () => {
    process.env.SAJTMASKIN_SCAFFOLD_KEYWORD_MATCH = "off";
    const blog = getScaffoldById("blog");
    expect(blog).toBeTruthy();
    mockedSearchScaffoldsWithDiagnostics.mockResolvedValue({
      results: [{ scaffold: blog!, score: 0.6 }],
      diagnostics: {
        attempted: true,
        available: true,
        failed: false,
        unavailableReason: null,
        errorMessage: null,
        durationMs: 10,
      },
    });

    const result = await matchScaffoldAuto(
      "Det här är en webbplats med artiklar, nyhetsbrev och redaktionellt innehåll.",
      "website",
    );

    expect(result.scaffold?.id).toBe("blog");
    expect(result.meta.selectionMethod).toBe("embedding");
    expect(result.meta.keywordScores["ecommerce"]).toBe(0);
  });
});
