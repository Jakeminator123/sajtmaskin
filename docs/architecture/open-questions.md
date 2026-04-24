# Open questions — assumptions we haven't fully verified

Levande dokument för **antaganden** vi gör i koden eller pratet om systemet, men som vi **inte säkert vet stämmer**. Inte buggar — frågetecken som behöver svar innan de blir antingen "verified" eller "fixed".

**Princip:** Säg inte bara "det buggar". Förstå **varför**. Om vi inte vet — det hör hemma här.

> Skapad: 2026-04-23 efter master-post-cleanup wave 1–4 + DB-pool-fyndet.

---

## Statusguide

| Symbol | Betydelse |
|---|---|
| ❓ | Vi vet inte om antagandet håller |
| 🟡 | Delvis verifierat, en bit kvar |
| ✅ | Verifierat — flytta till relevant arkitekturdoc och ta bort härifrån |
| ❌ | Antagandet visade sig falskt — fix landad eller plan finns |

---

## Aktiva frågor

### 1. ❓ Redis cache — vet vi ens om den körs?

**Antagande:** `useRedisCache` styr brief-cache + rate-limit + preview-session-store. Vi har använt det som om det vore aktivt.

**Vad vi vet:**
- `src/lib/data/redis.ts` är client-wrapper (sannolikt ioredis eller upstash REST).
- Brief-cache (`src/lib/api/ai/brief-cache.ts`) cacher 24h.
- Rate-limit (`src/lib/rateLimit.ts`) använder Redis när tillgänglig.
- Preview-session-store (`src/lib/gen/preview/session-store.ts`) lagrar sessions.

**Vad vi inte vet:**
- Är `REDIS_URL` / `UPSTASH_REDIS_REST_URL` satt i `.env.local`?
- Faller systemet tyst tillbaka till in-memory om Redis saknas, eller failas hela features?
- I dev — använder vi någonsin Redis, eller är allt no-op?
- Andra-agentens fynd: "FEATURES.useRedisCache = false → cachen no-op:ar tyst" — antyder att Redis är OFF i dev.

**Hur verifiera:**
1. `Get-Content .env.local | Select-String "REDIS"` — finns nyckel?
2. Lägg till en log-rad i Redis-init: "Redis enabled" / "Redis disabled (in-memory fallback)"
3. Prometheus-metrics: lägg till counter `sajtmaskin_redis_op_total{result="hit|miss|fallback"}`

**Konsekvens om det faktiskt är off i dev:**
- Brief-cache no-op:ar → varje smoke-run-retry-prompt går till LLM på nytt (kostnadsfråga, inte korrekthet)
- Rate-limit kan vara global no-op (alla users delar)
- Preview-session-store sparar i process-memory → förlorad efter HMR / dev-restart

**Plan-koppling:** Plan 10 (latency budgets) och Plan 11 (unified repair) bör adressera detta — verifiera om Redis faktiskt sparar tid.

---

### 2. ❓ Preview-host VM — Blitz-container i browsern?

**Antagande:** "Vi har en Blitz-container där VM:en körs i användarens browser."

**Vad vi vet:**
- Live-preview-URL:er pekar mot `vm-fly-jakem.fly.dev/<chatId>` (sett i smoke-runs).
- Det är en **fly.io-VM**, inte en browser-side container (WebContainers / StackBlitz / Bolt-style).
- `src/lib/gen/preview/preview-host-client.ts` pratar HTTP/WS med VM:en.

**Vad vi inte vet:**
- Var kom "Blitz"-tanken ifrån? Är det en gammal idé som aldrig implementerades?
- Om vi vill ha browser-side execution (WebContainers/Bolt-stil) — har vi det som långsiktigt mål? I så fall är fly.io-VM:n en mellanlösning.
- Hur många concurrent VMs klarar fly.io-uppsättningen? När maxar vi den?
- Pool-management i fly.io-laget (separat från Postgres-poolen).

**Hur verifiera:**
1. Läs `src/lib/gen/preview/preview-host-client.ts` + fly.io-config (om i repot)
2. Kolla `docs/architecture/preview-white-screen-runbook.md` — har den ett VM-pool-avsnitt?
3. Be ops/devops-agent skissa nuvarande arkitektur

**Plan-koppling:** Inte i wave 1–9-scope. Långsiktig produktstrategifråga.

---

### 3. ❌ HMR-läcka i pg.Pool (RESOLVED 2026-04-23)

**Antagande:** "Dev-servern är stabil under långa sessioner."

**Verifierat falskt.** Andra agenten diagnostiserade: `new Pool(...)` på modul-load i `src/lib/db/client.ts` re-evaluerades varje Fast Refresh → 5–10 HMR-cykler senare smällde Supabase pgbouncer (free tier ~15 sessions) med `EMAXCONNSESSION` → 500 från `/api/engine/chats/[chatId]` → klient tolkade som 404 → "Försök reparera sidan" / "Chat not found".

