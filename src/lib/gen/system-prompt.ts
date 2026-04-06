/**
 * System prompt builder for sajtmaskin's own code generation engine.
 *
 * Architecture:
 *  ┌─────────────────────────────────────────────────┐
 *  │  Static core — config/codegen-static-prompt.json +             │
 *  │    config/prompt-static/*.md (or monolithic systemprompt.md;   │
 *  │    not extensionless config/systemprompt)                      │
 *  │  (~6–8K tokens, mtime-cached per process)        │
 *  ├─────────────────────────────────────────────────┤
 *  │  Dynamic context  (varies per request)           │
 *  │  → Build intent, visual identity, project ctx    │
 *  └─────────────────────────────────────────────────┘
 *
 * Keeping the static block in one stable file helps prompt-prefix caching;
 * edit config/prompt-static/*.md and/or the manifest; see _READ_ME_FIRST.md.
 */

import type { BuildIntent } from "@/lib/builder/build-intent";
import { buildPaletteInstruction, type PaletteState } from "@/lib/builder/palette";
import type { ThemeColors } from "@/lib/builder/theme-presets";
import { debugLog } from "@/lib/utils/debug";
import type { BuildSpec } from "./build-spec";
import type { PreGenerationContractContext } from "./contract/pre-generation-contracts";
import type { RoutePlan } from "./route-plan";
import type { ScaffoldManifest } from "./scaffolds/types";
import { searchKnowledgeBaseAsync } from "./context/knowledge-base";
import { enrichWithRegistry } from "./context/registry-enricher";
import { getTemplateLibraryEntryById } from "./template-library/catalog";
import {
  searchTemplateLibraryWithDiagnostics,
  searchTemplateLibraryKeywordsOnly,
  selectTemplateReferenceFiles,
  type TemplateLibrarySearchDiagnostics,
} from "./template-library/search";
import {
  deriveTemplateRuntimeGuidance,
  isStarterOrBoilerplateReference,
} from "./template-library/runtime-guidance";
import type { TemplateLibraryEntry } from "./template-library/types";
import { looksDesignHeavyMessage } from "@/lib/builder/promptOrchestration";
import { getStaticCoreFromWorkspace } from "./static-core-loader";

// ═══════════════════════════════════════════════════════════════════════════
// STATIC CORE — config manifest + fragments (see static-core-loader.ts)
// ═══════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════
// DYNAMIC CONTEXT — varies per request
// ═══════════════════════════════════════════════════════════════════════════

const BUILD_INTENT_GUIDANCE: Record<
  BuildIntent,
  { label: string; rules: string[] }
> = {
  template: {
    label: "Template",
    rules: [
      "Scope is compact: 1-2 pages maximum with reusable sections.",
      "Avoid heavy app logic, databases, or authentication unless explicitly requested.",
      "Focus on layout quality, clean component composition, and content placeholders.",
      "Optimize for reusability — someone will customize this template for their own brand.",
    ],
  },
  website: {
    label: "Website",
    rules: [
      "Ship code that passes a real App Router build: valid `next/image`, metadata exports, and Server Components by default — not patterns that only work inside a browser-transpiled preview.",
      "Build a complete, visually polished website that feels professional and specific to the user's business.",
      "Every website MUST include: (1) sticky navigation header, (2) hero section with headline + subtext + CTA, (3) content sections relevant to the business, (4) footer with contact info or links.",
      "Hero sections must be impactful: large typography (text-5xl+), generous padding (py-24+), clear call-to-action buttons.",
      "Content sections should alternate backgrounds (bg-background / bg-muted/50) to create visual rhythm.",
      "Use shadcn/ui Cards for feature grids, Badges for labels, Buttons for CTAs. Only add Accordion for FAQs when the user or brief explicitly asks for FAQ content.",
      "Include realistic mock content — specific to the business type. A bakery needs warm, inviting copy; a law firm sounds authoritative; a startup sounds energetic. Never leave generic placeholder text.",
      "Add social proof (testimonials, ratings, trust signals) only when the prompt or brief calls for it or the business type naturally benefits — do not force testimonials on every site.",
      "Match scope to the request: short prompt = polished one-pager; detailed prompt = multi-page site.",
      "SEO baseline is required by default: include metadata with title/description, Open Graph/Twitter data, canonical strategy, sitemap, robots, and at least one sensible JSON-LD/schema.org block for company-style sites unless the user explicitly says otherwise.",
      "Scroll-reveal animations (fade-in, slide-up) must NEVER be applied to hero sections or other above-the-fold content — that content must render instantly without any opacity/blur/transform transition. Only use reveal on sections that appear below the fold on scroll. Never use CSS blur as part of reveal transitions on text — it makes content unreadable during the transition. Prefer opacity + translateY only.",
      "Never use the Tailwind arbitrary class `font-[family-name:var(--x)]` — it produces corrupt CSS in Turbopack. Instead, use inline `style={{ fontFamily: 'var(--font-serif)' }}` or define a utility class in globals.css.",
    ],
  },
  app: {
    label: "Application",
    rules: [
      "Build a functional application with professional UI that feels like a real product.",
      "MUST include: sidebar or top navigation, main content area, and contextual actions.",
      "Use shadcn/ui Sidebar for dashboard-style apps. Include a collapsible sidebar with icon + label navigation items.",
      "Include stateful UI: data tables with sorting/filtering, forms with validation feedback, modals for create/edit flows.",
      "Define realistic mock data with TypeScript interfaces. Use 5-10 realistic data rows, not placeholder text.",
      "Add empty states with illustrations (Lucide icons), loading skeletons, and error boundaries.",
      "Structure state with React hooks (useState, useReducer). Only add Context if state is shared across many components.",
      "Include toast notifications (via Sonner) for actions like save, delete, and error feedback.",
      "Full Next.js runtime is available: Server Actions, API routes, middleware, and any npm package. Use them when the app needs real data flow.",
    ],
  },
};

