---
status: active
owner: unassigned
created: 2026-07-13
topic: Builder runtime-robusthet — DB-pool-500-storm vid redeploy/hård polling, klient-backoff, CSP/font-brus, och scaffold-lint-bugg som orsakar återkommande ReleaseGate-fel
source: /logg-session prod (chat 747636c8, 2026-07-13) + explore-subagent kodläsning (db/client.ts, engine-routes, hooks, proxy.ts, preview-host/runtime.js, project-scaffold.ts)
---

# Builder runtime-robusthet

## TL;DR

**Incidenten som motiverade planen (prod-session 2026-07-13):** en skur av
**29× HTTP 500** (05:55–05:57 UTC) på de pollade läs-routerna (`version-status`,
`readiness`, `versions`, `dossiers`), alla med
`timeout exceeded when trying to connect` (DB-poolen tog slut). Sammanfallande orsaker:
(1) en **prod-redeploy mitt i körningen** (commit #514, 05:43 UTC) som bytte ut instanser,
(2) **hård klient-polling utan backoff**, (3) liten per-instans-pool (default **3**). Ingen
av läs-routerna degraderade mjukt — de kastade 500. Samma session visade dessutom ett par
kosmetiska brus-fel (CSP-eval report-only, font-403 i preview) och en
**scaffold-lint-bugg** (`use-reduced-motion`) som fällde ReleaseGate på lint för *varje*
genererad sajt.

**Nuläge:** brus-felen och scaffold-buggen är åtgärdade (C1, C2, D1), A1+A2 — den
självförstärkande delen av 500-stormen — är levererade, spår B är stängt, och A3:s
**mätning** finns nu i kod (ratten är medvetet orörd tills prod-siffror finns). Kvar:
A4 (redeploy-paus), att läsa A3-mätningen vid nästa pool-händelse, och D2. Stycket ovan
beskriver incidenten, inte dagens kodläge — statustabellen nedan är sanningen.

Pool-tuning kräver mätning (motsatta fixar för motsatta fel) — se A3.

## Status 2026-07-28 (A1+A2 levererade 07-27; A3-mätning + B levererade 07-28)

| Punkt | Läge | Bevis |
|---|---|---|
| A1 mjuk degradering (503 + `Retry-After`) | **klar** | `src/lib/db/transient-error.ts` + `src/lib/api/transient-db-response.ts`, inkopplad först i `catch` på alla fyra läs-routerna; route-tester i `version-status/route.test.ts` + `readiness/route.test.ts` låser 503 för transient och 500 för allt annat |
| A2 klient-backoff + visibility-paus | **klar** | `src/lib/hooks/poll-backoff.ts` (exponentiell backoff + jitter + `Retry-After`), använd av `useVersionStatus.ts` (timeout-kedja i st.f. `setInterval`, pausar på dold flik), `useChatReadiness.ts` och `useVersions.ts`; tester i `poll-backoff.test.ts` + `useVersionStatus.test.ts` |
| A3 pool-tuning | **mätning klar, ratten orörd** | `src/lib/db/pool-stats.ts` + 503-raden i `transient-db-response.ts` (appsidan), `db-health-check.mjs` → `connections` (serversidan); tester i `pool-stats.test.ts`. Default fortfarande 3 — höjs först när prod-siffror finns |
| A4 redeploy-tålighet | **öppen** | saknas i samtliga tre hooks |
| B error-log 503-retry | **klar** | `post-checks.ts` retryar 503 med `Retry-After` (tak 5 s, 2 försök); duplikat-skrivaren i `useBuilderDeployActions.ts` delegerar nu dit i stället för att ignorera svaret; tester i `post-checks-error-log-retry.test.ts` |
| B quality-gate 409 | **klar (by design)** | resume-lane med bounded retry: `post-checks.ts:528-544` |
| C1 CSP eval | **klar** | `instrumentation-client.ts:11` `z.config({ jitless: true })` |
| C2 preview font 403 | **klar** | `preview-host/src/runtime.js:2155-2161`, `:2229-2235` |
| D1 scaffold `use-reduced-motion` | **klar** (#578) | `project-scaffold.ts:377-404` `useSyncExternalStore` + test `project-scaffold.test.ts:315-332` |
| D2 verifier-täckning för `string \| undefined` | **öppen** | inget reply-mönster i `openai-chat/instructions.md`, ingen TS2345-täckning i verify/autofix |

## A. DB-pool-500-storm (P1 — det som "sabbade" i UI:t)

### Nuläge (verifierat)

| Aspekt | Värde | Fil |
|---|---|---|
| `POSTGRES_POOL_MAX` | **3** (pooled/pgbouncer) / 10 (direkt) | `src/lib/db/client.ts` 147–154 |
| `connectionTimeoutMillis` | **10 000 ms** → felet "timeout exceeded when trying to connect" | 193 |
| Retry på pool/query | **Ingen** | — |
| `version-status` / `readiness` / `versions` / `dossiers` vid DB-fel | **500** (ingen 503, ingen last-known) | respektive route |
| Klient-polling | `useVersionStatus` **4s** `setInterval`; SWR `readiness` 15–30s, `versions` 10–60s — **ingen backoff vid fel** | `src/lib/hooks/**` |
| Observerat i prod | 0× `EMAXCONNSESSION` → felet är per-instans-pool för liten, **inte** total session-svält | Vercel runtime-logg |

### Åtgärder

- **A1 — Mjuk degradering på läs-routerna: LEVERERAD 2026-07-27.** Vid transient DB-fel
  (connect-timeout, tappad connection, pooler-kapacitet, låskonflikt) svarar
  `version-status`, `readiness`, `versions` och `dossiers` nu **503 + `Retry-After: 3`** med
  `{ ok: false, code: "db_unavailable", retryable: true }`. Klassificeringen är avsiktligt
  smal (`isTransientDbError`): konfigurations-, schema- och query-fel ger fortfarande 500,
  annars blir ett hårt fel en oändlig klient-retry. Kontraktet är dokumenterat i
  [`data-layer.md`](../../contracts/data-layer.md) § Transienta DB-fel.
- **A2 — Klient-backoff: LEVERERAD 2026-07-27.** `poll-backoff.ts` ger exponentiell backoff
  med jitter och respekterar serverns `Retry-After`; alla tre hookarna nollställer vid första
  lyckade poll. `useVersionStatus` bytte `setInterval` mot en självschemaläggande
  timeout-kedja (annars kan delayen inte varieras) och pausar helt medan fliken är dold —
  SWR-hookarna pausar redan vid dold flik via `refreshWhenHidden: false`.
  Wall-clock-backstoppet (`maxNonTerminalMs`) gäller oförändrat, så en oåtkomlig endpoint
  slutar polla i stället för att backa av i evighet.
  Två fällor värda att minnas (båda hittade av bugbot-passet på diffen): SWR har
  `refreshInterval` i sin effekt-deps, så callbacken måste memoiseras annars startas
  timern om vid varje render; och SWR hoppar över intervall-pollning när cachen har ett
  fel, så backoffen måste också in i `onErrorRetry`-banan för att ha någon effekt.
- **A3 — Pool-tuning: MÄTNINGEN LEVERERAD 2026-07-28, ratten orörd.** Felet var
  connect-timeout (inte `EMAXCONNSESSION`) → riktningen är att **höja**
  `POSTGRES_POOL_MAX` (t.ex. 3→5–8). **Men** höj inte blint: fler instanser × högre max
  kan i stället ge `EMAXCONNSESSION` mot poolerns tak. Poolstorlek = samtidighet, inte
  hastighet. (Bakgrund: backlog M#db1 + `src/lib/db/client.ts`.)

  **Rättelse av planens egen mätinstruktion:** "mät `pg_stat_activity`" mäter fel sida.
  `timeout exceeded when trying to connect` kastas av `pg.Pool` medan den väntar på en
  klient ur **instansens egen pool** — Postgres tillfrågas aldrig, så serversidan kan se
  helt frisk ut samtidigt. Mätningen är därför tvåsidig:

  | Sida | Var | Vad den avgör |
  |---|---|---|
  | Appens pool | `src/lib/db/pool-stats.ts`, loggad i 503-raden: `[pool=3/3 idle=0 waiting=7 at-ceiling]` | `at-ceiling` ⇒ höj |
  | Server/pooler | `npm run db:health` → `connections` (`total`/`usable_connections`/`headroom`) | lite headroom ⇒ höj **inte**, flytta långlivade vägar till non-pooling |

  Två läsfällor, båda funna av bugbot-passet: `waiting` kan vara 0 när felet
  loggas (pg dequeuear den timeoutade requesten först), så `at-ceiling` är
  signalen; och `headroom` måste räknas mot hela instansen — bara vår databas gav
  53 i stället för 44 på dev.

  Siffrorna i appens pool går inte att hämta i efterhand — därför loggas de när felet
  inträffar. Nästa steg är att **läsa** dem vid nästa pool-händelse i prod och först då
  vrida ratten. Kontrakt: [`data-layer.md`](../../contracts/data-layer.md)
  § Mät innan du vrider `POSTGRES_POOL_MAX`.
- **A4 — Redeploy-tålighet:** överväg att pausa/förlänga klient-polling en kort stund vid
  detekterad ny deployment (t.ex. version-mismatch), så en prod-deploy mitt i en session
  inte ger en 500-skur medan nya instanser värms upp.

## B. error-log 503 + quality-gate 409 (mestadels by design)

| Symptom | Status | Bedömning |
|---|---|---|
| `POST …/error-log` → **503** `row_contention` | Avsiktlig degradering vid FK-lås-contention (`version-errors.ts` 128–167, `Retry-After: 3`) | Behåll. Klientens uteblivna retry är **åtgärdad 2026-07-28** |
| `POST …/quality-gate` → **409** | `version_busy` / readiness-konflikt (superseded är **200**, inte 409) | Klient hanterar via resume-lane (max 3 försök). Din 409-skur = snabb-klickande mellan versioner |

**ÅTGÄRDAD 2026-07-28.** `persistVersionErrorLogs` respekterar nu `Retry-After` och gör
två extra försök vid 503, med ett eget tak på 5 s eftersom resume-lanen **väntar** på
svaret. Bara 503 retryas — 4xx ändrar sig inte av att frågas igen och nätverksfel är
best-effort.

*Varför det spelade roll:* utan retry tappades felloggen tyst vid contention (dubbel
ironi: loggen *om* ett fel blev själv ett tyst fel), och resume-lanen tolkade `false` som
"blockeraren kunde inte sparas" → fail-closed på en övergående låskonflikt.

*Fynd på vägen:* `useBuilderDeployActions.ts` hade en **egen** kopia av skrivaren som inte
ens läste `res.ok`, så en retry bara i `post-checks.ts` hade täckt hälften av
skrivvägarna. Kopian delegerar nu till den delade funktionen.

409 krävde ingen kodändring — det är förväntat beteende vid snabba versionsbyten (mildras
av backoff i A2).

## C. Kosmetiskt brus (lågprio)

- **C1 — CSP eval report-only: ÅTGÄRDAD 2026-07-25.** Varningen var **report-only** ("no
  further action taken") och prod-policyn (`src/proxy.ts`) har inte `unsafe-eval`. Källan var
  **inte** preview-runtimen utan appens egen bundle: **Zod v4 JIT-kompilerar objektschemat med
  `new Function`**, och eftersom policyn bara rapporterar lyckas Zods `Function("")`-probe →
  varje kompilerat schema loggade en violation (×45 per sidladdning). Fix:
  `src/instrumentation-client.ts` sätter `z.config({ jitless: true })` innan appens klientkod
  körs. Servern behåller JIT (ingen CSP i Node). `src/app/api/csp-report/route.ts` (30–51)
  tystar fortfarande kvarvarande prod-eval-rapporter → 204.
- **C2 — Preview font 403: ÅTGÄRDAD.** Origin/Referer-fallbacken är härdad
  (`preview-host/src/runtime.js:2155-2161` Referer-fallback, `:2229-2235` Origin-strip för
  `/_next/*` och `/__nextjs*`), så `/__nextjs_font/*` proxas korrekt. `font-import-fixer.ts`
  byter fortfarande Geist→Inter som extra bandage.

## D. Genererad kodkvalitet — scaffold-lint-buggen (hög hävstång)

- **D1 — ÅTGÄRDAD 2026-07-22 (#578).** Baslinje-hooken satte `setState` synkront i en
  `useEffect` → `react-hooks/set-state-in-effect`, en ERROR i `eslint-config-next` som
  hårdblockerade F3:s ReleaseGate-lint för **alla** scaffolds (filen ligger i
  `SCAFFOLD_FILES`). Den är omskriven till `useSyncExternalStore`
  (`project-scaffold.ts:377-404`) — lint-ren, SSR-säker och testlåst i
  `project-scaffold.test.ts:315-332`.
- **D2 — `chatbot-widget.tsx`-felen** (TS2345 `data.reply: string | undefined`, plus
  set-state-in-effect) är **own-engine-genererad** kod, inte en mall (bekräftat: finns inte
  i dossiers/scaffolds). Rätt hävstång här är verifier/RepairGate + prompt-kvalitet, inte en
  mallfix. *Åtgärd:* säkerställ att RenderGate/autofix fångar den vanliga
  `string | undefined`-till-`string`-klassen och att `openai-chat`-dossierns
  (capability `ai-chat` — incidentens dossier, jfr M#dchat1) instruktioner styr mot ett
  typsäkert svarsmönster. Lägre prioritet / annan lever.

## Föreslagen ordning (kvarvarande)

| Fas | Innehåll | Risk | Hävstång |
|---|---|---|---|
| 1 | **A3 steg 2** — läs pool-siffrorna vid nästa pool-händelse i prod, vrid sedan `POSTGRES_POOL_MAX` | Låg (mätningen finns) | Medel |
| 2 | **A4** redeploy-paus | Låg | Medel |
| 3 | **D2** verifier-täckning | Låg | Låg-medel |

Levererat och därmed ur kön: A1, A2 (2026-07-27), A3:s mätning + B (2026-07-28), D1 (#578),
C1, C2 — se statustabellen överst.

## Explicit icke-mål

- Ingen ny DB, ingen ändrad connection-string-policy (`POSTGRES_URL` → non-pooling-kedjan bevaras).
- Ta inte bort error-log-503-degraderingen (den infördes medvetet vid prod-incident 2026-07-03).
- Ingen omskrivning av CSP till enforcing utan separat beslut (report-only är avsiktligt nu).

## Not om just din session

Bygget i sig gick bra (4/4 genereringar `success`, preview-VM frisk). Det du såg var
**inte** en generationskrasch utan (i) 500-stormen ovan under redeploy + hård polling, och
(ii) v4/v5:s äkta lint/typecheck-fel i `chatbot-widget.tsx`. D1 + A1/A2 adresserar det
återkommande; D2 adresserar den enskilda widget-buggen.
