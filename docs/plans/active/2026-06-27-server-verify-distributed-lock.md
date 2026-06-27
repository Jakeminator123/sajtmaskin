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
implementation_started: false
---

# Plan C / P1 — Distribuerat lås för server-verify & repair

> **Status: PLAN ONLY.** Ingen kod, ingen migration, ingen `engine_version_jobs`-tabell,
> ingen `run_id`-kedja är byggd. Detta dokument är beslutsunderlag. Bygg inget förrän
> ägaren godkänt planen och PR #251 (+ ev. #248/#249/#250) är mergade.

## TL;DR

Bakgrundsjobben **server-verify** och **build-error-repair** dedupliceras idag bara
av en **process-local `Set<string>`** i `src/lib/gen/verify/server-verify.ts`. Appen
körs serverless på Vercel (verifierat, se §1). Under flera samtidiga JS-instanser
räcker inte det: två instanser kan köra verify/repair på *samma* `versionId` parallellt,
och ingen av DB-mutationerna (`markVersionVerifying`, `markVersionRepairing`,
`saveRepairedFiles`, `promoteVersion`) kontrollerar att den anropande körningen
fortfarande äger raden. Förslag: en **Postgres lease-tabell** (`engine_version_jobs`)
som ger ett distribuerat lås per `(version_id, kind)`, plus att repair/verify-mutationerna
börjar bära ett `run_id` och blir no-op om låset bytt ägare. `Set` behålls som lokal
snabbspärr.

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

## 2. Föreslagen modell — `engine_version_jobs` (DB-lease)

Ny tabell (Drizzle i `src/lib/db/schema.ts`):

| Kolumn | Typ | Not |
|---|---|---|
| `id` | uuid PK | |
| `version_id` | text/uuid, FK→`engine_versions.id` | jobbets version |
| `kind` | text enum | `server_verify` \| `build_error_repair` \| `manual_repair` |
| `run_id` | text | ägar-id för denna körning (uuid genererat vid acquire) |
| `status` | text enum | `running` \| `done` \| `failed` \| `expired` |
| `lease_expires_at` | timestamptz | nu + TTL; förnyas av ägaren |
| `created_at` | timestamptz default now() | |
| `updated_at` | timestamptz default now() | |

**Index (kärnan i låset):**

```sql
-- Bara EN aktiv (running, ej utgången) körning per (version_id, kind).
CREATE UNIQUE INDEX engine_version_jobs_active_uq
  ON engine_version_jobs (version_id, kind)
  WHERE status = 'running';
```

**Acquire (atomiskt, idempotent):**

```sql
INSERT INTO engine_version_jobs (id, version_id, kind, run_id, status, lease_expires_at)
VALUES (:id, :versionId, :kind, :runId, 'running', now() + interval '<TTL>')
ON CONFLICT (version_id, kind) WHERE status = 'running'
DO UPDATE SET run_id = EXCLUDED.run_id, lease_expires_at = EXCLUDED.lease_expires_at, updated_at = now()
  WHERE engine_version_jobs.lease_expires_at < now()   -- bara om gammalt lås gått ut
RETURNING run_id;
```

Returneras `run_id` == vårt → vi äger låset. Inget rad-returnerat → någon annan
äger ett färskt lås → **avstå** (no-op). En utgången lease kan tas över (expiry-takeover).

**Release:** vid klar/fel: `UPDATE … SET status='done'|'failed', updated_at=now() WHERE version_id=:v AND kind=:k AND run_id=:runId`.

`Set` behålls som **lokal snabbspärr före DB-rundturen** (billig optimering, inte
korrekthetsgaranti).

---

## 3. Kodvägar som måste bära `run_id`

Mål: ingen verify/repair-mutation får ändra raden om låset bytt ägare.

| Funktion (`src/lib/db/chat-repository-pg.ts`) | Ändring |
|---|---|
| *(ny)* `acquireVersionJobLease(versionId, kind)` | atomisk acquire enligt §2; returnerar `{ runId } \| null` |
| *(ny)* `renewVersionJobLease(versionId, kind, runId)` | förnya `lease_expires_at`; periodiskt anrop i långa loopar |
| *(ny)* `releaseVersionJobLease(versionId, kind, runId, status)` | markera `done`/`failed` |
| `markVersionVerifying(versionId, …)` | + `runId`; `WHERE id=:v` **och** ägarkoll |
| `markVersionRepairing(versionId, …)` | + `runId`; ägarkoll |
| `saveRepairedFiles(versionId, files, …)` | + `runId`; **vägra** om ej ägare (returnera `null`) — stänger lost-update |
| `failVersionVerification` / `markVersionSupersededByRepair` | + `runId`-medveten (får ej skriva över annan ägares terminaltillstånd) |
| `promoteVersion` / `acceptRepair` | behåll `assertPromoteAllowed`-grinden; lägg ägarkoll där server-verify är promotor |

| Anropare (`src/lib/gen/verify/server-verify.ts`) | Ändring |
|---|---|
| `isServerVerifyEligible` | behåll `Set`-snabbkoll; **lägg** DB-acquire som sanning |
| `triggerServerVerification` | acquire-lease → kör → release i `finally`; trådra `runId` till alla mutationer |
| `triggerBuildErrorRepair` | samma; `kind="build_error_repair"` |
| `tryServerRepairLoop` | ta emot `runId`; ev. `renew` mellan pass; skicka `runId` till `saveRepairedFiles` |
| Manuell repair-route (`/api/engine/chats/[chatId]/repair`) | `kind="manual_repair"`; samma lease |

**Cleanup/expiry:** lease-takeover via `lease_expires_at < now()` (§2). Ev. en
lättviktig städning (cron eller lazy vid acquire) som sätter utgångna `running` → `expired`.
Ingen separat worker krävs för korrekthet — expiry-villkoret i acquire räcker.

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

1. **Concurrent jobs, samma version:** två `acquire(versionId, 'server_verify')` →
   exakt en får lås, den andra får `null` (no-op).
2. **Expired lease takeover:** acquire med utgången `lease_expires_at` → ny ägare får låset.
3. **Fel `run_id` får inte spara:** `saveRepairedFiles(versionId, files, wrongRunId)` →
   returnerar `null`, ingen skrivning. (Det specifika lost-update-skyddet.)
4. **Ägar-mutationer:** `markVersionVerifying/Repairing` med fel `run_id` → no-op.
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
| D. **Lease-kolumner på `engine_versions`** (`verify_lock_run_id`, `verify_lock_expires_at`) | Ingen ny tabell; allt på en rad | Blandar låsstate med domändata; svårare att ha flera `kind` per version; mer rad-contention |

**Varför A:** matchar pooled-Postgres-verkligheten (B faller bort), undviker ny
hot-path-dependency (C), och håller låsstate separerat från domändata (bättre än D).
Dks svaghet är migrationskostnaden — men den är additiv och engångs.

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
2. Ska `manual_repair` (HTTP-route) dela samma lease som auto-flödena? (Förslag: ja, samma `(version_id, kind)`-modell.)
3. Bygga nu efter #251-merge, eller parka tills "härda → bygga"-pivoten tar event-bus (B3/E2) samtidigt (samma multi-instans-rot)?
