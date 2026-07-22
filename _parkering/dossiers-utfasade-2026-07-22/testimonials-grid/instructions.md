# When to use

Use this dossier when the brief declares the `testimonials-section` capability — the site needs social proof in the form of customer or guest quotes.

Best fit:

- A landing page that needs trust-building above the pricing or contact section.
- A portfolio that wants short client endorsements between project cases.
- A hotel / restaurant / service site that wants guest reviews in a designed grid (different from raw star-rating widgets).

Do not use it for:

- Long case studies (use a dedicated case-study layout).
- Live review feeds from external services (Google Reviews, Trustpilot — those need their own integration dossier).
- Marquee-style auto-scrolling logo bars (different visual pattern; use a logo cloud component).

# How to integrate

Import the component and pass an `items` array with 3–6 testimonials. Each item has a `quote`, `author`, optional `role`, optional `company`, and optional `avatarUrl`.

```tsx
import { TestimonialsGrid } from "@/components/testimonials-grid";

export default function Section() {
  return (
    <TestimonialsGrid
      title="Loved by teams that ship"
      items={[
        {
          quote: "We replaced three tools with this and our standups got 20 minutes shorter.",
          author: "Anna Lindberg",
          role: "Head of Product",
          company: "Acme",
          avatarUrl: "https://images.unsplash.com/photo-...",
        },
        {
          quote: "Setup took ten minutes. We were sending invoices the same afternoon.",
          author: "Marcus Olsson",
          role: "Founder",
          company: "Rivertide",
        },
        {
          quote: "The support team has saved us twice already.",
          author: "Priya Patel",
          role: "Operations Lead",
        },
      ]}
    />
  );
}
```

The grid responds: 1 column on mobile, 2 columns on `md`, 3 columns on `lg` when there are ≥ 3 items.

# UX rules

- Use real names. Do not invent fake testimonials — leave a `// TODO: replace with real quote` comment if the operator must fill it in.
- Keep each quote under ~250 characters; longer quotes break the visual balance of the grid.
- If you have an avatar, prefer a real photo over a stylised illustration. If you have no avatar, fall back to initials in a coloured circle (the component handles this automatically).
- Aim for 3 testimonials by default. Three is the most scannable count on a single screen.
- Place this section after the value proposition and before the CTA, not before the headline.

# Avoid

- Do not auto-rotate or carousel the testimonials. Static grids convert better and are accessible by default.
- Do not link the avatar or author name to external profiles by default — that bleeds attention away from the page. Add links only if the brief explicitly asks for it (e.g. agency portfolio).
- Do not include star ratings unless the brief asks for them — generic 5-star icons feel manufactured.
- Do not put more than 6 testimonials in the grid; instead, swap to a different layout (vertical scrolling list, separate page).

# Verification

- Render with 3 items — three columns on desktop, one column on mobile.
- Render with 6 items — three columns × two rows; nothing wraps awkwardly.
- Render with one item missing `avatarUrl` — initials fallback shows up.
- Tab through the cards if any quote contains a link — focus order is left-to-right, top-to-bottom.
- Inspect: each card uses `bg-card`, `text-card-foreground`, and `border-border` so the section follows the active scaffold's theme.
