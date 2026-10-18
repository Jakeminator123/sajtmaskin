import { describe, expect, it } from "vitest";
import { normalizePlanArtifact } from "./schema";

describe("normalizePlanArtifact provider contracts", () => {
  it("preserves canonical provider metadata", () => {
    const plan = normalizePlanArtifact({
      goal: "Build auth",
      scope: [],
      pages: [],
      steps: [],
      blockers: [],
      assumptions: [],
      currentPhase: "plan",
      contracts: {
        dataMode: "persisted",
        integrations: [
          {
            kind: "auth",
            providerKey: "auth0",
            dossierCapability: "auth",
            selectionSource: "explicit",
            provider: "Auth0",
            name: "Auth0",
            reason: "Explicit provider",
            status: "chosen",
            envVars: ["AUTH0_CLIENT_ID"],
          },
        ],
        envVars: [],
      },
    });

    expect(plan?.contracts?.integrations[0]).toMatchObject({
      kind: "auth",
      providerKey: "auth0",
      dossierCapability: "auth",
      selectionSource: "explicit",
    });
  });

  it("keeps an unresolved capability without inventing a provider key", () => {
    const plan = normalizePlanArtifact({
      goal: "Choose auth",
      scope: [],
      pages: [],
      steps: [],
      blockers: [],
      assumptions: [],
      currentPhase: "plan",
      contracts: {
        dataMode: "persisted",
        integrations: [
          {
            kind: "auth",
            dossierCapability: "auth",
            selectionSource: "explicit",
            provider: "Authentication provider not selected",
            name: "Authentication provider not selected",
            reason: "Clerk was explicitly rejected; choose another provider.",
            status: "unresolved",
          },
        ],
        envVars: [],
      },
    });

    expect(plan?.contracts?.integrations[0]).toMatchObject({
      status: "unresolved",
      dossierCapability: "auth",
    });
    expect(plan?.contracts?.integrations[0]).not.toHaveProperty("providerKey");
  });

  it("preserves legacy-preserved as typed provenance", () => {
    const plan = normalizePlanArtifact({
      goal: "Keep legacy auth",
      scope: [],
      pages: [],
      steps: [],
      blockers: [],
      assumptions: [],
      currentPhase: "plan",
      contracts: {
        dataMode: "persisted",
        integrations: [
          {
            kind: "auth",
            providerKey: "next-auth",
            dossierCapability: "auth",
            selectionSource: "legacy-preserved",
            provider: "Auth.js / NextAuth",
            name: "Auth.js / NextAuth",
            reason: "Unambiguous legacy provider",
            status: "chosen",
          },
        ],
        envVars: [],
      },
    });

    expect(plan?.contracts?.integrations[0]?.selectionSource).toBe("legacy-preserved");
  });
});
