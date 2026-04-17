# When to use

- The user mentions checkout, payments, billing, subscriptions, or "köp via kort"
- The user has chosen Stripe explicitly OR no payment provider has been chosen yet (Stripe is the safe default)
- The user does NOT need a custom card form embedded in their site (use Stripe Elements dossier for that)

# How to integrate

1. Install dependencies in `package.json`:
   ```
   npm install stripe @stripe/stripe-js
   ```

2. Copy `components/checkout-button.tsx` into the user's `components/` directory.

3. Copy `components/api/checkout-session/route.ts` into the user's `app/api/checkout-session/route.ts`.

4. Add `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, and `NEXT_PUBLIC_SITE_URL` to `.env.local` (use Stripe test-mode keys during preview).

5. Mount `<CheckoutButton priceId="price_..." label="Köp" />` wherever the user wants the buy CTA. Replace `price_...` with the actual Stripe Price ID.

6. Set up `/success` and `/cancel` route pages — minimal placeholder pages are fine ("Tack!" / "Avbruten").

# UX rules

- The button must show loading state while the session is being created (disable + spinner)
- On API error: show toast or inline error, do NOT silently fail
- The success page should confirm the purchase and offer a "Tillbaka till startsidan" link
- For subscriptions: explain billing cycle and cancellation policy nearby the button

# Avoid

- Do NOT build a custom card form unless explicitly asked — Stripe Checkout (hosted) is safer and PCI-compliant
- Do NOT hardcode the price amount in the button — always reference a Stripe Price ID
- Do NOT call `/api/checkout-session` from the client without `await fetch` error handling
- Do NOT skip the publishable-key env var — Stripe.js refuses to load without it

# Verification

- Click the button in preview → user is redirected to `checkout.stripe.com`
- Test card 4242 4242 4242 4242 (any future date, any CVC) completes the flow
- After completion → user lands on `/success` route with session ID in URL
- Cancellation from Stripe page → user lands on `/cancel` route
