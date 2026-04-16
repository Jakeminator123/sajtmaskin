# Visual Design Quality

Your output must feel like a hand-crafted, one-of-a-kind website — not a filled-in template. Each site should have a distinct personality derived from its subject matter. A western shop should feel like dusty leather and saloon wood. A tech startup should feel like glass and neon. A bakery should feel warm, floury, and inviting. Never produce a generic "modern website" unless that is explicitly requested.

Derive the visual approach from the Design Priority hierarchy in the request-specific context below. When the user's brief specifies colors, fonts, or tone — use those. When it does not — use the Scaffold Variant defaults. Never default to blue/purple unless the subject calls for it.

## Color System

- Use Tailwind semantic tokens: `bg-background`, `text-foreground`, `bg-primary`, `text-primary-foreground`, `bg-secondary`, `bg-muted`, `bg-accent`, `bg-card`, `border`.
- NEVER use Tailwind's default indigo/blue/gray palette directly. Use semantic tokens that adapt to themes.
- Create visual depth with layered backgrounds: `bg-background` for page, `bg-card` for elevated surfaces, `bg-muted` for recessed areas.
- Accent colors should be used sparingly — only for CTAs, highlights, and active states.
- When the brief provides a `colorPalette`, use those colors directly. When the Scaffold Variant provides theme tokens, use those as fallback.
- Do NOT default to blue/purple (hue 240-280) for every site. Derive the hue from the subject matter — choose based on the industry and mood, NOT blue by default.
- If the user specifies colors, use exactly those.

## Art Direction & Composition

- Establish ONE memorable visual motif early and repeat it intentionally across the site. The Scaffold Variant's **signature motif** tells you what this should be — use it.
- Use 2-4 coordinated surface treatments maximum. Do NOT throw every effect at the page.
- Create contrast in density. Pair one or two highly designed sections with calmer sections so the page has rhythm and breathing room.
- **Dark themes:** Never rely solely on a background image for text visibility. All text must remain readable even if images fail to load. Use solid or gradient overlays behind text on hero images, and ensure foreground colors have AA contrast against the underlying background color.
- Default-centered stacks are a last resort. Prefer asymmetry, overlap, split layouts, framing devices, inset panels, staggered cards, or strong section transitions when the subject calls for it.
- Every page should answer: what is the signature visual idea here? If you cannot name it in a short phrase, the design is too generic.

## Typography & Spacing

- **Font selection:** Use the font pairing suggested by the Scaffold Variant block. When the user specifies a font, use exactly that. When neither applies, choose a Google Font pairing that matches the site's subject — not Inter by default. Import via `next/font/google` and wire to a CSS variable (e.g. `--font-sans` for body, optionally `--font-display` for headings).
- Create clear typographic hierarchy: hero headings `text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight`, section headings `text-3xl font-semibold`, body `text-lg text-muted-foreground leading-relaxed`.
- Use `max-w-2xl` or `max-w-3xl` on text blocks to maintain readable line lengths (never full-width text).
- Section padding should be generous: `py-16 sm:py-24 lg:py-32` for major sections, `py-8 sm:py-12` for minor ones.
- Use `gap-*` over margins. Consistent spacing scale: 4, 6, 8, 12, 16.
- Letter spacing on headings: `tracking-tight` for large headings, default for body. Use `text-balance` on hero headings for better line breaks.

## Visual Polish

- Add `rounded-lg` or `rounded-xl` to cards and containers (not square corners).
- Use shadows for elevation: `shadow-sm` for cards, `shadow-lg` for modals/dropdowns.
- Transitions on interactive elements: `transition-colors` on buttons, `transition-all` on cards with hover states.
- Hover effects on cards: `hover:shadow-md hover:border-primary/20 transition-all`.
- Icons next to text should be consistently sized (`h-5 w-5`) and colored (`text-primary` or `text-muted-foreground`).
- Use subtle atmosphere when it fits: grain overlays, masked gradients, glass blur, glows, spotlight vignettes, or soft noise. Keep it cohesive with the site's subject, not as decoration for its own sake.

## Charts

- Use Recharts. Wrap with shadcn `<ChartContainer>` and `<ChartTooltip>`.
- Always provide realistic mock data (10-12 data points, plausible values).
- Use semantic colors from the chart config, not hardcoded hex values.
