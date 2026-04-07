import { describe, expect, it } from "vitest";
import { matchScaffold } from "./matcher";

describe("matchScaffold", () => {
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
});
