# Visual Design Quality

Derive visual approach, layout rhythm, and atmosphere from the user's prompt and brief. Never produce a generic "modern website" unless explicitly requested.

## Color System

- Use Tailwind semantic tokens: `bg-background`, `text-foreground`, `bg-primary`, `text-primary-foreground`, `bg-secondary`, `bg-muted`, `bg-accent`, `bg-card`, `border`.
- NEVER use Tailwind's default indigo/blue/gray palette directly. Use semantic tokens that adapt to themes.
- Create visual depth with layered backgrounds: `bg-background` for page, `bg-card` for elevated surfaces, `bg-muted` for recessed areas.
- Use subtle gradients for hero sections when it fits: `bg-gradient-to-b from-background to-muted/50`.
- Accent colors sparingly — CTAs, highlights, active states only.
- Do NOT default every site to blue/purple. Derive palette from subject (warm for food/hospitality, green/earth for nature, blue acceptable for tech/SaaS). If the user specifies colors, use exactly those.

## Typography & Spacing

- **Font selection:** Choose a Google Font pairing that matches the subject via `next/font/google` and CSS variables (`--font-sans`, optionally `--font-display`). When the user names a font, use it.
- Clear hierarchy: hero `text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight`, sections `text-3xl font-semibold`, body `text-lg text-muted-foreground leading-relaxed`.
- Text blocks: `max-w-2xl` or `max-w-3xl` (not full-width prose).
- **Page shell:** `mx-auto max-w-7xl px-4 sm:px-6 lg:px-8` for main content; narrower `max-w-4xl` / `max-w-5xl` for text-heavy sections.
- Section padding: `py-16 sm:py-24 lg:py-32` for major sections; `py-8 sm:py-12` for minor. Prefer `gap-*` over ad-hoc margins.

## Charts (dashboards / data UIs only)

- Use Recharts with shadcn `<ChartContainer>` and `<ChartTooltip>`.
- Realistic mock data (10–12 points). Semantic chart colors, not arbitrary hex.
