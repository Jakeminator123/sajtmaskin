/**
 * System prompt builder for sajtmaskin's own code generation engine.
 *
 * Architecture (post 2026-04-18 directive-cascade removal):
 *  ┌─────────────────────────────────────────────────┐
 *  │  Static Core — config/codegen-core-manifest.json +             │
 *  │    config/prompt-core/*.md (immutable product rules,           │
 *  │    incl. visual-design + coding-direction)                     │
 *  │  (~8–10K tokens, mtime-cached per process)       │
 *  ├─────────────────────────────────────────────────┤
 *  │  Dynamic context  (varies per request)           │
 *  │  → Build intent, scaffold variant, brief, route, │
 *  │    contracts, dossiers, guidance                 │
 *  └─────────────────────────────────────────────────┘
 *
 * Per-request signal cascade (highest precedence first):
 *  1. EXPLICIT  — Brief/prompt provides an exact value
 *  2. INDICATED — Brief-LLM infers from context
 *  3. INFERRED  — `resolveGuidanceBlocks` (deterministic heuristics)
 *  4. STATIC    — Plain text in `config/prompt-core/*.md`
 *
 * The legacy `prompt-directives/` folder + `directive-loader.ts` were
 * removed 2026-04-18: only `visual-design` and `content-voice` were ever
 * runtime-injected, so they are now plain core fragments. The 10 unused
 * directive files were aspirational placeholders the substitution engine
 * never actually used. Brief and scaffold variant carry the per-request
 * signal those defaults pretended to switch on.
 *
 * What reaches the model (own-engine):
 *  - **Static Core** (`getStaticCoreFromWorkspace`) + `SYSTEM_PROMPT_SEPARATOR` +
 *    **dynamic context** from this file = full **system** message.
 *  - **User turn** = current request prompt; not duplicated here.
 *  - **Chat history** = prior turns, assembled by the generation pipeline.
 * Canonical map: `docs/architecture/fas2-orchestration-and-build.md`.
 */

import type { BuildIntent } from "@/lib/builder/build-intent";
import type { PaletteState } from "@/lib/builder/palette";
import type { ThemeColors } from "@/lib/builder/theme-presets";
import { debugLog } from "@/lib/utils/debug";
import {
  deriveTier3BuildSpec,
  renderTier3BuildPlanBlock,
} from "@/lib/integrations/tier3-build-spec";
import { renderTier3F2DenyBlockLines } from "@/lib/integrations/tier3-sdk-deny";
import type { BuildSpec } from "./build-spec";
import type { PreGenerationContractContext } from "./contract/pre-generation-contracts";
import { pickScaffoldVariant } from "./scaffold-variants";
import type { ScaffoldVariant } from "./scaffold-variants";
import { buildRegistryDrivenShadcnToolkitSummary } from "./data/shadcn-toolkit-summary";
import { resolveGoogleFontImportName } from "./data/google-font-registry";
import { resolveGuidanceBlocks, type ColorPalette } from "./guidance-resolvers";
import { BUILD_INTENT_GUIDANCE } from "./intent-guidance";
import type { RoutePlan } from "./route-plan";
import type { ScaffoldId, ScaffoldManifest } from "./scaffolds/types";
import {
  buildBudgetedSystemPrompt,
  estimateTokens,
  type PromptBudgetBlock,
} from "./tokens";
import {
  defaultInjectionMode,
  getDossierFileContent,
  type DossierSelectionResult,
} from "./dossiers";

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
  domainProfile?: string;
  motionLevel?: "minimal" | "moderate" | "lively";
  qualityBar?: "clean" | "premium" | "bold-dramatic";
  seasonalHints?: string[];
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
  /** Brief-LLM nominated scaffold (Fas 1.0). Hint — runtime embedding-pick may override. */
  scaffoldNomination?: {
    id: string;
    reason: string;
    confidence: number;
  } | null;
  /** Brief-LLM nominated variant (Fas 1.0). Hint — only meaningful if scaffoldNomination set. */
  variantNomination?: {
    id: string;
    reason: string;
    confidence: number;
  } | null;
  /** Brief-LLM nominated dossiers (Fas 1.0). Hints — orchestrator's embedding pick decides. */
  dossierNominations?: Array<{
    id: string;
    reason: string;
    confidence: number;
  }>;
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
  /** Raw user prompt text — used for domain/motion/quality inference. */
  userPrompt?: string;
  /** `init` = first gen (rich brief), `followUp` = delta-only editing. */
  generationMode?: "init" | "followUp";
  buildSpec?: BuildSpec | null;
  /** Per-session seed (chatId or similar) to vary scaffold variant selection across sessions with identical prompts. */
  sessionSeed?: string;
  /** Verified shadcn usage examples matched to this request's capabilities. */
  componentReferences?: { name: string; code: string }[];
  /** Dossier-poolen (legoklossar) selected for this request — opt-in via FEATURES.useDossierPipeline. */
  dossierSelection?: DossierSelectionResult | null;
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

