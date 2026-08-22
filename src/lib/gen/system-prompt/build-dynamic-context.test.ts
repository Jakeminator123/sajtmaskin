import { describe, expect, it } from "vitest";

import { SCAFFOLD_PROTECTED_PATHS } from "../scaffolds/protected-paths";
import type { BuildSpec } from "../build-spec";
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

  it.each([
    {
      mode: "structural" as const,
      intent: "app" as const,
      expected: "structural baseline",
      absent: "component mix are not load-bearing",
    },
    {
      mode: "inspirational" as const,
      intent: "website" as const,
      expected: "component mix are not load-bearing",
      absent: "structural baseline",
    },
  ])("uses $mode variant authority for $intent generations", ({ mode, intent, expected, absent }) => {
    const result = buildDynamicContext({
      intent,
      userPrompt: "Build a polished experience",
      generationMode: "init",
      scaffoldSerializeMode: mode,
      resolvedVariant: {
        id: "authority-test",
        scaffoldId: "app-shell",
        label: "Authority Test",
        keywords: [],
        fontPairings: [],
        signatureMotif: "clear hierarchy",
        colorMode: "light",
        promptHints: [],
      },
    });

    expect(result.context).toContain(expected);
    expect(result.context).not.toContain(absent);
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

  it("renders variant template inspiration on clear-redesign when the caller resolved it", () => {
    const result = buildDynamicContext({
      intent: "website",
      userPrompt: "Gör om hela sajten i en mörk editorial stil",
      generationMode: "followUp",
      followUpIntent: "clear-redesign",
      scaffoldSerializeMode: "inspirational",
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
      resolvedVariant: {
        id: "editorial-lux",
        scaffoldId: "landing-page",
        label: "Editorial Lux",
        keywords: ["editorial"],
        fontPairings: [{ heading: "Cormorant Garamond", body: "Raleway" }],
        signatureMotif: "editorial framing",
        colorMode: "dark",
        promptHints: ["Use stronger storytelling."],
        signaturePatterns: {
          layouts: ["Use a cinematic split hero with one oversized portrait."],
          motifs: ["Pair near-black surfaces with warm ivory typography."],
          antiPatterns: ["Avoid loud neon gradients."],
        },
      },
      variantTemplateInspiration: {
        templateId: "k3-redesign-fixture",
        title: "K3 Redesign Fixture",
        category: "landing-pages",
        archiveUrl: "https://cdn.example.com/k3.zip",
        stillImageUrl: "https://cdn.example.com/k3-still.png",
        structuralReferences: [
          {
            path: "app/page.tsx",
            language: "tsx",
            reason: "primary-page",
            excerpt: "export default function Page() { return <main />; }",
          },
        ],
      },
    });

    expect(result.context).toContain("## Variant Template Inspiration");
    expect(result.context).toContain("K3 Redesign Fixture");
    expect(result.context).toContain("Use a cinematic split hero with one oversized portrait.");
    expect(result.context).toContain("These are visual reference points, not a contract.");
    expect(result.context).not.toContain("Follow-up delta rule");
    expect(result.pruning.keptBlockKeys).toContain("variant_template_inspiration");
  });

  it("keeps clear-refine compact and drops inspiration even if a caller passed it", () => {
    const result = buildDynamicContext({
      intent: "website",
      userPrompt: "Byt hero-rubriken till Välkommen",
      generationMode: "followUp",
      followUpIntent: "clear-refine",
      buildSpec: {
        buildIntent: "website",
        generationMode: "followUp",
        changeScope: "copy",
        contextPolicy: "normal",
        verificationPolicy: "standard",
        previewPolicy: "fidelity2",
        qualityTarget: "standard",
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
      resolvedVariant: {
        id: "editorial-lux",
        scaffoldId: "landing-page",
        label: "Editorial Lux",
        keywords: ["editorial"],
        fontPairings: [{ heading: "Cormorant Garamond", body: "Raleway" }],
        signatureMotif: "editorial framing",
        colorMode: "dark",
        promptHints: ["Use stronger storytelling."],
        signaturePatterns: {
          layouts: ["Use a cinematic split hero with one oversized portrait."],
          motifs: ["Pair near-black surfaces with warm ivory typography."],
          antiPatterns: ["Avoid loud neon gradients.", "Never stack dense feature grids."],
        },
      },
      variantTemplateInspiration: {
        templateId: "k3-redesign-fixture",
        title: "K3 Redesign Fixture",
        category: "landing-pages",
        archiveUrl: "https://cdn.example.com/k3.zip",
        stillImageUrl: "https://cdn.example.com/k3-still.png",
        structuralReferences: [],
      },
    });

    expect(result.context).toContain("Follow-up delta rule");
    expect(result.context).toContain("Still avoid (variant anti-patterns)");
    expect(result.context).not.toContain("## Variant Template Inspiration");
    expect(result.context).not.toContain("Use a cinematic split hero with one oversized portrait.");
    expect(result.context).not.toContain("These are visual reference points, not a contract.");
    expect(result.pruning.keptBlockKeys).not.toContain("variant_template_inspiration");
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

  it("keeps compact follow-up context even for heavy non-redesign changes", () => {
    // Previously `contextPolicy: "heavy"` forced the full (non-compact)
    // render path. That made 3D/capability-heavy follow-ups re-expand the
    // scaffold variant, toolkit, route plan, lucide reminder and scaffold
    // research blocks even though the previous project files already carry
    // that detail — costing ~8-10k chars per repair/follow-up. The compact
    // branch now runs for every non-redesign follow-up; required blocks
    // (dossier files, brief-locked values, preservation) still come through
    // because the budget pass honors their priority.
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

    expect(result.context).not.toContain("## Scaffold Research Priorities");
    expect(result.context).not.toContain("### Lucide icons commonly needed");
    expect(result.context).not.toContain("**Planning source:**");
    expect(result.context).toContain("- **Routes in scope:** `/`, `/scene`");
  });

  // ──────────────────────────────────────────────────────────────────
  // Follow-up route-drift guard (prod 2026-08-01): the model created an
  // English `/pricing` duplicate + unrequested `/support` next to the
  // explicitly requested Swedish `/priser`/`/om-oss`. The follow-up prompt
  // must carry the existing-pages map + no-duplicate contract.
  // ──────────────────────────────────────────────────────────────────
  it("renders the existing-route-pages guard on follow-up with previousFilePaths", () => {
    const result = buildDynamicContext({
      intent: "website",
      userPrompt: "Lägg till sidorna /priser och /om-oss",
      generationMode: "followUp",
      previousFilePaths: [
        "app/page.tsx",
        "app/priser/page.tsx",
        "app/terms/page.tsx",
        "components/site-nav.tsx",
      ],
      routePlan: {
        provenance: { primarySource: "prompt", sources: ["prompt"] },
        siteType: "brochure",
        reason: "fixture",
        routes: [
          { path: "/", name: "Home", intent: "Landing", required: true },
          { path: "/priser", name: "Priser", intent: "Pricing", required: true },
        ],
      },
    });

    expect(result.context).toContain("## Existing Route Pages (do not duplicate)");
    expect(result.context).toContain("- `/priser`");
    expect(result.context).toContain("- `/terms`");
    expect(result.context).toContain(
      "Only create NEW pages the user explicitly asked for in this request.",
    );
    expect(result.context).toContain(
      "Never create a route that semantically duplicates an existing or requested page in another language",
    );
    const block = result.blocks.find(
      (candidate) => candidate.title === "Existing Route Pages (do not duplicate)",
    );
    expect(block).toMatchObject({ priority: 88, required: false, kept: true });
  });

  it("does NOT render the existing-route-pages guard on init", () => {
    const result = buildDynamicContext({
      intent: "website",
      userPrompt: "Bygg en hemsida med prissida",
      generationMode: "init",
      previousFilePaths: ["app/page.tsx", "app/priser/page.tsx"],
    });

    expect(result.context).not.toContain("## Existing Route Pages (do not duplicate)");
  });

  // ──────────────────────────────────────────────────────────────────
  // Capability-hint cleanliness: prompts that are neither 3D nor game
  // MUST NOT emit the 3D / interactive-game capability-hint lines.
  // Reviewers have flagged this several times — it's the single most
  // common way capability-specific hints leak into unrelated prompts.
  // ──────────────────────────────────────────────────────────────────
  it("does NOT emit 3D/WebGL or game capability hints on a plain landing prompt", () => {
    const result = buildDynamicContext({
      intent: "website",
      userPrompt: "Bygg en tydlig hemsida för en frisörsalong med öppettider och boka-knapp",
      generationMode: "init",
    });

    expect(result.context).not.toContain("3D/WebGL detected");
    expect(result.context).not.toContain("Game / playable mechanic requested");
    expect(result.context).not.toContain("interactive-game-loop");
  });

  it("emits the game capability hint for a Pac-Man prompt", () => {
    const result = buildDynamicContext({
      intent: "website",
      userPrompt: "Bygg Pac-Man med delfiner på startsidan",
      generationMode: "init",
      capabilityHints: [
        "## Detected Capabilities",
        "",
        "- **Game / playable mechanic requested**: state + loop + controls + collision + score + restart …",
      ].join("\n"),
    });

    // The hint itself is passed in via capabilityHints (normal orchestrate
    // flow), but the surrounding context (toolkit, route plan, etc.) must
    // still render and the game-hint bullet must survive budget pruning.
    expect(result.context).toContain("Game / playable mechanic requested");
    expect(result.context).toContain("state + loop + controls + collision + score + restart");
    // 3D must NOT bleed in when only game is signalled.
    expect(result.context).not.toContain("3D/WebGL detected");
  });

  it("emits both 3D and game hints when the prompt triggers both capabilities", () => {
    const result = buildDynamicContext({
      intent: "website",
      userPrompt: "Bygg ett 3D-arcade-game med fysik",
      generationMode: "init",
      capabilityHints: [
        "## Detected Capabilities",
        "",
        "- **3D/WebGL detected**: You MUST implement 3D elements …",
        "- **Game / playable mechanic requested**: state + loop + controls + collision + score + restart …",
      ].join("\n"),
    });

    expect(result.context).toContain("3D/WebGL detected");
    expect(result.context).toContain("Game / playable mechanic requested");
  });

  it("uses the file-derived F3 plan as the sole integration authority", () => {
    const result = buildDynamicContext({
      intent: "app",
      userPrompt: "Bygg integrationerna",
      generationMode: "followUp",
      buildSpec: {
        buildIntent: "app",
        generationMode: "followUp",
        changeScope: "integration",
        contextPolicy: "heavy",
        verificationPolicy: "strict",
        previewPolicy: "fidelity3",
        qualityTarget: "release-candidate",
        scaffoldId: "base-nextjs",
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
      } as BuildSpec,
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
          ],
          envVars: [{ key: "STRIPE_SECRET_KEY", reason: "Stripe" }],
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
            buildInstructions: ["Wire Clerk from parent files."],
            setupGuide: "Add Clerk keys.",
            hasConfigNoticeComponent: false,
          },
        ],
      },
    });

    expect(result.context).toContain("CLERK_SECRET_KEY");
    expect(result.context).not.toContain("## Pre-Generation Contracts");
    expect(result.context).not.toContain("speculative prompt contract");
  });

  it("uses approval as the sole integration authority when parent files have no spec (SM-005)", () => {
    const result = buildDynamicContext({
      intent: "app",
      userPrompt: "Bygg integrationerna",
      generationMode: "followUp",
      buildSpec: {
        buildIntent: "app",
        generationMode: "followUp",
        changeScope: "integration",
        contextPolicy: "heavy",
        verificationPolicy: "strict",
        previewPolicy: "fidelity3",
        qualityTarget: "release-candidate",
        scaffoldId: "base-nextjs",
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
      } as BuildSpec,
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
      tier3ApprovedProviders: ["stripe"],
    });

    const integrationPlanMatches = result.context.match(/## Tier-3 Integration Build Plan/g) ?? [];
    expect(integrationPlanMatches).toHaveLength(1);
    expect(result.context).toContain("STRIPE_SECRET_KEY");
    expect(result.context).not.toContain("## Pre-Generation Contracts");
    expect(result.context).not.toContain("RESEND_API_KEY");
    expect(result.context).not.toContain("speculative prompt contract");
  });

  it("still renders Pre-Generation Contracts when F3 has neither file spec nor approval", () => {
    const result = buildDynamicContext({
      intent: "app",
      userPrompt: "Bygg integrationerna",
      generationMode: "followUp",
      buildSpec: {
        buildIntent: "app",
        generationMode: "followUp",
        changeScope: "integration",
        contextPolicy: "heavy",
        verificationPolicy: "strict",
        previewPolicy: "fidelity3",
        qualityTarget: "release-candidate",
        scaffoldId: "base-nextjs",
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
      } as BuildSpec,
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
          ],
          envVars: [{ key: "STRIPE_SECRET_KEY", reason: "Stripe" }],
        },
        unresolvedDecisions: [],
      },
      tier3BuildSpec: { requirements: [] },
    });

    expect(result.context).toContain("## Pre-Generation Contracts");
    expect(result.context).toContain("speculative prompt contract");
  });
});
