import { describe, expect, it } from "vitest";
import type { BuildSpec } from "../../build-spec";
import { renderTier3IntegrationBlock } from "./session-contracts";

const f3BuildSpec = {
  previewPolicy: "fidelity3",
} as BuildSpec;

describe("renderTier3IntegrationBlock", () => {
  it("prefers the file-derived parent-version spec over empty prompt contracts", () => {
    const lines = renderTier3IntegrationBlock({
      buildSpec: f3BuildSpec,
      preGenerationContracts: {
        contracts: {
          dataMode: "none",
          integrations: [],
          envVars: [],
        },
        unresolvedDecisions: [],
        confirmedAnswers: [],
      },
      tier3BuildSpec: {
        requirements: [
          {
            key: "clerk",
            name: "Clerk",
            provider: "clerk",
            requiredRealEnvKeys: ["CLERK_SECRET_KEY"],
            placeholderOkEnvKeys: [],
            featureRuntimeEnvKeys: [],
            warnOnlyEnvKeys: [],
            buildInstructions: ["Wire the existing Clerk dossier files."],
            setupGuide: "Add the Clerk secret.",
            hasConfigNoticeComponent: false,
          },
        ],
      },
    });

    expect(lines.join("\n")).toContain("Tier-3 Integration Build Plan");
    expect(lines.join("\n")).toContain("CLERK_SECRET_KEY");
  });

  it("falls back to prompt contracts when parent files contain no integrations", () => {
    const lines = renderTier3IntegrationBlock({
      buildSpec: f3BuildSpec,
      preGenerationContracts: {
        contracts: {
          dataMode: "none",
          paymentProvider: "stripe",
          integrations: [
            {
              provider: "stripe",
              name: "Stripe",
              reason: "newly approved provider",
              status: "chosen",
              envVars: ["STRIPE_SECRET_KEY"],
            },
          ],
          envVars: [{ key: "STRIPE_SECRET_KEY", reason: "Stripe" }],
        },
        unresolvedDecisions: [],
        confirmedAnswers: [],
      },
      tier3BuildSpec: { requirements: [] },
    });

    expect(lines.join("\n")).toContain("Stripe");
    expect(lines.join("\n")).toContain("STRIPE_SECRET_KEY");
  });

  it("adds an explicitly approved provider beside existing file-derived integrations", () => {
    const lines = renderTier3IntegrationBlock({
      buildSpec: f3BuildSpec,
      preGenerationContracts: {
        contracts: {
          dataMode: "none",
          integrations: [],
          envVars: [],
        },
        unresolvedDecisions: [],
        confirmedAnswers: [],
      },
      tier3BuildSpec: {
        requirements: [
          {
            key: "clerk",
            name: "Clerk",
            provider: "clerk",
            requiredRealEnvKeys: ["CLERK_SECRET_KEY"],
            placeholderOkEnvKeys: [],
            featureRuntimeEnvKeys: [],
            warnOnlyEnvKeys: [],
            buildInstructions: ["Keep Clerk."],
            setupGuide: "Clerk",
            hasConfigNoticeComponent: false,
          },
        ],
      },
      approvedProviders: ["stripe"],
    });

    expect(lines.join("\n")).toContain("CLERK_SECRET_KEY");
    expect(lines.join("\n")).toContain("STRIPE_SECRET_KEY");
  });

  it("builds a plan from approvals when the parent has no integration files", () => {
    const lines = renderTier3IntegrationBlock({
      buildSpec: f3BuildSpec,
      preGenerationContracts: {
        contracts: { dataMode: "none", integrations: [], envVars: [] },
        unresolvedDecisions: [],
        confirmedAnswers: [],
      },
      tier3BuildSpec: { requirements: [] },
      approvedProviders: ["stripe"],
    });

    expect(lines.join("\n")).toContain("Stripe");
    expect(lines.join("\n")).toContain("STRIPE_SECRET_KEY");
  });
});
