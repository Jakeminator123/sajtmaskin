# When to use

Use for owner-visible, cookieless visit counts.

# How to integrate

Mount `<VisitBeacon />` once and keep `/statistik` plus the API and server core.

# Mock/demo mode

`mock: seed`. No real store → `lib/visits/config.ts` seeds a plausible 14-day series (weekday/weekend rhythm) in memory; live page views still tick today's numbers within the running server instance, so the preview feels alive, but every payload carries `demo: true` and the page says "Demoläge – visar exempelsiffror". A real store → `INCR` per hit in Upstash Redis, `demo: false`, no notice.

# UX rules

- The `/statistik` page is calm and owner-facing: four number cards (idag/totalt × besökare/sidvisningar), one bar chart, one "Uppdatera" link. No login wall is shipped; if the brief needs privacy, combine with an `auth` dossier and wrap the page.
- Keep the demo notice subtle (small muted banner), never a red error. Loading shows skeleton cards; a failed read shows "Kunde inte hämta statistiken just nu" with "Försök igen" — never a raw status code.
- The beacon must stay invisible: no cookie banner, no UI, no console output.

# Avoid

Never store personal data, double-mount the beacon, or mix counters silently.

# Verification

- Build the site WITHOUT the env keys: `/statistik` renders four cards + chart with the demo notice; `POST /api/visits` answers 200 and the "Sidvisningar idag" number increases on refresh (same server instance).
- Set real Upstash keys: `POST /api/visits` runs `INCR` (check the key `visits:views:total` in the Upstash console), `GET /api/visits` answers `demo: false`, the notice disappears.
- Open `/statistik` itself several times: it must NOT increase the counters (excluded path).
- Request `POST /api/visits` with a bot user-agent (e.g. `Googlebot`): answers `{ ok: true, counted: false }` and nothing is incremented.