export interface Brief {
  projectTitle?: string;
  brandName?: string;
  oneSentencePitch?: string;
  tagline?: string;
  targetAudience?: string;
  primaryCallToAction?: string;
  toneAndVoice?: string[];
  visualDirection?: {
    styleKeywords?: string[];
    colorPalette?: {
      primary?: string;
      secondary?: string;
      accent?: string;
      background?: string;
      text?: string;
    };
    typography?: {
      headings?: string;
      body?: string;
    };
  };
  pages?: Array<{
    name?: string;
    path?: string;
    purpose?: string;
    sections?: Array<{
      type?: string;
      heading?: string;
      bullets?: string[];
    }>;
  }>;
  imagery?: {
    styleKeywords?: string[];
    suggestedSubjects?: string[];
    styleNotes?: string[];
    subjects?: string[];
    shotTypes?: string[];
    altTextRules?: string[];
  };
  mustHave?: string[];
  avoid?: string[];
  uiNotes?: {
    components?: string[];
    interactions?: string[];
    accessibility?: string[];
  };
  seo?: {
    titleTemplate?: string;
    metaDescription?: string;
    keywords?: string[];
  };
  siteName?: string;
}

export interface MediaCatalogItem {
  alias: string;
  url: string;
  alt?: string;
}

export interface DesignReferenceAsset {
  kind: "figma" | "image";
  label: string;
  note?: string;
}

export interface DynamicContextOptions {
  intent: BuildIntent;
  brief?: Brief | null;
  themeOverride?: ThemeColors | null;
  imageGenerations?: boolean;
  mediaCatalog?: MediaCatalogItem[];
  originalPrompt?: string;
  scaffoldContext?: string;
  resolvedScaffold?: ScaffoldManifest | null;
  routePlan?: RoutePlan | null;
  preGenerationContracts?: PreGenerationContractContext | null;
  componentPalette?: PaletteState | null;
  designThemePreset?: string | null;
  designReferences?: DesignReferenceAsset[];
  /** User-supplied custom instructions from the builder UI */
  customInstructions?: string;
  /**
   * When false, skip semantic KB fallback and embedding-based template reference search.
   * Default true. Used by offline CLI traces; production omits this.
   */
  embeddingEnrichment?: boolean;
  /** `init` = first gen (rich brief), `followUp` = delta-only editing. */
  generationMode?: "init" | "followUp";
  buildSpec?: BuildSpec | null;
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function strList(v: unknown): string[] {
  return Array.isArray(v) ? v.map((x) => str(x)).filter(Boolean) : [];
}

const MIN_TEMPLATE_REFERENCE_QUALITY = 55;
const MIN_SCAFFOLD_REFERENCE_QUALITY = 45;

interface RankedTemplateReference {
  entry: TemplateLibraryEntry;
  score: number;
  source: "prompt" | "scaffold" | "hybrid";
  reasons: string[];
}

interface RankedTemplateReferenceResponse {
  matches: RankedTemplateReference[];
  diagnostics: TemplateLibrarySearchDiagnostics | null;
}

function intersectsScaffoldFamilies(
  entry: TemplateLibraryEntry,
  resolvedScaffold: ScaffoldManifest | null | undefined,
): boolean {
  if (!resolvedScaffold) return false;
  return entry.recommendedScaffoldFamilies.includes(resolvedScaffold.family);
}

function starterReferencePenalty(
  entry: TemplateLibraryEntry,
  resolvedScaffold: ScaffoldManifest | null | undefined,
): number {
  if (!isStarterOrBoilerplateReference(entry)) return 0;
  // Keep starter references for structure in base-nextjs mode, but strongly
  // downrank them as style references for richer scaffolds.
  if (resolvedScaffold?.family === "base-nextjs") return 8;
  return 24;
}

function addTemplateReferenceCandidate(
  candidates: Map<string, RankedTemplateReference>,
  entry: TemplateLibraryEntry,
  score: number,
  reason: string,
  source: "prompt" | "scaffold",
): void {
  const existing = candidates.get(entry.id);
  if (!existing) {
    candidates.set(entry.id, {
      entry,
      score,
      source,
      reasons: [reason],
    });
    return;
  }

  existing.score += score;
  existing.source = existing.source === source ? source : "hybrid";
  if (!existing.reasons.includes(reason)) {
    existing.reasons.push(reason);
  }
}

async function rankTemplateReferences(
  originalPrompt: string,
  resolvedScaffold: ScaffoldManifest | null | undefined,
  useEmbeddingSearch = true,
  topK = 6,
): Promise<RankedTemplateReferenceResponse> {
  const templateSearch = useEmbeddingSearch
    ? await searchTemplateLibraryWithDiagnostics(originalPrompt, topK)
    : {
        results: searchTemplateLibraryKeywordsOnly(originalPrompt, topK),
        diagnostics: null,
      };
  const promptMatches = templateSearch.results;
  const candidates = new Map<string, RankedTemplateReference>();
  const scaffoldLabel = resolvedScaffold?.label ?? "the selected scaffold";

  for (const match of promptMatches) {
    const fitBoost = intersectsScaffoldFamilies(match.entry, resolvedScaffold) ? 16 : 0;
    const starterPenalty = starterReferencePenalty(match.entry, resolvedScaffold);
    const starterHint = isStarterOrBoilerplateReference(match.entry)
      ? " Tolkas som strukturreferens, inte stilfacit."
      : "";
    addTemplateReferenceCandidate(
      candidates,
      match.entry,
      match.score * 100 + fitBoost + match.entry.qualityScore / 10 - starterPenalty,
      fitBoost > 0
        ? `Prompten matchar och referensen passar vald runtime scaffold.${starterHint}`
        : `Prompten matchar denna kuraterade referens.${starterHint}`,
      "prompt",
    );
  }

  for (const reference of resolvedScaffold?.research?.referenceTemplates ?? []) {
    const entry = getTemplateLibraryEntryById(reference.id);
    if (!entry) continue;
    const fitBoost = intersectsScaffoldFamilies(entry, resolvedScaffold) ? 20 : 0;
    const starterPenalty = starterReferencePenalty(entry, resolvedScaffold);
    const starterHint = isStarterOrBoilerplateReference(entry)
      ? " Referensen används som strukturhjälp, inte visuell facit."
      : "";
    addTemplateReferenceCandidate(
      candidates,
      entry,
      35 + fitBoost + entry.qualityScore / 10 - starterPenalty,
      `Scaffoldens research pekar ut denna referens för ${scaffoldLabel}.${starterHint}`,
      "scaffold",
    );
  }

  return {
    matches: [...candidates.values()]
      .filter((candidate) => {
        if (candidate.source === "scaffold" || candidate.source === "hybrid") {
          return candidate.entry.qualityScore >= MIN_SCAFFOLD_REFERENCE_QUALITY;
        }
        return candidate.entry.qualityScore >= MIN_TEMPLATE_REFERENCE_QUALITY;
      })
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return b.entry.qualityScore - a.entry.qualityScore;
      }),
    diagnostics: templateSearch.diagnostics,
  };
}

