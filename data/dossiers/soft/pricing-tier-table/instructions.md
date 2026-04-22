# When to use

Use this dossier when the brief declares the `pricing-section` capability — the site needs a comparison of plans, packages, or service tiers.

Best fit:

- 2-4 plans with short feature lists.
- One recommended/highlighted tier.
- A simple CTA per plan (`Get started`, `Choose Pro`, `Contact sales`).

Do not use it for:

- Large feature matrices with many rows and columns (use a comparison table instead).
- Dynamic billing logic tied directly to a payment provider SDK (the CTA is a plain `ReactNode` — wire your payment dossier into it).
- Marketplaces or catalogs where plans are actually products with variants.

# How to integrate

Import the component and pass a `plans` array. Each plan accepts a CTA as a React node, so you can pair it with `CheckoutButton` from the `stripe-checkout` dossier or any other action.

```tsx
import Link from "next/link";
import { PricingTierTable } from "@/components/pricing-tier-table";

export default function PricingSection() {
  return (
    <PricingTierTable
      title="Simple pricing"
      description="Choose the plan that matches your team."
      plans={[
        {
          name: "Starter",
          price: "$0",
          interval: "/mo",
          features: ["1 project", "Community support"],
          cta: <Link href="/signup" className="...">Start free</Link>,
        },
        {
          name: "Pro",
          price: "$29",
          interval: "/mo",
          features: ["Unlimited projects", "Priority support"],
          highlighted: true,
          cta: <Link href="/signup?plan=pro" className="...">Choose Pro</Link>,
        },
        {
          name: "Enterprise",
          price: "Custom",
          features: ["SSO/SAML", "Custom SLA"],
          cta: <Link href="/contact" className="...">Contact sales</Link>,
        },
      ]}
    />
  );
}
```

# UX rules

- Prefer 3 plans; 3 is easiest to scan.
- Highlight at most one plan.
- Keep each feature list roughly the same length to avoid visual imbalance.
- Use clear pricing labels (`$29`, `€19`, `Custom`).
- If billing cadence matters, include `interval` (`/mo`, `/seat/mo`).
- Action-oriented CTA labels: `Choose Pro`, `Buy now`, `Contact sales`.

# Avoid

- Do not hardcode brand-specific copy in the component.
- Do not embed payment SDK logic inside this component — pass a CTA node instead.
- Do not mix monthly/annual pricing in the same static table without a clear toggle.
- Do not mark multiple plans as `highlighted` unless there is a deliberate design reason.

# Verification

- Section renders with 2, 3, and 4 plans.
- CTAs are keyboard accessible and have valid destinations.
- On mobile, cards stack vertically and remain readable.
