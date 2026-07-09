# When to use

Use this dossier when the brief declares the `contact-form` capability — the site needs a working contact form that delivers messages somewhere (email inbox in this case).

Best fit:

- A "Contact us" page on a marketing site.
- A footer-form on a portfolio.
- A simple support-request form for a small SaaS.

Do not use it for:

- Booking or scheduling forms (different shape — date/time fields, calendar integration). Pair with a calendar dossier instead.
- Lead-capture forms that should sync to a CRM (HubSpot, Pipedrive). Use a CRM-targeted dossier when one exists.
- Heavy multi-step forms (use a wizard pattern + Zod validation instead — this dossier is single-step).

# How to integrate

1. Mount `<ContactForm />` on the contact route (typically `app/contact/page.tsx` or `app/(marketing)/contact/page.tsx`).
2. Wrap it in a section with sensible padding and a heading; the component itself does not own the surrounding layout.
3. Pass an optional `subjectPrefix` prop if you want server-side categorisation (e.g. `subjectPrefix="Hotel inquiry"` so the inbox sees `Hotel inquiry: <user subject>`).
4. The form POSTs to `/api/contact`, which validates the body, calls Resend, and returns `{ ok: true }` on success or `{ ok: false, error }` on failure.

There are two degradation paths (see "Mock/demo mode" below): no real key → a demo success; a real key with missing addresses → the calm `IntegrationConfigNotice`. All three files (`contact-form.tsx`, `integration-config-notice.tsx`, the route) are **verbatim** so both contracts are emitted deterministically; adapt visuals by wrapping `ContactForm` (props: `subjectPrefix`, `className`) in your own component.

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

- Do not call the Resend SDK directly from the client — the API key would leak.
- Do not paraphrase `components/api/contact/route.ts`. The Resend SDK init pattern, body validation order, and the demo-success / `email-not-configured` guard must stay byte-exact.
- Do not surface a raw error string or the HTTP status code to the visitor — on `email-not-configured` render the `IntegrationConfigNotice` and disable the submit button instead.
- Do not store form submissions in a database without telling the user (privacy). Email-only delivery is the default contract.
- Do not auto-fill the message with marketing copy. Always start empty.
- Do not hide the contact email entirely when the form is unconfigured — give the user a fallback way to reach you.

# Verification

- Submit the form with valid data — the configured inbox receives an email within a few seconds.
- Submit with an invalid email — the form shows an inline error, no API call is made.
- Submit with `RESEND_API_KEY` empty or a preview stub — the route returns `200 { ok: true, demo: true }` and the form shows the thank-you + "Demo: … skickades inte på riktigt" notice (mock: success).
- Submit with a real `RESEND_API_KEY` but no `EMAIL_FROM` / `CONTACT_EMAIL_TO` — the route returns 503 `email-not-configured`, the form renders the `IntegrationConfigNotice` and disables submit, and no raw error/status code is shown.
- Server logs show `[POST] /api/contact 200` on success/demo or `[POST] /api/contact 503` on genuine config error.
- Reload the page — the form returns to its empty state cleanly.
