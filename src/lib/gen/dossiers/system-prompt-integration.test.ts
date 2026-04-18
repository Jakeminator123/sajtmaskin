/**
 * End-to-end check: when DossierSelectionResult is passed into
 * buildDynamicContext, the system prompt gains both expected blocks.
 *
 * Mocks dossier registry to avoid disk reads.
 */

import { describe, expect, it, vi } from "vitest";

import { buildDynamicContext } from "../system-prompt";
import type { DossierSelectionResult } from "../dossiers";
import * as registry from "../dossiers/registry";
import type { BuildSpec } from "../build-spec";

const TINY_BUILD_SPEC: BuildSpec = {
  buildIntent: "website",
  generationMode: "init",
  changeScope: "redesign",
  scaffoldId: "ecommerce",
  routePlanSummary: "prompt:storefront:/",
  stylePack: "default",
  qualityTarget: "standard",
  previewPolicy: "fidelity2",
  verificationPolicy: "standard",
  contextPolicy: "normal",
  referenceCategories: [],
  forbiddenPatterns: [],
  tokenBudgets: {
    scaffoldChars: 36_000,
    refsChars: 12_000,
    systemContextChars: 96_000,
    systemContextTokens: 30_000,
  },
};

const MOCK_SELECTION: DossierSelectionResult = {
  poolSize: 27,
  embeddingsUsed: true,
  embeddingMeta: { model: "text-embedding-3-small", dimensions: 1536 },
  byCategory: { payments: ["payments-stripe-checkout"] },
  selected: [
    {
      score: 0.77,
      reason: "embedding+boost",
      entry: {
        id: "payments-stripe-checkout",
        kind: "integration",
        category: "payments",
        label: "Stripe Checkout",
        description: "One-time and subscription payments via Stripe Checkout.",
        summary: "Adds a Checkout button + server route.",
        providers: [{ name: "Stripe", url: "https://stripe.com" }],
        envVars: [],
        dependencies: ["stripe", "@stripe/stripe-js"],
        files: [],
        scaffoldFit: { primary: ["ecommerce"], compatible: [] },
        complexity: "medium",
        lastVerified: "2026-04-17",
        tags: ["payments", "stripe"],
        _source: "hand-curated",
        _status: "active",
        instructions: "# When to use\n\n- User mentions checkout, payments, billing.\n\n# How to integrate\n\n1. Install stripe.\n2. Add CheckoutButton.\n",
      },
    },
  ],
};

