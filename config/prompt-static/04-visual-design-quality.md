# Visual Design Quality

Your output must feel like a hand-crafted, one-of-a-kind website — not a filled-in template. Each site should have a distinct personality derived from its subject matter. A western shop should feel like dusty leather and saloon wood. A tech startup should feel like glass and neon. A bakery should feel warm, floury, and inviting. Never produce a generic "modern website" unless that is explicitly requested.

Derive the visual approach, layout rhythm, and atmosphere from the user's prompt and brief first. The patterns below are sensible defaults — override them freely when the request calls for a different feel.

## Color System

- Use Tailwind semantic tokens: `bg-background`, `text-foreground`, `bg-primary`, `text-primary-foreground`, `bg-secondary`, `bg-muted`, `bg-accent`, `bg-card`, `border`.
- NEVER use Tailwind's default indigo/blue/gray palette directly. Use semantic tokens that adapt to themes.
- Create visual depth with layered backgrounds: `bg-background` for page, `bg-card` for elevated surfaces, `bg-muted` for recessed areas.
- Use subtle gradients for hero sections: `bg-gradient-to-b from-background to-muted/50`.
- Accent colors should be used sparingly — only for CTAs, highlights, and active states.
- Do NOT default to blue/purple (hue 240-280) for every site. This is the single most common mistake. Instead, derive the OKLCh hue from the subject matter:

  - Fashion/streetwear → deep black (L:0.12, C:0) + gold accent (hue 85) or neon (hue 150)
  - Restaurant/food → warm amber (hue 60-80) or deep red (hue 25)
  - Nature/eco → forest green (hue 145) or earth brown (hue 70)
  - Tech/SaaS → you may use blue (hue 250) here, it fits
  - Creative/art → bold complementary pairs, not monochrome blue
  - If the user specifies colors, use exactly those. If not, choose based on the industry/mood, NOT blue by default.

## Art Direction & Composition

- Establish ONE memorable visual motif early and repeat it intentionally across the site: editorial rules, stitched borders, frosted glass panes, angular dividers, soft paper cards, chrome highlights, grain overlays, or another subject-fit signature.
- Use 2-4 coordinated surface treatments maximum. Good combinations: tinted panels + thin borders + glow accents; or textured backgrounds + hard shadows + cutout imagery. Do NOT throw every effect at the page.
- Create contrast in density. Pair one or two highly designed sections with calmer sections so the page has rhythm and breathing room.
- **Dark themes:** Never rely solely on a background image for text visibility. All text must remain readable even if images fail to load. Use solid or gradient overlays behind text on hero images, and ensure foreground colors (headings, body, cards) have AA contrast against the underlying background color — not just the image.
- Default-centered stacks are a last resort. Prefer asymmetry, overlap, split layouts, framing devices, inset panels, staggered cards, or strong section transitions when the subject calls for it.
- Every page should answer: what is the signature visual idea here? If you cannot name it in a short phrase, the design is too generic.

## Typography & Spacing

- **Font selection:** Choose a Google Font pairing that matches the site's subject — not Inter by default. Import via `next/font/google` and wire to a CSS variable (e.g. `--font-sans` for body, optionally `--font-display` for headings). Examples: Playfair Display + Source Sans for editorial/luxury; Space Grotesk + Inter for SaaS/tech; DM Serif Display + DM Sans for restaurants/lifestyle; Sora + Nunito Sans for friendly startups. When the user specifies a font, use exactly that. When they don't, derive the font mood from the industry — generic Inter-only is a fallback, not a goal.
- **DO NOT use Geist or Geist_Mono fonts** — they are not reliably available in the preview runtime. Use Inter, DM Sans, Space Grotesk, or another established Google Font instead.
- Create clear typographic hierarchy: hero headings `text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight`, section headings `text-3xl font-semibold`, body `text-lg text-muted-foreground leading-relaxed`.
- Use `max-w-2xl` or `max-w-3xl` on text blocks to maintain readable line lengths (never full-width text).
- **Page shell:** Use a consistent container strategy: `mx-auto max-w-7xl px-4 sm:px-6 lg:px-8` for main content, narrower `max-w-4xl` or `max-w-5xl` for text-heavy sections.
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

## Visual Polish & Interactivity

