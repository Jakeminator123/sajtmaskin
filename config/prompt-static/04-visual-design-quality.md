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
- **DO NOT use Geist or Geist_Mono fonts** — they are not reliably available in the preview runtime. Use Inter, DM Sans, Space Grotesk, or another established Google Font instead.
- **Fonts are ONLY loaded via `next/font/google`** — NEVER install font packages from npm (e.g. `sora-font`, `geist`, `inter-font`, `playfair-display`). These do NOT exist on npm. Always use `import { FontName } from "next/font/google"` instead.
- Create clear typographic hierarchy: hero headings `text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight`, section headings `text-3xl font-semibold`, body `text-lg text-muted-foreground leading-relaxed`.
- Use `max-w-2xl` or `max-w-3xl` on text blocks to maintain readable line lengths (never full-width text).
- Section padding should be generous: `py-16 sm:py-24 lg:py-32` for major sections, `py-8 sm:py-12` for minor ones.
- Use `gap-*` over margins. Consistent spacing scale: 4, 6, 8, 12, 16.
- Letter spacing on headings: `tracking-tight` for large headings, default for body. Use `text-balance` on hero headings for better line breaks.

## Layout Patterns

Choose the layout approach that best serves the site's subject and atmosphere. The examples below are common defaults — use them when they fit, but deviate when the prompt calls for something different:

- **Hero sections**: Full-bleed with generous vertical padding, or split layouts, parallax, video backgrounds, full-screen immersive — whatever matches the mood. Common: `mx-auto max-w-4xl text-center` with heading + subtext + CTA. Better: give the hero a framing move such as offset media, floating metrics, diagonal separators, layered captions, or an atmospheric backdrop.
- **Content sections**: Grids (`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6`), alternating left-right, timelines, bento grids, masonry, or free-form editorial layouts. Pick what suits the content. Avoid repeating the exact same card grid structure section after section.
- **Backgrounds**: Alternate between `bg-background` and `bg-muted/50` for rhythm, or use bold gradients, textures, and atmospheric effects when the theme demands it. Use section transitions to make adjacent sections feel intentionally different.
- **CTAs**: `<Button size="lg">` for primary, `<Button variant="outline" size="lg">` for secondary. Group with `flex gap-4`.
- **Footers**: Multi-column grid with company info, links, and social icons.
- **Navigation**: Sticky header with `border-b bg-background/95 backdrop-blur` is a safe default, but creative themes may use transparent nav, sidebar nav, or other approaches.

## Visual Polish

- Add `rounded-lg` or `rounded-xl` to cards and containers (not square corners).
- Use shadows for elevation: `shadow-sm` for cards, `shadow-lg` for modals/dropdowns.
- Transitions on interactive elements: `transition-colors` on buttons, `transition-all` on cards with hover states.
- Hover effects on cards: `hover:shadow-md hover:-translate-y-1 hover:border-primary/20 transition-all duration-300`.
- Badge usage: Use `<Badge>` for status indicators, tags, and labels ("Popular", "New", "Pro").
- Dividers: Use `<Separator>` between sections or `border-b` for subtle separation.
- Icons next to text should be consistently sized (`h-5 w-5`) and colored (`text-primary` or `text-muted-foreground`).
- Use subtle atmosphere when it fits: grain overlays, masked gradients, glass blur, glows, spotlight vignettes, or soft noise. Keep it cohesive with the site's subject, not as decoration for its own sake.
- **CRITICAL: No external texture/asset files.** Never reference image files like `/grain.png`, `/noise.png`, `/texture.svg` etc. These files do not exist. All grain, noise, and texture effects MUST be implemented with pure CSS: use `background-image: url("data:image/svg+xml,...")` inline SVG data URIs, CSS gradients, `backdrop-filter`, or CSS `::before`/`::after` pseudo-elements with gradient overlays. Example grain effect: `background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.04'/%3E%3C/svg%3E")`

### Content First, Effects Second

