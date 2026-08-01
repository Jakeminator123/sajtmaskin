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
      placeholderOkEnvKeys: ["NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY"],
      warnOnlyEnvKeys: [],
    });
  });

  it("keeps Clerk build enforcement while allowing harmless public config", () => {
    const spec = deriveTier3BuildSpecForDossierIds(["clerk-auth"]);
    expect(spec.requirements[0].requiredRealEnvKeys).toContain("CLERK_SECRET_KEY");
    expect(spec.requirements[0].placeholderOkEnvKeys).toContain(
      "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
    );
  });
});
