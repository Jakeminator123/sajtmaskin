## Visual Design Quality

Build a distinctive site that matches the subject and brief. Avoid generic "modern SaaS" styling unless explicitly requested. Derive the visual approach from the Design Priority hierarchy in the request-specific context (user-locked theme → brief → scaffold variant → these defaults). Never default to blue/purple unless the subject calls for it.

## Color System

- Use Tailwind semantic tokens: `bg-background`, `text-foreground`, `bg-primary`, `text-primary-foreground`, `bg-secondary`, `bg-muted`, `bg-accent`, `bg-card`, `border`. Never use Tailwind's default indigo/blue/gray palette directly.
- When you write OKLCH tokens in `app/globals.css` `@theme inline`, emit BOTH the raw token (`--background: oklch(...)`) AND the Tailwind v4 alias (`--color-background: var(--background)`). Both are required for utility classes to resolve. The scaffold's `globals.css` already follows this pattern — match it.
- Create visual depth with layered backgrounds: `bg-background` for page, `bg-card` for elevated surfaces, `bg-muted` for recessed areas. Use accent colors sparingly (CTAs, highlights, active states).
- When the Scaffold Variant block provides `Theme tokens`, write them verbatim into `@theme inline` in `app/globals.css`. Apply any `Body background recipe` on `body`. For `colorMode: "dark"` variants, put dark tokens in `:root` directly unless a toggle is explicitly requested.

## Composition & Polish

- Establish one memorable visual motif and repeat it intentionally. The Scaffold Variant's signature motif tells you what. Use 2-4 coordinated surface treatments maximum.
- Create contrast in density — pair one or two heavily designed sections with calmer ones so the page breathes. Prefer deliberate structure (asymmetry, overlap, split, staggering) when it fits the subject; avoid default centered stacks unless the brief calls for minimalism.
- Dark themes: never rely solely on a background image for text readability. Use solid/gradient overlays behind text on hero images and ensure AA contrast against the underlying background.
- Rounded cards/containers (`rounded-lg`/`rounded-xl`), subtle shadows (`shadow-sm` / `shadow-lg` for modals), transitions on interactive elements (`transition-colors`, `transition-all`). Hover on cards: `hover:shadow-md hover:border-primary/20 transition-all`.
- Use subtle atmosphere when it fits the subject (grain, masked gradients, glass blur, glows, soft noise) — not decoration for its own sake.

## Typography & Spacing

- Use the font pairing suggested by the Scaffold Variant. When the user specifies a font, use exactly that. When neither applies, pick a Google Font pairing that matches the subject — not Inter by default. Import via `next/font/google` and wire to a CSS variable (`--font-sans` for body; optionally `--font-display` for headings).
- Hierarchy: hero `text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight`, section headings `text-3xl font-semibold`, body `text-lg text-muted-foreground leading-relaxed`.
- Cap text blocks at `max-w-2xl`/`max-w-3xl` for readable line length.
- Generous section padding: `py-16 sm:py-24 lg:py-32` for major sections, `py-8 sm:py-12` for minor. Use `gap-*` over margins. Consistent spacing scale: 4, 6, 8, 12, 16.

## Charts

- Chart API + composition pattern (ChartContainer / ChartTooltip + Recharts wiring) is delivered through dossier instructions when the capability is in scope — follow those when present.
- Always provide realistic mock data (10-12 data points, plausible values).
- Use semantic colors from the chart config, not hardcoded hex values.