function describeTemplateSearchDiagnostics(
  diagnostics: TemplateLibrarySearchDiagnostics | null,
): string | null {
  if (!diagnostics) return null;
  switch (diagnostics.mode) {
    case "empty_catalog":
      return "Committed template library is empty, so runtime should rely on scaffold research and the user's request.";
    case "hybrid_keyword_blend":
      return "Semantic template retrieval was weak, so keyword fallback was blended in to keep references conservative.";
    case "keyword_fallback":
      switch (diagnostics.reason) {
        case "missing_api_key":
          return "Semantic template retrieval is unavailable in this environment, so references came from keyword fallback only.";
        case "missing_embeddings":
          return "Template embeddings are unavailable, so references came from keyword fallback only.";
        case "embedding_query_failed":
          return "Template embedding lookup failed at runtime, so references came from keyword fallback only.";
        case "no_embedding_hits":
          return "Semantic template search found no strong hits, so references came from keyword fallback only.";
        default:
          return "Template references came from keyword fallback only.";
      }
    default:
      return null;
  }
}

function shouldIncludeTemplateCodeSnippets(buildSpec: BuildSpec | null | undefined): boolean {
  if (!buildSpec) return true;
  if (buildSpec.contextPolicy === "light") return false;
  return (
    buildSpec.contextPolicy === "heavy" ||
    buildSpec.changeScope === "redesign" ||
    buildSpec.changeScope === "page-addition" ||
    buildSpec.changeScope === "integration"
  );
}

function resolveTemplateSnippetSelectionOptions(
  referenceBudget: number,
  buildSpec: BuildSpec | null | undefined,
): {
  maxFiles: number;
  maxExcerptChars: number;
  maxTotalChars: number;
} {
  const isHeavy = buildSpec?.contextPolicy === "heavy";
  const maxTotalChars = Math.max(2_400, Math.min(referenceBudget, isHeavy ? 5_000 : 3_000));
  return {
    maxFiles: isHeavy ? 2 : 1,
    maxExcerptChars: Math.min(maxTotalChars, isHeavy ? 2_200 : 1_500),
    maxTotalChars,
  };
}

export type BuildDynamicContextResult = {
  context: string;
  /** Set when template-library retrieval ran (skipped in light follow-up mode). */
  templateLibrarySearchDiagnostics: TemplateLibrarySearchDiagnostics | null;
};

