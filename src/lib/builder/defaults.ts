/**
 * Shared defaults and options for model tiers and prompt assist.
 * Used by Builder UI for model tier and prompt assist defaults.
 *
 * CONCEPTS:
 *
 * Model Tiers (for v0 builder):
 *   - v0-mini: Fastest, cheapest. Good for quick prototypes.
 *   - v0-pro:  Balanced quality and speed.
 *   - v0-max:  Best quality, slower. Deep reasoning. RECOMMENDED.
 *
 * Prompt Assist (preprocessing user prompts before v0 generation):
 *   - off:            No preprocessing, send prompt directly to v0.
 *   - gateway:        AI Gateway (Vercel's multi-provider routing with fallbacks).
 *   - openai-compat:  v0 Model API (v0-1.5-md/lg).
 *
 * Deep Brief Mode:
 *   When enabled, AI first generates a structured "brief" (specification)
 *   which is then used to construct a better prompt for v0. Takes longer
 *   but produces more thorough results for complex projects.
 */

import { GATEWAY_ASSIST_MODELS, V0_ASSIST_MODELS } from "./promptAssist";
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
    value: "v0-mini",
    label: "Mini",
    description: "Snabbast, billigast",
  },
  {
    value: "v0-pro",
    label: "Pro",
    description: "Balanserad",
  },
  {
    value: "v0-max",
    label: "Max",
    description: "Bäst kvalitet",
    hint: "Rekommenderad",
  },
];

/** Default model tier for new chats */
export const DEFAULT_MODEL_TIER: ModelTier = "v0-max";

// ============================================
// PROMPT ASSIST OPTIONS
// ============================================

export interface PromptAssistModelOption {
  value: string;
  label: string;
}

export const PROMPT_ASSIST_MODEL_OPTIONS: PromptAssistModelOption[] = [
  { value: "openai/gpt-5.2", label: "GPT‑5.2 (Gateway)" },
  { value: "openai/gpt-5.2-pro", label: "GPT‑5.2 Pro (Gateway)" },
  { value: "anthropic/claude-opus-4.5", label: "Claude Opus 4.5 (Gateway)" },
  { value: "anthropic/claude-sonnet-4.5", label: "Claude Sonnet 4.5 (Gateway)" },
  { value: "v0-1.5-md", label: "v0‑1.5‑md (v0 Model API)" },
  { value: "v0-1.5-lg", label: "v0‑1.5‑lg (v0 Model API)" },
];

const PROMPT_ASSIST_MODEL_ALLOWLIST = new Set<string>([
  ...GATEWAY_ASSIST_MODELS,
  ...V0_ASSIST_MODELS,
]);

export function getPromptAssistModelOptions(): PromptAssistModelOption[] {
  return PROMPT_ASSIST_MODEL_OPTIONS;
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
 * Default prompt assist configuration.
 * - Default provider is AI Gateway to keep all external models on the gateway.
 * - If enabled, gateway + gpt-5.2 gives highest quality prompt rewrites.
 * - Deep Brief ON by default for higher quality; user can disable for speed.
 */
export const DEFAULT_PROMPT_ASSIST: PromptAssistDefaults = {
  model: "openai/gpt-5.2",
  deep: true,
};

/** Whether prompt assist is enabled by default (kept in sync with provider) */
export const DEFAULT_PROMPT_ASSIST_ENABLED = true;

// ============================================
// OTHER DEFAULTS
// ============================================

/** Default for AI image generation toggle */
export const DEFAULT_IMAGE_GENERATIONS = true;

/** Default for v0 thinking toggle */
export const DEFAULT_THINKING = true;

/** Default for spec mode in builder */
export const DEFAULT_SPEC_MODE = true;

/** Default system instructions for new chats (editable in UI) */
export const DEFAULT_CUSTOM_INSTRUCTIONS = `## Tech Stack
- Next.js App Router with TypeScript (React 19)
- Tailwind CSS v4 for styling (utility classes)
- shadcn/ui components (\`@/components/ui/*\`, style "new-york")
- Use Next.js route handlers for server logic (no custom Node/Express server)
- Do not change core versions for next, react, react-dom, tailwindcss, postcss, typescript unless explicitly asked

## shadcn/ui Setup (summary)
- components.json: style "new-york", rsc true, baseColor "slate", css "src/app/globals.css", aliases for @/components, @/lib/utils, @/components/ui, @/lib, @/hooks
- \`src/lib/utils.ts\`: export cn() using clsx + tailwind-merge
- \`src/app/globals.css\`: define CSS variables for theme tokens (--background, --foreground, --primary, etc.)
- Ensure deps exist: clsx, tailwind-merge, class-variance-authority, lucide-react, next-themes
- Use Tailwind v4 animation utilities via "tw-animate-css" (import it in globals.css when using animate-* utilities)
- Add @radix-ui/* packages only when a specific component requires them

## Language
- Match the user's language for all visible copy. Only translate if the user explicitly asks.

## Component Usage
- Use existing shadcn/ui components; avoid duplicating component files (use cn() from \`@/lib/utils\`)
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
- Use Tailwind's built-in animations; avoid custom @keyframes or @property rules
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
- Include images in hero + at least 2 other sections
- Never use blob: URIs, data: URIs, or local file paths for images
- Prefer v0-generated images when available; only use public https URLs as a last resort

## Accessibility
- Semantic HTML: header, main, section, article, footer
- Proper heading hierarchy (h1 → h2 → h3)
- ARIA labels where needed
- Dialogs must include DialogTitle + DialogDescription (sr-only ok)
- Keyboard navigation support
- Focus-visible rings on interactive elements`;

/** Spec file reference to append to system prompt when spec mode is active */
export const SPEC_FILE_INSTRUCTION = `\n\n## Spec File
- If sajtmaskin.spec.json exists in the project, treat it as the source of truth for business info, theme, pages, and constraints.
- Do not contradict the spec unless the user explicitly asks.
- When iterating, refer to the spec for context about the project.`;
