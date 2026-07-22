# When to use

Use this dossier when the brief declares the `logo-cloud` capability — the site needs social proof in the form of a row of customer, partner, or integration logos.

Best fit:

- A landing or SaaS page that wants a "Trusted by" / "As seen in" strip directly under the hero or above the pricing section.
- A B2B site listing well-known customers or integration partners.
- An agency or portfolio site showing client brands as a compact, scannable row.

Do not use it for:

- Quote-based social proof with named people (use the `testimonials-section` dossier instead).
- Auto-scrolling / animated logo bars (use the `marquee` dossier — this component is intentionally static).
- A single hero image or a full partner directory with descriptions.

# How to integrate

Import the component and pass an `items` array. Each item has a `name` (required) plus optional `src` (logo image URL) and `href` (link to the brand).

```tsx
import { LogoCloud } from "@/components/logo-cloud";

export default function Section() {
  return (
    <LogoCloud
      title="Trusted by teams everywhere"
      items={[
        { name: "Acme", src: "https://cdn.example.com/logos/acme.svg", href: "https://acme.com" },
        { name: "Rivertide", src: "https://cdn.example.com/logos/rivertide.svg" },
        { name: "Northwind" },
      ]}
    />
  );
}
```

- Mount it as a full-width section; wrap it in your scaffold's container for horizontal padding.
- The component is server-renderable (no `"use client"` needed) — the grayscale-to-color reveal is pure CSS.
- When `src` is omitted the `name` renders as a muted text wordmark, so the row never shows a broken image.

# UX rules

- Aim for 4–8 logos. Fewer than 4 looks thin; more than 8 turns into visual noise.
- Keep logos at a uniform optical height — the component normalizes to `h-8` (mobile) / `h-10` (desktop) with `object-contain` so aspect ratios are preserved.
- Default state is muted + grayscale; full color appears on hover and on keyboard focus. This keeps the strip calm and lets the page headline lead.
- Use a short eyebrow `title` (e.g. "Trusted by teams everywhere"), not a full heading.
- In dark mode, prefer logos with a light or monochrome variant; pure-black logos can disappear against a dark background.

# Avoid

- Do not auto-scroll, carousel, or animate the row — that is a different pattern (`marquee` dossier).
- Do not stretch or distort logos to a fixed width; rely on `object-contain` to preserve each logo's ratio.
- Do not fabricate brand logos the operator has no rights to use — leave a `// TODO: replace with a logo you have permission to display` comment instead.
- Do not link logos to external sites unless the brief asks for it; outbound links pull attention off the page.

# Verification

- Render with 6 items that have `src` — a single centered row that wraps cleanly on narrow viewports, all logos at the same height.
- Render with one item missing `src` — the text wordmark fallback shows up, no broken-image icon.
- Hover or tab to a logo — it lifts from grayscale/muted to full color, and linked logos show a visible focus ring.
- Toggle dark mode — wordmarks use `text-muted-foreground` and stay legible.
- Inspect: the section uses theme tokens (`text-muted-foreground`, `focus-visible:ring-ring`) so it follows the active scaffold's theme.