/**
 * Builds the dynamic (per-request) portion of the system prompt.
 * Contains build intent guidance, project context, visual identity, and media catalog.
 */
export async function buildDynamicContext(
  options: DynamicContextOptions,
): Promise<BuildDynamicContextResult> {
  const {
    intent,
    brief,
    themeOverride,
    imageGenerations: _imageGenerations = false,
    mediaCatalog,
    originalPrompt,
    scaffoldContext,
    resolvedScaffold,
    routePlan,
    preGenerationContracts,
    componentPalette,
    designThemePreset,
    designReferences,
    customInstructions,
    embeddingEnrichment = true,
    generationMode,
    buildSpec,
  } = options;

  const isFollowUp = generationMode === "followUp";
  const originalPromptTrimmed = (originalPrompt ?? "").trim();
  const useLightFollowUpContext =
    isFollowUp &&
    buildSpec?.contextPolicy === "light" &&
    (buildSpec.changeScope === "copy" || buildSpec.changeScope === "local-layout") &&
    !looksDesignHeavyMessage(originalPromptTrimmed);
  const useLightFirstGenContext =
    !isFollowUp &&
    buildSpec?.contextPolicy !== "heavy" &&
    originalPromptTrimmed.length < 1500 &&
    !resolvedScaffold?.research;
  const skipHeavyRetrieval = useLightFollowUpContext || useLightFirstGenContext;
  const referenceBudget = buildSpec?.tokenBudgets.refsChars ?? 8_000;

  const parts: string[] = [];
  let templateLibrarySearchDiagnostics: TemplateLibrarySearchDiagnostics | null = null;

  // ── Generation Mode ────────────────────────────────────────────────────
  if (isFollowUp) {
    parts.push(
      "## Generation Mode: Follow-Up",
      "",
      "You are editing/refining an existing generation. The scaffold, brief, and route plan below were established in the initial generation. Apply only the user's requested changes.",
      "",
    );
  }

  // ── Custom Instructions (user-supplied from builder UI) ────────────────
  const trimmedCustom = customInstructions?.trim();
  if (trimmedCustom) {
    parts.push("## Custom Instructions (from the user)", "", trimmedCustom, "");
  }

  // ── Build Intent ────────────────────────────────────────────────────────
  const guidance = BUILD_INTENT_GUIDANCE[intent];
  parts.push(
    `## Build Intent: ${guidance.label}`,
    "",
    ...guidance.rules.map((r) => `- ${r}`),
    "",
  );

  if (buildSpec) {
    const referenceFamilies =
      buildSpec.referenceCategories.length > 0
        ? buildSpec.referenceCategories.join(", ")
        : "general";
    const profileLines: string[] = [
      "## Generation Profile",
      "",
      `- **Style direction:** ${buildSpec.stylePack}`,
      `- **Quality tier:** ${buildSpec.qualityTarget}`,
      `- **Reference families:** ${referenceFamilies}`,
    ];
    if (buildSpec.forbiddenPatterns.length > 0) {
      profileLines.push(
        `- **Forbidden patterns:** ${buildSpec.forbiddenPatterns.join(", ")}`,
      );
    }
    profileLines.push("");
    parts.push(...profileLines);
  }

  // ── Scaffold ───────────────────────────────────────────────────────────
  if (scaffoldContext) {
    parts.push("## Scaffold", "", scaffoldContext.trim(), "");
  }

  if (resolvedScaffold) {
    const checklist = resolvedScaffold.qualityChecklist?.slice(0, 6) ?? [];
    const upgradeTargets = resolvedScaffold.research?.upgradeTargets.slice(0, 5) ?? [];
    if (checklist.length > 0 || upgradeTargets.length > 0) {
      parts.push(
        "## Scaffold Research Priorities",
        "",
        `Use these runtime priorities for the selected scaffold (${resolvedScaffold.label}) while adapting the implementation to the user's request.`,
      );
      if (checklist.length > 0) {
        parts.push("", "- Quality checklist:");
        parts.push(...checklist.map((item) => `  - ${item}`));
      }
      if (upgradeTargets.length > 0) {
        parts.push("", "- Upgrade targets from curated research:");
        parts.push(...upgradeTargets.map((item) => `  - ${item}`));
      }
      parts.push("");
    }
  }

  if (routePlan && routePlan.routes.length > 0) {
    parts.push(
      "## Route Plan",
      "",
      `- **Site type:** ${routePlan.siteType}`,
      `- **Planning source:** ${routePlan.source}`,
      `- **Why:** ${routePlan.reason}`,
      "",
    );
    for (const route of routePlan.routes.slice(0, 10)) {
      parts.push(
        `- \`${route.path}\` — ${route.name}: ${route.intent}${route.required ? " (must exist)" : ""}`,
      );
    }
    if (routePlan.routes.length > 1) {
      parts.push(
        "",
        "- Do not collapse this into a single long landing page. Create real App Router page files for the required routes unless the user explicitly asks to simplify.",
      );
    } else {
      parts.push("", "- Keep the route structure compact unless the prompt clearly requires extra pages.");
    }
    parts.push("");
  }

  if (preGenerationContracts) {
    const { contracts, unresolvedDecisions } = preGenerationContracts;
    const hasContractSignal =
      contracts.dataMode !== "none" ||
      Boolean(contracts.databaseProvider) ||
      Boolean(contracts.authProvider) ||
      Boolean(contracts.paymentProvider) ||
      contracts.integrations.length > 0 ||
      contracts.envVars.length > 0 ||
      unresolvedDecisions.length > 0;
    if (hasContractSignal) {
      parts.push("## Pre-Generation Contracts", "");
      parts.push(`- **Data mode:** ${contracts.dataMode}`);
      if (contracts.databaseProvider) parts.push(`- **Database:** ${contracts.databaseProvider}`);
      if (contracts.authProvider) parts.push(`- **Auth:** ${contracts.authProvider}`);
      if (contracts.paymentProvider) parts.push(`- **Payment:** ${contracts.paymentProvider}`);
      for (const integration of contracts.integrations.slice(0, 8)) {
        const envSuffix = integration.envVars?.length ? ` [${integration.envVars.join(", ")}]` : "";
        parts.push(
          `- **Integration (${integration.status}):** ${integration.name} — ${integration.reason}${envSuffix}`,
        );
      }
      if (contracts.envVars.length > 0) {
        parts.push("", "- **Environment variables:**");
        parts.push(
          ...contracts.envVars
            .slice(0, 10)
            .map((envVar) => `  - ${envVar.key} — ${envVar.reason}${envVar.required ? " (required)" : ""}`),
        );
      }
      parts.push(
        "",
        "- **Placeholder policy (mandatory for runnable preview):** If **Auth** is NextAuth/Auth.js, use **Credentials** (password/demo user) only — **no OAuth** providers unless the user explicitly asked for one by name. If **Stripe/payment** appears, use test-mode keys and/or `process.env` fallbacks so the app never throws at import time. The preview/sandbox merges non-secret placeholder `.env.local` values; your code must still run when those are absent.",
        "",
      );
      if (unresolvedDecisions.length > 0) {
        parts.push("", "- **Unresolved decisions:**");
        parts.push(...unresolvedDecisions.map((entry) => `  - ${entry.kind}: ${entry.reason}`));
        parts.push(
          "  - Prefer **non-blocking** defaults: Auth.js Credentials, SQLite or mock data, Stripe test placeholders. Do not stall generation on provider choice; ship runnable code first.",
        );
      }
      if (preGenerationContracts.confirmedAnswers.length > 0) {
        parts.push("", "- **Confirmed contract answers from the user:**");
        parts.push(
          ...preGenerationContracts.confirmedAnswers
            .slice(0, 6)
            .map((entry) => `  - ${entry.kind}: ${entry.answer}`),
        );
      }
      parts.push("");
    }
  }

  // ── Project Context (from brief) ────────────────────────────────────────
  if (brief) {
    const title = str(brief.projectTitle) || str(brief.siteName) || "Website";
    const brand = str(brief.brandName);
    const pitch = str(brief.oneSentencePitch) || str(brief.tagline);
    const audience = str(brief.targetAudience);
    const cta = str(brief.primaryCallToAction);
    const tone = strList(brief.toneAndVoice);

    const ctxLines: string[] = [
      `## Project Context`,
      "",
      `- **Title:** ${title}`,
    ];
    if (brand) ctxLines.push(`- **Brand:** ${brand}`);
    if (pitch) ctxLines.push(`- **Pitch:** ${pitch}`);
    if (audience) ctxLines.push(`- **Audience:** ${audience}`);
    if (cta) ctxLines.push(`- **Primary CTA:** ${cta}`);
    if (tone.length) ctxLines.push(`- **Tone:** ${tone.join(", ")}`);
    ctxLines.push("");

    parts.push(...ctxLines);

    // Pages & sections
    const pages = Array.isArray(brief.pages) ? brief.pages : [];
    if (pages.length > 0) {
      parts.push("## Pages & Sections", "");
      for (const p of pages.slice(0, 10)) {
        const name = str(p?.name) || "Page";
        const path = str(p?.path) || "/";
        const purpose = str(p?.purpose);
        parts.push(`- **${name}** (\`${path}\`)${purpose ? ` — ${purpose}` : ""}`);
        const sections = Array.isArray(p?.sections) ? p.sections : [];
        for (const s of sections.slice(0, 14)) {
          const type = str(s?.type) || "section";
          const heading = str(s?.heading);
          const bullets = strList(s?.bullets).slice(0, 8);
          const bulletText = bullets.length > 0 ? `: ${bullets.join("; ")}` : "";
          parts.push(`  - ${type}${heading ? ` — ${heading}` : ""}${bulletText}`);
        }
      }
      parts.push("");
    }

    // Must-have / avoid
    const mustHave = strList(brief.mustHave).slice(0, 10);
    const avoid = strList(brief.avoid).slice(0, 8);
    if (mustHave.length > 0) {
      parts.push("## Must Have", "", ...mustHave.map((m) => `- ${m}`), "");
    }
    if (avoid.length > 0) {
      parts.push("## Avoid", "", ...avoid.map((a) => `- ${a}`), "");
    }
  }

  parts.push(
    "## Preview vs CodeProject parity",
    "",
    "- A temporary compatibility preview may appear in the product before this stream finishes. Treat it as a rough layout approximation only, not the final design system.",
    "- Your emitted files are the **source of truth**: they must reflect the **user message**, any **Project Context / brief** above, **Visual Identity**, and the **scaffold** (structure hints only). Do not replace a specific user topic, language, or palette with an unrelated generic marketing template.",
    "- When a structured brief exists, major copy, sections, palette, and tone should be traceable to that brief or the prompt — **extend and refine**, do not reset to a generic narrative.",
    "",
  );

  // ── Visual Identity ─────────────────────────────────────────────────────
  const hasTheme = themeOverride && (themeOverride.primary || themeOverride.secondary || themeOverride.accent);
  const briefPalette = brief?.visualDirection?.colorPalette;
  const styleKeywords = strList(brief?.visualDirection?.styleKeywords);
  const typography = brief?.visualDirection?.typography;
  const themePresetLabel = str(designThemePreset);
  const paletteInstruction = buildPaletteInstruction(componentPalette);

  if (themePresetLabel || hasTheme || briefPalette || styleKeywords.length > 0 || typography) {
    parts.push("## Visual Identity", "");

    if (themePresetLabel) {
      parts.push(`- **Internal theme preset:** ${themePresetLabel}`);
    }

    if (styleKeywords.length > 0) {
      parts.push(`- **Style:** ${styleKeywords.join(", ")}`);
    }

    if (hasTheme) {
      parts.push("- **Theme tokens (locked — use exactly these values):**");
      if (themeOverride!.primary) parts.push(`  - --primary: ${themeOverride!.primary}`);
      if (themeOverride!.secondary) parts.push(`  - --secondary: ${themeOverride!.secondary}`);
      if (themeOverride!.accent) parts.push(`  - --accent: ${themeOverride!.accent}`);
      parts.push("- Apply these colors via Tailwind's semantic classes (`bg-primary`, `text-primary-foreground`, etc.).");
    } else if (briefPalette?.primary) {
      parts.push(`- **Color palette:** primary ${briefPalette.primary}${briefPalette.secondary ? `, secondary ${briefPalette.secondary}` : ""}${briefPalette.accent ? `, accent ${briefPalette.accent}` : ""}`);
    }

    if (typography?.headings || typography?.body) {
      parts.push(`- **Typography:** headings ${typography.headings || "system"}, body ${typography.body || "system"}`);
    }

    parts.push("");
  }

  if (paletteInstruction) {
    parts.push(paletteInstruction, "");
  }

  if (designReferences && designReferences.length > 0) {
    parts.push(
      "## Design References",
      "",
      "- Use attached design references as visual direction, not as an excuse to produce a flat screenshot clone.",
      "- Read references in this order: (1) structure and hierarchy, (2) spacing rhythm and alignment, (3) component vocabulary, (4) finishing details such as texture, glow, shadows, and gradients.",
      "- Preserve the strongest layout ideas from the references, but still produce clean React/Tailwind code with reusable sections and accessible markup.",
    );
    for (const reference of designReferences.slice(0, 6)) {
      const note = reference.note ? ` — ${reference.note}` : "";
      parts.push(`- **${reference.kind === "figma" ? "Figma" : "Image"} reference:** ${reference.label}${note}`);
    }
    parts.push("");
  }

  // ── Imagery ─────────────────────────────────────────────────────────────
  parts.push("## Imagery", "");
  parts.push(
    "Use `/placeholder.svg?height=H&width=W&text=DESCRIPTION` for all images. Write descriptive `text` parameters that precisely match the site's subject (e.g. `text=Vintage+leather+cowboy+boots+warm+lighting`). Post-processing replaces these with real Unsplash photos automatically.",
    "- The hero section **MUST** have a large image (height=600, width=1200 minimum).",
    "- Include images in at least 2 additional sections beyond the hero.",
    "- NEVER fabricate Unsplash photo IDs. NEVER use picsum.photos, placehold.co, `blob:`, or `data:` URIs.",
  );
  parts.push("");

  // Imagery notes from brief
  if (brief?.imagery) {
    const imgNotes = [
      ...strList(brief.imagery.styleKeywords),
      ...strList(brief.imagery.suggestedSubjects),
      ...strList(brief.imagery.styleNotes),
    ].filter(Boolean);
    if (imgNotes.length > 0) {
      parts.push(...imgNotes.map((n) => `- ${n}`), "");
    }
  }

  // ── Media Catalog ───────────────────────────────────────────────────────
  if (mediaCatalog && mediaCatalog.length > 0) {
    parts.push(
      "## Media Catalog",
      "",
      "Use the following media assets by their alias. The aliases will be expanded to full URLs during post-processing.",
      "",
    );
    for (const item of mediaCatalog.slice(0, 30)) {
      const altText = item.alt ? ` (${item.alt})` : "";
      parts.push(`- \`{{${item.alias}}}\`${altText}`);
    }
    parts.push("");
  }

  // ── SEO (from brief) ───────────────────────────────────────────────────
  if (brief?.seo) {
    const seoTitle = str(brief.seo.titleTemplate);
    const seoDesc = str(brief.seo.metaDescription);
    const seoKw = strList(brief.seo.keywords);
    if (seoTitle || seoDesc || seoKw.length > 0) {
      parts.push("## SEO", "");
      if (seoTitle) parts.push(`- **Title template:** ${seoTitle}`);
      if (seoDesc) parts.push(`- **Meta description:** ${seoDesc}`);
      if (seoKw.length > 0) parts.push(`- **Keywords:** ${seoKw.join(", ")}`);
      parts.push("");
    }
  }

  // ── Relevant Documentation + Template Retrieval (parallel) ──────────────
  if (originalPrompt && !skipHeavyRetrieval) {
    const [kbSearch, templateReferenceSearch] = await Promise.all([
      searchKnowledgeBaseAsync({
        query: originalPrompt,
        maxResults: 7,
        maxChars: 4000,
        allowSemantic: embeddingEnrichment,
      }),
      rankTemplateReferences(
        originalPrompt,
        resolvedScaffold,
        embeddingEnrichment,
        buildSpec?.contextPolicy === "heavy" ? 6 : 4,
      ),
    ]);
    if (kbSearch.matches.length > 0) {
      parts.push("## Relevant Documentation", "");
      if (kbSearch.mode === "keyword_weak_semantic") {
        parts.push("- _Retrieval note: semantic search was unavailable or returned no strong hits; keyword fallback only._", "");
      }
      for (const match of kbSearch.matches) {
        parts.push(`### ${match.title}`, "", match.content, "");
      }

      try {
        const registryExtra = await enrichWithRegistry(kbSearch.matches);
        if (registryExtra) {
          parts.push(registryExtra, "");
        }
      } catch {
        // Registry unavailable -- continue without enrichment
      }
    }
    templateLibrarySearchDiagnostics = templateReferenceSearch.diagnostics;
    const usefulTemplateMatches = templateReferenceSearch.matches.slice(
      0,
      buildSpec?.contextPolicy === "heavy" ? 3 : 2,
    );
    const templateSearchStatus = describeTemplateSearchDiagnostics(
      templateReferenceSearch.diagnostics,
    );
    if (usefulTemplateMatches.length > 0) {
      parts.push("## Relevant Template References", "");
      parts.push(
        "- Treat the structured guidance in this section as the primary runtime signal. If small code excerpts appear below, use them only as narrow structural inspiration.",
      );
      parts.push(
        "- Never let a reference override the user's brief, route plan, selected scaffold, current project files, or follow-up scope.",
      );
      if (templateSearchStatus) {
        parts.push(`- Retrieval status: ${templateSearchStatus}`);
      }
      parts.push("");
      for (const match of usefulTemplateMatches) {
        const guidance = deriveTemplateRuntimeGuidance(match.entry);
        parts.push(`### ${match.entry.title}`, "");
        parts.push(`- Category: ${match.entry.categoryName}`);
        parts.push(`- Scaffold fit: ${match.entry.recommendedScaffoldFamilies.join(", ")}`);
        parts.push(`- Quality score: ${match.entry.qualityScore}`);
        parts.push(`- Why this reference: ${match.reasons.join(" ")}`);
        parts.push(`- Summary: ${match.entry.summary}`);
        if (isStarterOrBoilerplateReference(match.entry)) {
          parts.push("- Reference mode: structure-only (starter/boilerplate).");
        }
        if (guidance.styleRules.length > 0) {
          parts.push(`- Style rules: ${guidance.styleRules.join(" | ")}`);
        }
        if (guidance.sectionInventory.length > 0) {
          parts.push(`- Section inventory: ${guidance.sectionInventory.join(" | ")}`);
        }
        if (guidance.avoidPatterns.length > 0) {
          parts.push(`- Avoid: ${guidance.avoidPatterns.join(" | ")}`);
        }
        if (guidance.worldClassRubric.length > 0) {
          parts.push(`- World-class rubric: ${guidance.worldClassRubric.join(" | ")}`);
        }
        parts.push("");
      }

      const allowTemplateCodeSnippets = shouldIncludeTemplateCodeSnippets(buildSpec);
      const snippetSelectionOptions = resolveTemplateSnippetSelectionOptions(
        referenceBudget,
        buildSpec,
      );
      const snippetMatches = allowTemplateCodeSnippets
        ? usefulTemplateMatches
          .slice(0, 2)
          .map((match) => ({
            match,
            files: selectTemplateReferenceFiles(match.entry, snippetSelectionOptions),
          }))
          .filter(
            (item) =>
              item.files.length > 0 && !isStarterOrBoilerplateReference(item.match.entry),
          )
        : [];

      if (allowTemplateCodeSnippets && snippetMatches.length > 0) {
        parts.push(
          "## Reference Code Snippets",
          "",
          "Use these as structural inspiration only when they directly unblock a component or layout pattern. Keep them secondary to the guidance above.",
          "",
        );
        for (const { match, files } of snippetMatches) {
          parts.push(`### ${match.entry.title}`, "");
          for (const file of files) {
            parts.push(`- ${file.path} — ${file.reason}`, "");
            parts.push("```text");
            parts.push(file.excerpt);
            parts.push("```", "");
          }
        }
      }
    } else if (templateSearchStatus) {
      parts.push(
        "## Template Reference Retrieval",
        "",
        `- ${templateSearchStatus}`,
        "- No curated template references were injected, so scaffold guidance and the user's request should stay primary.",
        "",
      );
    }
  }

  // ── Original request reference ──────────────────────────────────────────
  if (originalPrompt) {
    const MAX_INLINE_ORIGINAL_PROMPT_CHARS = 400;
    const trimmed = originalPrompt.trim();
    if (trimmed.length <= MAX_INLINE_ORIGINAL_PROMPT_CHARS || !isFollowUp) {
      parts.push("## Original Request (for reference)", "", trimmed, "");
    } else {
      const summary = trimmed.slice(0, MAX_INLINE_ORIGINAL_PROMPT_CHARS).trimEnd();
      parts.push(
        "## Original Request (summary)",
        "",
        `${summary} …`,
        "",
        `_(Full original request: ${trimmed.length} chars, truncated for prompt budget.)_`,
        "",
      );
    }
  }

  let context = parts.join("\n").trim();

  const budgetChars = buildSpec?.tokenBudgets.systemContextChars ?? 28_000;
  if (context.length > budgetChars) {
    const originalLength = context.length;
    context = context.slice(0, budgetChars);
    const lastNewline = context.lastIndexOf("\n");
    if (lastNewline > budgetChars * 0.9) {
      context = context.slice(0, lastNewline);
    }
    context += "\n\n_(Dynamic context truncated to budget.)_";
    debugLog("engine", `Dynamic context truncated: ${originalLength} chars → ${context.length} chars (budget ${budgetChars})`);
  }

  return {
    context,
    templateLibrarySearchDiagnostics,
  };
}


