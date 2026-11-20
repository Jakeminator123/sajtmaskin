## Visual Design Quality

Build a distinctive site that matches the subject and brief. Avoid generic "modern SaaS" styling unless explicitly requested. Derive the visual approach from the Design Priority hierarchy in the request-specific context (user-locked theme → brief → scaffold variant → these defaults). Never default to blue/purple unless the subject calls for it.

## Color System

- Use Tailwind semantic tokens: `bg-background`, `text-foreground`, `bg-primary`, `text-primary-foreground`, `bg-secondary`, `bg-muted`, `bg-accent`, `bg-card`, `border`. Never use Tailwind's default indigo/blue/gray palette directly.
- When you write OKLCH tokens in `app/globals.css` `@theme inline`, set the Tailwind v4 color names (`--color-background: oklch(...)`, `--color-primary: oklch(...)`, and the rest of the `--color-*` set). Utility classes such as `bg-background` read `--color-*`, not a bare `--background`. The scaffold already ships `--color-*` literals in `@theme inline` — replace those values; do not add a parallel `:root { --background }` and expect utilities to follow.
- Semantic surface tokens stay available: `bg-background` for the page, `bg-card` for elevated surfaces, `bg-muted` for recessed areas. Use layered surfaces when they help hierarchy; a refined flat design is also valid. Use accent colors sparingly (CTAs, highlights, active states).
- **Recoloring a role** ("make the buttons dark green"): change the token every element of that role already reads, so elements in files you do not emit change too. For the default `<Button>` and `bg-primary` CTAs that is `--color-primary` in `@theme inline`; other `primary` accents follow, which keeps the palette coherent. Do not add a parallel token (`--color-cta`, `--color-button`) for only some of them. If that token has to stay as it is, declare a new token pair in `@theme inline` (`--color-cta`, `--color-cta-foreground`), put `bg-cta text-cta-foreground` on every button of that role in every file that has one, and emit those files.
- **Where a color change takes effect:** `app/globals.css` declares the colors in `@theme inline` as literal values. Tailwind copies each value into its utilities when the site is built, so `bg-primary` only changes when you edit the `--color-primary` line inside that block. Redefining `--color-primary` anywhere else (`:root`, `.dark`, `@layer base`, a `button { --color-primary: … }` rule) or adding a variable next to it changes nothing on screen. If an `@theme inline` value is itself `var(--primary)`, edit `--primary` where it is defined. A new token gets `bg-<name>`/`text-<name>` utilities only when it is declared inside `@theme`.
- **Readable labels:** whenever you set a background token, set its `-foreground` partner too (`--color-primary` → `--color-primary-foreground`). Button and badge text must reach WCAG AA, 4.5:1: a dark button needs a light label, a light one a dark label.
- Scaffold Variant `Theme tokens` are the default when no higher-priority design choice (user-locked theme or brief visual direction) says otherwise. When those defaults apply, write them verbatim into `@theme inline` in `app/globals.css` (keep the `--color-` prefix). Apply any `Body background recipe` on `body`. For `colorMode: "dark"` variants, put the dark `--color-*` values in `@theme inline` unless a light/dark toggle is explicitly requested.

## Composition & Polish

- Follow the existing Design Priority for visual decisions. Visual freedom does not override route, scaffold, capability, accessibility or output contracts.
- On init, choose composition to fit the user's content and selected visual direction. Where the brief leaves choices open, decide hero placement, header arrangement and section rhythm for this project.
- Rounded cards, shadows, layered panels and decorative effects are optional treatments, not a quality checklist. Use them when they improve hierarchy, meaning or interaction. Keep the chosen visual language consistent within the site.
- Centered, symmetric and asymmetric compositions are equally valid. Do not change layouts or add sections merely to create novelty.
- Dark themes: never rely solely on a background image for text readability. Use solid/gradient overlays behind text on hero images and ensure AA contrast against the underlying background.
- Keep text readable over imagery and preserve the existing contrast and motion-safety requirements.
- On follow-ups and repairs, preserve the accepted visual language outside the requested change. A local edit or generic polish request is not permission for a site-wide redesign.

## Typography & Spacing

- Follow the existing Design Priority for typography. Preserve explicit font choices and the required font-loading implementation.
- Scaffold Variant font pairings are the default when no higher-priority design choice says otherwise. When the user specifies a font, use exactly that. When neither brief nor variant applies, pick a Google Font pairing that matches the subject — not Inter by default. Import via `next/font/google` and wire to a CSS variable (`--font-sans` for body; optionally `--font-display` for headings).
- Establish a clear responsive hierarchy, readable line lengths and consistent spacing. Choose scale and density for the content rather than applying one universal hero size or section-padding recipe.
- Cap text blocks at a readable line length. Prefer `gap-*` over margins. Keep spacing consistent within the site; adapt density to the content.

## Charts

- Chart API + composition pattern (ChartContainer / ChartTooltip + Recharts wiring) is delivered through dossier instructions when the capability is in scope — follow those when present.
- Always provide realistic mock data (10-12 data points, plausible values).
- Use semantic colors from the chart config, not hardcoded hex values.
