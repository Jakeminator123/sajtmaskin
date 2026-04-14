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
 * Step 3 — what actually reaches the model (own-engine):
 *  - **Static core** (`getStaticCoreFromWorkspace`) + `SYSTEM_PROMPT_SEPARATOR` +
 *    **dynamic context** from this file = full **system** message.
 *  - **User turn** = current request prompt (possibly URL-compressed); it is **not**
 *    duplicated here — we do not inject a second "original request" block that mirrors
 *    the same user text (see `buildDynamicContext`).
 *  - **Chat history** = prior user/assistant turns, assembled by the generation
 *    pipeline (`createOwnEnginePipelineAndGenerationStream`, etc.), separate from system.
 * Canonical map: `docs/architecture/llm-input-blocks.md`.
 *
 * Keeping the static block in one stable file helps prompt-prefix caching;
 * edit config/prompt-static/*.md and/or the manifest; see _READ_ME_FIRST.md.
 */

import type { BuildIntent } from "@/lib/builder/build-intent";
import type { PaletteState } from "@/lib/builder/palette";
import type { ThemeColors } from "@/lib/builder/theme-presets";
import { debugLog } from "@/lib/utils/debug";
import type { BuildSpec } from "./build-spec";
import type { PreGenerationContractContext } from "./contract/pre-generation-contracts";
import { pickScaffoldVariant } from "./scaffold-variants";
import type { ScaffoldVariant } from "./scaffold-variants";
import { buildRegistryDrivenShadcnToolkitSummary } from "./data/shadcn-toolkit-summary";
import type { RoutePlan } from "./route-plan";
import type { ScaffoldManifest } from "./scaffolds/types";
import {
  buildBudgetedSystemPrompt,
  estimateTokens,
  type PromptBudgetBlock,
} from "./tokens";

// ═══════════════════════════════════════════════════════════════════════════
// STATIC CORE — config manifest + fragments (see static-core-loader.ts)
// Loaded via require() to keep node:fs out of Turbopack's static analysis
// while remaining available at server runtime.
// ═══════════════════════════════════════════════════════════════════════════

let _cachedStaticCore: string | null = null;
function loadStaticCoreSync(): string {
  if (_cachedStaticCore !== null) return _cachedStaticCore;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { getStaticCoreFromWorkspace } = require("./static-core-loader") as typeof import("./static-core-loader");
  _cachedStaticCore = getStaticCoreFromWorkspace();
  return _cachedStaticCore;
}

// ═══════════════════════════════════════════════════════════════════════════
// DYNAMIC CONTEXT — varies per request
// ═══════════════════════════════════════════════════════════════════════════

// Canonical build intent rules for codegen. Assist-copy in promptAssist.ts
// serves rewrite/polish — keep in sync but do not merge (circular import risk).
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
      "Build a complete, visually polished website with navigation, content sections, and a footer. Follow the Scaffold Variant block for layout cues, visual motif, and tone — do not fall back to a generic hero-cards-footer formula.",
      "Include realistic mock content specific to the business type — never generic placeholder copy.",
      "Match scope: short prompt → polished one-pager; detailed prompt → multi-page. Add testimonials/trust only when the prompt, brief, or business type calls for it.",
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
  scaffoldContext?: string;
  capabilityHints?: string;
  resolvedScaffold?: ScaffoldManifest | null;
  resolvedVariant?: ScaffoldVariant | null;
  routePlan?: RoutePlan | null;
  preGenerationContracts?: PreGenerationContractContext | null;
  componentPalette?: PaletteState | null;
  designThemePreset?: string | null;
  designReferences?: DesignReferenceAsset[];
  /** User-supplied custom instructions from the builder UI */
  customInstructions?: string;
  /** `init` = first gen (rich brief), `followUp` = delta-only editing. */
  generationMode?: "init" | "followUp";
  buildSpec?: BuildSpec | null;
  /** Per-session seed (chatId or similar) to vary scaffold variant selection across sessions with identical prompts. */
  sessionSeed?: string;
  /** Pre-rendered scaffold-anchored template-library guidance (init only, opt-in). */
  templateGuidance?: string;
  /** Verified shadcn usage examples matched to this request's capabilities. */
  componentReferences?: { name: string; code: string }[];
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function strList(v: unknown): string[] {
  return Array.isArray(v) ? v.map((x) => str(x)).filter(Boolean) : [];
}

