# When to use

Use this dossier when the brief declares the `cta-section` capability — the page needs a clear, conversion-focused call-to-action band (sign up, book a demo, get started, contact us).

Best fit:

- The closing section of a landing or SaaS page, just before the footer.
- A mid-page nudge after the value proposition or pricing.
- A service site driving toward a single primary action (book / call / quote).

Do not use it for:

- Navigation menus or in-content links.
- A full contact form (use the `contact-form` dossier; this is just the buttons).
- Multiple competing actions — one primary action, at most one secondary.

# How to integrate

Import the component and pass a `title`, optional `description`, a `primary` action, and an optional `secondary` action. Each action is `{ label, href }`.

```tsx
import { CtaSection } from "@/components/cta-section";

export default function Section() {
  return (
    <CtaSection
      title="Ready to get started?"
      description="Create your first site in minutes. No credit card required."
      primary={{ label: "Start free", href: "/signup" }}
      secondary={{ label: "Talk to sales", href: "/contact" }}
    />
  );
}
```

- `href` can be an internal route or an external URL.
- The primary button uses the theme's `primary` color; the secondary is an outline button.

# UX rules

- Keep the heading short and benefit-driven ("Ready to get started?", not "Sign up for our service").
- Limit to one primary action. A secondary action is optional and should be lower-commitment (e.g. "Talk to sales", "Learn more").
- The supporting line should remove friction ("No credit card required", "Cancel anytime"), not add detail.
- Center the band and give it generous vertical padding so it reads as a deliberate stop.

# Avoid

- Do not stack three or more buttons — it dilutes the call to action.
- Do not make the secondary button visually compete with the primary (keep it outline/ghost).
- Do not bury the real action behind vague copy like "Click here".
- Do not repeat the same CTA band multiple times on one page.

# Verification

- Render with only a `primary` action — the band is balanced with a single centered button.
- Render with `primary` + `secondary` — buttons sit side by side on desktop and stack on mobile.
- Tab to each button — focus rings are visible and order is primary then secondary.
- Inspect: the primary button uses `bg-primary`/`text-primary-foreground` and the secondary uses `border-border`, so it follows the active theme.
