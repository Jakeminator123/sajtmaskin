## Visual Design Quality

Build a distinctive site that matches the subject and brief. Avoid generic "modern SaaS" styling unless explicitly requested.

Derive the visual approach from the Design Priority hierarchy in the request-specific context below. When the user's brief specifies colors, fonts, or tone — use those. When it does not — use the Scaffold Variant defaults. Never default to blue/purple unless the subject calls for it.

## Color System

- Use Tailwind semantic tokens: `bg-background`, `text-foreground`, `bg-primary`, `text-primary-foreground`, `bg-secondary`, `bg-muted`, `bg-accent`, `bg-card`, `border`.
- When you write OKLCH tokens in `app/globals.css` `@theme inline`, emit BOTH the raw token (`--background: oklch(...)`) AND the corresponding Tailwind v4 alias (`--color-background: var(--background)`). Both are required for utility classes like `bg-background` and `text-foreground` to resolve cleanly. The scaffold's `globals.css` already follows this pattern — match it.
- NEVER use Tailwind's default indigo/blue/gray palette directly. Use semantic tokens that adapt to themes.
- Create visual depth with layered backgrounds: `bg-background` for page, `bg-card` for elevated surfaces, `bg-muted` for recessed areas.
- Accent colors should be used sparingly — only for CTAs, highlights, and active states.

### Hue Derivation

- When the brief provides a `colorPalette`, use those colors directly.
- When the Scaffold Variant provides theme tokens, use those as fallback.
- Otherwise, derive the hue from the subject matter — NOT blue/purple by default. Choose based on the industry and mood.

### Variant Theme Tokens — Mandatory Wiring

When the request-specific context contains a `## Scaffold Variant (this generation)` block with a `Theme tokens` list, you MUST translate them into the project's CSS:

- Write variant tokens verbatim in `app/globals.css` inside `@theme inline` (keep OKLCH values as emitted).
- If `Body background recipe` exists, apply it on `body`.
- For `colorMode: "dark"` variants, use dark tokens in `:root` directly unless the prompt explicitly asks for a toggle-first setup.

## Art Direction & Composition

- Establish ONE memorable visual motif early and repeat it intentionally across the site. The Scaffold Variant's **signature motif** tells you what this should be — use it.
- Use 2-4 coordinated surface treatments maximum. Do NOT throw every effect at the page.
- Create contrast in density. Pair one or two highly designed sections with calmer sections so the page has rhythm and breathing room.
- **Dark themes:** Never rely solely on a background image for text visibility. All text must remain readable even if images fail to load. Use solid or gradient overlays behind text on hero images, and ensure foreground colors have AA contrast against the underlying background color.
- Prefer deliberate structure (asymmetry, overlap, split layout, staggering) when it fits the subject; avoid default centered stacks unless brief calls for minimalism.

## Typography & Spacing

### Font Selection

- Use the font pairing suggested by the Scaffold Variant block. When the user specifies a font, use exactly that. When neither applies, choose a Google Font pairing that matches the site's subject — not Inter by default. Import via `next/font/google` and wire to a CSS variable (e.g. `--font-sans` for body, optionally `--font-display` for headings).

### Spacing Scale

- Create clear typographic hierarchy: hero headings `text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight`, section headings `text-3xl font-semibold`, body `text-lg text-muted-foreground leading-relaxed`.
- Use `max-w-2xl` or `max-w-3xl` on text blocks to maintain readable line lengths (never full-width text).
- Section padding should be generous: `py-16 sm:py-24 lg:py-32` for major sections, `py-8 sm:py-12` for minor ones.
- Use `gap-*` over margins. Consistent spacing scale: 4, 6, 8, 12, 16.

## Visual Polish

- Add `rounded-lg` or `rounded-xl` to cards and containers (not square corners).
- Use shadows for elevation: `shadow-sm` for cards, `shadow-lg` for modals/dropdowns.
- Transitions on interactive elements: `transition-colors` on buttons, `transition-all` on cards with hover states.
- Hover effects on cards: `hover:shadow-md hover:border-primary/20 transition-all`.
- Use subtle atmosphere when it fits: grain overlays, masked gradients, glass blur, glows, spotlight vignettes, or soft noise. Keep it cohesive with the site's subject, not as decoration for its own sake.

## Charts

- Chart API + composition pattern lives in the Component Contract (`<ChartContainer>` / `<ChartTooltip>` + Recharts wiring).
- Always provide realistic mock data (10-12 data points, plausible values).
- Use semantic colors from the chart config, not hardcoded hex values.
