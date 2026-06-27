---
status: active
owner: unassigned
created: 2026-06-27
topic: "#4 distribuerat lås för server-verify/repair (process-local Set → DB-lease)"
related:
  - docs/architecture/open-questions.md (#4-klassen, multi-instans)
  - "PR #251 (Plan B schemahärdning — separat, redan i review)"
  - "docs/plans/active/README.md backlog B3/E2 (durable event-bus, samma multi-instans-korrekthetsrisk)"
decision_required: true
implementation_started: true
---

# Plan C / P1 — Distribuerat lås för server-verify & repair

> **Status: CORE IMPLEMENTERAD (dev), ej committad/mergad, prod-migration EJ körd.**
> Ägaren godkände bygget (2026-06-27) efter att #251 mergats. Den distribuerade
> kärnan (lease-tabell + lease-API + auto-flödets `run_id`-kedja) är byggd och
> verifierad lokalt: `npm run typecheck` (0 fel), `db:schema-drift`-testet grönt,
> 111 verify/route-tester gröna (bakåtkompatibelt — `run_id` är valfritt, så gamla
> callers/tester är oförändrade).
>
> ### Vad som landat
> - `engine_version_jobs` i `src/lib/db/schema.ts` (+ partiellt unikt index
>   `engine_version_jobs_active_uq ON (version_id) WHERE status='running'`).
> - Migration `src/lib/db/migrations/add-engine-version-jobs.sql` + registrerad i
>   `MIGRATION_ORDER` + inline `CREATE TABLE/INDEX` i `db-init.mjs` + tabellen i
>   `db-health-check.mjs` `EXPECTED_TABLES` (schema-drift-gate grön).
> - Lease-API i `chat-repository-pg.ts`: `acquireVersionLease` (atomisk
>   INSERT … ON CONFLICT (version_id) WHERE status='running' DO UPDATE … WHERE
>   expired), `renewVersionLease`, `releaseVersionLease`, `hasActiveVersionLease`.
> - `run_id`-trådning genom `markVersionVerifying/Repairing`, `saveRepairedFiles`,
>   `promoteVersion`, `failVersionVerification`, `markVersionSupersededByRepair`
>   via `versionWriteWhere()` (UPDATE villkoras atomiskt på en levande egen-lease →
>   en run vars lease tagits över blir **no-op** istället för lost-update).
> - `server-verify.ts`: `triggerServerVerification` + `triggerBuildErrorRepair`
>   tar lease (`server_verify` / `build_error_repair`), trådar `run_id`, förnyar
>   före `saveRepairedFiles`, släpper i `finally`. Lokala `inflight`-Set:en kvar
>   som snabbspärr. **Fail-safe:** om acquire kastar (tabell saknas/DB-fel)
>   degraderar vi till dagens Set-only-beteende (kör utan lås) istället för att
>   krascha eller stänga av verify.
>
> ### HTTP-vägarnas lease — LANDAT (ägaren valde A, öppen fråga 2: lease alla)
> - `quality-gate/route.ts` (HTTP-verify): tar `server_verify`-lease, `409
>   version_busy` om en annan run äger den, trådar `run_id` genom
>   markVersionVerifying/SupersededByRepair/promoteVersion/failVersionVerification,
>   släpper i `finally`.
> - `repair/route.ts` (manuell repair): tar `manual_repair`-lease, `409
>   version_busy` om upptagen, trådar `run_id` + renew före `saveRepairedFiles`,
>   släpper i `finally`.
> - `accept-repair/route.ts`: `hasActiveVersionLease`-grind → `409 version_busy`
>   om ett jobb äger versionen (accept = promote, får ej race:a en pågående run).
> - `readiness/route.ts`: stale-verification-watchdogen failar bara om INGEN aktiv
>   lease finns (annars äger ett jobb raden legitimt). Alla grindar är fail-safe
>   (DB-fel → dagens beteende). Verifierat: typecheck 0, db:schema-drift grön,
>   273 tester gröna (verify/DB/migration/route), inkl. nytt 409-routetest.
>
> ### Vad som återstår (medvetet ej gjort i denna pass)
> - **Concurrent-lock-integrationstest mot dev-Postgres** (§5). Partiellt unikt
>   index + `ON CONFLICT … WHERE` kan inte emuleras rättvist av pg-mem, så
>   semantiken verifieras mot riktig dev-DB (se runbook nedan), inte via mock.
> - **Prod-migration** (körs manuellt av ägaren, §4.2/§4.3).
>
> ### Runbook — verifiera + migrera (ägaren)
> ```text
> # 1. DEV (agent får köra):
> $env:DB_SSL_REJECT_UNAUTHORIZED="false"; npm run db:migrate
> #    verifiera: SELECT to_regclass('public.engine_version_jobs');  -> ej null
> #    concurrent-test: kör acquireVersionLease(v,'server_verify') + (v,'manual_repair')
> #    parallellt mot dev-DB -> exakt en får run_id, andra null.
> # 2. PROD (endast ägaren, pooled prod-URL):
> #    vercel env pull .env.vercel.production.pulled --environment=production
> #    DB_ALLOW_PROD_LIKE_WRITE=1 + pooled *.pooler.supabase.com  ->  npm run db:migrate
> #    verifiera i information_schema att tabell+index finns.
> # 3. FÖRST DÄREFTER: deploya koden som acquire:ar lås. (Schema-före-kod.)
> ```

## TL;DR

Bakgrundsjobben **server-verify** och **build-error-repair** dedupliceras idag bara
av en **process-local `Set<string>`** i `src/lib/gen/verify/server-verify.ts`. Appen
körs serverless på Vercel (verifierat, se §1). Under flera samtidiga JS-instanser
räcker inte det: två instanser kan köra verify/repair på *samma* `versionId` parallellt,
och ingen av DB-mutationerna (`markVersionVerifying`, `markVersionRepairing`,
`saveRepairedFiles`, `promoteVersion`) kontrollerar att den anropande körningen
fortfarande äger raden. Förslag: en **Postgres lease-tabell** (`engine_version_jobs`)
som ger ett distribuerat lås **per `version_id`** (en delad row-muterande lease för
all verify/repair som muterar samma `engine_versions`-rad; `kind` är metadata),
plus att repair/verify-mutationerna börjar bära ett `run_id` och blir no-op om låset
bytt ägare eller gått ut. `Set` behålls som lokal snabbspärr.

Rekommendation: **egen P1-PR**, byggd **efter** att #251 mergats, **dev-migration först**,
**prod-migration manuellt av ägaren** enligt explicit ordning nedan. Säkerhet på analysen:
~85 % (verifierat mot kod + `vercel.json`, ej mot en faktisk multi-instans-repro).

---

## 1. Nuvarande risk

### 1.1 Var låset bor idag

`src/lib/gen/verify/server-verify.ts`:

```ts
const inflight = new Set<string>();

export function isServerVerifyEligible(versionId: string): boolean {
  if (!dbConfigured) return false;
  if (!isQualityGateConfigured()) return false;
  if (inflight.has(versionId)) return false;   // <- enda dedup
  return true;
}
```

`inflight` är **modul-scopad** → en per JS-instans. Både `triggerServerVerification`
och `triggerBuildErrorRepair` gör `inflight.add(versionId)` i början och
`inflight.delete(versionId)` i `finally`.

### 1.2 Hur det dispatchas

`src/lib/providers/own-engine/generation-stream-post-finalize.ts` anropar båda
**fire-and-forget** (utan `await`, utan `waitUntil`) inne i SSE-strömmens
function-invocation.

### 1.3 Verifierad runtime/deploy-kontext

| Fynd | Bevis |
|---|---|
| Serverless på Vercel | `vercel.json` `functions` för stream-routes; inga single-instance-pinningar |
| Node serverless function | `src/app/api/engine/chats/stream/route.ts`: `runtime="nodejs"`, `maxDuration=800`, `supportsCancellation` |
| Fire-and-forget verify/repair | `generation-stream-post-finalize.ts` (ej awaitad) |
| Lås per instans | `const inflight = new Set()` (modul-scope) |

Vercel skalar ut flera function-instanser vid samtidighet (och Fluid Compute återanvänder
instanser men garanterar inte en enda). Alltså: `Set` är per-instans, inte global.

### 1.4 Exakta race conditions

1. **Dubbel verify/repair, olika instanser.** Två triggers för samma `versionId`
   (t.ex. snabb retry, dubbelklick, två SSE-vägar) landar på olika instanser. Båda
   ser tom `Set` → båda kör `runQualityGateOnExportable` + ev. `runRepairLoop`.
   Dubbel LLM-kostnad och konkurrerande skrivningar.
2. **Lost update på `saveRepairedFiles`.** Båda repair-loopar når
   `saveRepairedFiles(versionId, filesJson, …)` som gör `UPDATE … WHERE id = versionId`
   utan ägarkoll. Sista skrivningen vinner; den andra reparationens resultat skrivs
   tyst över. (Jfr open-questions: blocking 1 → 3 över repair-pass.)
3. **Tillstånds-flapp.** Instans A sätter `repairing`, instans B sätter `verifying`/
   `failed`/`repair_available` på samma rad om vartannat → UI och auto-accept-timeout
   (`maybeAutoAcceptTimedOutRepair`) läser inkonsekvent tillstånd.
4. **Fryst instans efter response.** Eftersom jobbet är fire-and-forget efter att SSE
   stängts kan en serverless-instans frysas/avslutas mitt i loopen. `Set`-posten
   försvinner med instansen → nästa trigger ser "ledigt" och startar om, ev.
   samtidigt som den frusna tinar. Ingen lease-expiry finns för att resonera om detta.
5. **`isLatestVersionForChat` täcker inte detta.** Den superseded-koll som finns
   skyddar mot *nyare* version, inte mot två körningar på *samma* version.

> Inget av detta läcker cross-tenant och orsakar inte tyst datakorruption i DB-schemat —
> men det ger dubbla repairs, bortskrivna reparationer och svår-debuggade tillståndsflappar.
> Samma klass som README-backloggens **B3/E2** (efemär state i multi-instans serverless).

---

## 2. Föreslagen modell — `engine_version_jobs` (DB-lease per version)

> **Codex-fix (P1):** låset är **per `version_id`**, inte per `(version_id, kind)`.
> server-verify, build-error-repair, manuell repair och quality-gate-route muterar
> **samma `engine_versions`-rad**. En per-kind-lease skulle låta verify och repair
> äga varsin lease och mutera raden parallellt — exakt det race vi vill stänga.
> Därför: **en delad row-muterande lease per version**, med jobbtypen som metadata
> (`kind` ingår inte i unikheten). Cross-kind-ägarskap blir därmed implicit: vem som
> än håller den aktiva leasen äger raden.

Ny tabell (Drizzle i `src/lib/db/schema.ts`):

| Kolumn | Typ | Not |
|---|---|---|
| `id` | uuid PK | |
| `version_id` | **`text`** (matchar `engine_versions.id`), FK → `engine_versions(id)` **ON DELETE CASCADE** | jobbets version |
| `kind` | text enum (**metadata**) | `server_verify` \| `build_error_repair` \| `manual_repair` — beskriver vem som tog leasen, styr **inte** unikhet |
| `run_id` | text | ägar-id för denna körning (uuid genererat vid acquire) |
| `status` | text enum | `running` \| `done` \| `failed` \| `expired` |
| `lease_expires_at` | timestamptz | nu + TTL; förnyas av ägaren (`renew`) |
| `created_at` | timestamptz default now() | |
| `updated_at` | timestamptz default now() | |

`version_id` är **`text`** eftersom `engine_versions.id` är `text` i Drizzle-schemat —
en `uuid`-kolumn skulle få FK:n att falla. **`ON DELETE CASCADE`** så att radering/wipe
av en version automatiskt städar dess job-rad (alternativet vore att uppdatera alla
cleanup/wipe-paths manuellt; cascade är enklare och säkrare — se §4).

**Index (kärnan i låset) — per version, inte per kind:**

```sql
-- Bara EN aktiv (running) lease per version, oavsett kind.
CREATE UNIQUE INDEX engine_version_jobs_active_uq
  ON engine_version_jobs (version_id)
  WHERE status = 'running';
```

**Acquire (atomiskt, idempotent):**

```sql
INSERT INTO engine_version_jobs (id, version_id, kind, run_id, status, lease_expires_at)
VALUES (:id, :versionId, :kind, :runId, 'running', now() + interval '<TTL>')
ON CONFLICT (version_id) WHERE status = 'running'
DO UPDATE SET run_id = EXCLUDED.run_id, kind = EXCLUDED.kind,
              lease_expires_at = EXCLUDED.lease_expires_at, updated_at = now()
  WHERE engine_version_jobs.lease_expires_at < now()   -- bara om gammalt lås gått ut
RETURNING run_id;
```

Returneras `run_id` == vårt → vi äger den enda aktiva leasen för versionen (oavsett
kind). Inget rad-returnerat → någon annan äger en färsk lease → **avstå** (no-op).
En utgången lease kan tas över (expiry-takeover) och `kind` uppdateras till ny ägare.

**Renew:** `UPDATE … SET lease_expires_at = now() + interval '<TTL>', updated_at = now()
WHERE version_id=:v AND run_id=:runId AND status='running'` — anropas mellan långa pass.

**Release:** `UPDATE … SET status='done'|'failed', updated_at=now()
WHERE version_id=:v AND run_id=:runId`.

`Set` behålls som **lokal snabbspärr före DB-rundturen** (billig optimering, inte
korrekthetsgaranti).

---

## 3. Kodvägar, `run_id` och guard-semantik

Mål: ingen mutation av en `engine_versions`-rad får ske om den anropande körningen
inte äger den **aktiva** leasen för versionen.

### 3.1 Acquire ligger i dispatch/trigger-path — inte i `isServerVerifyEligible`

**Codex-fix (P2):** `isServerVerifyEligible` ska förbli **side-effect-free** (ren
predikatfunktion som bara läser `dbConfigured` / `isQualityGateConfigured` / `Set`).
DB-`acquire` (som **skriver** en rad) sker i **trigger/dispatch-path**
(`triggerServerVerification` / `triggerBuildErrorRepair` / repair-route), som
genererar `runId` och trådar det vidare till varje mutation. `Set` förblir den lokala
snabbkollen inuti `isServerVerifyEligible`; acquiret är den distribuerade sanningen.

### 3.2 Nya lease-funktioner (`src/lib/db/chat-repository-pg.ts`)

| Funktion | Beteende |
|---|---|
| `acquireVersionLease(versionId, kind)` | atomisk acquire enligt §2; returnerar `{ runId } \| null` |
| `renewVersionLease(versionId, runId)` | förnyar `lease_expires_at`; anropas i långa loopar |
| `releaseVersionLease(versionId, runId, status)` | markerar `done`/`failed` |

### 3.3 Guard-semantik på muterande funktioner

**Codex-fix (P2):** guarden får inte bara matcha `run_id` — den måste kräva att leasen
fortfarande är **aktiv** vid skrivtillfället. Varje server-ägd mutation körs som ETT
atomiskt `UPDATE` som joinar mot en levande lease:

```sql
UPDATE engine_versions v SET …
FROM engine_version_jobs j
WHERE v.id = :versionId
  AND j.version_id = :versionId
  AND j.run_id = :runId
  AND j.status = 'running'
  AND j.lease_expires_at > now();
```

`rowCount = 0` → leasen är förlorad/utgången → mutationen blir **no-op** (returnerar
`null`). Alternativ implementering: en lyckad `renewVersionLease` **omedelbart före**
skrivningen i samma transaktion. Detta stänger lost-update även om TTL råkat löpa ut
mitt i ett pass. Funktioner som får `runId`: `markVersionVerifying`,
`markVersionRepairing`, `saveRepairedFiles` (vägrar om ej ägare → stänger lost-update),
`failVersionVerification`, `markVersionSupersededByRepair`, `promoteVersion`
(behåller dessutom `assertPromoteAllowed`-grinden).

### 3.4 Alla muterande callers — policy per caller

**Codex-fix (P2):** mutationerna anropas från fler ställen än server-verify
(enumererat via grep). Plan: inför **server-ägda lease-varianter** för
bakgrunds-/konkurrerande vägar och **lämna finalize-vägen utanför** (den äger
versionen vid skapande, innan något bakgrundsjobb finns).

| Caller | Funktioner | Lease-policy |
|---|---|---|
| `server-verify.ts` (auto verify) | markVersionVerifying, promoteVersion, failVersionVerification, markVersionSupersededByRepair | **acquire lease**; trådra `runId` |
| `server-verify.ts` (build-error / server-repair) | markVersionRepairing, saveRepairedFiles, fail… | **samma per-version-lease** |
| `repair/route.ts` (manuell repair, HTTP) | markVersionRepairing, saveRepairedFiles, failVersionVerification | **acquire lease** (`kind=manual_repair`) |
| `quality-gate/route.ts` (HTTP verify) | markVersionVerifying, promoteVersion, failVersionVerification, markVersionSupersededByRepair | **acquire lease** (`kind=server_verify`) — annars konkurrerar den med auto-flödet om samma rad |
| `accept-repair/route.ts` + `maybeAutoAcceptTimedOutRepair` | acceptRepair | behåll `assertPromoteAllowed`; **kräv att ingen annan aktiv lease finns** (eller ta kort egen lease) innan promote |
| `readiness/route.ts` (timeout-fail) | failVersionVerification | tillåt timeout-fail **endast om ingen aktiv lease** (annars äger ett jobb raden) |
| finalize-path (`generation-stream.ts`, `finalize-version/persist-side-effects.ts`) | failVersionVerification (init verifier/preflight-state) | **ingen lease** — körs inline i genereringen *före* bakgrundsjobb; sätter initialt terminaltillstånd. Behåll som idag. |
| `createAndPromoteDraftVersion` (`chat-repository-pg.ts`) | promoteVersion | internt skapande-flöde, ingen samtidig verify → **ingen lease** |

> **Öppen fråga 2 (beslut innan bygg):** ska varje HTTP-väg ha en **egen server-ägd
> variant** (t.ex. `markVersionVerifyingOwned(versionId, runId)`) medan de inline
> finalize-anropen behåller dagens signatur, eller ska de muterande funktionerna
> splittras i "owned" vs "unowned"? Default-rekommendation: **alla row-muterande
> verify/repair-vägar tar samma per-version-lease**; finalize + createAndPromote är
> de enda undantagen (inline-ägande vid skapande).

**Cleanup/expiry:** lease-takeover via `lease_expires_at < now()` (§2). FK
`ON DELETE CASCADE` städar job-rader när versionen raderas (ingen wipe-path behöver
röras). Ev. lazy `expired`-städning vid acquire; ingen separat worker krävs för
korrekthet — expiry-villkoret i acquire + guard räcker.

---

## 4. Migration — dev/prod, kompatibilitet, deploy-ordning, rollback

Följer `.cursor/rules/db-env-parity.mdc`.

### 4.1 Backward compatibility (måste hålla)

- Migrationen är **additiv**: ny tabell + index, **inga ändringar** på `engine_versions`.
- **Gammal kod måste fungera med tabellen närvarande** (den ignorerar den bara).
- **Ny kod måste faila säkert** om acquire misslyckas: behandla "fick inte lås" som
  "kör inte" (= dagens beteende när `Set` redan har versionen), aldrig krasch.
- Registrera i `MIGRATION_ORDER` (`scripts/db/run-migrations.ts`) **och** `db-init.mjs`
  så fresh DB + drift-gate (`db:schema-drift`) hålls i synk med `schema.ts`.

### 4.2 Safe deploy-order

```text
1. Merga migrationsfilen + schema.ts (tabellen finns, men ingen kod använder den ännu)
   – ELLER kör migrationen mot DB innan kod-deploy. Tabellen är oanvänd → ofarlig.
2. Kör migration mot DEV (npm run db:migrate, DB_SSL_REJECT_UNAUTHORIZED=false).
3. Ägaren kör migration mot PROD manuellt (pooled prod-URL, DB_ALLOW_PROD_LIKE_WRITE=1)
   – verifiera kolumn/tabell i information_schema efteråt.
4. FÖRST DÄREFTER: deploya koden som börjar acquire:a lås.
```

Schema-före-kod är medvetet: tabellen ska kunna existera utan att gammal kod bryr sig,
och ny kod ska aldrig deployas mot en DB som saknar tabellen.

### 4.3 Prod-policy (denna plan)

- **Ingen automatisk prod-migration.** Agenten kör **endast dev** + tester.
- Ingen `DB_ALLOW_PROD_LIKE_WRITE`, ingen pooled prod-URL till agenten.
- PR:n ska innehålla en **exakt prod-migrationsinstruktion** (kommando, env, verifiering)
  som ägaren kör manuellt efter review, före merge/deploy.

### 4.4 Rollback

- **Kod-rollback:** revert PR → koden slutar acquire:a; tabellen blir oanvänd (ofarlig).
- **Schema-rollback (vid behov):** `DROP TABLE engine_version_jobs;` är säkert *efter*
  att kod som läser den är borttagen. Ingen data i `engine_versions` påverkas.
- Eftersom låset failar mot dagens beteende (Set-only) vid problem, är "stäng av genom
  revert" en ren reträtt utan datatapp.

---

## 5. Testplan

Vitest (CI-gatat), helst utan live-DB via mockad repository-yta + en riktad
integrationsnivå där möjligt:

1. **Concurrent leases, samma version (olika kind):** `acquire(versionId, 'server_verify')`
   och `acquire(versionId, 'manual_repair')` samtidigt → exakt en får lås, den andra
   får `null` (per-version — `kind` påverkar inte unikheten, det stänger verify-vs-repair-racet).
2. **Expired lease takeover:** acquire med utgången `lease_expires_at` → ny ägare får
   låset (och `kind` uppdateras till den nya ägaren).
3. **Fel `run_id` får inte spara:** `saveRepairedFiles(versionId, files, wrongRunId)` →
   returnerar `null`, ingen skrivning. (Det specifika lost-update-skyddet.)
4. **Guard kräver aktiv lease (ej bara run_id):** mutation med rätt `run_id` men
   `status != 'running'` eller `lease_expires_at < now()` → no-op. Med fel `run_id` → no-op.
5. **Single-worker-regression:** hela befintliga server-verify-flödet (ett `versionId`,
   en körning) fungerar oförändrat — promote/fail/repair_available som idag.
6. **Release i `finally`:** efter klar/kastat fel frigörs låset (status≠`running`).
7. **`db:schema-drift` grön:** schema.ts == db-init.mjs == migration.

---

## 6. Alternativ

| Alternativ | För | Emot |
|---|---|---|
| **A. `engine_version_jobs` lease-tabell** (förslaget) | Robust under pooled Postgres; explicit `run_id`-ägarskap; expiry; lätt att observera/debugga; idempotent | Ny tabell + migration + `run_id`-trådning genom flera funktioner |
| B. Postgres **advisory locks** (`pg_try_advisory_lock`) | Ingen tabell; auto-release vid connection-close | **Olämpligt här:** Supabase **pooled/pgbouncer (transaction mode)** delar inte session-scope mellan queries → session-advisory-lås beter sig oförutsägbart. Svårt att resonera om ägarskap/expiry |
| C. **Redis/Upstash lease** (`SET key NX PX`) | Mycket enkel TTL-lease; snabb | Ny dependency i hot path; Redis redan "optional_runtime" (kan saknas) → låset blir best-effort; två sanningskällor (DB-tillstånd + Redis-lås) |
| D. **Lease-kolumner på `engine_versions`** (`verify_lock_run_id`, `verify_lock_expires_at`) | Ingen ny tabell; naturligt per-version | Blandar låsstate med domändata; varje acquire/renew skriver den heta `engine_versions`-raden (mer contention + write-amplification); ingen historik/observability över jobb |

**Varför A:** matchar pooled-Postgres-verkligheten (B faller bort), undviker ny
hot-path-dependency (C), och håller låsstate separerat från domändata + ger jobb-historik
(bättre än D). Lås-**granulariteten är per `version_id`** (inte per `kind`, se §2) så
verify och repair inte kan äga raden samtidigt. Dess svaghet är migrationskostnaden —
men den är additiv och engångs.

---

## 7. Rekommendation

- **Egen P1-PR.** Inte en fortsättning på Plan B (#251) — det är DB + runtime-låsning + repair-flöde.
- **Sekvens:** vänta tills **#251** (och ev. öppna små PR:er **#248/#249/#250**) är mergade,
  så lås-PR:n byggs mot färsk master utan korsberoenden.
- **Bygg dev-migration + tester + rollback-plan först.** Prod-migration körs **manuellt av ägaren**
  enligt §4.2/§4.3 efter review, före merge/deploy.
- **Scope-grind:** detta är korrekthet (inte ett governance-lager) → ligger inom
  `project-phase-priorities.mdc` ("dataförlust/tyst korruption fixas alltid"; här:
  lost-update på reparationer). Men det är fortfarande en arkitekturändring → kräver
  explicit ägar-OK på *denna plan* innan kod.

### Öppna frågor till ägaren (innan bygg)

1. Lease-TTL-värde (förslag: 2–3× typisk verify/repair-tid; med `renew` i loopen).
2. Vilka HTTP-vägar får **egna server-ägda lease-varianter** vs. delar auto-flödets
   per-version-lease (se §3.4)? Förslag: alla row-muterande verify/repair-vägar delar
   per-version-leasen; finalize + `createAndPromoteDraftVersion` undantas (inline-ägande).
3. Bygga nu efter #251-merge, eller parka tills "härda → bygga"-pivoten tar event-bus (B3/E2) samtidigt (samma multi-instans-rot)?