describe("buildDynamicContext + dossier injection", () => {
  it("renders ## Available Dossiers block when dossierSelection is non-empty", async () => {
    const result = await buildDynamicContext({
      intent: "website",
      generationMode: "init",
      brief: { projectTitle: "Café Solen" },
      buildSpec: TINY_BUILD_SPEC,
      scaffoldContext: "## Scaffold: ecommerce\n\nbody",
      dossierSelection: MOCK_SELECTION,
    });

    expect(result.context).toContain("## Available Dossiers");
    expect(result.context).toContain("payments-stripe-checkout");
    expect(result.context).toContain("Stripe Checkout");
    expect(result.context).toContain("integration, payments");
    expect(result.context).toContain("providers: Stripe");
  });

  it("renders ## Selected Dossier Instructions when entries have instructions", async () => {
    const result = await buildDynamicContext({
      intent: "website",
      generationMode: "init",
      brief: { projectTitle: "Test" },
      buildSpec: TINY_BUILD_SPEC,
      scaffoldContext: "scaffold",
      dossierSelection: MOCK_SELECTION,
    });

    expect(result.context).toContain("## Selected Dossier Instructions");
    expect(result.context).toContain("### Stripe Checkout");
    expect(result.context).toContain("# When to use");
    expect(result.context).toContain("# How to integrate");
  });

  it("does NOT render dossier blocks when dossierSelection is null", async () => {
    const result = await buildDynamicContext({
      intent: "website",
      generationMode: "init",
      brief: { projectTitle: "Test" },
      buildSpec: TINY_BUILD_SPEC,
      scaffoldContext: "scaffold",
      dossierSelection: null,
    });

    expect(result.context).not.toContain("## Available Dossiers");
    expect(result.context).not.toContain("## Selected Dossier Instructions");
  });

  it("does NOT render dossier blocks when selection is empty", async () => {
    const result = await buildDynamicContext({
      intent: "website",
      generationMode: "init",
      brief: { projectTitle: "Test" },
      buildSpec: TINY_BUILD_SPEC,
      scaffoldContext: "scaffold",
      dossierSelection: { ...MOCK_SELECTION, selected: [], byCategory: {} },
    });

    expect(result.context).not.toContain("## Available Dossiers");
  });

  it("renders ## Dossier Files To Emit Verbatim when integration files default to verbatim", async () => {
    vi.spyOn(registry, "getDossierFileContent").mockReturnValue(
      'import Stripe from "stripe";\nexport const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);\n',
    );
    const selection: DossierSelectionResult = {
      ...MOCK_SELECTION,
      selected: [
        {
          ...MOCK_SELECTION.selected[0]!,
          entry: {
            ...MOCK_SELECTION.selected[0]!.entry,
            files: [
              { path: "components/lib/stripe.ts", role: "server", kind: "util" },
              { path: "components/checkout-button.tsx", role: "client", kind: "component" },
            ],
          },
        },
      ],
    };
    const result = await buildDynamicContext({
      intent: "website",
      generationMode: "init",
      brief: { projectTitle: "Test" },
      buildSpec: TINY_BUILD_SPEC,
      scaffoldContext: "scaffold",
      dossierSelection: selection,
    });
    expect(result.context).toContain("## Dossier Files To Emit Verbatim");
    expect(result.context).toContain("MUST appear in your CodeProject output exactly");
    expect(result.context).toContain('file="lib/stripe.ts"');
    expect(result.context).toContain("import Stripe from");
    expect(result.context).not.toContain('file="checkout-button.tsx"');
    vi.restoreAllMocks();
  });

  it("respects explicit injectionMode override on a component", async () => {
    vi.spyOn(registry, "getDossierFileContent").mockReturnValue("export {};\n");
    const selection: DossierSelectionResult = {
      ...MOCK_SELECTION,
      selected: [
        {
          ...MOCK_SELECTION.selected[0]!,
          entry: {
            ...MOCK_SELECTION.selected[0]!.entry,
            files: [
              {
                path: "components/special.tsx",
                role: "client",
                kind: "component",
                injectionMode: "verbatim",
              },
            ],
          },
        },
      ],
    };
    const result = await buildDynamicContext({
      intent: "website",
      generationMode: "init",
      brief: { projectTitle: "Test" },
      buildSpec: TINY_BUILD_SPEC,
      scaffoldContext: "scaffold",
      dossierSelection: selection,
    });
    expect(result.context).toContain('file="special.tsx"');
    vi.restoreAllMocks();
  });

  it("skips verbatim files where getDossierFileContent returns null", async () => {
    vi.spyOn(registry, "getDossierFileContent").mockReturnValue(null);
    const selection: DossierSelectionResult = {
      ...MOCK_SELECTION,
      selected: [
        {
          ...MOCK_SELECTION.selected[0]!,
          entry: {
            ...MOCK_SELECTION.selected[0]!.entry,
            files: [{ path: "components/missing.ts", role: "server", kind: "util" }],
          },
        },
      ],
    };
    const result = await buildDynamicContext({
      intent: "website",
      generationMode: "init",
      brief: { projectTitle: "Test" },
      buildSpec: TINY_BUILD_SPEC,
      scaffoldContext: "scaffold",
      dossierSelection: selection,
    });
    expect(result.context).not.toContain("## Dossier Files To Emit Verbatim");
    vi.restoreAllMocks();
  });
});
