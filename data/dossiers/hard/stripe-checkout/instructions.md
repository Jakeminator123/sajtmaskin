# When to use

Use for a one-time payment through hosted Stripe Checkout.

# How to integrate

Mount `<CheckoutButton />` with the owner's real one-time Price and a `Buy now` label.

# UX rules

- Show the exact one-time amount and currency next to the button.
- Use action-oriented labels such as `Buy now` or `Choose`; never use a recurring CTA or interval.
- Show a loading spinner while the API call is in flight.
- After successful payment, the success page should confirm what the user got and what happens next (email receipt, account access, etc.).

# Avoid

Never invent price IDs, collect card details, or present this as a subscription.

# Verification

- Click the button — browser navigates to `https://checkout.stripe.com/...`.
- In Stripe test mode, use card `4242 4242 4242 4242`, any future date, any CVC.
- Server logs show `[POST] /api/checkout-session 200`.
- After payment, the user lands on the success page.
- With `STRIPE_SECRET_KEY` empty — the route returns 503 `payments-not-configured`, clicking the (still enabled) pay button opens the demo modal with the `IntegrationConfigNotice`, Escape/outside-click closes it, and no raw error/status code is shown to the visitor.