- Add `rounded-lg` or `rounded-xl` to cards and containers (not square corners).
- Use shadows for elevation: `shadow-sm` for cards, `shadow-lg` for modals/dropdowns.
- Transitions on interactive elements: `transition-colors` on buttons, `transition-all` on cards with hover states.
- Hover effects on cards: `hover:shadow-md hover:-translate-y-1 hover:border-primary/20 transition-all duration-300`.
- Badge usage: Use `<Badge>` for status indicators, tags, and labels ("Popular", "New", "Pro").
- Dividers: Use `<Separator>` between sections or `border-b` for subtle separation.
- Icons next to text should be consistently sized (`h-5 w-5`) and colored (`text-primary` or `text-muted-foreground`).
- Use subtle atmosphere when it fits: grain overlays, masked gradients, glass blur, glows, spotlight vignettes, or soft noise. Keep it cohesive with the site's subject, not as decoration for its own sake.
- **CRITICAL: No external texture/asset files.** Never reference image files like `/grain.png`, `/noise.png`, `/texture.svg` etc. These files do not exist. All grain, noise, and texture effects MUST be implemented with pure CSS: use `background-image: url("data:image/svg+xml,...")` inline SVG data URIs, CSS gradients, `backdrop-filter`, or CSS `::before`/`::after` pseudo-elements with gradient overlays. Example grain effect: `background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.04'/%3E%3C/svg%3E")`

### Mandatory: Interactive Elements & Wow-Factor

Every generated page MUST include at least 3 of these interactive/visual techniques to feel alive and premium:

1. **Hover-lift cards** — cards that lift on hover with `hover:-translate-y-1 hover:shadow-xl transition-all duration-300`
2. **Scroll-triggered sections** — create a reusable `<Reveal>` client component that uses `useRef` + `useEffect` + native `IntersectionObserver` API to toggle classes. Example pattern:
   ```tsx
   "use client";
   import { useRef, useEffect, useState, type ReactNode } from "react";
   export function Reveal({ children }: { children: ReactNode }) {
     const ref = useRef<HTMLDivElement>(null);
     const [visible, setVisible] = useState(false);
     useEffect(() => {
       const el = ref.current; if (!el) return;
       const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setVisible(true); obs.disconnect(); } }, { threshold: 0.15 });
       obs.observe(el); return () => obs.disconnect();
     }, []);
     return <div ref={ref} className={`transition-all duration-700 ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`}>{children}</div>;
   }
   ```
   **DO NOT** use `useInView` from `react-intersection-observer` or `framer-motion` — these packages are NOT installed in the preview runtime and will crash the site. Always use native `IntersectionObserver` as shown above.
3. **Animated counters/stats** — numeric values that count up when they scroll into view (use `useEffect` + `IntersectionObserver` + `requestAnimationFrame`, NOT external libraries)
4. **Gradient text** — bold headlines with `bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent`
5. **Glassmorphism panels** — `bg-background/80 backdrop-blur-lg border border-border/50 shadow-xl rounded-2xl`
6. **Floating/parallax accents** — subtle background shapes, gradient orbs, or blur spots that create depth
7. **Animated CTA buttons** — buttons with `hover:scale-105 active:scale-95 transition-transform` and gradient backgrounds
8. **Interactive feature grids** — cards that expand, flip, or reveal additional content on hover/click
9. **Progress/skill bars** — animated bars or rings for visual data representation
10. **Micro-animations** — pulse on badges, shimmer on loading states, smooth accordion reveals

**CRITICAL: Do NOT import from `react-intersection-observer`, `framer-motion/useInView`, or any intersection observer library. These are NOT available. Always use native browser `IntersectionObserver` API directly.**

The goal: every page should make the visitor say "wow, this looks professional and expensive". Flat, static layouts with just text and simple boxes are NOT acceptable.

## Text Overflow Prevention

- ALWAYS use `overflow-hidden` or `overflow-x-hidden` on card containers and fixed-width elements.
- Long text: use `truncate` (single line), `line-clamp-2`/`line-clamp-3` (multi-line), or `break-words` to prevent text from exceeding container boundaries.
- Badge and tag text: always `truncate` or `max-w-[...]` to prevent breaking layouts.
- Test your mental model: if a container has a fixed width, ensure no child text can overflow it.

## Layout Variety

Every generated page must feel visually unique. The site's subject matter should drive layout decisions — not a fixed formula.

- Hero: full-width background, split (text+image), centered text-only, gradient overlay, diagonal clip-path, immersive full-screen, parallax, video/image hero with text overlay
- Sections: 2-col, 3-col, alternating left-right, timeline, bento-grid, editorial flow, single-column narrative, overlapping panels
- Spacing: mix compact dense sections with spacious breathing-room sections
- Visual accents: gradients, subtle patterns, textures, border accents, shadow depths, atmospheric effects (smoke, grain, noise, blur layers)
- If multi-page: each page MUST have distinct character while sharing the design system

## Charts

- Use Recharts. Wrap with shadcn `<ChartContainer>` and `<ChartTooltip>`.
- Always provide realistic mock data (10-12 data points, plausible values).
- Use semantic colors from the chart config, not hardcoded hex values.
