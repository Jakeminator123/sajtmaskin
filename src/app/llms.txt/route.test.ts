import { describe, expect, it } from "vitest";
import { CREDIT_PACKAGES } from "@/lib/billing/credit-packages";
import { PUBLIC_CANONICAL_ORIGIN } from "@/lib/public-canonical-url";
import { buildLlmsTxt, GET } from "./route";

describe("llms.txt", () => {
  it("describes the product, live credit packages and key canonical pages", async () => {
    const body = buildLlmsTxt();
    expect(body).toContain("Sajtmaskin är en svensk AI-hemsidebyggare");
    expect(body).toContain("Pretty Good B.V.");
    expect(body).toContain("1 kr = 1 credit");
    for (const pkg of CREDIT_PACKAGES) {
      expect(body).toContain(`${pkg.name}: ${pkg.price} kr`);
    }
    expect(body).toContain(`${PUBLIC_CANONICAL_ORIGIN}/priser`);
    expect(body).toContain(`${PUBLIC_CANONICAL_ORIGIN}/skapa-hemsida`);

    const response = GET();
    expect(response.headers.get("Content-Type")).toBe("text/plain; charset=utf-8");
    expect(await response.text()).toBe(body);
  });
});