**Fix landad:** commit `9f6e36475` — globalThis-cache (Prisma-pattern) i `db/client.ts`.

**Föregående fix för prod-vägen:** commit `3a4decf0` (2026-04-20). Dev-vägen var oguardad innan idag.

**Kvar:** Plan 11/12-kandidat — diskriminera 503 (transient) vs 404 (chat finns inte) i `/api/engine/chats/[chatId]`-routes så klienten inte fall-tillbaka till "ny chatt"-state vid pool-blowout.

---

### 4. 🟡 Observatorie-routing-läckage (orchestration-styledirection-bucket)

**Antagande:** Per-run-mappen i `logs/generationslogg/` innehåller all data om en specifik körning.

**Verifierat delvis falskt.** Run A (chat `1fa58609`, 2026-04-23 ~00:31) och flera tidigare runs har hela sin trace i `_unrouted/orchestration-styledirection/`-bucket istället för per-run-mapp. 846 KB av events utan runId-association.

**Konsekvens:** Per-run-summarier är **ofullständiga**. Latens-statistik är opålitlig. Plan 02:s modal-truth kan ha rätt men vi kan inte verifiera det åt enskilda runs eftersom datan saknas.

**Plan-koppling:** STATUS-10-CANDIDATES.md har detta som Tier B medel-impact, men efter Run A-buggen där en **bruten generation** skedde utan trace bör det uppgraderas till **Tier A high-impact** för plan 10.

---

### 5. ❓ Scaffolds — saknar de ett enhetligt minimi-fil-kontrakt?

**Antagande:** Varje scaffold levererar samma minsta uppsättning filer (`app/page.tsx`, `app/layout.tsx`, `app/globals.css`, etc.).

**Verifierat delvis falskt.** Användaren noterade att struktur/layout skiljer sig mellan scaffolds när hen tittade i `src/lib/gen/scaffolds/{landing-page,base-nextjs,...}/files/`.

**Specifik skada:** Run A (kaffe-init) genererade en sajt UTAN `app/page.tsx`. Layouten renderade bara header + footer + tomt `<main>`-skal. Sajten "promotades" som grön men var helt tom. Cross-file-import-checker fångade inte detta för `page.tsx` är auto-discovered av Next.js, inte importerad.

**Vad som behövs:**
- En **scaffold-required-files-check** som validerar "om scaffold deklarerar `app/page.tsx` så MÅSTE final version ha den med non-trivial content"
- Enhetligt fil-kontrakt mellan alla 9 scaffolds

**Plan-koppling:** Plan 11 (unified repair) eller en ny plan efter wave 5.

---

### 6. ❓ AJV `format: "uri"` warning på dossier-schema

**Antagande:** Strict schemas validerar perfekt.

**Vad vi ser:** `unknown format "uri" ignored in schema at path "#/properties/sourceRepoUrl"` × 2 per server-start. AJV Draft-07 hanterar inte `format: "uri"` inbyggt utan `ajv-formats`.

**Konsekvens:** Validering av `sourceRepoUrl` är effektivt strängare än specat (ingen format-check). Inte en bugg, men inkonsekvent.

**Fix:** 1-rader — antingen `ajv-formats` plugin-load eller `format: "url"` som AJV känner till.

**Plan-koppling:** Trivial, kan göras i plan 12 eller separat micro-commit.

---

### 7. ❓ `THREE.WebGLRenderer: Context Lost` — IDE-noise eller riktig bugg?

**Antagande:** Det här kommer från Cursor IDE:s egen WebGL-inspektor, inte din genererade sajt.

**Vad vi vet:** Det dyker upp **innan** användaren ens skrivit en 3D-prompt (Run 1, Run A i smoke). Om det vore i previewn skulle det krävt 3D-content.

**Vad vi inte vet:** Är det 100% säkert IDE-noise? Eller kan något i builder-UI:t (preview-iframe-overlay?) ha en webgl-context som tappas vid tab-switch?

**Hur verifiera:** Kör smoke i en vanlig browser (utanför Cursor IDE) och se om varningen försvinner.

---

## Hur använda denna fil

1. **Innan du säger "det buggar"** — kolla om det är listat här. Om ja → läs vad vi vet, lägg till nya datapunkter.
2. **När du upptäcker ett antagande som inte verifierats** — addera ny rad här.
3. **När ett antagande verifierats sant** — flytta till relevant arkitekturdoc, markera ✅ och ta bort härifrån vid nästa cleanup.
4. **När ett antagande visat sig falskt** — markera ❌, dokumentera fix-commit, behåll här som arkiv tills nästa cleanup.

**Referensformat:** `### N. <symbol> Korta-titeln`. Ändra inte numreringen retroaktivt — lägg nya rader i botten.
