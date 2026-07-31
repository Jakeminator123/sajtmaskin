# Testning

Repots tester körs med [Vitest](https://vitest.dev). Den fulla sviten (`npm run test:ci`)
körs på varje PR och push via [`.github/workflows/ci.yml`](../.github/workflows/ci.yml).
Ovanpå den finns två smalare lanes:

| Lane | Kommando | Filnamn | Blockerar merge? |
|---|---|---|---|
| Full svit | `npm run test:ci` | `*.test.ts(x)` | **Ja** (`quality`) |
| Stabilitet | `npm run test:stability` | `*.stability.test.ts(x)` | Nej — warn-only |
| DB-backad | `npm run test:postgres` | `*.postgres.test.ts` | **Ja** (steg i `quality`) |

Den fulla sviten körs **utan databas**, med flit — se `test:postgres` nedan.

## Vilka CI-jobb blockerar faktiskt merge

Ett jobb som failar hårt är inte samma sak som ett jobb som **hindrar merge** — det senare
kräver att jobbnamnet står som required status check i master-rulesetet. Tabellen är den
kanoniska bilden av skillnaden (verifierad mot rulesetet `Protect master` 2026-07-31 via
`gh api repos/.../rules/branches/master`):

| Jobb | Failar hårt? | Required (blockerar merge)? |
| --- | --- | --- |
| `quality` | Ja | **Ja** |
| `backoffice-tests` | Ja | **Ja** |
| `schema-drift` | Ja | **Ja** |
| `review-window` | Håller pending | **Ja** |
| `build` | Ja | **Ja** — tillagd i rulesetet 2026-07-30 (#660) |
| `preview-host-guards` | Ja | Nej |
| `dead-code` (orphan-filgrind) | Ja | Nej |
| `db-blob-sync` | Ja | Nej — och på PR körs den utan credentials (ren script-smoke) |
| `stability` | Nej (`continue-on-error`) | Nej |

De tre icke-required jobben som ändå failar hårt syns röda på PR:en men stoppas bara av
agent-/människodisciplin. Det är ett medvetet men **öppet** läge: se raden om CI-grindarnas
required-status i [`BUG-SWARM-BACKLOG.md`](../BUG-SWARM-BACKLOG.md) → "Beslut & policy".

## Build-grinden

`build`-jobbet kör `npm run build` (som i sin tur kör `prebuild`: `preflight:common` +
`scaffolds:embeddings:check`) **utan secrets**. Det finns för att `next build` annars inte
körs någonstans före merge: preview-deployer är avstängda i
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

| Del | CI-jobb | Trigger | Blockerande? | Varför |
|---|---|---|---|---|
| `db:schema-drift` | `schema-drift` | push + PR mot `master` | **Ja** — hård gate | Deterministisk, nyckelfri, billig → trygg att blockera |
| Bredare stabilitets-lane (`*.stability.test.ts(x)`) | `stability` | push + PR mot `master` | **Nej** — warn-only | Kan vara flaky medan lanen stabiliseras |
| Extern review-fönster | `review-window` | PR mot `master` | **Ja** — required check | Pending tills PR:en är ≥ 7 min och kända externa botar för head-SHA:n är klara (10 min cap) — teknisk enforcement av merge-gaten i `pr-merge-review-gate.mdc` |
| Prod-migrationer (`scripts/db/migrate-prod.mjs`) | `prod-migrations-apply` | push till `master` + manuell dispatch (aldrig PR — prod-secret injiceras inte på `pull_request`) | Gate:ad bakom `quality` + `schema-drift` | Migrationer körs inte av Vercel-deployen; idempotent + bokför `schema_migrations`-ledgern |
| Ledger-verifiering (`scripts/db/check-migrations-applied.mjs`) | `prod-migrations-applied` | efter `prod-migrations-apply` | Post-condition (skippas när apply skippas) | Verifierar att prod-ledgern täcker alla migrationsfiler — fångar tyst missad apply |

- Det blockerande `schema-drift`-jobbet kör enbart `npm run db:schema-drift` (utan `continue-on-error`).
  Ett rött resultat stoppar push/PR/merge → fångar t.ex. tabell/index som finns i `schema.ts`
  men saknas i `db-init.mjs` (tyst drift på nya miljöer).
- Det `stability`-jobbet är medvetet `continue-on-error` (warn-only) — kör hela `npm run test:stability`
  men ett rött vitest-resultat blockerar inte merge ännu. Blockering av vitest-delen kopplas in först
  när lanen är stabil (separat beslut).

| Körläge | Kommando / trigger | Blockerande? |
|---|---|---|
| Lokalt | `npm run test:stability` (innan commit, sekunder) | — |
| PR | jobbet `schema-drift` på `pull_request` | **Ja** — hård gate (bara schema-drift) |
| PR | jobbet `stability` på `pull_request` | **Nej** — warn-only (vitest-delen) |
| Push | jobbet `schema-drift` på push till `master` | **Ja** — hård gate (bara schema-drift) |
| Push | jobbet `stability` på push till `master` | **Nej** — warn-only (vitest-delen) |

## Dokumentations- och kontraktsgates

Dokumentation verifieras bottom-up i samma `quality`-jobb som kodkontrakten:

| Kontroll | Roll | Kommando |
| --- | --- | --- |
| Genererade kontraktsdocs | Blockerar om committed projektioner avviker från runtimeägare, schemas, registries eller policies | `npm run docs:check` |
| Aktiva dokumentationslänkar | Blockerar brutna relativa paths i aktiva Markdown-ytor; historiska källfiler ligger utanför den blockerande mängden | `npm run docs:links` |
| Terminologi-ownership | Blockerar parallella glossary-paths, dubletter och uttryckligen förbjudna legacyalias | `npm run check:terms:contract` |
| Generator-/guardtester | Blockerar regressioner i docs-generatorer och kontroller | `npm run docs:test` |
| Bug-backloggens format | Blockerar avbockade `[x]`-rader kvar i Aktiv kö och rader som motsäger sin egen status | `npm run check:bug-backlog` |
| Bred termtäckning | Rådgivande signal; historikytor ingår inte | `npm run check:terms` |

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
att Drizzle *formulerar* en subselect men aldrig att Postgres räknar om värdet.

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

| Skydd | Mekanism |
|---|---|
| Vägrar allt utom en dev-target | Repots egen `scripts/db/check-db-env-target.mjs` (`expect: "dev"`). En prod-URL ger SKIP, inga skrivningar |
| Skippar rent utan databas (lokalt) | Utvecklare utan `.env.local` får inte ett rött test för en databas de inte har |
| Städar efter sig | Skriv allt under en `engine_chats`-rad och radera den i `afterAll` — resten hänger i `ON DELETE CASCADE` |

### Två spärrar mot false-green

Vitest avslutar med **0** för skippade tester, så en försvunnen databas i CI hade
gett en grön grind utan att något bevisats. Därför:

| Spärr | Vad den stoppar |
|---|---|
| `REQUIRE_POSTGRES_TESTS=1` (sätts i CI) | Ett **hopp** räknas som fel i stället för att passera tyst |
| **Inget** `--passWithNoTests` på lanen | En **omdöpt eller borttagen** fil faller på "No test files found". Filens egen grind kan bara larma om filen faktiskt laddas |

Stability-lanen har `--passWithNoTests` eftersom den legitimt kan vara tom. Den
här lanen får inte vara det — kopiera inte flaggan hit.

### Var databasen kommer ifrån

| Läge | Databas |
|---|---|
| Lokalt | Dev-Supabase via `.env.local` (testet laddar filen självt) |
| CI (`quality`-jobbet) | Efemär `postgres:16`-service som föds och dör med jobbet, `POSTGRES_HOST_AUTH_METHOD=trust` (inget lösenord i en committad fil), följd av `npm run db:init` |

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
