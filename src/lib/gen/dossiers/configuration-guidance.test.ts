import { describe, expect, it } from "vitest";

import { isDossierConfigured } from "./select";
import { dossierRequiresF3, type DossierEntry } from "./types";
import { projectDossierConfigurationGuidance } from "./configuration-guidance";

function entryWithGuidance(): DossierEntry {
  return {
    class: "hard",
    id: "example-payments",
    label: "Example payments",
    capability: "payments",
    providers: ["example"],
    codeFidelity: "verbatim",
    complexity: "medium",
    defaultForCapability: false,
    summary: "Synthetic hard dossier for configuration guidance tests.",
    envVars: [
      {
        key: "EXAMPLE_SECRET_KEY",
        required: true,
        purpose: "Authenticates server-side requests to the example provider.",
        enforcement: "build",
      },
    ],
    configInputs: [
      {
        id: "price-id",
        label: "Price id",
        target: "component-prop",
        binding: "priceId",
        purpose: "Selects which provider price the project checkout should purchase.",
      },
    ],
    providerSetup: [
      {
        id: "create-price",
        title: "Create the checkout price",
        instruction: "Create a price in the provider dashboard, then bind it in project code.",
        references: {
          envVarKeys: ["EXAMPLE_SECRET_KEY"],
          configInputIds: ["price-id"],
        },
      },
    ],
    lastVerified: "2026-10-04",
    verificationStatus: "unverified",
  };
}

describe("projectDossierConfigurationGuidance", () => {
  it("resolves ordered references for prompt consumers without deriving readiness", () => {
    const entry = entryWithGuidance();
    const projected = projectDossierConfigurationGuidance(entry);

    expect(projected.configInputs.map((input) => input.id)).toEqual(["price-id"]);
    expect(projected.providerSetup[0]).toMatchObject({
      id: "create-price",
      referencedEnvVars: [{ key: "EXAMPLE_SECRET_KEY" }],
      referencedConfigInputs: [{ id: "price-id", binding: "priceId" }],
    });
  });

  it("normalizes omitted metadata to empty guidance", () => {
    const entry = entryWithGuidance();
    delete entry.configInputs;
    delete entry.providerSetup;
    expect(projectDossierConfigurationGuidance(entry)).toEqual({
      configInputs: [],
      providerSetup: [],
    });
  });

  it("does not alter configured, F3, verification or lastVerified semantics", () => {
    const withGuidance = entryWithGuidance();
    const withoutGuidance = { ...withGuidance, configInputs: undefined, providerSetup: undefined };
    const configuredKeys = new Set(["EXAMPLE_SECRET_KEY"]);

    expect(isDossierConfigured(withGuidance, configuredKeys)).toBe(
      isDossierConfigured(withoutGuidance, configuredKeys),
    );
    expect(dossierRequiresF3(withGuidance)).toBe(dossierRequiresF3(withoutGuidance));
    expect(projectDossierConfigurationGuidance(withGuidance)).not.toHaveProperty(
      "verificationStatus",
    );
    expect(withGuidance.verificationStatus).toBe("unverified");
    expect(withGuidance.lastVerified).toBe("2026-10-04");
  });
});
