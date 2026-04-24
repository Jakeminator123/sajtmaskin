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

### 1. ❌ Redis cache — vet vi ens om den körs?

**Antagande:** `useRedisCache` styr brief-cache + rate-limit + preview-session-store. Vi var osäkra på om den var no-op:ad i dev.

**Verifierat 2026-04-23 (chatId `b71dafb3`):** Redis körs aktivt mot Upstash. Lazy-init när någon route faktiskt behöver den (inte vid server-boot).

```
01:20:41.727 [DB] [Redis] Creating client { host: 'alert-silkworm-17000.upstash.io', port: 6379, ... }
01:20:41.826 [DB] [Redis] Connected
01:20:42.237 [DB] [Redis] Ready
```

**Konfiguration:** `REDIS_URL` (eller `UPSTASH_REDIS_REST_URL`) finns i `.env.local`. Tidigare antagande "Redis off i dev" var felaktigt — andra agentens diagnos byggde på en gammal session.

**Sekundärbugg fortfarande:** brief-cache-hits skriver fail till `_unrouted/brief-cache-hit/timeline.ndjson` (ENOENT — directory existerar inte). Cachen FUNGERAR men telemetri-loggen failar tyst:
```
[generationslogg] writeGenerationLogEntry failed: ENOENT ... \brief-cache-hit\timeline.ndjson
```
→ Plan 10-fynd (observatory writer ska mkdir innan write).

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

### 5. ❌ Scaffolds — saknar enhetligt minimi-fil-kontrakt (REPRODUCERBAR BUGG)

**Antagande:** Scaffold-kontrakt garanterar att deklarerade filer landar i final version.

**Verifierat falskt — REPRODUCERBAR i 2 av 2 init-runs.**

| Run | chatId | scaffoldVariant | page.tsx genererad? | site-footer.tsx? |
|---|---|---|---|---|
| A | `1fa58609` | `editorial-lux` | ❌ NEJ | ✅ Ja |
| B (denna) | `b71dafb3` | `corporate-grid` | ❌ NEJ | ❌ NEJ |

Variant spelar ingen roll. **Systematisk generation-quality-bugg.** LLM:n returnerar inte alltid alla scaffold-filer i sin CodeProject-output, och merge-pipelinen tappar bort dem tyst.

**Specifik skada:** Sajten "promotas" grön men är helt tom (`<main>` är 936 tecken skal-wrapper, 0 sektioner, 0 headings, 0 images). Cross-file-import-checker fångar inte detta för `page.tsx` är auto-discovered av Next.js, inte importerad.

**Vad som behövs:**
- **Scaffold-required-files-check** som validerar "om scaffold deklarerar `app/page.tsx` (och liknande core-routes) så MÅSTE final version ha den med non-trivial content"
- Lägg som blocking-finding i `runFinalizePreflightAll()` (efter plan-05:s konsolidering)
- Enhetligt fil-kontrakt mellan alla 9 scaffolds (per användarens önskemål)

**Plan-koppling:** **HIGH-PRIO för plan 11 (unified repair)** eller egen ny plan. Detta är den enskilda största user-impact-buggen vi hittat.

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

### 8. ❌ scaffoldVariant lockas inte mellan init och follow-up

**Antagande:** När en follow-up körs på en chat med befintlig version ska systemet låsa till samma `scaffoldVariant` som init valde, så sajten inte byter utseende mellan användarens prompts.

**Verifierat falskt 2026-04-23 (chat `b71dafb3`):** Init valde `corporate-grid`. Follow-up försökte locka och gav upp:

```
[scaffold-variant] variant_lock_skip {
  reason: 'missing_prior_variant_id',
  scaffoldId: 'landing-page',
  priorVariantId: null,
  intent: 'neutral'
}
```

Sedan valde follow-up `warm-local` istället. Sajten har därmed olika look mellan v1 och v2, även för en trivial "lägg till mer innehåll"-prompt.

**Sannolik rotsorsak (samma kod-område som page.tsx-loss):** `resolveOrchestrationBase` (eller `engine_versions`-persistens) sparar inte `scaffoldVariantId` på versionen. Vid follow-up läses `priorVariantId: null` från base.

**Konfirmerade variants:** `corporate-grid`, `warm-local`, `editorial-lux`, `bold-startup`, `minimalist-mag` — minst 5 finns i `src/lib/gen/scaffold-variants/`. Variant-systemet är inte trasigt; bara persistensen.

**Plan-koppling:** **Lägg till i investigation-agentens scope** OCH plan 11. Är troligen samma fix som page.tsx-loss eftersom båda bor i samma persistens-/merge-kedja.

---

### 9. 🟡 CSP frame-src violation — iframe med tom src

**Loggrad (server):** `[csp-report] directive=frame-src blocked= doc=http://localhost:3000/builder?chatId=b71dafb3...`

**Browser-rapport:** `Framing '' violates the following report-only Content Security Policy directive: "frame-src 'self' *.vusercontent.net *.vercel.run *.vercel.app https://vm-fly-jakem.fly.dev https://fly.dev https://*.fly.dev"`

**Tolkning:** Källan är **tom string `''`** — något försöker montera en `<iframe>` med:
- tom `src=""` (browser tolkar som "ladda current URL" → rekursiv frame)
- `src="about:blank"` (utan `'self'` mot blank-källa)
- en `javascript:` URL (sällan)

CSP är `report-only` så det loggas men blockas inte. Latent bugg: om CSP byter till enforcing-mode kommer detta att blockera den iframen.

**Troliga kandidater:**
- Hidden `<iframe>` för clipboard/print/download i builder-UI
- Element-inspector mount-point (har sett relaterade buggar tidigare)
- Vercel speed-insights / web-analytics widget injection

**Hur verifiera:** Sök i `src/components/builder/**` efter `<iframe`-användning utan src-attribute eller med `src=""`. Eller sätt CSP till enforcing temporärt och se vilken UI-komponent som breaker.

**Plan-koppling:** Inte plan 11/12-scope. Värd egen 30-min-task för en framtida UI-cleanup-pass.

---

## Hur använda denna fil

1. **Innan du säger "det buggar"** — kolla om det är listat här. Om ja → läs vad vi vet, lägg till nya datapunkter.
2. **När du upptäcker ett antagande som inte verifierats** — addera ny rad här.
3. **När ett antagande verifierats sant** — flytta till relevant arkitekturdoc, markera ✅ och ta bort härifrån vid nästa cleanup.
4. **När ett antagande visat sig falskt** — markera ❌, dokumentera fix-commit, behåll här som arkiv tills nästa cleanup.

**Referensformat:** `### N. <symbol> Korta-titeln`. Ändra inte numreringen retroaktivt — lägg nya rader i botten.
