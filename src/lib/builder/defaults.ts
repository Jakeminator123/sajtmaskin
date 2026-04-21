/**
 * Shared defaults and options for model tiers and prompt assist.
 * Used by Builder UI for model tier and prompt assist defaults.
 *
 * CONCEPTS:
 *
 * Build Models:
 *   - The first group represents build profiles, not prompt-assist models.
 *   - Profiles map to the own engine's provider model IDs (codegen is own-engine only).
 *   - own-engine is the canonical codegen path.
 *   - Prompt Assist models are listed separately below and are only used to
 *     rewrite/brief the prompt before generation.
 *
 * Prompt Assist (preprocessing user prompts before generation):
 *   - off:            No preprocessing, send prompt directly to the build engine.
 *   - openai/*:       OpenAI prompt-assist path.
 *   - anthropic/*:    Anthropic prompt-assist path.
 *   - (v0 Model API is not used for prompt assist — only OpenAI/Anthropic direct.)
 *
 * Deep Brief Mode:
 *   When enabled, AI first generates a structured "brief" (specification)
 *   which is then used to construct a better prompt for the build engine. Takes longer
 *   but produces more thorough results for complex projects.
 */

import { ANTHROPIC_ASSIST_MODELS, ASSIST_MODELS } from "./promptAssist";
import { ASSIST_MODEL, POLISH_MODEL } from "@/lib/gen/defaults";
import type { ScaffoldMode } from "@/lib/gen/scaffolds";
import { DEFAULT_MODEL_ID } from "@/lib/models/catalog";
import type { ModelTier } from "@/lib/validations/chatSchemas";

// ============================================
// MODEL TIER OPTIONS
// ============================================

export interface ModelTierOption {
  value: ModelTier;
  label: string;
  description: string;
  hint?: string;
}

export const MODEL_TIER_OPTIONS: ModelTierOption[] = [
  {
    value: "fast",
    label: "Snabb",
    description: "Liten/billig profil. GPT-4.1 för enklare sidor och snabba ändringar.",
    hint: "billig",
  },
  {
    value: "pro",
    label: "Lagom",
    description: "Mellanprofil. GPT-5.3 Codex för bra balans mellan kvalitet och hastighet.",
    hint: "rekommenderad",
  },
  {
    value: "max",
    label: "Tanker",
    description:
      "GPT-5.4 — resonemang/thinking som standard i strömmen (inte samma profil som «Kod Max»/codex nedan).",
    hint: "dyr",
  },
  {
    value: "codex",
    label: "Kod Max",
    description:
      "Separat tung kodmodell (gpt-5.3-codex-max). Använd när du uttryckligen vill codex-varianten — vardagsläge för stark modell är «Tanker» ovan.",
  },
  {
    value: "anthropic",
    label: "Anthropic",
    description: "Jämförelseläge. Claude Sonnet 4.6 via Anthropic API för hela byggflödet.",
    hint: "jämför",
  },
];

/** Default build tier for new chats */
export const DEFAULT_MODEL_TIER: ModelTier = DEFAULT_MODEL_ID;

/** Default scaffold selection for new chats — off means no scaffold unless user picks one */
export const DEFAULT_SCAFFOLD_MODE: ScaffoldMode = "auto";
export const DEFAULT_SCAFFOLD_ID: string | null = null;

// ============================================
// PROMPT ASSIST OPTIONS
// ============================================

export interface PromptAssistModelOption {
  value: string;
  label: string;
}

export const PROMPT_ASSIST_OFF_VALUE = "off";

const PROMPT_ASSIST_LABELS: Record<string, string> = {
  "openai/gpt-5.4": "OpenAI GPT-5.4",
  "openai/gpt-5.3-codex": "OpenAI GPT-5.3 Codex",
  "openai/gpt-5.2": "OpenAI GPT-5.2",
  "anthropic/claude-sonnet-4.6": "Anthropic Claude Sonnet 4.6",
  "anthropic/claude-opus-4.6": "Anthropic Claude Opus 4.6",
  "anthropic-direct/claude-haiku-4-5-20251001": "Anthropic Claude Haiku 4.5 (direct)",
  "anthropic-direct/claude-sonnet-4-6": "Anthropic Claude Sonnet 4.6 (direct)",
  "anthropic-direct/claude-opus-4-6": "Anthropic Claude Opus 4.6 (direct)",
};

