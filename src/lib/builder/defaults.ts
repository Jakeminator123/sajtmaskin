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

/** Default for reasoning/thinking toggle — off for faster first generation */
export const DEFAULT_THINKING = false;

/** Default for spec mode in builder */
export const DEFAULT_SPEC_MODE = true;

/**
 * Core instructions — always relevant regardless of scaffold/engine.
 * Covers tech stack, shadcn setup, language, and accessibility basics.
 */
const CORE_CUSTOM_INSTRUCTIONS = `## Tech Stack
- Next.js App Router with TypeScript (React 19)
- Tailwind CSS v4 for styling (utility classes)
- shadcn/ui components (\`@/components/ui/*\`, style "new-york-v4")
- Use Next.js route handlers for server logic (no custom Node/Express server)
- Do not change core versions for next, react, react-dom, tailwindcss, postcss, typescript unless explicitly asked

## shadcn/ui Setup (summary)
- components.json: style "new-york-v4", rsc true, baseColor "slate", css "src/app/globals.css", aliases for @/components, @/lib/utils, @/components/ui, @/lib, @/lib/hooks
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
- Focus-visible rings on interactive elements`;

/**
 * Extended instructions — visual design, layout, motion, images.
 * Only useful when NO scaffold is active, since scaffolds (and the engine's
 * STATIC_CORE) already provide comprehensive design guidance.
 */
const EXTENDED_CUSTOM_INSTRUCTIONS = `## Design System Execution
- Treat theme tokens as source of truth. Do not drift into ad-hoc colors if a theme is selected.
- Build in this order: small reusable components -> section blocks -> full page composition.
- Reuse existing UI primitives/components before adding new ones.
- Prefer token-driven styling in globals.css over one-off inline styles.
- Keep outputs compatible with registry/Open-in-Builder workflows when possible.

## Component Usage
- Use existing shadcn/ui components; avoid duplicating component files (use cn() from \`@/lib/utils\`)
- Prefer shadcn/ui primitives for modals, overlays, badges, tooltips, sheets, and accordions
- When adding a new shadcn component, update dependencies/components.json if needed
- Import icons from lucide-react

## Tailwind Best Practices
- Use Tailwind's design tokens: colors (slate, zinc, violet), spacing (px-4, py-8), typography (text-sm, font-medium)
- Prefer Tailwind v4 CSS-first config: define tokens in globals.css with @theme inline; keep tailwind.config minimal
- Leverage modern utilities: container, prose, backdrop-blur, gradient-*
- Use responsive prefixes: sm:, md:, lg:, xl:, 2xl:
- Prefer gap-* over margins between flex/grid items
- Use group/peer for interactive states

## Visual Identity
- Never use flat pure-white backgrounds across the whole page
- Use layered backgrounds: gradients, soft tints, and section bands to create depth
- Ensure the hero uses a distinctive background (gradient or tinted panel)
- Pick a distinct font pairing (e.g., Inter + Space Grotesk, or DM Sans + DM Mono)
- Use a cohesive color palette with primary, secondary, accent colors

## Layout Patterns
- Full-width sections with max-w-7xl mx-auto for content
- Hero: min-h-[80vh] or min-h-screen with flex items-center
- Spacing between sections: py-16 md:py-24
- Use CSS Grid for complex layouts (bento grids, masonry), Flexbox for alignment
- Vary section layouts: split hero, stats row, logo wall, testimonial carousel

## Motion & Interaction
- Add tasteful hover states on all interactive elements
- Use subtle scroll-reveal animations (fade-in, slide-up) in hero and at least 2 sections
- Prefer Tailwind animate-* utilities for simple transitions; use custom @keyframes in globals.css when the design calls for it
- For advanced motion (timelines, carousels, staggered reveals, atmospheric effects), use framer-motion (add dependency if missing)
- For creative visual effects (smoke, particles, parallax, glitch, neon), use @keyframes, CSS animations, or framer-motion freely
- Respect prefers-reduced-motion for accessibility

## Visual Quality
- Smooth transitions: transition-all duration-200
- Layered depth: subtle shadows (shadow-sm, shadow-lg), borders, glassy panels
- Border radius: rounded-lg, rounded-xl
- Dark mode support: dark: prefixes
- Premium feel: cards with borders, soft backgrounds, consistent spacing

## Images
- Always include descriptive alt text
- Use next/image with proper sizing
- Prefer .png, .jpg, .webp formats
- The hero section MUST have a large, prominent image (w=1200, h=600 minimum)
- Include images in hero + at least 2 other sections
- Never use blob: URIs, data: URIs, or local file paths for images
- Prefer AI-generated images when available; when not, use real Unsplash photos matching the site topic exactly
- NEVER use generic stock photos (office/laptop/handshake/coffee) unless the site is about those topics
- When using Unsplash, use the format: https://images.unsplash.com/photo-{ID}?w={W}&h={H}&fit=crop&q=80

## Figma Workflow
- If the user provides Figma, extract structure first (nav, hero, sections, footer) before polishing visuals.
- Prefer iterative conversion: implement key components first, then assemble the full page.
- Preserve spacing rhythm and typography hierarchy from the design reference.`;

/**
 * Returns the appropriate default Custom Instructions based on scaffold mode.
 *
 * - scaffold "auto" / "manual" → CORE only (scaffold + engine STATIC_CORE
 *   already cover design, layout, motion, images).
 * - scaffold "off" → CORE + EXTENDED (full guidance for v0 fallback or
 *   scaffoldless generation).
 */
export function getDefaultCustomInstructions(scaffoldMode: ScaffoldMode): string {
  if (scaffoldMode === "auto" || scaffoldMode === "manual") {
    return CORE_CUSTOM_INSTRUCTIONS;
  }
  return `${CORE_CUSTOM_INSTRUCTIONS}\n\n${EXTENDED_CUSTOM_INSTRUCTIONS}`;
}

/**
 * All known default instruction variants so we can detect whether the user
 * has manually edited the instructions or is still on a default.
 */
const ALL_DEFAULTS = new Set([
  CORE_CUSTOM_INSTRUCTIONS.trim(),
  `${CORE_CUSTOM_INSTRUCTIONS}\n\n${EXTENDED_CUSTOM_INSTRUCTIONS}`.trim(),
]);

export function isDefaultCustomInstructions(value: string): boolean {
  return ALL_DEFAULTS.has(value.trim());
}

/** Spec file reference to append to system prompt when spec mode is active */
export const SPEC_FILE_INSTRUCTION = `\n\n## Spec File
- If sajtmaskin.spec.json exists in the project, treat it as the source of truth for business info, theme, pages, and constraints.
- Do not contradict the spec unless the user explicitly asks.
- When iterating, refer to the spec for context about the project.`;

