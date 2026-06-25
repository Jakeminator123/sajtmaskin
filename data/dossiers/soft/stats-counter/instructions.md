# When to use

Use this dossier when the brief declares the `stats-counter` capability — the site wants to highlight a few headline numbers (customers, uptime, revenue, projects shipped) in an animated metrics band.

Best fit:

- A SaaS or landing page proving traction ("10,000+ users", "99.9% uptime").
- An agency or portfolio summarizing impact ("250+ projects", "18 awards").
- An about/company page with a compact "by the numbers" strip.

Do not use it for:

- Live dashboards or real-time data (this animates static, brief-provided numbers, not a data feed).
- Long tables of figures (use a data table).
- A single number — one stat looks unbalanced; aim for 3–4.

# How to integrate

Import the component and pass an `items` array. Each item has a numeric `value`, a `label`, and optional `prefix` / `suffix`.

```tsx
import { StatsCounter } from "@/components/stats-counter";

export default function Section() {
  return (
    <StatsCounter
      title="By the numbers"
      items={[
        { value: 10000, suffix: "+", label: "Active users" },
        { value: 99.9, suffix: "%", label: "Uptime" },
        { value: 250, suffix: "+", label: "Projects shipped" },
        { value: 18, label: "Team members" },
      ]}
    />
  );
}
```

- The count-up starts when the band scrolls into view (IntersectionObserver), so place it where the user will scroll to it.
- Pass real numbers from the brief; never invent traction metrics — leave a `// TODO: confirm real figure` comment if unsure.

# UX rules

- Aim for 3–4 stats. They lay out in a responsive row that wraps cleanly.
- Keep labels to 1–3 words; long labels break the visual rhythm.
- Use `prefix`/`suffix` for units ("$", "%", "+"), not for the whole number.
- The component already respects `prefers-reduced-motion` — users who opt out see the final value immediately. Do not add a competing animation.
- Use `tabular-nums` (built in) so the digits do not shift width while animating.

# Avoid

- Do not animate on every render or loop the count — it runs once when first seen.
- Do not use decimals with many places; one decimal (99.9) is the practical limit for readability.
- Do not fabricate impressive-sounding numbers; inaccurate stats erode trust and may be misleading.
- Do not place more than ~5 stats in one band; split into sections instead.

# Verification

- Scroll the section into view — each number animates from 0 to its target once, then stops.
- Enable "reduce motion" in the OS — numbers appear at their final value with no animation.
- Render a value with a `suffix` ("%") and one with a `prefix` ("$") — both render adjacent to the number without a space gap issue.
- Resize to mobile — stats wrap to fewer columns and stay centered.
- Inspect: numbers use `text-foreground` and labels use `text-muted-foreground` so the band follows the active theme.