function humanizePromptAssistModel(model: string): string {
  const known = PROMPT_ASSIST_LABELS[model];
  if (known) return known;
  return model
    .replace(/^openai\//, "OpenAI ")
    .replace(/^anthropic-direct\//, "Anthropic direct ")
    .replace(/^anthropic\//, "Anthropic ")
    .replace(/-/g, " ");
}

export const PROMPT_ASSIST_MODEL_OPTIONS: PromptAssistModelOption[] = [
  { value: PROMPT_ASSIST_OFF_VALUE, label: "Av – skicka direkt" },
  ...ASSIST_MODELS.map((value) => ({
    value,
    label: humanizePromptAssistModel(value),
  })),
];

const PROMPT_ASSIST_MODEL_ALLOWLIST = new Set<string>([
  ...ASSIST_MODELS,
  ...ANTHROPIC_ASSIST_MODELS,
]);

export function getPromptAssistModelOptions(): PromptAssistModelOption[] {
  return PROMPT_ASSIST_MODEL_OPTIONS;
}

export function getPromptAssistModelLabel(model: string): string {
  return PROMPT_ASSIST_MODEL_OPTIONS.find((option) => option.value === model)?.label || model;
}

export function getDefaultPromptAssistModel(): string {
  const defaultCandidate = DEFAULT_PROMPT_ASSIST.model;
  if (PROMPT_ASSIST_MODEL_ALLOWLIST.has(defaultCandidate)) return defaultCandidate;
  return PROMPT_ASSIST_MODEL_OPTIONS[0]?.value || defaultCandidate;
}

// ============================================
// DEFAULT PROMPT ASSIST PROFILE
// ============================================

export interface PromptAssistDefaults {
  model: string;
  deep: boolean;
}

/**
 * Resolved from src/lib/gen/defaults.ts (defaults originate in config/ai_models/manifest.json).
 * Override via SAJTMASKIN_POLISH_MODEL and SAJTMASKIN_ASSIST_MODEL in .env.local.
 */
export const DEFAULT_PROMPT_POLISH_MODEL = POLISH_MODEL;

export const DEFAULT_PROMPT_ASSIST: PromptAssistDefaults = {
  model: ASSIST_MODEL,
  deep: true,
};

// ============================================
// OTHER DEFAULTS
// ============================================

/** Default for AI image generation toggle */
export const DEFAULT_IMAGE_GENERATIONS = true;

/** Default for reasoning/thinking toggle.
 * Önskat beteende: alltid på. Reasoning ger märkbart bättre arkitekturval och
 * struktur, särskilt för multi-page och scenes. Kostar lite tid (~5-15s extra)
 * men ger högre kvalitet. Användare kan toggla av per-chat i UI:t. */
export const DEFAULT_THINKING = true;

/**
 * Core instructions — always relevant regardless of scaffold/engine.
 * Covers tech stack, shadcn setup, language, and accessibility basics.
 */
const CORE_CUSTOM_INSTRUCTIONS = `## Tech Stack
- Next.js App Router with TypeScript (React 19)
- Tailwind CSS v4 for styling (utility classes)
- shadcn/ui components (\`@/components/ui/*\`, style "radix-vega")
- Use Next.js route handlers for server logic (no custom Node/Express server)
- Do not change core versions for next, react, react-dom, tailwindcss, postcss, typescript unless explicitly asked

## shadcn/ui Setup (summary)
- components.json: style "radix-vega", rsc true, baseColor "slate", css "src/app/globals.css", aliases for @/components, @/lib/utils, @/components/ui, @/lib, @/lib/hooks
- \`src/lib/utils.ts\`: export cn() using clsx + tailwind-merge
- \`src/app/globals.css\`: define CSS variables for theme tokens (--background, --foreground, --primary, etc.)
- Ensure deps exist: clsx, tailwind-merge, class-variance-authority, lucide-react, next-themes
- Use Tailwind v4 animation utilities via "tw-animate-css" (import it in globals.css when using animate-* utilities)
- Add @radix-ui/* packages only when a specific component requires them

## Language
- Match the user's language for all visible copy. Only translate if the user explicitly asks.

## Accessibility
- Semantic HTML: header, main, section, article, footer
- Proper heading hierarchy (h1 → h2 → h3)
- ARIA labels where needed
- Dialogs must include DialogTitle + DialogDescription (sr-only ok)
- Keyboard navigation support
- Focus-visible rings on interactive elements

## Component & Styling Principles
- Treat theme tokens as source of truth. Do not drift into ad-hoc colors if a theme is selected.
- Reuse existing shadcn/ui primitives before adding new components.
- Prefer token-driven styling in globals.css over one-off inline styles.
- Import icons from lucide-react.`;

// Legacy extended instructions live in a separate module so this file stays
// focused on the live defaults. The only consumer is the backward-compat
// detection in `isDefaultCustomInstructions()` below.
import { LEGACY_EXTENDED_CUSTOM_INSTRUCTIONS } from "./legacy-custom-instructions";

/**
 * Returns the appropriate default Custom Instructions based on scaffold mode.
 *
 * - scaffold "auto" / "manual" → CORE only (scaffold + engine STATIC_CORE
 *   already cover design, layout, motion, images).
 * - scaffold "off" → CORE + EXTENDED (full guidance for v0 fallback or
 *   scaffoldless generation).
 */
/**
 * Returns the default Custom Instructions.
 *
 * Visual design, layout, motion and images are covered by Core Rules
 * (config/prompt-core/, including 03-visual-design.md and 04-coding-direction.md)
 * plus brief-driven dynamic context — custom instructions only carry tech stack,
 * shadcn setup and a11y basics.
 */
export function getDefaultCustomInstructions(_scaffoldMode: ScaffoldMode): string {
  return CORE_CUSTOM_INSTRUCTIONS;
}

/**
 * All known default instruction variants so we can detect whether the user
 * has manually edited the instructions or is still on a default.
 */
const ALL_DEFAULTS = new Set([
  CORE_CUSTOM_INSTRUCTIONS.trim(),
  `${CORE_CUSTOM_INSTRUCTIONS}\n\n${LEGACY_EXTENDED_CUSTOM_INSTRUCTIONS}`.trim(),
]);

export function isDefaultCustomInstructions(value: string): boolean {
  return ALL_DEFAULTS.has(value.trim());
}
