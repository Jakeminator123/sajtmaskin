# When to use

- The user mentions pricing, plans, tiers, subscription levels, or "olika paket"
- The site needs to communicate value-based pricing (Free / Pro / Enterprise pattern)
- The user has chosen Stripe / Paddle / similar — pair with a payments dossier for full flow

# How to integrate

1. Install dependencies (likely already present from scaffold):
   ```
   npm install lucide-react
   ```

2. Copy `components/pricing-tier-table.tsx` into the user's `components/` directory.

3. In a page or section, import and render with custom plans:
   ```tsx
   import { PricingTierTable } from "@/components/pricing-tier-table";

   <PricingTierTable
     plans={[
       { name: "Starter", price: "0 kr", interval: "/månad", features: [...], cta: "Kom igång" },
       { name: "Pro", price: "199 kr", interval: "/månad", features: [...], cta: "Välj Pro", highlighted: true },
       { name: "Enterprise", price: "Kontakta oss", interval: "", features: [...], cta: "Boka demo" },
     ]}
   />
   ```

4. Wrap each CTA button in a real action — typically a payment dossier component (e.g. `<CheckoutButton priceId="..." />`) or a contact form route.

# UX rules

- The recommended tier (`highlighted: true`) gets a colored ring or badge — only ONE plan should be highlighted
- Feature lists should be parallel — every plan answers the same questions
- Mobile layout stacks vertically with the highlighted plan first
- Always show currency and billing cycle near the price (no ambiguous "199")

# Avoid

- Do NOT mix billing cycles within the same table without a toggle (monthly/yearly) — it confuses comparison
- Do NOT use red/warning color for any plan — pricing should feel positive
- Do NOT cram more than 5 features per plan — readability dies
- Do NOT silently skip the CTA wiring — if no payment dossier is configured, link to a contact form instead

# Verification

- Three columns visible side-by-side on desktop (≥1024px)
- Plans stack vertically on mobile, highlighted plan first
- Each CTA is clickable and points somewhere (not `href="#"`)
- Feature checklist items align horizontally across all plans