function buildShadcnToolkitSummary(ctx?: {
  scaffoldId?: ScaffoldId | null;
}): string[] {
  return buildRegistryDrivenShadcnToolkitSummary(
    ctx?.scaffoldId ? ctx : undefined,
  );
}

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
  { match: /^design priority$/i, priority: 89, required: true },
  { match: /^scaffold$/i, priority: 90, required: true },
  { match: /^scaffold:\s/i, priority: 90, required: true },
  { match: /^layout & theme files/i, priority: 85 },
  { match: /^import reference/i, priority: 75 },
  { match: /^route plan$/i, priority: 90, required: true },
  { match: /^your toolkit$/i, priority: 85, required: true },
  { match: /^available dossiers$/i, priority: 87 },
  { match: /^selected dossier instructions$/i, priority: 84 },
  { match: /^dossier files to emit verbatim$/i, priority: 92, required: true },
  { match: /^pre-generation contracts$/i, priority: 90, required: true },
  { match: /^project context$/i, priority: 88, required: true },
  { match: /^pages & sections$/i, priority: 82 },
  { match: /^media catalog$/i, priority: 80 },
  { match: /^visual identity$/i, priority: 78 },
  { match: /^design references$/i, priority: 72 },
  { match: /^component references$/i, priority: 80 },
  { match: /^critical scaffold files$/i, priority: 86, required: true },
  { match: /^scaffold file tree$/i, priority: 84, required: true },
  { match: /^scaffold research priorities$/i, priority: 70 },
  { match: /^domain inference$/i, priority: 77 },
  { match: /^structure hints$/i, priority: 76 },
  { match: /^contract.*backend.*hints$/i, priority: 75 },
  { match: /^coding direction$/i, priority: 76 },
  { match: /^color system$/i, priority: 73 },
  { match: /^art direction/i, priority: 73 },
  { match: /^typography/i, priority: 72 },
  { match: /^visual polish$/i, priority: 71 },
  { match: /^charts$/i, priority: 65 },
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
export function buildDynamicContext(
  options: DynamicContextOptions,
): BuildDynamicContextResult {
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
    userPrompt,
    generationMode,
    buildSpec,
    sessionSeed,
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
      "You are editing/refining the current project state from previous generations. Treat the scaffold, route plan, project context, and continuity signals below as the latest known implementation context. Apply only the user's requested changes unless they clearly ask for a redesign.",
      "",
    );
  }

  // ── Custom Instructions (user-supplied from builder UI) ────────────────
  const trimmedCustom = customInstructions?.trim();
  if (trimmedCustom) {
    parts.push("## Custom Instructions (from the user)", "", trimmedCustom, "");
  }

  // ── F2 / Design Stage Contract (HARD) ─────────────────────────────────
  // F2 = visual fidelity stage. The user is iterating on look-and-feel,
  // NOT on backend integrations. Tier-3 imports/process.env references
  // bloat output, leak imports the user didn't ask for, and force the
  // builder UI into "fill in env vars"-mode which we explicitly want
  // to avoid. F3 ("Bygg nu" / fidelity3) is when integrations are wired
  // in — and only when the user has clicked that button.
  // See `.cursor/rules/env-flow-f2-mute.mdc`.
  if (buildSpec?.previewPolicy !== "fidelity3") {
    parts.push(
      "## Generation Stage: F2 / Design (HARD CONTRACT)",
      "",
      "You are generating a **visual design preview**. The user wants to see, click, and iterate on the UI. They have NOT asked you to wire in any external services.",
      "",
      "**FORBIDDEN in F2 — even if a dossier example shows it, even if the prompt mentions a service by name unless the user explicitly asks for backend wiring:**",
      "",
      "- Do NOT `import` any of these packages:",
      // Deny-list rendered from `config/integrations/tier3-sdk-deny.json` so
      // this prompt block and the mechanical `tier3-sdk-guard-fixer` can
      // never drift apart. Add a module in the JSON; both update.
      ...renderTier3F2DenyBlockLines(),
      "- Do NOT use `process.env.STRIPE_*`, `process.env.SUPABASE_*`, `process.env.CLERK_*`, `process.env.RESEND_*`, `process.env.SANITY_*`, `process.env.GOOGLE_CLIENT_*`, `process.env.AUTH_SECRET`, or any other tier-3 secret. Public `NEXT_PUBLIC_GA_ID` etc. is fine if the user wanted analytics.",
      "- Do NOT emit a `.env.local` listing tier-3 keys.",
      "- Do NOT add Stripe API routes (`/api/stripe/*`, `/api/checkout/*`), webhooks (`/api/webhooks/*`), or auth callbacks unless explicitly requested.",
      "",
      "**INSTEAD in F2, for any 'backend' need:**",
      "",
      "- Mock all data inline as TypeScript constants: `const ROOMS = [{ id: \"1\", name: \"Skogssvit\", price: 1290 }, ...]`.",
      "- Forms: use `useState` + `toast.success(\"Bokningen mottagen!\")` on submit. No POST endpoint, no DB.",
      "- Auth UIs: render a beautiful `<LoginForm>` with email/password fields that calls `toast.success(\"Inloggad (demo)\")` on submit. No real session.",
      "- Payments UIs: render a beautiful checkout summary card with a `<Button>Betala (demo)</Button>` that opens a `<Dialog>` saying \"Riktiga betalningar aktiveras i F3 — klicka 'Bygg nu' i previewpanelen.\" No Stripe, no API call.",
      "- Search: client-side `Array.filter()` over the inline mock data.",
      "",
      "Why: the user will click **\"Bygg nu\"** in the preview panel when they want to lift the site to F3 / integrations stage. THAT is when real keys, SDKs and API routes get wired in — by a separate generation pass with a separate prompt that explicitly asks for it. Right now, your job is to make the visual frontend perfect.",
      "",
    );
  }

  // ── Build Intent ────────────────────────────────────────────────────────
  const guidance = BUILD_INTENT_GUIDANCE[intent];
  // Variant resolution: production callers (orchestrate) always pass
  // `resolvedVariant`. The fallback below exists for legacy callers
  // (`buildSystemPrompt` from eval/runner). Keep its inputs aligned with
  // `orchestrate.resolveScaffoldVariant` so the fallback picks the same
  // variant as orchestrate would — otherwise `variantId` logged downstream
  // can drift from what shaped the prompt. Prefer the raw user prompt
  // (canonical orchestrate input); fall back to brief-derived text only
  // when no userPrompt is available.
  const fallbackVariantPrompt =
    str(userPrompt) ||
    [
      str(brief?.oneSentencePitch),
      str(brief?.tagline),
      strList(brief?.mustHave).join(" "),
      toneKeywords.join(" "),
      styleKeywords.join(" "),
    ]
      .filter(Boolean)
      .join(" ")
      .trim() ||
    guidance.rules.join(" ");
  // resolvedVariant is the embedding-driven pick from resolveOrchestrationBase
  // (orchestrate.ts → pickScaffoldVariantAsync). The keyword fallback below
  // only runs when buildDynamicContext is called outside the standard
  // orchestrate flow (e.g. legacy tests, snapshot rendering) — keeping it
  // sync avoids forcing this whole function async.
  const effectiveVariant =
    resolvedVariant ??
    pickScaffoldVariant({
      prompt: fallbackVariantPrompt,
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
      const importHints: string[] = [];
      for (const pair of effectiveVariant.fontPairings.slice(0, 1)) {
        for (const name of [pair.heading, pair.body]) {
          const importName = resolveGoogleFontImportName(name);
          if (importName && importName !== name) {
            importHints.push(`\`${name}\` → \`import { ${importName} } from "next/font/google"\``);
          }
        }
      }
      if (importHints.length > 0) {
        parts.push(`  - Import names: ${importHints.join("; ")}`);
      }
    }
    if (effectiveVariant.promptHints.length > 0) {
      parts.push("- **Variant cues:**");
      for (const hint of effectiveVariant.promptHints.slice(0, 3)) {
        parts.push(`  - ${hint}`);
      }
    }
    const sig = effectiveVariant.signaturePatterns;
    if (sig && (sig.layouts.length || sig.motifs.length || sig.antiPatterns.length)) {
      // Concrete layout/motif/anti-pattern signatures, replacing the generic
      // guidance fields removed 2026-04-17. Populated by
      // scripts/scaffolds/auto-curate-variant-patterns.ts (GPT-5.4 + Zod).
      if (sig.layouts.length > 0) {
        parts.push("- **Signature layouts:**");
        for (const layout of sig.layouts.slice(0, 5)) {
          parts.push(`  - ${layout}`);
        }
      }
      if (sig.motifs.length > 0) {
        parts.push("- **Signature motifs:**");
        for (const motif of sig.motifs.slice(0, 4)) {
          parts.push(`  - ${motif}`);
        }
      }
      if (sig.antiPatterns.length > 0) {
        parts.push("- **Avoid for this variant:**");
        for (const anti of sig.antiPatterns.slice(0, 4)) {
          parts.push(`  - ${anti}`);
        }
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

  parts.push(
    "## Design Priority",
    "",
    "When multiple sources suggest different colors, fonts, or visual direction, follow this order:",
    "1. User-locked theme tokens (if set in builder UI) — absolute, never override",
    "2. Brief visual direction (colorPalette, typography, tone, domainProfile) — primary design intent",
    "3. Scaffold Variant defaults (theme tokens, font pairings, signature motif, prompt hints) — fallback when brief is silent",
    "4. Directive defaults — placeholder values from directive files, used when neither brief nor variant provides guidance",
    "",
  );

  // ── Import Rules & Known Pitfalls live in config/prompt-core/01-behavioral-contract.md
  // (static core, cached per process — no longer eats dynamic context token budget)

  // ── Scaffold ───────────────────────────────────────────────────────────
  // scaffoldContext already starts with its own ## heading from serialize.ts
  // (e.g. "## Scaffold: landing-page (inspirational mode)"). Adding an extra
  // "## Scaffold" wrapper would create a near-empty required block while the
  // real content ends up in a separate block with wrong priority.
  if (scaffoldContext) {
    parts.push(scaffoldContext.trim(), "");
  }

  if (resolvedScaffold) {
    const checklist = resolvedScaffold.qualityChecklist?.slice(0, 6) ?? [];
    const upgradeTargets = resolvedScaffold.research?.upgradeTargets?.slice(0, 3) ?? [];
    const referenceTemplates = resolvedScaffold.research?.referenceTemplates ?? [];
    // Fas C: Brief now carries variant-derived design direction (Fas A/B),
    // so reference inspirations are trimmed to 2 compact lines (no strengths).
    const referenceLines = referenceTemplates.slice(0, 2).map(
      (t) => `  - ${t.title} (${t.categorySlug}, score ${t.qualityScore})`,
    );

    if (checklist.length > 0 || upgradeTargets.length > 0 || referenceLines.length > 0) {
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
        parts.push("", "- Upgrade targets:");
        parts.push(...upgradeTargets.map((item) => `  - ${item}`));
      }
      if (referenceLines.length > 0) {
        parts.push("", "- Reference inspirations:");
        parts.push(...referenceLines);
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
    ...buildShadcnToolkitSummary({
      scaffoldId: resolvedScaffold?.id ?? null,
    }),
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

  // ── Available Dossiers + Selected Instructions (pool-modellen) ────────
  // Två block:
  //   ## Available Dossiers — kompakt lista av valda legoklossar (LLM ser
  //      vad som finns att stoppa in om prompten begär det)
  //   ## Selected Dossier Instructions — full instructions.md per vald
  //      dossier (When to use / How to integrate / UX rules / Avoid)
  // Drivs av FEATURES.useDossierPipeline; opt-in. Tomt → block hoppas över.
  const dossierSel = options.dossierSelection;
  if (dossierSel && dossierSel.selected.length > 0) {
    parts.push(
      "## Available Dossiers",
      "",
      `Selected from a pool of ${dossierSel.poolSize} active dossiers (legoklossar) for this generation. Use only what the user's prompt actually needs.`,
      "",
    );
    for (const sel of dossierSel.selected) {
      const e = sel.entry;
      const providers = e.providers && e.providers.length > 0
        ? ` — providers: ${e.providers.map((p) => p.name).join(", ")}`
        : "";
      parts.push(`- **${e.label}** \`${e.id}\` (${e.kind}, ${e.category})${providers}`);
      parts.push(`  - ${e.description}`);
    }
    parts.push("");

    const withInstructions = dossierSel.selected.filter((s) => s.entry.instructions);
    if (withInstructions.length > 0) {
      parts.push(
        "## Selected Dossier Instructions",
        "",
        "Concrete usage instructions for each selected dossier. Adapt to the user's request — do not paste blindly.",
        "",
      );
      for (const sel of withInstructions) {
        parts.push(`### ${sel.entry.label} (\`${sel.entry.id}\`)`, "");
        parts.push(sel.entry.instructions!.trim(), "");
      }
    }

    // ── Verbatim files (Fas 1.5: dossier-as-code) ─────────────────────────
    // Files marked `injectionMode: "verbatim"` (or defaulting to it for
    // integration api-routes/middleware/config/util) MUST be emitted by the
    // codegen LLM exactly as given. This protects integration glue (Stripe
    // webhook signing, auth middleware, SDK init) from accidental rewrites.
    interface VerbatimFile {
      dossierId: string;
      dossierLabel: string;
      relPath: string;
      /** Output path in the generated project (without dossier `components/` prefix). */
      outputPath: string;
      /** File extension fence language for CodeProject blocks. */
      fence: string;
      content: string;
    }
    // Paths that belong to the scaffold and are dangerous to overwrite via a
    // dossier verbatim block (would clobber fonts, providers, metadata). We
    // skip these even if a dossier asks for verbatim — log so we can spot
    // dossier-data that needs fixing.
    const SCAFFOLD_RESERVED_PATHS = new Set([
      "app/layout.tsx",
      "app/globals.css",
      "app/loading.tsx",
      "app/error.tsx",
      "app/not-found.tsx",
      "app/template.tsx",
      "package.json",
      "tsconfig.json",
      "next.config.js",
      "next.config.mjs",
      "next.config.ts",
      "tailwind.config.ts",
      "postcss.config.mjs",
    ]);
    const verbatimFiles: VerbatimFile[] = [];
    for (const sel of dossierSel.selected) {
      for (const file of sel.entry.files) {
        const mode = file.injectionMode ?? defaultInjectionMode(file.kind, sel.entry.kind);
        if (mode !== "verbatim") continue;
        const content = getDossierFileContent(sel.entry.id, file.path);
        if (content === null) continue;
        // Dossier files live under data/dossiers/<id>/components/<path-in-project>
        // The "components/" prefix is the dossier-internal staging dir; strip it
        // for the actual output path so files land at app/.../route.ts etc.
        const outputPath = file.path.replace(/^components\//, "");
        if (SCAFFOLD_RESERVED_PATHS.has(outputPath)) {
          debugLog(
            "GEN",
            `[verbatim-skip] ${sel.entry.id}: refusing to emit verbatim file at scaffold-reserved path '${outputPath}'`,
          );
          continue;
        }
        const ext = (outputPath.split(".").pop() ?? "ts").toLowerCase();
        const fence =
          ext === "tsx" || ext === "ts" || ext === "js" || ext === "jsx" || ext === "css"
            ? ext
            : "text";
        verbatimFiles.push({
          dossierId: sel.entry.id,
          dossierLabel: sel.entry.label,
          relPath: file.path,
          outputPath,
          fence,
          content: content.trimEnd(),
        });
      }
    }
    if (verbatimFiles.length > 0) {
      parts.push(
        "## Dossier Files To Emit Verbatim",
        "",
        "The following files come from selected dossier integrations and **MUST appear in your CodeProject output exactly as written below**. Do not paraphrase, refactor, rename, or remove any line — these contain integration glue (auth, webhooks, SDK init) where deviation breaks the integration. Adjust only environment-variable comments if the user already provided a replacement value.",
        "",
        "Emit one CodeProject block per file with the exact path shown.",
        "",
      );
      for (const vf of verbatimFiles) {
        parts.push(`### From \`${vf.dossierId}\` (${vf.dossierLabel}) → \`${vf.outputPath}\``);
        parts.push("");
        parts.push("```" + vf.fence + ` file="${vf.outputPath}"`);
        parts.push(vf.content);
        parts.push("```");
        parts.push("");
      }
    }
  }

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

  // ── Tier-3 Integration Build Plan (F3 only) ────────────────────────────
  // When previewPolicy is fidelity3 we render the structured tier-3 spec
  // derived from the contracts. This block tells the F3 LLM exactly which
  // env keys are guaranteed present and what wiring steps to perform.
  if (
    buildSpec?.previewPolicy === "fidelity3" &&
    preGenerationContracts &&
    preGenerationContracts.contracts.integrations.length > 0
  ) {
    try {
      const spec = deriveTier3BuildSpec(preGenerationContracts.contracts);
      const block = renderTier3BuildPlanBlock(spec);
      if (block) {
        parts.push(block, "");
      }
    } catch {
      // Never block prompt assembly on a tier-3 rendering error.
    }
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

  // ── Guidance blocks (domain, motion, quality bar) ────────────────────────
  // Level 3 (INFERRED): guidance-resolvers provide deterministic heuristics.
  // Level 4 (DEFAULT): directive file text is used when resolvers have no signal.
  if (userPrompt) {
    const briefPaletteForGuidance: ColorPalette = briefPalette
      ? {
          primary: briefPalette.primary,
          secondary: briefPalette.secondary,
          accent: briefPalette.accent,
          background: briefPalette.background,
          text: briefPalette.text,
        }
      : {};
    const guidance = resolveGuidanceBlocks({
      userPrompt,
      buildIntent: intent,
      tone: toneKeywords,
      styleKeywords,
      briefPalette: briefPaletteForGuidance,
      themeOverride,
      topicSignal: [
        str(brief?.projectTitle),
        str(brief?.brandName),
        str(brief?.oneSentencePitch),
        userPrompt,
      ]
        .filter(Boolean)
        .join(" "),
      briefDomainProfile: str(brief?.domainProfile) || undefined,
      briefMotionLevel: brief?.motionLevel,
      briefQualityBar: brief?.qualityBar,
      briefSeasonalHints: brief?.seasonalHints?.filter(Boolean),
    });

    if (guidance.domainProfile !== "general") {
      const domainSource = brief?.domainProfile
        ? "from brief"
        : "inferred from prompt keywords";
      parts.push(
        "## Domain Inference",
        "",
        `- Domain profile (${domainSource}): **${guidance.domainProfile}**.`,
        "",
      );
    }
    if (guidance.domainStructureHints.length > 0) {
      parts.push(
        "## Structure Hints",
        "",
        ...guidance.domainStructureHints.map((h) => `- ${h}`),
        "",
      );
    }
    if (guidance.domainContractHints.length > 0) {
      parts.push(
        "## Contract & Backend Hints",
        "",
        ...guidance.domainContractHints.map((h) => `- ${h}`),
        "",
      );
    }
    parts.push(
      "## Interaction & Motion",
      "",
      ...guidance.motionGuidance.map((g) => `- ${g}`),
      "",
    );
    parts.push(
      "## Quality Bar",
      "",
      ...guidance.qualityBarGuidance.map((g) => `- ${g}`),
      "",
    );
    if (guidance.seasonalPaletteGuidance.length > 0) {
      parts.push(...guidance.seasonalPaletteGuidance.map((g) => `- ${g}`));
    }
  }

  // ── Visual-design + content-voice live in static core ─────────────────
  // These were directive files (`config/prompt-directives/01-visual-design.md`
  // + `10-content-voice.md`) injected per-request via the now-removed
  // directive cascade. They never varied per request, so they are static
  // core fragments today (`config/prompt-core/03-visual-design.md` +
  // `04-coding-direction.md`) and load through `static-core-loader.ts`
  // alongside the behavioral and component contracts. Per-request signal
  // (brief, scaffold variant, guidance resolvers above) overrides them
  // through the `## Design Priority` hierarchy emitted earlier in the
  // dynamic context.

  // ── Imagery (brief-specific only) ──────────────────────────────────────
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
      parts.push(`### ${ref.name}`, "", "```tsx", ref.code, "```", "");
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
// PUBLIC API — composeEngineSystemPrompt(), getSystemPromptLengths()
//
// The canonical generation path is:
//   1. `prepareGenerationContext()` (orchestrate.ts) builds a `BuildSpec`,
//      resolves scaffold/variant/route/contracts, then calls
//      `buildDynamicContext()` with the full input set.
//   2. `composeEngineSystemPrompt(dynamicContext)` glues the static Core
//      Rules (`config/prompt-core/*.md`) onto the dynamic context to produce
//      the single system message sent to the LLM.
//
// The legacy `buildSystemPrompt(options)` shortcut was removed in favor of
// this two-step path because its options type kept drifting from
// `DynamicContextOptions` and silently producing thinner prompts in eval.
// ═══════════════════════════════════════════════════════════════════════════

/** Between static core (config/prompt-core) and buildDynamicContext output. */
export const SYSTEM_PROMPT_SEPARATOR = "\n\n---\n\n# Request-Specific Context\n\n";

/** Compose static codegen core + dynamic context without re-running retrieval. */
export function composeEngineSystemPrompt(dynamicContextText: string): string {
  return `${loadStaticCoreSync()}${SYSTEM_PROMPT_SEPARATOR}${dynamicContextText}`;
}

/**
 * Returns character counts for prompt-cache monitoring.
 * Use after `composeEngineSystemPrompt()` to log total, static, and dynamic lengths.
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
