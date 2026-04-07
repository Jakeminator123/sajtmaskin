import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./scaffold-search", () => ({
  searchScaffoldsWithDiagnostics: vi.fn(),
}));

import { searchScaffoldsWithDiagnostics } from "./scaffold-search";
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

  it("does not over-promote generic company gallery sites to portfolio", () => {
    const prompt =
      "Bygg en företagshemsida för ett konsultbolag med galleri, tjänster, testimonials och kontakt.";

    expect(matchScaffold(prompt, "website")?.id).toBe("landing-page");
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
});
