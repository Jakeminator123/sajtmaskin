# When to use

Use this dossier when the brief declares the `feature-grid` capability — the site needs to present several product features or service offerings as a scannable card grid.

Best fit:

- A landing or SaaS page listing 3–9 core features under the hero.
- A service business showing "what we do" as distinct offerings.
- A product page breaking capabilities into titled, described cards.

Do not use it for:

- Pricing tiers (use the `pricing-section` dossier).
- Customer quotes (use `testimonials-section`).
- A single highlighted feature (use a hero or a split feature block instead).

# How to integrate

Import the component and pass an `items` array. Each item has a `title`, a `description`, and an optional `icon` (any ReactNode — a Lucide icon, an emoji, or an inline SVG).

```tsx
import { FeatureGrid } from "@/components/feature-grid";
import { Zap, ShieldCheck, BarChart3 } from "lucide-react";

export default function Section() {
  return (
    <FeatureGrid
      title="Everything you need to ship"
      description="Built for teams that move fast without breaking things."
      items={[
        { icon: <Zap className="h-5 w-5" />, title: "Fast by default", description: "Edge-rendered pages load in under a second." },
        { icon: <ShieldCheck className="h-5 w-5" />, title: "Secure", description: "SOC 2 compliant with SSO and audit logs." },
        { icon: <BarChart3 className="h-5 w-5" />, title: "Insightful", description: "Real-time analytics on every interaction." },
      ]}
    />
  );
}
```

- The `icon` slot is optional; cards render cleanly without it.
- The grid is responsive: 1 column on mobile, 2 on `sm`, 3 on `lg`.

# UX rules

- Aim for 3, 6, or 9 features so the grid stays balanced (multiples of the column count).
- Keep titles to 2–4 words and descriptions to one or two sentences.
- If you use icons, use them on every card for consistency — do not mix carded-icon and no-icon items.
- Lead each description with the user benefit, not the technical mechanism.

# Avoid

- Do not pad the grid with weak filler features to reach a round number; quality over count.
- Do not put long paragraphs in a card — link to a detail page instead.
- Do not use decorative icons that fight the text for attention; keep them small and monochrome (`text-primary`).
- Do not nest interactive controls (forms, dropdowns) inside a feature card.

# Verification

- Render 3 items — single row on desktop, stacked on mobile.
- Render 6 items — two balanced rows of three on desktop.
- Render an item without an `icon` — the card still aligns with iconed cards.
- Inspect: cards use `bg-card`, `text-card-foreground`, and `border-border`, and icons use `text-primary`, so the section follows the active theme.
