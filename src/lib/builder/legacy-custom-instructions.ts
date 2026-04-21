/**
 * Legacy default custom-instructions string.
 *
 * Kept **only** so that `isDefaultCustomInstructions()` in
 * `src/lib/builder/defaults.ts` can still detect previously-saved values and
 * recognise them as "user has not edited the defaults" — otherwise a stored
 * chat created before the Core Rules consolidation would look like a
 * manually-edited value.
 *
 * This block is **not** injected into new chats. Everything in here is now
 * covered by:
 *   - `config/prompt-core/03-visual-design.md`
 *   - `config/prompt-core/04-coding-direction.md`
 *   - brief-driven dynamic context
 *
 * Do not edit this string. Any edit would change the detection hash and make
 * old saved chats look "customized". If you want to change legacy-detection
 * semantics, do it via a migration, not by rewriting this constant.
 */
export const LEGACY_EXTENDED_CUSTOM_INSTRUCTIONS = `## Design System Execution
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
- Tailwind v4 \`@apply\` accepts ONLY real utility classes — NEVER your own \`@layer components\` classes (e.g. \`.surface-*\`, \`.tile-*\`, \`.card-*\`). Doing \`@apply surface-blueprint;\` after declaring \`.surface-blueprint { ... }\` in \`@layer components\` produces a hard build error ("Cannot apply unknown utility class") that whitescreens the preview. Either use the custom class directly via \`className=\"surface-blueprint\"\` in JSX, or repeat the underlying CSS declarations inline in each consumer rule.

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
