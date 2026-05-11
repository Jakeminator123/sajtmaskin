/**
 * End-to-end check: the new dossier selection result, when passed into
 * buildDynamicContext, renders the expected prompt blocks with the new
 * capability/class/configured shape.
 */
import { describe, expect, it, vi } from "vitest";

import { buildDynamicContext } from "../system-prompt";
import * as registry from "./registry";
import { selectDossiersForRequest } from "./select";
import type { DossierSelectionResult } from "./types";
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

const BASE_SELECTION: DossierSelectionResult = {
  poolSize: 3,
  byCapability: { payments: ["stripe-checkout"] },
  selected: [
    {
      reason: "capability-match",
      configured: true,
      entry: {
        class: "hard",
        id: "stripe-checkout",
        label: "Stripe Checkout",
        capability: "payments",
        codeFidelity: "verbatim",
        complexity: "medium",
        defaultForCapability: true,
        summary: "Hosted Stripe Checkout for one-time and subscription payments.",
        envVars: [{ key: "STRIPE_SECRET_KEY", required: true, purpose: "API auth" }],
        dependencies: ["stripe", "@stripe/stripe-js"],
        files: [],
        lastVerified: "2026-04-20",
        instructions:
          "# When to use\n\nWhen the brief requests payments.\n\n# How to integrate\n\nDrop in CheckoutButton.\n",
      },
    },
  ],
};

describe("buildDynamicContext + new dossier shape", () => {
  it("renders ## Available Dossiers with class + capability + codeFidelity", async () => {
    const result = await buildDynamicContext({
      intent: "website",
      generationMode: "init",
      brief: { projectTitle: "Café Solen" },
      buildSpec: TINY_BUILD_SPEC,
      scaffoldContext: "## Scaffold: ecommerce\n\nbody",
      dossierSelection: BASE_SELECTION,
    });
    expect(result.context).toContain("## Available Dossiers");
    expect(result.context).toContain("stripe-checkout");
    expect(result.context).toContain("Stripe Checkout");
    expect(result.context).toContain("(hard, capability: payments, verbatim)");
    expect(result.context).toContain("[configured]");
  });

  it("flags hard+unconfigured dossiers in the Available block", async () => {
    const sel: DossierSelectionResult = {
      ...BASE_SELECTION,
      selected: [{ ...BASE_SELECTION.selected[0]!, configured: false }],
    };
    const result = await buildDynamicContext({
      intent: "website",
      generationMode: "init",
      brief: { projectTitle: "Test" },
      buildSpec: TINY_BUILD_SPEC,
      scaffoldContext: "scaffold",
      dossierSelection: sel,
    });
    expect(result.context).toContain("[UNCONFIGURED — render placeholder UI]");
  });

  it("renders ## Selected Dossier Instructions when entries have instructions", async () => {
    const result = await buildDynamicContext({
      intent: "website",
      generationMode: "init",
      brief: { projectTitle: "Test" },
      buildSpec: TINY_BUILD_SPEC,
      scaffoldContext: "scaffold",
      dossierSelection: BASE_SELECTION,
    });
    expect(result.context).toContain("## Selected Dossier Instructions");
    expect(result.context).toContain("### Stripe Checkout");
    expect(result.context).toContain("compact instructions");
    expect(result.context).toContain("Env vars: STRIPE_SECRET_KEY (required).");
    expect(result.context).not.toContain("# When to use");
  });

  it("does not render dossier blocks when selection is null", async () => {
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

  it("renders verbatim file block when integration files are verbatim", async () => {
    vi.spyOn(registry, "getDossierFileContent").mockReturnValue(
      'import Stripe from "stripe";\nexport const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);\n',
    );
    const sel: DossierSelectionResult = {
      ...BASE_SELECTION,
      selected: [
        {
          ...BASE_SELECTION.selected[0]!,
          entry: {
            ...BASE_SELECTION.selected[0]!.entry,
            files: [
              { path: "components/lib/stripe.ts", role: "server" },
              { path: "components/checkout-button.tsx", role: "client", injectionMode: "rewritable" },
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
      dossierSelection: sel,
    });
    expect(result.context).toContain("## Dossier Files To Emit Verbatim");
    expect(result.context).toContain('file="lib/stripe.ts"');
    expect(result.context).not.toContain('file="components/checkout-button.tsx"');
    vi.restoreAllMocks();
  });

  it("reads a real verbatim file from disk (no mocks) — exercises full registry path", async () => {
    // The shipped stripe-checkout dossier has a verbatim api-route on disk;
    // this guards against drift between the rendering code and the actual
    // file layout under data/dossiers/.
    const sel: DossierSelectionResult = {
      ...BASE_SELECTION,
      selected: [
        {
          ...BASE_SELECTION.selected[0]!,
          entry: {
            ...BASE_SELECTION.selected[0]!.entry,
            files: [
              {
                path: "components/api/checkout-session/route.ts",
                role: "server",
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
      dossierSelection: sel,
    });
    expect(result.context).toContain("## Dossier Files To Emit Verbatim");
    // Next.js App Router expects API routes under app/api/<route>/route.ts,
    // not at root. mapDossierPathToOutput rewrites the staging path here.
    expect(result.context).toContain('file="app/api/checkout-session/route.ts"');
    expect(result.context).toContain("import Stripe from");
  });

  it("renders three-fiber-canvas shell as verbatim safety wrapper", async () => {
    const selection = selectDossiersForRequest({
      requestedCapabilities: ["visual-3d"],
    });
    expect(selection.selected[0]?.entry.id).toBe("three-fiber-canvas");
    const result = await buildDynamicContext({
      intent: "website",
      generationMode: "init",
      brief: { projectTitle: "3D Test" },
      buildSpec: {
        ...TINY_BUILD_SPEC,
        scaffoldId: "landing-page",
      },
      scaffoldContext: "scaffold",
      dossierSelection: selection,
    });
    expect(result.context).toContain("## Dossier Files To Emit Verbatim");
    // ROTORSAKS-LÅS (2026-05-01): the LLM MUST be told to emit at
    // `components/three-canvas-shell.tsx` — that's where `@/components/three-canvas-shell`
    // resolves under the scaffold tsconfig (`"@/*": ["./*"]`). Earlier code
    // stripped `components/`, putting the shell at root and breaking imports.
    expect(result.context).toContain('file="components/three-canvas-shell.tsx"');
    expect(result.context).toContain("export function ThreeCanvasShell");
    expect(result.context).toContain("SSR-safe 3D shells");
  });
});
