import { describe, expect, it } from "vitest";
import type { BuildSpec } from "../../build-spec";
import {
  buildImportedRepoBaselineSnapshot,
  buildImportedRepoContractContext,
} from "@/lib/templates/imported-repo-contract";
import { renderImportedRepoBlock, renderTier3IntegrationBlock } from "./session-contracts";

const f3BuildSpec = {
  previewPolicy: "fidelity3",
} as BuildSpec;

describe("renderImportedRepoBlock", () => {
  it("renders authoritative current structure beside the historical import reference", () => {
    const importedFiles = [
      {
        path: "package.json",
        content: JSON.stringify({
          scripts: { dev: "next dev", build: "next build" },
          dependencies: { next: "16.2.10", react: "19.2.7" },
        }),
        language: "json",
      },
      {
        path: "src/app/page.tsx",
        content: "export default function Page() { return null }",
        language: "tsx",
      },
    ];
    const baseline = buildImportedRepoBaselineSnapshot({
      files: importedFiles,
      origin: { kind: "v0_template", templateId: "tmpl_1" },
      versionId: "version_1",
      capturedAt: "2026-08-12T08:00:00.000Z",
    });
    const context = buildImportedRepoContractContext(
      [
        ...importedFiles,
        {
          path: "src/app/about/page.tsx",
          content: "export default function About() { return null }",
          language: "tsx",
        },
      ],
      { importedRepoBaseline: baseline },
    );

    const rendered = renderImportedRepoBlock(true, context).join("\n");

    expect(rendered).toContain("Imported repository context (not a Scaffold)");
    expect(rendered).toContain("current project structure is authoritative");
    expect(rendered).toContain("`/about`");
    expect(rendered).toContain("Initial import reference from version version_1");
    expect(rendered).toContain("must never restore, regenerate, or overwrite current files");
  });

  it("never renders contract context for an ordinary project", () => {
    expect(renderImportedRepoBlock(false, undefined)).toEqual([]);
  });
});

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
      },
      tier3BuildSpec: { requirements: [] },
      approvedProviders: ["stripe"],
    });

    expect(lines.join("\n")).toContain("Stripe");
    expect(lines.join("\n")).toContain("STRIPE_SECRET_KEY");
  });

  it("does not weave prompt-contract candidates into an approval-only plan", () => {
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
              reason: "speculative prompt contract",
              status: "chosen",
              envVars: ["STRIPE_SECRET_KEY"],
            },
            {
              provider: "resend",
              name: "Resend",
              reason: "speculative prompt contract",
              status: "chosen",
              envVars: ["RESEND_API_KEY"],
            },
          ],
          envVars: [
            { key: "STRIPE_SECRET_KEY", reason: "Stripe" },
            { key: "RESEND_API_KEY", reason: "Resend" },
          ],
        },
        unresolvedDecisions: [],
      },
      tier3BuildSpec: { requirements: [] },
      approvedProviders: ["stripe"],
    });

    const rendered = lines.join("\n");
    expect(rendered).toContain("Stripe");
    expect(rendered).toContain("STRIPE_SECRET_KEY");
    expect(rendered).not.toContain("Resend");
    expect(rendered).not.toContain("RESEND_API_KEY");
  });

  it("keeps the contract's envVars for an APPROVED dossier-less provider (F-b978adccc911)", () => {
    const lines = renderTier3IntegrationBlock({
      buildSpec: f3BuildSpec,
      preGenerationContracts: {
        contracts: {
          dataMode: "none",
          integrations: [
            {
              provider: "posthog",
              name: "PostHog",
              reason: "user-requested analytics",
              status: "chosen",
              envVars: ["NEXT_PUBLIC_POSTHOG_KEY", "POSTHOG_PROJECT_HOST"],
            },
            {
              provider: "resend",
              name: "Resend",
              reason: "speculative prompt contract",
              status: "chosen",
              envVars: ["RESEND_API_KEY"],
            },
          ],
          envVars: [
            { key: "NEXT_PUBLIC_POSTHOG_KEY", reason: "PostHog" },
            { key: "RESEND_API_KEY", reason: "Resend" },
          ],
        },
        unresolvedDecisions: [],
      },
      tier3BuildSpec: { requirements: [] },
      approvedProviders: ["posthog"],
    });

    const rendered = lines.join("\n");
    // posthog has no dossier — the registry-only derivation drops the
    // contract's specific envVars. The APPROVED provider's contract
    // requirement must win the merge, while the unapproved Resend
    // candidate stays excluded (SM-005).
    expect(rendered).toContain("POSTHOG_PROJECT_HOST");
    expect(rendered).not.toContain("RESEND_API_KEY");
  });

  it("unions file spec with approval only — not prompt-contract providers", () => {
    const lines = renderTier3IntegrationBlock({
      buildSpec: f3BuildSpec,
      preGenerationContracts: {
        contracts: {
          dataMode: "none",
          integrations: [
            {
              provider: "resend",
              name: "Resend",
              reason: "speculative prompt contract",
              status: "chosen",
              envVars: ["RESEND_API_KEY"],
            },
          ],
          envVars: [{ key: "RESEND_API_KEY", reason: "Resend" }],
        },
        unresolvedDecisions: [],
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

    const rendered = lines.join("\n");
    expect(rendered).toContain("CLERK_SECRET_KEY");
    expect(rendered).toContain("STRIPE_SECRET_KEY");
    expect(rendered).not.toContain("Resend");
    expect(rendered).not.toContain("RESEND_API_KEY");
  });
});
