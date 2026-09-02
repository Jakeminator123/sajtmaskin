# Testning

Repots tester körs med [Vitest](https://vitest.dev). Den fulla sviten
(`npm run test:ci`) är `vitest run` och ingår i den tunga profilen i
[`.github/workflows/ci.yml`](../.github/workflows/ci.yml): ready runtime,
högrisk-PR:ar och `master`. Bevisat safe docs och vanliga drafts får i stället
ett explicit light-kvitto; required checknamn publiceras fortfarande för varje
PR-head. Godnatt-buggs egna skripttester (`npm run test:godnatt-bugg`) är
on-demand och ingår inte i `test:ci`, CI eller `verify:pr`. Ovanpå den finns två
smalare testlanes och ett separat E2E-discoverykontrakt:

| Lane                      | Kommando                          | Filnamn                                  | Blockerar merge?                     |
| ------------------------- | --------------------------------- | ---------------------------------------- | ------------------------------------ |
| Full svit                 | `npm run test:ci`                 | `*.test.ts(x)`                           | **Ja i tung profil** (`quality`)     |
| E2E-kontrakt              | `npm run test:e2e:contract`       | `e2e/**/*.smoke.spec.ts`                 | **Ja i tung profil** (`quality`)     |
| Deterministisk stabilitet | `npm run test:stability:blocking` | allowlist i `check-contract.mjs`         | **Ja i tung profil** (`quality`)     |
| Bred stabilitets-lane     | `npm run test:stability`          | `*.stability.test.ts(x)`                 | Nej — warn-only (`stability`-jobbet) |
| DB-backad                 | `npm run test:postgres`           | `*.postgres.test.ts`                     | **Ja** (steg i `quality`)            |

Den fulla sviten körs **utan databas**, med flit — se `test:postgres` nedan.
E2E-kontraktet kör Playwrights `--list`: det kompilerar och discoverar sviten
utan browser eller nätverk. Själva deploy-smoken är fortsatt separat.

## Vilka CI-jobb blockerar faktiskt merge

Ett jobb som failar hårt är inte samma sak som ett jobb som **hindrar merge** — det senare
kräver att jobbnamnet står som required status check i master-rulesetet. Tabellen beskriver
repots avsedda kontrakt och en historisk snapshot (verifierad mot rulesetet `Protect master`
2026-07-31 via `gh api repos/.../rules/branches/master`). GitHub-inställningar kan drifta:
mergeagenten måste därför live-verifiera aktuellt ruleset och checks för exakt head-SHA före
varje merge; snapshoten nedan är aldrig ensam mergeauktoritet.

| Jobb                          | Failar hårt?                                                                         | Required (blockerar merge)?                                  |
| ----------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------ |
| `quality`                     | Ja                                                                                   | **Ja**                                                       |
| `backoffice-tests`            | Ja                                                                                   | **Ja**                                                       |
| `schema-drift`                | Ja                                                                                   | **Ja**                                                       |
| `review-window`               | Checken kan bli `action_required` vid väntan; orchestrator-jobbet ska då sluta grönt | **Ja** — det är checken, inte jobbets exitkod, som blockerar |
| `build`                       | Ja                                                                                   | **Ja** — tillagd i rulesetet 2026-07-30 (#660)               |
| `preview-host-guards`         | Ja                                                                                   | **Ja, via `quality`-aggregatet**                             |
| `dead-code` (orphan-filgrind) | Ja                                                                                   | **Ja, via `quality`-aggregatet**                             |
| `db-blob-sync`                | Ja                                                                                   | Nej — och på PR körs den utan credentials (ren script-smoke) |
| `stability`                   | Nej (`continue-on-error`)                                                            | Nej — den deterministiska subseten blockerar via `quality`   |

`db-blob-sync` är fortsatt en separat, icke-required hård kontroll. Preview-host och
orphan-filgrinden är däremot transitivt blockerande eftersom den required checken
`quality` inte blir grön om något av jobben är rött.

## Build-grinden

I den tunga profilen kör `build`-jobbet `npm run build` (som i sin tur kör
`prebuild`: `preflight:common` + `scaffolds:embeddings:check`) **utan secrets**.
Det finns för att `next build` annars inte körs någonstans före merge:
preview-deployer är avstängda i
[`vercel.json`](../vercel.json) (`deploymentEnabled` bara för `master`), så första riktiga
bygget av en ändring var prod-deployen efter merge. typecheck och lint täcker inte
build-tidsfel som route-config, RSC-gränser eller prerender-fel.

Bygget är verifierat nyckelfritt — behöver det plötsligt en secret är det en regression i
env-hanteringen, inte ett skäl att ge jobbet credentials.

## `test:stability` — stabilitets-lane

En liten, snabb lane som låser **större buggar och UX-invarianter** — inte en bred
regressionssvit. Den kör två saker, i ordning:

1. `npm run db:schema-drift` — deterministisk, nyckelfri (kräver ingen DB) gate som låser att
   avsett schema (`src/lib/db/schema.ts`) matchar applicerat (`db-init` + migrations).
2. Kuraterade stabilitetstester via egen vitest-config ([`vitest.stability.config.ts`](../vitest.stability.config.ts)):
   filer som heter `*.stability.test.ts(x)`.

Lanen kör grönt även med **noll** stabilitetstester (`--passWithNoTests`). Testfallen läggs
in efter hand (t.ex. aktivitet S2/S3) och varje fall ska peka på sin källa (se
[`delivery-bias.md`](delivery-bias.md)).

## Två CI-lägen: hård gate vs warn-only

`db:schema-drift` och den bredare vitest-stabilitets-lanen har **olika** blockerings-status i CI
(grandmaster S4):

| Del                                                                   | CI-jobb                                                                                            | Trigger                                                                                          | Blockerande?                               | Varför                                                                                                                                                                                                                                          |
| --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `db:schema-drift`                                                     | `schema-drift`                                                                                     | push + PR mot `master`                                                                           | **Ja** — hård gate                         | Deterministisk, nyckelfri, billig → trygg att blockera                                                                                                                                                                                          |
| Deterministisk `*.stability.test.*`-allowlist                         | `quality` (`quality-core`-steget `test:stability:blocking`)                                        | tung profil (ready/runtime/högrisk/`master`)                                                     | **Ja** — hård gate                         | Alla nuvarande stability-filer är hermetiska (ingen nätverk/DB/väggklocka); allowlisten ägs av `scripts/workflow/check-contract.mjs`                                                                                                                                                                           |
| Bredare stabilitets-lane (`*.stability.test.ts(x)` + ordlista-check)  | `stability`                                                                                        | push + PR mot `master`                                                                           | **Nej** — warn-only                        | Jobbet förblir `continue-on-error` så en ny oklassificerad/flaky fil inte kan blockera innan den tas in i allowlisten                                                                                                                                                                                           |
| Extern review + live-sign-off                                         | `review-window`                                                                                    | Betrodd default-branch-controller mot exakt PR-head                                              | **Ja** — required check                    | Väntar på övriga required checks, minst 7 min och reviewkvitton; blir först därefter grön när mänsklig sign-off + label matchar live head/base och är nyare än senaste botfynd. Master-rörelse publicerar `action_required` på oförändrad head. |
| Prod-migrationer (`scripts/db/migrate-prod.mjs`)                      | `prod-migrations-apply`                                                                            | push till `master` + manuell dispatch (aldrig PR — prod-secret injiceras inte på `pull_request`) | Gate:ad bakom `quality` + `schema-drift`   | Migrationer körs inte av Vercel-deployen; idempotent + bokför `schema_migrations`-ledgern                                                                                                                                                       |
| Ledger-verifiering (`scripts/db/check-migrations-applied.mjs`)        | `prod-migrations-applied`                                                                          | efter `prod-migrations-apply`                                                                    | Post-condition (skippas när apply skippas) | Verifierar att prod-ledgern täcker alla migrationsfiler — fångar tyst missad apply                                                                                                                                                              |
| Dev-synk + live schema-paritet (`scripts/db/check-schema-parity.mjs`) | `db-schema-parity`                                                                                 | efter `prod-migrations-apply` (aldrig PR — secrets injiceras inte på `pull_request`)             | Hård gate på trusted events                | Auto-applicerar migrationer + perf-index mot **dev**-DB:n och jämför sedan de två LEVANDE databaserna objekt för objekt — fångar dashboard-DDL och halvlyckade applies som ledger-checkarna inte ser                                            |
| Schemalagd paritets-vakt (samma skript, read-only)                    | `db-schema-parity-scheduled` ([`db-schema-parity.yml`](../.github/workflows/db-schema-parity.yml)) | cron dagligen + manuell dispatch                                                                 | Hård gate (rött = verklig drift)           | Fångar drift som uppstår **mellan** master-pushar, t.ex. manuell DDL i Supabase-dashboarden                                                                                                                                                     |

- Det blockerande `schema-drift`-jobbet kör enbart `npm run db:schema-drift` (utan `continue-on-error`).
  Ett rött resultat stoppar push/PR/merge → fångar t.ex. tabell/index som finns i `schema.ts`
  men saknas i `db-init.mjs` (tyst drift på nya miljöer).
- Det `stability`-jobbet är medvetet `continue-on-error` (warn-only) — kör hela `npm run test:stability`
  plus ordlista-checken. Ett rött resultat där blockerar inte merge. Den deterministiska
  allowlisten körs separat som `test:stability:blocking` i `quality-core` och blockerar.

| Körläge | Kommando / trigger                                | Blockerande?                           |
| ------- | ------------------------------------------------- | -------------------------------------- |
| Lokalt  | `npm run test:stability:blocking`                 | —                                      |
| Lokalt  | `npm run test:stability` (innan commit, sekunder) | —                                      |
| PR      | jobbet `schema-drift` på `pull_request`           | **Ja** — hård gate (bara schema-drift) |
| PR      | `test:stability:blocking` i `quality-core`        | **Ja** — hård gate (allowlist)         |
| PR      | jobbet `stability` på `pull_request`              | **Nej** — warn-only (bred lane)        |
| Push    | jobbet `schema-drift` på push till `master`       | **Ja** — hård gate (bara schema-drift) |
| Push    | `test:stability:blocking` i `quality-core`        | **Ja** — hård gate (allowlist)         |
| Push    | jobbet `stability` på push till `master`          | **Nej** — warn-only (bred lane)        |

## Dokumentations- och kontraktsgates

Dokumentation verifieras bottom-up i samma `quality`-jobb som kodkontrakten:

| Kontroll                    | Roll                                                                                                                                                 | Kommando                       |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| Genererade kontraktsdocs    | Blockerar om committed projektioner avviker från runtimeägare, schemas, registries eller policies                                                    | `npm run docs:check`           |
| Aktiva dokumentationslänkar | Blockerar brutna relativa paths i aktiva Markdown-ytor; historiska källfiler ligger utanför den blockerande mängden                                  | `npm run docs:links`           |
| Terminologi-ownership       | Blockerar parallella glossary-paths, dubletter och uttryckligen förbjudna legacyalias                                                                | `npm run check:terms:contract` |
| Generator-/guardtester      | Blockerar regressioner i docs-generatorer och kontroller                                                                                             | `npm run docs:test`            |
| Bug-backloggens format      | Blockerar avbockade `[x]`-rader kvar i Aktiv kö, rader som motsäger sin egen status, saknade/återbrukade `SM-###`-ID och saknade kanoniska sektioner | `npm run check:bug-backlog`    |
| Bred termtäckning           | Rådgivande signal; historikytor ingår inte                                                                                                           | `npm run check:terms`          |

Bug-backlog-checken låg tidigare inuti `preflight:common` och därmed även i Vercels
`prebuild` — en bokföringsmiss i en markdown-fil kunde alltså fälla **prod-bygget** (hänt:
#368). Den är blockerande på PR precis som förut, men ligger utanför build-kedjan.

Ändra först den kanoniska ägaren. Kör därefter eventuell generator och sist
kontrollerna. Redigera inte en generated-fil manuellt för att få CI grön.

## `test:postgres` — DB-backad lane (riktig databas)

En tredje lane för kontrakt som **bara** kan bevisas mot en riktig Postgres:
DB-genererade kolumner, triggers, index och SQL som en mock per definition inte
kan verifiera. Filnamn: `<namn>.postgres.test.ts`.

Första fallet är `files_revision` (`scripts/db/files-revision-contract.postgres.test.ts`):
kolumnen är `GENERATED ALWAYS AS (md5(files_json)) STORED`, så en mock kan bevisa
att Drizzle _formulerar_ en subselect men aldrig att Postgres räknar om värdet.

Andra fallet är läsarsidan av samma primitiv
(`scripts/db/content-revision-readers.postgres.test.ts`): revisionsgrinden i
kvittots UPDATE och verdikt-läsarens radval. Den bevisar också att Postgres'
`md5()` och Nodes `createHash("md5")` ger samma värde — antagandet hela
jämförelsen står på, och något en mock aldrig kan visa.

### Varför en egen lane och inte bara en env-variabel

`test:ci` körs **medvetet utan databas**, och flera tester verifierar just att
appen degraderar snyggt när den saknas. Sätter man `POSTGRES_URL` för hela
`quality`-jobbet ändras förutsättningen för dem tyst. Lanen håller den
skiljelinjen i konfigurationen i stället för i en miljövariabel.
`vitest.config.ts` exkluderar globen; `vitest.postgres.config.ts` kör bara den.

### Säkerhet — dessa tester SKRIVER rader

| Skydd                              | Mekanism                                                                                                   |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Vägrar allt utom en dev-target     | Repots egen `scripts/db/check-db-env-target.mjs` (`expect: "dev"`). En prod-URL ger SKIP, inga skrivningar |
| Skippar rent utan databas (lokalt) | Utvecklare utan `.env.local` får inte ett rött test för en databas de inte har                             |
| Städar efter sig                   | Skriv allt under en `engine_chats`-rad och radera den i `afterAll` — resten hänger i `ON DELETE CASCADE`   |

### Två spärrar mot false-green

Vitest avslutar med **0** för skippade tester, så en försvunnen databas i CI hade
gett en grön grind utan att något bevisats. Därför:

| Spärr                                   | Vad den stoppar                                                                                                              |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `REQUIRE_POSTGRES_TESTS=1` (sätts i CI) | Ett **hopp** räknas som fel i stället för att passera tyst                                                                   |
| **Inget** `--passWithNoTests` på lanen  | En **omdöpt eller borttagen** fil faller på "No test files found". Filens egen grind kan bara larma om filen faktiskt laddas |

Stability-lanen har `--passWithNoTests` eftersom den legitimt kan vara tom. Den
här lanen får inte vara det — kopiera inte flaggan hit.

### Var databasen kommer ifrån

| Läge                  | Databas                                                                                                                      |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Lokalt                | Dev-Supabase via `.env.local` (testet laddar filen självt)                                                                   |
| CI (`quality`-jobbet) | Efemär vanilla `postgres:16` (ingen Supabase-`service_role`) + `POSTGRES_HOST_AUTH_METHOD=trust`, följd av `npm run db:init` |

`db:init` skapar `service_role` som `NOLOGIN` så `CREATE POLICY … TO postgres, service_role` kan köras; testerna ansluter fortfarande som `postgres`. Healthcheck är `pg_isready -U postgres` — utan `-U` loggar containern `FATAL: role "root" does not exist` var 10:e sekund under hela jobbet (inte bara i starten). `trust` är medvetet: efemär localhost-container, och ett inbäddat lösenord i en committad fil är det mönster GitGuardian flaggar.

Dev-Supabase används **inte** i CI: varje PR hade skrivit i en delad databas och
samtidiga PR:er kunnat kollidera.

```powershell
npm run test:postgres    # kräver en dev-POSTGRES_URL, annars skippas den
```

## Skriva en stabilitetstest

- Namnge filen `<namn>.stability.test.ts` (eller `.tsx`) så plockas den upp av lanen.
- Filen körs **bara** av `test:stability`. Den blockerande sviten (`test:ci`) exkluderar
  `*.stability.test.ts(x)` i [`vitest.config.ts`](../vitest.config.ts), så ett flaky
  stability-case kan aldrig fälla `quality`-grinden medan lanen är warn-only.
- Lägg bara till tester enligt disciplinen i [`delivery-bias.md`](delivery-bias.md).
