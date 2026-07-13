---
status: active
owner: unassigned
created: 2026-07-13
topic: Builder runtime-robusthet — DB-pool-500-storm vid redeploy/hård polling, klient-backoff, CSP/font-brus, och scaffold-lint-bugg som orsakar återkommande ReleaseGate-fel
source: /logg-session prod (chat 747636c8, 2026-07-13) + explore-subagent kodläsning (db/client.ts, engine-routes, hooks, proxy.ts, preview-host/runtime.js, project-scaffold.ts)
---

# Builder runtime-robusthet

## TL;DR

Under den senaste prod-sessionen kom en skur av **29× HTTP 500** (05:55–05:57 UTC) på de
pollade läs-routerna (`version-status`, `readiness`, `versions`, `dossiers`), alla med
`timeout exceeded when trying to connect` (DB-poolen tog slut). Sammanfallande orsaker:
(1) en **prod-redeploy mitt i körningen** (commit #514, 05:43 UTC) som bytte ut instanser,
(2) **hård klient-polling utan backoff**, (3) liten per-instans-pool (default **3**). Ingen
av läs-routerna degraderar mjukt — de kastar 500. Utöver det: ett par kosmetiska brus-fel
(CSP-eval report-only, font-403 i preview) och en **scaffold-lint-bugg** (`use-reduced-motion`)
som får *varje* genererad sajt att fälla ReleaseGate på lint.

Detta är en **plan, ingen implementation.** Pool-tuning kräver mätning (motsatta fixar för
motsatta fel) — se A3.

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

- **A1 — Mjuk degradering på läs-routerna:** vid connect-timeout/transient DB-fel, returnera
  **503 + `Retry-After`** (eller `{ ok:true, pending:true }` / last-known) i stället för 500,
  på `version-status`, `readiness`, `versions`, `dossiers`. Då kan klienten backa av i stället
  för att tolka det som permanent fel.
  *Motivering:* dessa är idempotenta pollar; en transient poolbrist ska inte se ut som en
  hård 500-krasch i konsollen och ska inte spamma Sentry/loggar.
- **A2 — Klient-backoff:** exponential backoff (+ jitter) på fel i `useVersionStatus`,
  `useChatReadiness`, `useVersions`. Pausa polling när fliken är dold (`visibilitychange`).
  *Motivering:* 4s-hammer × flera endpoints × flera versioner = självförvållad poolbrist,
  särskilt precis efter en redeploy när instanser är kalla.
- **A3 — Pool-tuning (mät först):** felet var connect-timeout (inte `EMAXCONNSESSION`) →
  riktningen är att **höja** `POSTGRES_POOL_MAX` (t.ex. 3→5–8) på appen. **Men** höj inte
  blint: fler instanser × högre max kan i stället ge `EMAXCONNSESSION` mot poolerns tak.
  Mät `pg_stat_activity` och vilket fel som faktiskt loggas innan ratten vrids. Poolstorlek
  = samtidighet, inte hastighet. (Bakgrund: backlog M#db1 + `src/lib/db/client.ts`.)
- **A4 — Redeploy-tålighet:** överväg att pausa/förlänga klient-polling en kort stund vid
  detekterad ny deployment (t.ex. version-mismatch), så en prod-deploy mitt i en session
  inte ger en 500-skur medan nya instanser värms upp.

## B. error-log 503 + quality-gate 409 (mestadels by design)

| Symptom | Status | Bedömning |
|---|---|---|
| `POST …/error-log` → **503** `row_contention` | Avsiktlig degradering vid FK-lås-contention (`version-errors.ts` 128–167, `Retry-After: 3`) | Behåll — men klient `persistVersionErrorLogs` (`post-checks.ts` 43–63) **retryar inte** på 503 |
| `POST …/quality-gate` → **409** | `version_busy` / readiness-konflikt (superseded är **200**, inte 409) | Klient hanterar via resume-lane (max 3 försök). Din 409-skur = snabb-klickande mellan versioner |

**Åtgärd (liten):** låt `persistVersionErrorLogs` respektera `Retry-After` och göra 1–2
retries vid 503. *Motivering:* annars tappas felloggen tyst vid contention (dubbel-ironi:
loggen om felet blir själv ett tyst fel). 409 kräver ingen kodändring — det är förväntat
beteende vid snabba versionsbyten (mildras av backoff i A2).

## C. Kosmetiskt brus (lågprio)

- **C1 — CSP eval report-only:** varningen är **report-only** ("no further action taken").
  Prod-policyn (`src/proxy.ts`) har inte `unsafe-eval`; `src/app/api/csp-report/route.ts`
  (30–51) tystar redan prod-eval-brus → 204. *Åtgärd:* bekräfta att varningen är godartad
  (dev/preview-runtime, inte app) och ev. dämpa konsol-bruset. Låg prioritet.
- **C2 — Preview font 403** (`/__nextjs_font/geist-latin.woff2`): preview-host-proxyns
  Origin-strip för Next 16 `blockCrossSiteDEV` träffar inte alltid (`preview-host/src/runtime.js`
  2127–2139). *Åtgärd:* härda Origin/Referer-fallback så `/__nextjs_font/*` proxas korrekt.
  Kosmetiskt (font faller tillbaka), men bullrigt. `font-import-fixer.ts` byter redan
  Geist→Inter som bandage.

## D. Genererad kodkvalitet — scaffold-lint-buggen (hög hävstång)

`use-reduced-motion` i **scaffold-baslinjen** anropar `setState` synkront i en `useEffect`
→ `react-hooks/set-state-in-effect`. **Precisering efter bevisrunda:** filen ligger i
`SCAFFOLD_FILES` och injiceras i **alla** scaffolds, och regeln flaggade den faktiskt i den
här körningens F3-lint (`hooks/use-reduced-motion.ts:13:5`, användarens egen logg). Men lint
gate:ar **bara i F3-verify-lanen**, inte i varje F2-generering — så det blir en ReleaseGate-
blocker först när användaren kör "Bygg integrationer", inte "i varje genererad sajt". Värdet
kvarstår: fixar man baslinjen försvinner ett återkommande F3-lint-fel för alla scaffolds.

```347:366:src/lib/gen/export/project-scaffold.ts
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const query = window.matchMedia(REDUCED_MOTION_QUERY);
    setReduced(query.matches);
    // ...
  }, []);
  return reduced;
}
```

- **D1 — Skriv om baslinje-hooken** så den inte sätter state synkront i effekt (t.ex.
  `useSyncExternalStore`, eller lazy `useState`-init för första matchen + subscribe för
  ändringar). Injiceras via `SCAFFOLD_FILES` i alla scaffolds.
  *Motivering:* detta är **vår** mall, inte LLM-output. Fixen tar bort ett återkommande
  ReleaseGate-lint-fel för **alla** framtida sajter — direkt koppling till din
  "ReleaseGate underkände lint"-observation.
- **D2 — `chatbot-widget.tsx`-felen** (TS2345 `data.reply: string | undefined`, plus
  set-state-in-effect) är **own-engine-genererad** kod, inte en mall (bekräftat: finns inte
  i dossiers/scaffolds). Rätt hävstång här är verifier/RepairGate + prompt-kvalitet, inte en
  mallfix. *Åtgärd:* säkerställ att RenderGate/autofix fångar den vanliga
  `string | undefined`-till-`string`-klassen och att `openai-chat`-dossierns
  (capability `ai-chat` — incidentens dossier, jfr M#dchat1) instruktioner styr mot ett
  typsäkert svarsmönster. Lägre prioritet / annan lever.

## Föreslagen ordning

| Fas | Innehåll | Risk | Hävstång |
|---|---|---|---|
| 1 | **D1** scaffold `use-reduced-motion`-fix (+ test) | Låg | Hög — tar bort återkommande lint-fel |
| 2 | **A1 + A2** mjuk degradering + klient-backoff | Medel | Hög — dödar 500-stormen i UI:t |
| 3 | **A3** pool-mätning + ev. höjning | Låg (mät först) | Medel |
| 4 | **B** error-log-retry; **A4** redeploy-paus | Låg | Medel |
| 5 | **C1/C2** brus-städ; **D2** verifier-täckning | Låg | Låg-medel |

## Explicit icke-mål

- Ingen ny DB, ingen ändrad connection-string-policy (`POSTGRES_URL` → non-pooling-kedjan bevaras).
- Ta inte bort error-log-503-degraderingen (den infördes medvetet vid prod-incident 2026-07-03).
- Ingen omskrivning av CSP till enforcing utan separat beslut (report-only är avsiktligt nu).

## Not om just din session

Bygget i sig gick bra (4/4 genereringar `success`, preview-VM frisk). Det du såg var
**inte** en generationskrasch utan (i) 500-stormen ovan under redeploy + hård polling, och
(ii) v4/v5:s äkta lint/typecheck-fel i `chatbot-widget.tsx`. D1 + A1/A2 adresserar det
återkommande; D2 adresserar den enskilda widget-buggen.