function extractCapabilityHintLines(capabilityHints?: string): string[] {
  if (!capabilityHints?.trim()) return [];
  return capabilityHints
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- "));
}

function buildShadcnToolkitSummary(): string[] {
  return buildRegistryDrivenShadcnToolkitSummary();
}

const DEFAULT_REFS_BUDGET_TOKENS = 7_500;
const DEFAULT_DYNAMIC_CONTEXT_BUDGET_TOKENS = 30_000;

const CONTEXT_BLOCK_PRIORITY_RULES: Array<{
  match: RegExp;
  priority: number;
  required?: boolean;
}> = [
  { match: /^generation mode:/i, priority: 100, required: true },
  { match: /^custom instructions/i, priority: 100, required: true },
  { match: /^build intent:/i, priority: 95, required: true },
  { match: /^generation profile$/i, priority: 92, required: true },
  { match: /^scaffold variant \(this generation\)$/i, priority: 91 },
  { match: /^scaffold$/i, priority: 90, required: true },
  { match: /^route plan$/i, priority: 90, required: true },
  { match: /^your toolkit$/i, priority: 85, required: true },
  { match: /^pre-generation contracts$/i, priority: 90, required: true },
  { match: /^project context$/i, priority: 88, required: true },
  { match: /^pages & sections$/i, priority: 82 },
  { match: /^media catalog$/i, priority: 80 },
  { match: /^visual identity$/i, priority: 78 },
  { match: /^design references$/i, priority: 72 },
  { match: /^component references$/i, priority: 76 },
  { match: /^critical scaffold files$/i, priority: 86, required: true },
  { match: /^scaffold file tree$/i, priority: 84, required: true },
  { match: /^scaffold research priorities$/i, priority: 70 },
  { match: /^coding direction$/i, priority: 76 },
  { match: /^interaction.+motion$/i, priority: 68 },
  { match: /^quality bar$/i, priority: 74 },
  { match: /^component palette$/i, priority: 72 },
  { match: /^spec file$/i, priority: 78 },
  { match: /^current project files$/i, priority: 80 },
  { match: /^imagery/i, priority: 66 },
  { match: /^seo$/i, priority: 62 },
];

function normalizeContextBlockKey(title: string, index: number): string {
  const normalized = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return normalized || `context_block_${index + 1}`;
}

function resolveContextBlockPriority(title: string): { priority: number; required: boolean } {
  for (const rule of CONTEXT_BLOCK_PRIORITY_RULES) {
    if (rule.match.test(title)) {
      return {
        priority: rule.priority,
        required: Boolean(rule.required),
      };
    }
  }
  return { priority: 60, required: false };
}

type DynamicContextBlock = PromptBudgetBlock & {
  title: string;
  estimatedTokens: number;
};

function splitContextIntoBudgetBlocks(context: string): DynamicContextBlock[] {
  if (!context.trim()) return [];

  const blocks: Array<{ title: string; content: string }> = [];
  const lines = context.split("\n");
  let currentTitle = "preamble";
  let currentLines: string[] = [];

  const flush = () => {
    const content = currentLines.join("\n").trim();
    if (!content) return;
    blocks.push({ title: currentTitle, content });
  };

  for (const line of lines) {
    const headingMatch = /^##\s+(.+)$/.exec(line);
    if (headingMatch) {
      flush();
      currentTitle = headingMatch[1].trim();
      currentLines = [line];
      continue;
    }
    currentLines.push(line);
  }
  flush();

  const duplicateCounts = new Map<string, number>();

  return blocks.map((block, index) => {
    const { priority, required } = resolveContextBlockPriority(block.title);
    const baseKey = normalizeContextBlockKey(block.title, index);
    const seen = duplicateCounts.get(baseKey) ?? 0;
    duplicateCounts.set(baseKey, seen + 1);
    const key = seen === 0 ? baseKey : `${baseKey}_${seen + 1}`;
    return {
      key,
      text: block.content,
      title: block.title,
      priority,
      required,
      estimatedTokens: estimateTokens(block.content),
    };
  });
}

