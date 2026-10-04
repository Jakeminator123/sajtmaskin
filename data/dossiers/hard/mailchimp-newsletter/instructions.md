# When to use

Use for real email capture into a Mailchimp audience.

# How to integrate

Restyle the form; keep the server route's lowercase-email MD5 upsert contract.

# Mock/demo mode

`mock: success`. Two states:

- **No real `MAILCHIMP_API_KEY`** (missing OR a preview stub containing `placeholder` / `not_real`): the route returns `200 { ok: true, demo: true, status: "subscribed" }` WITHOUT calling Mailchimp. `NewsletterForm` shows the normal success plus a discreet "Demo: prenumerationen registrerades inte på riktigt" notice, so the capture flow works in an F2/preview without real credentials.
- **Real key but missing `MAILCHIMP_AUDIENCE_ID`**: a genuine configuration error → `503 { ok: false, error: "newsletter-not-configured" }`; the form renders the non-blocking "Newsletter is not configured yet" banner. F3 reports this as a warning, not a build blocker.

Real signup runs only once a genuine key + audience id are set. Keep both branches when you adapt the route.

# UX rules

- Use a single `<input type="email">` plus a submit button. Resist asking for a name on the first capture; you can enrich later via Mailchimp tags.
- Show inline validation only after the first blur, never on every keystroke (Mailchimp's 422 messages are confusing if the user sees them mid-typing).
- Disable the submit button + show a spinner during the request. Re-enable on response.
- Treat `already-subscribed` as success, not error. Phrase: "Du är redan med — tack!".
- Persist the success state for ≥ 5 seconds before allowing a second submit; rapid resubmits look spammy and Mailchimp rate-limits aggressively.
- When the form lives above the fold, mark it `aria-live="polite"` so screen readers announce success without stealing focus.

# Avoid

Never expose the API key or bypass the server route from the browser.

# Verification

- Submit a fresh email — UI shows success, Mailchimp dashboard shows the subscriber under the configured audience within ~10 seconds.
- Submit the same email again — UI shows the already-subscribed message (not an error). Network tab: route returns `{ ok: true, status: "already" }`.
- Submit a malformed email (`abc`) — UI shows inline validation, no network request fires.
- Remove `MAILCHIMP_API_KEY` (or use a preview stub) and restart `next dev` — submitting shows success + the "Demo: … registrerades inte på riktigt" notice (mock: success). The page does not crash. With a real key but no `MAILCHIMP_AUDIENCE_ID`, submitting shows the "newsletter not configured" banner instead. F3 readiness reports a `feature-runtime` warning, not a blocker.
- Throttle to "Slow 3G" in DevTools and submit — spinner stays visible until the response arrives, no double-submit possible.
