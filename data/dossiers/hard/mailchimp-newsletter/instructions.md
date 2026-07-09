# When to use

Use this dossier when the brief declares the `newsletter-subscribe` capability — the site needs an email-capture form wired to a real list. Triggers (Swedish + English): `newsletter`, `nyhetsbrev`, `prenumerera`, `subscribe`, `email signup`, `mailing list`, `epostlista`, `Mailchimp`, `Substack-style email capture`.

Best fit:

- A footer CTA on a marketing site ("Få våra tips i mejlen") that drops the address into a Mailchimp audience.
- A blog post end-card prompting the reader to subscribe before they leave.
- A coming-soon / waitlist landing where the entire hero is the signup form.

Do not use for:

- Transactional email (use the `resend-contact-form` dossier or a dedicated transactional dossier).
- A double-opt-in flow that needs a custom confirmation page (Mailchimp owns the confirmation email; if the brief asks for a custom one, reach for the `resend-contact-form` dossier and roll a small subscribe table yourself).
- SMS / push notifications.

# How to integrate

The dossier ships a client `<NewsletterForm />` and a server `route.ts` at `/api/newsletter-subscribe`. Drop them in unchanged unless explicitly overridden:

1. Copy `components/newsletter-form.tsx` to `components/newsletter-form.tsx`. Restyle freely — change copy, swap layout from inline to stacked, add a checkbox for marketing consent. Keep the four UX states (`idle` / `submitting` / `success` / `error`).
2. Copy `components/api/newsletter-subscribe/route.ts` to `app/api/newsletter-subscribe/route.ts`. Do NOT paraphrase — the SHA256-of-lowercased-email subscriber-id pattern and the PUT-vs-POST upsert flow are how Mailchimp distinguishes "new" from "already-subscribed".
3. Mount `<NewsletterForm />` wherever the CTA belongs:

```tsx
import { NewsletterForm } from "@/components/newsletter-form";

export function FooterCta() {
  return (
    <section className="border-t bg-muted/30 px-6 py-12">
      <div className="mx-auto max-w-xl text-center">
        <h2 className="text-2xl font-semibold">Få våra tips i mejlen</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Ett mejl varannan vecka. Säg upp när du vill.
        </p>
        <NewsletterForm
          className="mt-6"
          placeholder="din@epost.se"
          submitLabel="Prenumerera"
          successMessage="Tack! Kolla inkorgen för bekräftelsen."
        />
      </div>
    </section>
  );
}
```

See "Mock/demo mode" below for how the route behaves without a real key.

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

- Do not put `MAILCHIMP_API_KEY` in a `NEXT_PUBLIC_*` variable. The key grants full audience-management access — keep it server-side.
- Do not POST directly from the client to `https://us21.api.mailchimp.com/...` — CORS will block it AND you'd leak the key. Always go through the route handler.
- Do not invent a "GDPR consent" checkbox without copy. If the brief is EU-facing, ship a real consent line ("Genom att prenumerera godkänner du vår integritetspolicy") with a link to the privacy page.
- Do not rely on Mailchimp's hosted `<script>` embed (`mc-embedded-subscribe-form`). The embed loads jQuery, fights Next.js hydration, and has been the source of repeated reports of double-fire on mobile.
- Do not log the subscriber email server-side. The route's debug log redacts it for a reason.

# Verification

- Submit a fresh email — UI shows success, Mailchimp dashboard shows the subscriber under the configured audience within ~10 seconds.
- Submit the same email again — UI shows the already-subscribed message (not an error). Network tab: route returns `{ ok: true, status: "already" }`.
- Submit a malformed email (`abc`) — UI shows inline validation, no network request fires.
- Remove `MAILCHIMP_API_KEY` (or use a preview stub) and restart `next dev` — submitting shows success + the "Demo: … registrerades inte på riktigt" notice (mock: success). The page does not crash. With a real key but no `MAILCHIMP_AUDIENCE_ID`, submitting shows the "newsletter not configured" banner instead. F3 readiness reports a `feature-runtime` warning, not a blocker.
- Throttle to "Slow 3G" in DevTools and submit — spinner stays visible until the response arrives, no double-submit possible.
