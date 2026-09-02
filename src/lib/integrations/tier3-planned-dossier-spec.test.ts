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

    // A public NEXT_PUBLIC_* key that the manifest tags feature-runtime must
    // stay feature-runtime — never demoted to placeholder-ok by the global
    // harmless-key catalog (sanity-cms used to be the fixture; parked 2026-09-02).
    const supabase = deriveTier3BuildSpecForDossierIds(["supabase-auth"]).requirements[0];
    expect(supabase.featureRuntimeEnvKeys).toEqual(
      expect.arrayContaining(["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"]),
    );
    expect(supabase.placeholderOkEnvKeys).toEqual([]);
  });
});
