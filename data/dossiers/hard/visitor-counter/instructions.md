# When to use

Use this dossier when the brief declares the `analytics` capability and the site owner wants to SEE how many people visit — "en räknare", "hur många besökare har jag", "besöksstatistik". It is the default for `analytics`: sites are hosted in Sajtmaskin's Vercel team, so dashboard-only tools (Vercel Analytics) never reach the owner, while this one ships its own `/statistik` page.

Best fit:

- A small-business site whose owner wants a simple answer to "kommer det någon?" — today, in total and per day.
- Any site where a cookieless, no-personal-data counter is preferred over a third-party tracker (no consent banner needed).

Do not use it for:

- Funnels, cohorts, session recordings, campaign attribution — that is a behavioural analytics product (PostHog etc.), not this dossier.
- Core Web Vitals / performance monitoring — pick the `vercel-analytics` sibling explicitly ("vercel analytics", "speed insights").
- Per-visitor tracking of any kind. The counter stores only per-day integers.

# How to integrate

1. Emit the dossier files to their project outputs (source → output):
   - `components/lib/visits/config.ts` → `lib/visits/config.ts`
   - `components/lib/visits/server.ts` → `lib/visits/server.ts`
   - `components/api/visits/route.ts` → `app/api/visits/route.ts`
   - `components/visit-beacon.tsx` → `components/visit-beacon.tsx`
   - `components/visitor-stats.tsx` → `components/visitor-stats.tsx`
   - `app/statistik/page.tsx` → `app/statistik/page.tsx`
2. Mount `<VisitBeacon />` ONCE in the root `app/layout.tsx`, inside `<body>`, as the last child. It renders nothing. Never mount it in individual pages — a second mount double-counts.
3. Keep `/statistik` as the standard page. You may adjust its heading copy and wrapper classes to match the site (the file is rewritable) but keep `<VisitorStats />`, the `robots: noindex` metadata and the relative import. Do not add the page to the main navigation unless the brief asks — it is the owner's page, reached by URL.
4. SEED FALLBACK CONTRACT (`mock: seed`): `recordVisit()` and `readVisitStats()` fall back to an in-memory demo store whenever `isVisitorCounterConfigured()` is false (missing keys OR preview placeholders). `/api/visits` then answers `200 { ok: true, demo: true, stats }` and `<VisitorStats />` shows the sample series with the demo notice. Nothing is persisted in demo mode.
5. Env keys: `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` (the Vercel Marketplace aliases `KV_REST_API_URL` / `KV_REST_API_TOKEN` are read as a fallback). Both are server-only.

# Mock/demo mode

`mock: seed`. No real store → `lib/visits/config.ts` seeds a plausible 14-day series (weekday/weekend rhythm) in memory; live page views still tick today's numbers within the running server instance, so the preview feels alive, but every payload carries `demo: true` and the page says "Demoläge – visar exempelsiffror". A real store → `INCR` per hit in Upstash Redis, `demo: false`, no notice.

# UX rules

- The `/statistik` page is calm and owner-facing: four number cards (idag/totalt × besökare/sidvisningar), one bar chart, one "Uppdatera" link. No login wall is shipped; if the brief needs privacy, combine with an `auth` dossier and wrap the page.
- Keep the demo notice subtle (small muted banner), never a red error. Loading shows skeleton cards; a failed read shows "Kunde inte hämta statistiken just nu" with "Försök igen" — never a raw status code.
- The beacon must stay invisible: no cookie banner, no UI, no console output.

# Avoid

- Do not paraphrase `lib/visits/config.ts`, `lib/visits/server.ts`, `app/api/visits/route.ts`, `components/visit-beacon.tsx` or `components/visitor-stats.tsx` — the env gate, day bucketing, bot filter and demo contract must stay byte-exact.
- Do not mount `<VisitBeacon />` more than once, and do not also add `@vercel/analytics` "for good measure" unless the brief explicitly asks for Vercel Analytics — mixed numbers confuse the owner.
- Do not store IPs, user agents, paths or any per-visitor data; the keys are per-day integers only.
- Do not import `@/lib/visits/server` in client components — read through `/api/visits`.
- Do not expose `UPSTASH_REDIS_REST_TOKEN` (or `KV_REST_API_TOKEN`) to the browser.

# Verification

- Build the site WITHOUT the env keys: `/statistik` renders four cards + chart with the demo notice; `POST /api/visits` answers 200 and the "Sidvisningar idag" number increases on refresh (same server instance).
- Set real Upstash keys: `POST /api/visits` runs `INCR` (check the key `visits:views:total` in the Upstash console), `GET /api/visits` answers `demo: false`, the notice disappears.
- Open `/statistik` itself several times: it must NOT increase the counters (excluded path).
- Request `POST /api/visits` with a bot user-agent (e.g. `Googlebot`): answers `{ ok: true, counted: false }` and nothing is incremented.