// ═══════════════════════════════════════════════════════════════════════════
// PUBLIC API — buildSystemPrompt(), getSystemPromptLengths()
// ═══════════════════════════════════════════════════════════════════════════

/** Between static core (files under config/prompt-static) and buildDynamicContext output. */
export const SYSTEM_PROMPT_SEPARATOR = "\n\n---\n\n# Request-Specific Context\n\n";

export interface BuildSystemPromptOptions {
  intent: BuildIntent;
  brief?: Brief | null;
  themeOverride?: ThemeColors | null;
  imageGenerations?: boolean;
  mediaCatalog?: MediaCatalogItem[];
  originalPrompt?: string;
  scaffoldContext?: string;
  resolvedScaffold?: ScaffoldManifest | null;
  routePlan?: RoutePlan | null;
  preGenerationContracts?: PreGenerationContractContext | null;
  componentPalette?: PaletteState | null;
  designThemePreset?: string | null;
  designReferences?: DesignReferenceAsset[];
  customInstructions?: string;
  embeddingEnrichment?: boolean;
  generationMode?: "init" | "followUp";
  buildSpec?: BuildSpec | null;
}

/**
 * Builds the complete system prompt by combining the static core with
 * a dynamic, per-request context block.
 *
 * The static core is always the first portion of the string, which allows
 * OpenAI's prompt prefix caching to kick in after the first request.
 */
