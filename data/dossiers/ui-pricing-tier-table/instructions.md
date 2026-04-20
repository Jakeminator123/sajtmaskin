# When to use

Use this component when the site needs a pricing section for SaaS, memberships, services, or packaged offers.

Best fit:
- 2-4 plans with short feature lists
- one recommended or most-popular tier
- simple CTA per plan such as `Get started`, `Contact sales`, or `Buy now`

Do not use it for:
- large feature matrices with many rows and columns
- dynamic billing logic tied directly to a payment provider SDK
- marketplaces or catalogs where plans are actually products with many variants

# How to integrate

Import the component and pass a `plans` array. The component is client-safe and expects each plan to include a CTA as a React node.

```tsx
import Link from "next/link";
import { PricingTierTable } from "@/components/pricing-tier-table";

export default function PricingSection() {
  return (
    <PricingTierTable
      title="Simple pricing"
      description="Choose the plan that matches your team size and support needs."
      plans={[
        {
          name: "Starter",
          price: "$0",
          interval: "/mo",
          description: "For trying the product",
          features: ["1 project", "Community support", "Basic analytics"],
          cta: (
            <Link
              href="/signup"
              className="inline-flex w-full items-center justify-center rounded-md bg-secondary px-4 py-2 text-sm font-medium"
            >
              Start free
            </Link>
          ),
        },
        {
          name: "Pro",
          price: "$29",
          interval: "/mo",
          description: "For growing teams",
          features: ["Unlimited projects", "Priority support", "Advanced analytics"],
          highlighted: true,
          cta: (
            <Link
              href="/signup?plan=pro"
              className="inline-flex w-full items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
            >
              Choose Pro
            </Link>
          ),
        },
        {
          name: "Enterprise",
          price: "Custom",
          description: "For security, scale, and procurement",
          features: ["SSO/SAML", "Custom SLA", "Dedicated success manager"],
          cta: (
            <Link
              href="/contact"
              className="inline-flex w-full items-center justify-center rounded-md border px-4 py-2 text-sm font-medium"
            >
              Contact sales
            </Link>
          ),
        },
      ]}
    />
  );
}
```

## Data contract

```ts
export interface PricingPlan {
  name: string;
  price: string;
  interval?: string;
  description?: string;
  features: string[];
  cta: ReactNode;
  highlighted?: boolean;
}
```

Integration notes:
- Keep `price` as a preformatted string so the caller controls currency and locale.
- Pass only one `highlighted` plan in most cases.
- Keep feature text short and parallel across plans.
- Use a CTA that matches the destination: signup, checkout, or contact.

If pricing comes from CMS or config, map it before rendering:

```tsx
const plans = pricingFromCms.map((plan) => ({
  name: plan.name,
  price: plan.priceLabel,
  interval: plan.intervalLabel,
  description: plan.summary,
  features: plan.features,
  highlighted: plan.recommended,
  cta: (
    <Link
      href={plan.href}
      className="inline-flex w-full items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
    >
      {plan.ctaLabel}
    </Link>
  ),
}));
```

# UX rules

- Prefer 2-4 plans; 3 is the easiest to scan.
- Highlight at most one plan.
- Keep each feature list roughly the same length to avoid visual imbalance.
- Use clear pricing labels like `$29`, `€19`, or `Custom`.
- If billing cadence matters, include `interval` such as `/mo` or `/seat/mo`.
- Ensure CTA labels are action-oriented and specific.
- Preserve full-width CTAs inside each card for consistent alignment.
- If one plan is for enterprise sales, use a non-transactional CTA such as `Contact sales` rather than implying self-serve checkout.

# Avoid

- Do not hardcode business copy that is specific to one template, locale, or brand.
- Do not embed payment-provider logic inside this component.
- Do not mix monthly and annual pricing in the same static table unless the page clearly explains the comparison.
- Do not overload feature lists with long paragraphs.
- Do not mark multiple plans as `highlighted` unless there is a deliberate design reason.

# Verification

Check the following after integration:

- The section renders correctly with 2, 3, and 4 plans.
- CTAs are keyboard accessible and have valid destinations.
- Only one plan is visually emphasized when `highlighted` is used.
- Long feature text wraps cleanly without breaking layout.
- On mobile, cards stack vertically and remain readable.
- The section title and description match the rest of the page voice.

Minimal smoke test:

```tsx
<PricingTierTable
  plans={[
    {
      name: "Basic",
      price: "$10",
      interval: "/mo",
      features: ["Feature A", "Feature B"],
      cta: <button className="rounded-md border px-4 py-2">Choose Basic</button>,
    },
    {
      name: "Pro",
      price: "$20",
      interval: "/mo",
      features: ["Feature A", "Feature B", "Feature C"],
      highlighted: true,
      cta: <button className="rounded-md bg-primary px-4 py-2 text-primary-foreground">Choose Pro</button>,
    },
  ]}
/>
```