The #1 priority is rich, readable content. Every section must have substantial text: headings, descriptions, value propositions, feature explanations, testimonials. A page with beautiful backgrounds but sparse text is a failure. Fill every section with realistic Swedish content before adding any visual effects.

### Nice-to-have interactive touches (use sparingly)

Pick 1-2 of these if they fit the site — do NOT overload the page:

- **Hover-lift cards** — `hover:-translate-y-1 hover:shadow-xl transition-all duration-300`
- **Gradient text** — headlines with `bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent`
- **Animated CTA buttons** — `hover:scale-105 active:scale-95 transition-transform`
- **Glassmorphism panels** — `bg-background/80 backdrop-blur-lg border border-border/50 rounded-2xl` (only on 1-2 elements)

**DO NOT** use scroll-triggered animations, `IntersectionObserver`, `useInView`, `react-intersection-observer`, `framer-motion`, or any animation that hides content with `opacity-0` by default. Content must always be visible without JavaScript.

**DO NOT** import from `react-intersection-observer` or `framer-motion/useInView` — these packages are NOT available in the preview runtime.

## Mandatory Design Richness

Every generated site MUST meet these minimum quality bars. A site that fails ANY of these looks amateurish:

### Minimum Visual Complexity
1. **Section variety**: No two adjacent sections may use the same background treatment. Alternate between: solid color, gradient, image-backed with overlay, muted background, and accent-colored sections.
2. **Card treatments**: Cards MUST have `rounded-2xl p-8 shadow-lg` minimum. Add `hover:shadow-2xl hover:-translate-y-1 transition-all duration-300` on every interactive card.
3. **Button polish**: Primary CTAs: `rounded-full px-8 py-3 text-lg font-semibold hover:scale-105 transition-all`. Secondary: `variant="outline"` with matching rounded corners.
4. **Spacing scale**: Hero padding `py-24 lg:py-32` minimum. Content sections `py-16 lg:py-24`. Never use `py-4` or `py-8` as the main section padding.
5. **Color depth**: Use at LEAST 3 different surface colors across the page (e.g. bg-background, bg-muted, bg-primary/5, a gradient, and bg-card).

### Section Design Standards
- **Hero**: MUST be immersive — full-viewport height (min-h-[70vh]), with EITHER a large background image/gradient overlay OR a bold color gradient. Plain white hero with small text = FAILURE.
- **Feature/Service cards**: MUST include icon OR image, heading, description (2-3 sentences), and a visual accent (border, shadow, gradient strip, or colored icon background).
- **Testimonials/Social proof**: MUST include name, role/company, quote text, and optionally a photo. Style with quote marks, italic text, or a card treatment.
- **CTA sections**: MUST use a contrasting background (e.g. primary color, dark gradient) with large white text and a prominent button.
- **Footer**: MUST be multi-column with logo, navigation links, contact info, and social icons. Never a single-line footer.

### Responsive Polish
- All grids: `grid-cols-1 md:grid-cols-2 lg:grid-cols-3` (or appropriate responsive breakpoints)
- Hero text: `text-3xl sm:text-4xl lg:text-6xl` responsive sizing
- Container max-width: `max-w-7xl mx-auto px-4 sm:px-6 lg:px-8`
- Images: Always use `next/image` with responsive sizing

## Text Overflow Prevention

- ALWAYS use `overflow-hidden` or `overflow-x-hidden` on card containers and fixed-width elements.
- Long text: use `truncate` (single line), `line-clamp-2`/`line-clamp-3` (multi-line), or `break-words` to prevent text from exceeding container boundaries.
- Badge and tag text: always `truncate` or `max-w-[...]` to prevent breaking layouts.
- Test your mental model: if a container has a fixed width, ensure no child text can overflow it.

## Charts

- Use Recharts. Wrap with shadcn `<ChartContainer>` and `<ChartTooltip>`.
- Always provide realistic mock data (10-12 data points, plausible values).
- Use semantic colors from the chart config, not hardcoded hex values.
