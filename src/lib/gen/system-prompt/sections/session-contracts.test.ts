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
  it("renders an authoritative current contract beside the immutable baseline", () => {
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

    expect(rendered).toContain("synthetic context, not a scaffold");
    expect(rendered).toContain("Current is authoritative");
    expect(rendered).toContain("`/about`");
    expect(rendered).toContain("Original import baseline from version version_1");
    expect(rendered).toContain("never restore, regenerate, or overwrite current files");
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