/** Observability for dynamic-context token budgeting (`buildBudgetedSystemPrompt`). */
export interface DynamicContextPruning {
  budgetTokens: number;
  usedTokens: number;
  droppedBlockKeys: string[];
  keptBlockKeys: string[];
}

export interface DynamicContextBlockTrace {
  key: string;
  title: string;
  priority: number;
  required: boolean;
  estimatedTokens: number;
  kept: boolean;
}

export type BuildDynamicContextResult = {
  context: string;
  pruning: DynamicContextPruning;
  blocks: DynamicContextBlockTrace[];
  variantId: string | null;
};

function formatThemeTokenLines(variant: ScaffoldVariant | null | undefined): string[] {
  const tokens = variant?.themeTokens;
  if (!tokens) return [];
  const entries = [
    ["--background", tokens.background],
    ["--foreground", tokens.foreground],
    ["--card", tokens.card],
    ["--card-foreground", tokens.cardForeground],
    ["--primary", tokens.primary],
    ["--primary-foreground", tokens.primaryForeground],
    ["--secondary", tokens.secondary],
    ["--secondary-foreground", tokens.secondaryForeground],
    ["--muted", tokens.muted],
    ["--muted-foreground", tokens.mutedForeground],
    ["--accent", tokens.accent],
    ["--accent-foreground", tokens.accentForeground],
    ["--border", tokens.border],
    ["--ring", tokens.ring],
    ["--radius", tokens.radius],
  ] as const;

  const lines = entries
    .filter(([, value]) => Boolean(value))
    .map(([token, value]) => `  - ${token}: ${value}`);
  if (tokens.bodyBackgroundImage) {
    lines.push(`  - background-image: ${tokens.bodyBackgroundImage}`);
  }
  return lines;
}

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
    scaffoldContext,
    capabilityHints,
    resolvedScaffold,
    resolvedVariant,
    routePlan,
    preGenerationContracts,
    componentPalette,
    designThemePreset,
    designReferences,
    customInstructions,
    generationMode,
    buildSpec,
    sessionSeed,
    templateGuidance,
    componentReferences,
  } = options;

  const isFollowUp = generationMode === "followUp";
  const styleKeywords = strList(brief?.visualDirection?.styleKeywords);
  const toneKeywords = strList(brief?.toneAndVoice);

  const parts: string[] = [];

  // ── Generation Mode ────────────────────────────────────────────────────
  if (isFollowUp) {
    parts.push(
      "## Generation Mode: Follow-Up",
      "",
      "You are editing/refining the current project state from previous generations. Treat the scaffold, brief, route plan, and continuity signals below as the latest known implementation context. Apply only the user's requested changes unless they clearly ask for a redesign.",
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
  const effectiveVariant =
    resolvedVariant ??
    pickScaffoldVariant({
      prompt: [
        str(brief?.oneSentencePitch),
        str(brief?.tagline),
        strList(brief?.mustHave).join(" "),
        toneKeywords.join(" "),
        styleKeywords.join(" "),
      ]
        .filter(Boolean)
        .join(" ")
        .trim() || guidance.rules.join(" "),
      scaffoldId: resolvedScaffold?.id ?? buildSpec?.scaffoldId ?? null,
      styleKeywords,
      toneKeywords,
      generationMode,
      sessionSeed,
    });
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

  if (effectiveVariant) {
    parts.push(
      "## Scaffold Variant (this generation)",
      "",
      `- **Variant:** ${effectiveVariant.label} (\`${effectiveVariant.id}\`)`,
      `- **Scaffold:** \`${effectiveVariant.scaffoldId}\``,
      `- **Color mode:** ${effectiveVariant.colorMode}`,
      `- **Signature motif:** ${effectiveVariant.signatureMotif}`,
    );
    if (effectiveVariant.description) {
      parts.push(`- **Variant purpose:** ${effectiveVariant.description}`);
    }
    if (effectiveVariant.fontPairings.length > 0) {
      const pairStr = effectiveVariant.fontPairings
      .map((p) => `${p.heading} + ${p.body}`)
      .join(", or ");
      parts.push(`- **Suggested font pairings:** ${pairStr} (via next/font/google)`);
    }
    if (effectiveVariant.promptHints.length > 0) {
      parts.push("- **Variant cues:**");
      for (const hint of effectiveVariant.promptHints.slice(0, 3)) {
        parts.push(`  - ${hint}`);
      }
    }
    if ((effectiveVariant.styleRules?.length ?? 0) > 0) {
      parts.push("- **Style rules from curated references:**");
      for (const rule of effectiveVariant.styleRules!.slice(0, 3)) {
        parts.push(`  - ${rule}`);
      }
    }
    if ((effectiveVariant.sectionInventory?.length ?? 0) > 0) {
      parts.push(
        `- **Section inventory to favor:** ${effectiveVariant.sectionInventory!.slice(0, 4).join(", ")}`,
      );
    }
    if ((effectiveVariant.avoidPatterns?.length ?? 0) > 0) {
      parts.push("- **Avoid patterns:**");
      for (const pattern of effectiveVariant.avoidPatterns!.slice(0, 2)) {
        parts.push(`  - ${pattern}`);
      }
    }
    const themeTokenLines = formatThemeTokenLines(effectiveVariant);
    if (themeTokenLines.length > 0) {
      parts.push(
        "- **Theme tokens (variant defaults — override only when the brief or locked theme says otherwise):**",
      );
      parts.push(...themeTokenLines);
    }
    if ((effectiveVariant.sourceTemplateIds?.length ?? 0) > 0) {
      parts.push(
        `- **Derived from curated references:** ${effectiveVariant.sourceTemplateIds!.slice(0, 4).join(", ")}`,
      );
    }
    parts.push("");
  }

  // ── Import Rules & Known Pitfalls moved to config/prompt-static/12-import-rules-and-pitfalls.md
  // (static core, cached per process — no longer eats dynamic context token budget)

  // ── Scaffold ───────────────────────────────────────────────────────────
  if (scaffoldContext) {
    parts.push("## Scaffold", "", scaffoldContext.trim(), "");
  }

  if (resolvedScaffold) {
    const checklist = resolvedScaffold.qualityChecklist?.slice(0, 6) ?? [];
    const upgradeTargets = resolvedScaffold.research?.upgradeTargets.slice(0, 5) ?? [];
    const referenceTemplates = resolvedScaffold.research?.referenceTemplates ?? [];
    const refsBudgetTokens = Math.max(
      450,
      buildSpec?.tokenBudgets.refsTokens ?? DEFAULT_REFS_BUDGET_TOKENS,
    );
    const referenceLines: string[] = [];
    let refsUsedTokens = 0;
    for (const template of referenceTemplates.slice(0, 5)) {
      const strengths = template.strengths.slice(0, 3).join("; ");
      const summary = strengths
        ? `${template.title} (${template.categorySlug}, score ${template.qualityScore}): ${strengths}`
        : `${template.title} (${template.categorySlug}, score ${template.qualityScore})`;
      const line = `  - ${summary}`;
      const lineTokens = estimateTokens(line);
      if (refsUsedTokens + lineTokens > refsBudgetTokens && referenceLines.length > 0) {
        break;
      }
      referenceLines.push(line);
      refsUsedTokens += lineTokens;
    }

    if (checklist.length > 0 || upgradeTargets.length > 0 || referenceLines.length > 0 || templateGuidance) {
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
      if (referenceLines.length > 0) {
        parts.push("", "- Reference inspirations from curated templates:");
        parts.push(...referenceLines);
      }
      if (templateGuidance) {
        parts.push("", templateGuidance);
      }
      parts.push("");
    }
  }

  const capabilityLines = extractCapabilityHintLines(capabilityHints);
  const paletteSelections = componentPalette?.selections ?? [];
  const paletteLines = paletteSelections.slice(0, 12).map((selection) => {
    const tags = selection.tags?.length ? ` (${selection.tags.slice(0, 3).join(", ")})` : "";
    return `  - ${selection.label} [${selection.source}]${tags}`;
  });
  const toolkitLines: string[] = [
    "## Your Toolkit",
    "",
    "Use these confirmed, safe building blocks. Prefer them over inventing parallel UI primitives or adding unvetted libraries.",
    "",
    "- shadcn/ui (registry-synced local layer; import from `@/components/ui/<subpath>`):",
    ...buildShadcnToolkitSummary(),
  ];
  if (capabilityLines.length > 0) {
    toolkitLines.push("", "- Capability-driven additions for this request:");
    toolkitLines.push(...capabilityLines.map((line) => `  - ${line.slice(2)}`));
  }
  if (paletteLines.length > 0) {
    toolkitLines.push("", "- Curated component palette from builder context:");
    toolkitLines.push(...paletteLines);
  }
  toolkitLines.push("");
  parts.push(...toolkitLines);

  if (routePlan && routePlan.routes.length > 0) {
    const routeRealization = buildSpec?.routeRealization ?? null;
    const routeMode = routeRealization?.mode ?? "full";
    const shellRoutes = routeRealization?.shellRoutePaths ?? [];
    const fullRoutes = routeRealization?.fullRoutePaths ?? routePlan.routes.map((route) => route.path);
    parts.push(
      "## Route Plan",
      "",
      `- **Site type:** ${routePlan.siteType}`,
      `- **Planning source:** ${routePlan.provenance.primarySource}`,
      `- **Route contributors:** ${routePlan.provenance.sources.join(" → ")}`,
      `- **Why:** ${routePlan.reason}`,
      "",
    );
    if (routeRealization) {
      parts.push(`- **Primary route:** \`${routeRealization.primaryRoutePath}\``);
      if (routeMode === "primary-full-with-shells") {
        parts.push(
          `- **Init realization policy:** Fully realize only \`${routeRealization.primaryRoutePath}\` in this generation. Planned extras should start as intentional shell pages.`,
        );
        parts.push(
          `- **Full routes now:** ${fullRoutes.map((path) => `\`${path}\``).join(", ")}`,
        );
        parts.push(
          `- **Shell routes now:** ${shellRoutes.map((path) => `\`${path}\``).join(", ")}`,
        );
      } else {
        parts.push(
          `- **Init realization policy:** Fully realize all planned routes in this generation when they are in scope.`,
        );
      }
      parts.push("");
    }
    for (const route of routePlan.routes.slice(0, 10)) {
      const routeModeLabel =
        routeMode === "primary-full-with-shells"
          ? route.path === routeRealization?.primaryRoutePath
            ? " [full now]"
            : shellRoutes.includes(route.path)
              ? " [shell now]"
              : ""
          : "";
      parts.push(
        `- \`${route.path}\` — ${route.name}${routeModeLabel}: ${route.intent}${route.required ? " (must exist)" : ""}`,
      );
    }
    if (routeMode === "primary-full-with-shells") {
      parts.push(
        "",
        "- For shell routes, create valid App Router pages that look intentional: include page title, route purpose, a short explanation of what the page will become, and a clear primary CTA such as 'Skapa sida'.",
        "- Shell routes should feel like deliberate builder-owned placeholder states, not broken pages. It is fine if they use a bold branded theme treatment to signal 'this route exists and is ready to be expanded next'.",
        "- Keep shell code lightweight, coherent, and safe to preview. They should preserve navigation, metadata surface, and internal linking without pretending to be fully implemented.",
        "- Keep most design and implementation budget on the primary route. Extra planned routes should preserve IA, navigation, metadata, and internal linking without demanding full implementation yet.",
      );
      if (isFollowUp) {
        parts.push(
          "- **Shell preservation rule (follow-up):** These shell routes already exist as intentional placeholders. Do NOT replace, expand, redesign, or regenerate them unless the user explicitly asks to build out that specific page. If your change does not target a shell route, omit it from your response entirely so it is kept as-is.",
        );
      }
    } else if (routePlan.routes.length > 1) {
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
        "- **Placeholder policy (mandatory for runnable preview):** If **Auth** is NextAuth/Auth.js, use **Credentials** (password/demo user) only — **no OAuth** providers unless the user explicitly asked for one by name. If **Stripe/payment** appears, use test-mode keys and/or `process.env` fallbacks so the app never throws at import time. The preview runtime merges non-secret placeholder `.env.local` values; your code must still run when those are absent.",
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

    // Pages & Sections — only when the brief carries section-level detail
    // that goes beyond what Route Plan already provides (path + name + intent).
    const pages = Array.isArray(brief.pages) ? brief.pages : [];
    const pagesWithSections = pages.filter(
      (p) => Array.isArray(p?.sections) && p.sections.length > 0,
    );
    if (pagesWithSections.length > 0) {
      parts.push("## Pages & Sections", "");
      for (const p of pagesWithSections.slice(0, 10)) {
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

    // UX & UI notes from brief
    const uiComponents = strList(brief.uiNotes?.components).slice(0, 16);
    const uiInteractions = strList(brief.uiNotes?.interactions).slice(0, 16);
    const uiAccessibility = strList(brief.uiNotes?.accessibility).slice(0, 16);
    if (uiComponents.length > 0 || uiInteractions.length > 0 || uiAccessibility.length > 0) {
      parts.push("## UX & UI Notes", "");
      if (uiComponents.length > 0) {
        parts.push("**Components:**", ...uiComponents.map((c) => `- ${c}`), "");
      }
      if (uiInteractions.length > 0) {
        parts.push("**Interactions:**", ...uiInteractions.map((i) => `- ${i}`), "");
      }
      if (uiAccessibility.length > 0) {
        parts.push("**Accessibility:**", ...uiAccessibility.map((a) => `- ${a}`), "");
      }
    }
  }

  // ── Visual Identity ─────────────────────────────────────────────────────
  const hasTheme = themeOverride && (themeOverride.primary || themeOverride.secondary || themeOverride.accent);
  const briefPalette = brief?.visualDirection?.colorPalette;
  const typography = brief?.visualDirection?.typography;
  const themePresetLabel = str(designThemePreset);

  if (themePresetLabel || hasTheme || briefPalette || typography) {
    parts.push("## Visual Identity", "");

    if (themePresetLabel) {
      parts.push(`- **Internal theme preset:** ${themePresetLabel}`);
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

  // ── Imagery (brief-specific only; global rules live in prompt-static/06-images.md)
  // Exclude imagery.styleKeywords that already appear in visualDirection.styleKeywords
  // (those already feed Scaffold Variant selection). Keep only concrete image subjects/notes.
  if (brief?.imagery) {
    const visualKwSet = new Set(styleKeywords.map((k) => k.toLowerCase()));
    const imgStyleKw = strList(brief.imagery.styleKeywords).filter(
      (k) => !visualKwSet.has(k.toLowerCase()),
    );
    const imgNotes = [
      ...imgStyleKw,
      ...strList(brief.imagery.suggestedSubjects),
      ...strList(brief.imagery.styleNotes),
    ].filter(Boolean);
    if (imgNotes.length > 0) {
      parts.push("## Imagery (from brief)", "", ...imgNotes.map((n) => `- ${n}`), "");
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

  // ── Component References (capability-driven shadcn examples) ─────────
  if (componentReferences && componentReferences.length > 0) {
    parts.push(
      "## Component References",
      "",
      "Verified usage examples for components relevant to this request. Adapt these patterns to the site — do not copy verbatim.",
      "",
    );
    for (const ref of componentReferences.slice(0, 5)) {
      const truncatedCode =
        ref.code.split("\n").length > 60
          ? ref.code.split("\n").slice(0, 60).join("\n") + "\n// ... (truncated)"
          : ref.code;
      parts.push(`### ${ref.name}`, "", "```tsx", truncatedCode, "```", "");
    }
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

  // User prompt text is carried by the **user** message in the chat/completions
  // request — do not duplicate it here as a second "original request" block.

  let context = parts.join("\n").trim();
  const contextBlocks = splitContextIntoBudgetBlocks(context);
  const budgetTokens = Math.max(
    900,
    buildSpec?.tokenBudgets.systemContextTokens ?? DEFAULT_DYNAMIC_CONTEXT_BUDGET_TOKENS,
  );
  const budgeted = buildBudgetedSystemPrompt({
    staticCore: "",
    separator: "",
    dynamicBlocks: contextBlocks,
    dynamicBudgetTokens: budgetTokens,
  });
  context = budgeted.dynamicContext;
  const keptKeys = new Set(budgeted.keptKeys);
  const blockTrace = contextBlocks.map((block) => ({
    key: block.key,
    title: block.title,
    priority: block.priority,
    required: Boolean(block.required),
    estimatedTokens: block.estimatedTokens,
    kept: keptKeys.has(block.key),
  }));

  if (budgeted.droppedKeys.length > 0) {
    try {
      debugLog("engine", "Dynamic context pruned to token budget", {
        budgetTokens,
        usedTokens: budgeted.usedTokens,
        droppedBlocks: budgeted.droppedKeys,
        keptBlocks: budgeted.keptKeys,
      });
    } catch {
      // Some isolated tests mock "@/lib/utils/debug" without debugLog.
    }
  }

  return {
    context,
    pruning: {
      budgetTokens: budgeted.budgetTokens,
      usedTokens: budgeted.usedTokens,
      droppedBlockKeys: budgeted.droppedKeys,
      keptBlockKeys: budgeted.keptKeys,
    },
    blocks: blockTrace,
    variantId: effectiveVariant?.id ?? null,
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
  scaffoldContext?: string;
  resolvedScaffold?: ScaffoldManifest | null;
  routePlan?: RoutePlan | null;
  preGenerationContracts?: PreGenerationContractContext | null;
  componentPalette?: PaletteState | null;
  designThemePreset?: string | null;
  designReferences?: DesignReferenceAsset[];
  customInstructions?: string;
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
    scaffoldContext: options.scaffoldContext,
    resolvedScaffold: options.resolvedScaffold,
    routePlan: options.routePlan,
    preGenerationContracts: options.preGenerationContracts,
    componentPalette: options.componentPalette,
    designThemePreset: options.designThemePreset,
    designReferences: options.designReferences,
    buildSpec: options.buildSpec,
    customInstructions: options.customInstructions,
    generationMode: options.generationMode,
  });

  return `${loadStaticCoreSync()}${SYSTEM_PROMPT_SEPARATOR}${context}`;
}

/** Compose static codegen core + dynamic context without re-running retrieval. */
export function composeEngineSystemPrompt(dynamicContextText: string): string {
  return `${loadStaticCoreSync()}${SYSTEM_PROMPT_SEPARATOR}${dynamicContextText}`;
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
