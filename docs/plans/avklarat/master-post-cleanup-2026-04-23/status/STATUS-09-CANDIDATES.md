# STATUS-09 KANDIDATLISTA — orkestrator-scan av deprecated/legacy-rester

**Datum:** 2026-04-23
**Producerad av:** orkestrator-agent (denna chatt) under plan-02-väntan
**Syfte:** Ge plan-09-agenten en färdig startlista. Inga filer modifieras här — bara dokumentation.

> Kompletterar `STATUS-04-AUDIT.md` (fixer-yta) och plan 04-agentens 5 tombstones (`plan-09`-kommentarer redan i koden).

## Skansningsmetod

`@deprecated`-markörer + `legacy*` exports + `compat shim`-mönster i `src/`. Filtrerat bort sådant som **rör pågående plan-02/03/05/06/07-territorium** för att undvika merge-friktion när plan 09 körs.

## Säkra kandidater (ingen pågående plan rör dessa)

### Tier A — V0 Platform-rester (helt borttagen integration, bara stubs kvar)

| Fil | Vad | Förslag |
|---|---|---|
| `src/app/api/v0/integrations/vercel/projects/route.ts` | 3 endpoint-stubs som returnerar 501 ("V0 Platform integration removed") | **Radera hela filen** + ev. routes-mappen om tom. Inga interna importer fanns vid scan. |
| `src/app/api/v0/projects/[projectId]/env-vars/route.ts` | Stub: "V0 Platform env sync removed; app-project env vars are stored locally." | **Radera filen** + verifiera att inga klienter pingar `/api/v0/...`-pathen. |

### Tier B — `demoUrl` deprecated, `previewUrl` är canonical

Tre callsites där `demoUrl` lever kvar som backward-compat:

| Fil | Rad | Status |
|---|---|---|
| `src/lib/hooks/chat/types.ts` | 130-131 | `demoUrl?: string \| null` (deprecated, prefer previewUrl) |
| `src/lib/webhooks.ts` | 39-40 | Inbound webhook payload accepts both during dual-key phase |
| `src/lib/project-client.ts` | 120-121 | API response contains both fields |

**Förslag:** Lås in dual-key-perioden — sätt en deadline-kommentar (`// TODO(plan-09): drop demoUrl after 2026-Q3 if no inbound payloads carry it`). Logga `demoUrl`-träffar i webhooks under en period; om noll → radera.

### Tier C — `plan/schema.ts` legacy

| Fil | Rad | Status |
|---|---|---|
| `src/lib/gen/plan/schema.ts` | 11 | `PlanPhaseLegacy` (kept for backward compat with stored artifacts) |
| `src/lib/gen/plan/schema.ts` | 97-98 | `family?: string` (legacy alias for `id`) |

**Förslag:** Sök i DB-data om `polish` eller `family` används aktivt. Om inte → radera.

### Tier D — `env-local.ts` per-tier loaders

| Fil | Rad | Status |
|---|---|---|
| `src/lib/gen/preview/env-local.ts` | 170-171 | Function deprecated in favor of per-tier loaders |

**Förslag:** Hitta callsites med `rg`. Migrera + radera.

### Tier E — `post-checks-results.ts` rename

| Fil | Rad | Status |
|---|---|---|
| `src/lib/hooks/chat/post-checks-results.ts` | 67-68 | `qualityGatePending` deprecated → renamed `verifyPending` |

**Förslag:** Migrera klienter, deprecate hela fältet. Tier B-mönstret.

## Kandidater som plan 02/03/05 KAN landa i — vänta tills wave 3

Dessa **rör pågående agentterritorium** — plan-09-agenten ska INTE öppna dem förrän wave 3 är mergad:

- `src/lib/gen/preview/legacy/` (hela mappen — compat shim + URL helpers)
  - Importerad av: `useBuilderCallbacks.ts`, `PreviewPanel.tsx`, `useSendMessage.ts`, `useBuilderPageController` indirekt
  - Plan 02 rör `PreviewPanel.tsx`. Vänta.
- `src/lib/gen/autofix/repair-generated-files.ts` — `@deprecated AutoFixEntry` typ-alias (plan 04 har redan tombstone på filnivå)
  - Plan 05 kan röra denna under konsolidering. Vänta tills wave 2 mergat.
- `src/lib/gen/autofix/pipeline.ts:49` — samma `AutoFixEntry`-alias
  - Plan 05-territorium. Vänta.

## Kandidater som behöver mer data innan beslut

- `src/lib/gen/scaffolds/README.md` nämner `family` som "äldre docs kan fortfarande nämna" — kolla om scaffolds har stored artifacts som bär `family` istället för `id`.
- `src/lib/deploy/dependency-utils.ts:15` — kommentar "Legacy individual Radix UI primitives (kept for backward compat with older scaffolds)" — om alla nuvarande scaffolds använder samlad import, fasa ut.

## Sammanfattning för plan-09-prompten

| Tier | Antal | Risk | Effort |
|---|---|---|---|
| A (radera direkt) | 2 filer | låg | låg |
| B (deadline + drop) | 3 callsites | låg | medel (kräver telemetri) |
| C (DB-scan + radera) | 2 fält | medel | medel |
| D (callsite-migration) | 1 funktion | medel | medel |
| E (rename + drop) | 1 fält | låg | låg |
| **Vänta-tier** | 3 areas | n/a | n/a |
| **Behöver mer data** | 2 areas | n/a | låg-medel |

Plan-09-agenten ska behandla denna lista som kandidater, inte order. Slutbedömning per fall.
