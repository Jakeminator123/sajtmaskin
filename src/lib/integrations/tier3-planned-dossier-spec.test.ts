import { describe, expect, it } from "vitest";
import { deriveTier3BuildSpecForDossierIds } from "./tier3-build-spec";

describe("deriveTier3BuildSpecForDossierIds", () => {
  it("creates a build plan for a planned dossier without parent file evidence", () => {
    const spec = deriveTier3BuildSpecForDossierIds(["stripe-checkout"]);
    expect(spec.requirements).toHaveLength(1);
    expect(spec.requirements[0]).toMatchObject({
      key: "stripe-checkout",
      provider: "stripe-checkout",
      featureRuntimeEnvKeys: ["STRIPE_SECRET_KEY"],
      placeholderOkEnvKeys: [],
      warnOnlyEnvKeys: ["NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY"],
    });
  });

  it("lets manifest enforcement outrank the global harmless-key catalog", () => {
    const spec = deriveTier3BuildSpecForDossierIds(["clerk-auth"]);
    expect(spec.requirements[0].requiredRealEnvKeys).toContain("CLERK_SECRET_KEY");
    expect(spec.requirements[0].requiredRealEnvKeys).toContain("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY");
    expect(spec.requirements[0].placeholderOkEnvKeys).toEqual([]);

    const sanity = deriveTier3BuildSpecForDossierIds(["sanity-cms"]).requirements[0];
    expect(sanity.featureRuntimeEnvKeys).toEqual(
      expect.arrayContaining(["NEXT_PUBLIC_SANITY_PROJECT_ID", "NEXT_PUBLIC_SANITY_DATASET"]),
    );
    expect(sanity.placeholderOkEnvKeys).toEqual([]);
  });
});