export async function buildSystemPrompt(options: BuildSystemPromptOptions): Promise<string> {
  const { context } = await buildDynamicContext({
    intent: options.intent,
    brief: options.brief,
    themeOverride: options.themeOverride,
    imageGenerations: options.imageGenerations,
    mediaCatalog: options.mediaCatalog,
    originalPrompt: options.originalPrompt,
    scaffoldContext: options.scaffoldContext,
    resolvedScaffold: options.resolvedScaffold,
    routePlan: options.routePlan,
    preGenerationContracts: options.preGenerationContracts,
    componentPalette: options.componentPalette,
    designThemePreset: options.designThemePreset,
    designReferences: options.designReferences,
    buildSpec: options.buildSpec,
    customInstructions: options.customInstructions,
    embeddingEnrichment: options.embeddingEnrichment,
    generationMode: options.generationMode,
  });

  return `${getStaticCoreFromWorkspace()}${SYSTEM_PROMPT_SEPARATOR}${context}`;
}

/** Compose static codegen core + dynamic context without re-running retrieval. */
export function composeEngineSystemPrompt(dynamicContextText: string): string {
  return `${getStaticCoreFromWorkspace()}${SYSTEM_PROMPT_SEPARATOR}${dynamicContextText}`;
}

/**
 * Returns character counts for prompt-cache monitoring.
 * Use after buildSystemPrompt() to log total, static, and dynamic lengths.
 */
export function getSystemPromptLengths(fullPrompt: string): {
  total: number;
  static: number;
  dynamic: number;
} {
  const total = fullPrompt.length;
  const sepIdx = fullPrompt.indexOf(SYSTEM_PROMPT_SEPARATOR);
  if (sepIdx === -1) {
    return { total, static: total, dynamic: 0 };
  }
  const staticLen = sepIdx;
  const dynamicLen = total - staticLen - SYSTEM_PROMPT_SEPARATOR.length;
  return {
    total,
    static: staticLen,
    dynamic: Math.max(0, dynamicLen),
  };
}

