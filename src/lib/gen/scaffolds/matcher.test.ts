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

    expect(matchScaffold(prompt, "website")?.id).toBe("content-site");
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

    expect(matchScaffold(prompt, "website")?.id).toBe("content-site");
  });

  it("keeps website intent on content scaffolds for app-like cinematic marketing prompts", () => {
    const prompt =
      'Jag vill ha en hemsida som är mycket app-lik med en massa coola 3dsaker och filmisk neon-känsla för en UFO-komedi.';

    const result = matchScaffold(prompt, "website");
    expect(result?.id).not.toBe("app-shell");
    expect(result?.id).not.toBe("dashboard");
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

    expect(result.scaffold?.id).toBe("content-site");
    expect(result.meta.selectionConfidence).toBe("medium");
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
    expect(result.meta.embeddingOverrideReason).toBe("non_generic_strength_win");
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

    expect(result.scaffold?.id).toBe("portfolio");
    expect(result.meta.selectionMethod).toBe("embedding");
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
