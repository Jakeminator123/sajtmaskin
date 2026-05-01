import { describe, expect, it } from "vitest";

import { SCAFFOLD_PROTECTED_PATHS } from "../scaffolds/protected-paths";
import { buildDynamicContext } from "./build-dynamic-context";

describe("buildDynamicContext", () => {
  it("tells the model not to emit scaffold-protected files", () => {
    const result = buildDynamicContext({
      intent: "website",
      userPrompt: "Build a simple website",
      generationMode: "init",
    });

    expect(result.context).toContain("## Scaffold-default files");
    expect(result.blocks.find((block) => block.title === "Scaffold-default files")).toMatchObject({
      required: true,
      chars: expect.any(Number),
    });
    for (const path of SCAFFOLD_PROTECTED_PATHS) {
      expect(result.context).toContain(`\`${path}\``);
    }
  });

  it("ignores invalid brief domainProfile values and falls back to canonical inference", () => {
    const result = buildDynamicContext({
      intent: "website",
      userPrompt: "Bygg en hemsida för en frisörsalong i Malmö",
      generationMode: "init",
      brief: {
        domainProfile: "hospitality",
        visualDirection: { styleKeywords: ["modern", "varm"] },
        toneAndVoice: ["professionell"],
      },
    });

    expect(result.context).toContain("Domain profile (inferred from prompt keywords): **spa-salon**.");
    expect(result.context).not.toContain("**hospitality**");
  });

  it("renders Brief-Locked Design Values before conflicting scaffold variant cues", () => {
    const result = buildDynamicContext({
      intent: "website",
      userPrompt: "Bygg en varm premium restaurangsida med livlig rörelse",
      generationMode: "init",
      brief: {
        domainProfile: "restaurant",
        qualityBar: "premium",
        motionLevel: "lively",
        toneAndVoice: ["varm", "inbjudande"],
        visualDirection: {
          styleKeywords: ["warm", "editorial", "premium"],
          colorPalette: {
            primary: "#f59e0b",
            secondary: "#7c2d12",
            accent: "#fde68a",
            background: "#fff7ed",
            text: "#1f1308",
          },
          typography: {
            headings: "serif editorial",
            body: "humanist sans",
          },
        },
        mustHave: ["atmosfärisk hero", "boknings-CTA"],
        avoid: ["kall corporate-känsla"],
      },
      resolvedVariant: {
        id: "corporate-grid",
        scaffoldId: "landing-page",
        label: "Corporate Grid",
        description: "Bright B2B consulting pages.",
        keywords: ["corporate", "b2b"],
        fontPairings: [{ heading: "Manrope", body: "Inter" }],
        signatureMotif: "enterprise grid and restrained blue accents",
        colorMode: "light",
        promptHints: ["Prefer measured consulting hierarchy."],
        signaturePatterns: {
          layouts: ["strict corporate grid"],
          motifs: ["cool blue accents"],
          antiPatterns: ["avoid editorial mood"],
        },
        themeTokens: {
          primary: "oklch(0.56 0.14 250)",
        },
      },
    });

    const briefIdx = result.context.indexOf("## Brief-Locked Design Values");
    const variantIdx = result.context.indexOf("## Scaffold Variant (this generation)");
    expect(briefIdx).toBeGreaterThanOrEqual(0);
    expect(variantIdx).toBeGreaterThan(briefIdx);
    expect(result.context).toContain("- **Visual direction:** warm, editorial, premium");
    expect(result.context).toContain("- **Quality bar:** premium");
    expect(result.context).toContain("- **Motion level:** lively");
    expect(result.context).toContain("If the variant says dark/corporate/minimal");
    expect(result.context).toContain("follow the brief");
  });

  it("keeps Brief-Locked Design Values before scaffold variant when token budget is tight", () => {
    const result = buildDynamicContext({
      intent: "website",
      userPrompt: "Bygg en varm premium restaurangsida",
      generationMode: "init",
      brief: {
        qualityBar: "premium",
        motionLevel: "lively",
        toneAndVoice: ["varm"],
        visualDirection: {
          styleKeywords: ["warm", "editorial"],
          colorPalette: { primary: "#f59e0b" },
        },
      },
      buildSpec: {
        buildIntent: "website",
        generationMode: "init",
        changeScope: "redesign",
        contextPolicy: "light",
        verificationPolicy: "fast",
        previewPolicy: "fidelity2",
        qualityTarget: "premium",
        scaffoldId: "landing-page",
        routePlanSummary: "1 route",
        stylePack: "editorial",
        referenceCategories: [],
        forbiddenPatterns: [],
        tokenBudgets: {
          scaffoldChars: 1_000,
          refsChars: 1_000,
          systemContextChars: 4_800,
          systemContextTokens: 1_500,
        },
      },
      resolvedVariant: {
        id: "corporate-grid",
        scaffoldId: "landing-page",
        label: "Corporate Grid",
        keywords: [],
        fontPairings: [],
        signatureMotif: "corporate",
        colorMode: "light",
        promptHints: ["corporate grid ".repeat(80)],
      },
    });

    const briefBlock = result.blocks.find((block) => block.title === "Brief-Locked Design Values");
    const variantBlock = result.blocks.find((block) => block.title === "Scaffold Variant (this generation)");
    expect(briefBlock).toMatchObject({ required: true, kept: true });
    expect(variantBlock?.priority).toBeLessThan(briefBlock?.priority ?? 0);
  });

  it("uses compact follow-up context for non-redesign changes", () => {
    const result = buildDynamicContext({
      intent: "website",
      userPrompt: "Byt rubriken i hero",
      generationMode: "followUp",
      buildSpec: {
        buildIntent: "website",
        generationMode: "followUp",
        changeScope: "copy",
        contextPolicy: "light",
        verificationPolicy: "fast",
        previewPolicy: "fidelity2",
        qualityTarget: "standard",
        scaffoldId: "landing-page",
        routePlanSummary: "1 route",
        stylePack: "minimal",
        referenceCategories: [],
        forbiddenPatterns: [],
        tokenBudgets: {
          scaffoldChars: 3_000,
          refsChars: 1_500,
          systemContextChars: 12_000,
          systemContextTokens: 3_000,
        },
      },
      routePlan: {
        provenance: { primarySource: "prompt", sources: ["prompt"] },
        siteType: "brochure",
        reason: "fixture",
        routes: [{ path: "/", name: "Home", intent: "Landing", required: true }],
      },
      resolvedVariant: {
        id: "warm-local",
        scaffoldId: "landing-page",
        label: "Warm Local",
        keywords: ["warm"],
        fontPairings: [{ heading: "DM Serif Display", body: "DM Sans" }],
        signatureMotif: "soft gradients",
        colorMode: "light",
        promptHints: ["warm local"],
      },
      resolvedScaffold: {
        id: "landing-page",
        label: "Landing",
        description: "Fixture scaffold",
        allowedBuildIntents: ["website"],
        tags: ["marketing"],
        promptHints: [],
        files: [],
      },
    });

    expect(result.context).toContain("## Generation Mode: Follow-Up");
    expect(result.context).not.toContain("## Scaffold Research Priorities");
    expect(result.context).not.toContain("### Lucide icons commonly needed");
  });

  it("uses compact follow-up context for normal non-redesign changes", () => {
    const result = buildDynamicContext({
      intent: "website",
      userPrompt: "Lägg till en ny undersida med tabeller och dashboard-layout",
      generationMode: "followUp",
      buildSpec: {
        buildIntent: "website",
        generationMode: "followUp",
        changeScope: "page-addition",
        contextPolicy: "normal",
        verificationPolicy: "standard",
        previewPolicy: "fidelity2",
        qualityTarget: "premium",
        scaffoldId: "app-shell",
        routePlanSummary: "2 routes",
        stylePack: "product",
        referenceCategories: [],
        forbiddenPatterns: [],
        tokenBudgets: {
          scaffoldChars: 3_000,
          refsChars: 1_500,
          systemContextChars: 80_000,
          systemContextTokens: 20_000,
        },
      },
      routePlan: {
        provenance: { primarySource: "prompt", sources: ["prompt"] },
        siteType: "app-shell",
        reason: "fixture",
        routes: [
          { path: "/", name: "Home", intent: "Landing", required: true },
          { path: "/dashboard", name: "Dashboard", intent: "Data", required: true },
        ],
      },
      resolvedVariant: {
        id: "product-clean",
        scaffoldId: "app-shell",
        label: "Product Clean",
        keywords: ["product"],
        fontPairings: [{ heading: "Inter", body: "Inter" }],
        signatureMotif: "structured panels",
        colorMode: "light",
        promptHints: ["high information density"],
      },
      resolvedScaffold: {
        id: "app-shell",
        label: "App Shell",
        description: "Fixture scaffold",
        allowedBuildIntents: ["website", "app"],
        tags: ["app"],
        promptHints: [],
        files: [],
        qualityChecklist: ["Preserve shell navigation"],
      },
    });

    expect(result.context).not.toContain("## Scaffold Research Priorities");
    expect(result.context).not.toContain("### Lucide icons commonly needed");
    expect(result.context).toContain("- **Routes in scope:** `/`, `/dashboard`");
    expect(result.context).not.toContain("**Planning source:**");
  });

  it("keeps full follow-up context for clear redesign intent", () => {
    const result = buildDynamicContext({
      intent: "website",
      userPrompt: "Gör en tydlig redesign av hela upplevelsen",
      generationMode: "followUp",
      followUpIntent: "clear-redesign",
      buildSpec: {
        buildIntent: "website",
        generationMode: "followUp",
        changeScope: "redesign",
        contextPolicy: "normal",
        verificationPolicy: "standard",
        previewPolicy: "fidelity2",
        qualityTarget: "premium",
        scaffoldId: "landing-page",
        routePlanSummary: "1 route",
        stylePack: "editorial",
        referenceCategories: [],
        forbiddenPatterns: [],
        tokenBudgets: {
          scaffoldChars: 3_000,
          refsChars: 1_500,
          systemContextChars: 80_000,
          systemContextTokens: 20_000,
        },
      },
      routePlan: {
        provenance: { primarySource: "prompt", sources: ["prompt"] },
        siteType: "brochure",
        reason: "fixture",
        routes: [{ path: "/", name: "Home", intent: "Landing", required: true }],
      },
      resolvedScaffold: {
        id: "landing-page",
        label: "Landing",
        description: "Fixture scaffold",
        allowedBuildIntents: ["website"],
        tags: ["marketing"],
        promptHints: [],
        files: [],
        qualityChecklist: ["Preserve landing hierarchy"],
      },
    });

    expect(result.context).toContain("## Scaffold Research Priorities");
    expect(result.context).toContain("### Lucide icons commonly needed");
  });

  it("keeps full follow-up context when BuildSpec is missing", () => {
    const result = buildDynamicContext({
      intent: "website",
      userPrompt: "Lägg till en ny undersida med tabeller och dashboard-layout",
      generationMode: "followUp",
      routePlan: {
        provenance: { primarySource: "prompt", sources: ["prompt"] },
        siteType: "app-shell",
        reason: "fixture",
        routes: [
          { path: "/", name: "Home", intent: "Landing", required: true },
          { path: "/dashboard", name: "Dashboard", intent: "Data", required: true },
        ],
      },
      resolvedScaffold: {
        id: "app-shell",
        label: "App Shell",
        description: "Fixture scaffold",
        allowedBuildIntents: ["website", "app"],
        tags: ["app"],
        promptHints: [],
        files: [],
        qualityChecklist: ["Preserve shell navigation"],
      },
    });

    expect(result.context).toContain("## Scaffold Research Priorities");
    expect(result.context).toContain("### Lucide icons commonly needed");
    expect(result.context).toContain("**Planning source:**");
  });

  it("keeps full follow-up context for heavy non-redesign changes", () => {
    const result = buildDynamicContext({
      intent: "website",
      userPrompt: "Lägg till en komplex 3D-scen med animationer och interaktion",
      generationMode: "followUp",
      followUpIntent: "capability-add",
      buildSpec: {
        buildIntent: "website",
        generationMode: "followUp",
        changeScope: "page-addition",
        contextPolicy: "heavy",
        verificationPolicy: "standard",
        previewPolicy: "fidelity2",
        qualityTarget: "premium",
        scaffoldId: "app-shell",
        routePlanSummary: "2 routes",
        stylePack: "product",
        referenceCategories: [],
        forbiddenPatterns: [],
        tokenBudgets: {
          scaffoldChars: 6_000,
          refsChars: 3_000,
          systemContextChars: 160_000,
          systemContextTokens: 40_000,
        },
      },
      routePlan: {
        provenance: { primarySource: "prompt", sources: ["prompt"] },
        siteType: "app-shell",
        reason: "fixture",
        routes: [
          { path: "/", name: "Home", intent: "Landing", required: true },
          { path: "/scene", name: "Scene", intent: "3D scene", required: true },
        ],
      },
      resolvedScaffold: {
        id: "app-shell",
        label: "App Shell",
        description: "Fixture scaffold",
        allowedBuildIntents: ["website", "app"],
        tags: ["app"],
        promptHints: [],
        files: [],
        qualityChecklist: ["Preserve shell navigation"],
      },
    });

    expect(result.context).toContain("## Scaffold Research Priorities");
    expect(result.context).toContain("### Lucide icons commonly needed");
    expect(result.context).toContain("**Planning source:**");
  });
});
