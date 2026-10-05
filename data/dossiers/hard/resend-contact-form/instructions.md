# When to use

Use for a real contact form delivered through Resend.

# How to integrate

Restyle the view, copy, and styles; keep `name`, `email`, and `message` in the server payload.

# Mock/demo mode

`mock: success`. The route distinguishes two states:

- **No real key** (`RESEND_API_KEY` missing OR a preview stub like `re_placeholder_preview_not_a_real_key` — the guard requires the `re_` prefix and rejects placeholder/not_real values): the route returns `200 { ok: true, demo: true }` WITHOUT sending. `ContactForm` shows the normal thank-you plus a discreet "Demo: meddelandet skickades inte på riktigt" notice, so the form flow works in an F2/preview without real credentials.
- **Real key but missing `EMAIL_FROM` / `CONTACT_EMAIL_TO`**: a genuine configuration error → `503 { ok: false, error: "email-not-configured" }`. The form gates on that explicit error code (not the HTTP status alone, so a platform/proxy 503 still takes the retryable error path) and renders the shared `IntegrationConfigNotice` with the required env-key names + a Resend setup link.

Real delivery happens only once a genuine `re_...` key and both addresses are set. Keep both branches when you adapt the route.

# UX rules

- Always include `name`, `email`, and `message` fields. `subject` is optional but improves inbox triage.
- Validate email format on the client *and* the server. The server is the source of truth.
- Show a loading spinner or `Submitting…` label while the request is in flight.
- After success, replace the form with a thank-you confirmation that includes the submitted email so the user knows where the reply will go.
- After failure, keep the form contents intact and show a non-destructive error message — never throw away what the user typed.
- Honour `prefers-reduced-motion` for any transitions.

# Avoid

Never expose `RESEND_API_KEY` or rewrite the server route and email contract.

# Verification

- Submit the form with valid data — the configured inbox receives an email within a few seconds.
- Submit with an invalid email — the form shows an inline error, no API call is made.
- Submit with `RESEND_API_KEY` empty or a preview stub — the route returns `200 { ok: true, demo: true }` and the form shows the thank-you + "Demo: … skickades inte på riktigt" notice (mock: success).
- Submit with a real `RESEND_API_KEY` but no `EMAIL_FROM` / `CONTACT_EMAIL_TO` — the route returns 503 `email-not-configured`, the form renders the `IntegrationConfigNotice` and disables submit, and no raw error/status code is shown.
- Server logs show `[POST] /api/contact 200` on success/demo or `[POST] /api/contact 503` on genuine config error.
- Reload the page — the form returns to its empty state cleanly.
