# Testning

Repots tester körs med [Vitest](https://vitest.dev). Den fulla sviten (`npm run test:ci`)
körs på varje PR och push via [`.github/workflows/ci.yml`](../.github/workflows/ci.yml).
Ovanpå den finns en **kuraterad, snabb stabilitets-lane**.

## Vilka CI-jobb blockerar faktiskt merge

Ett jobb som failar hårt är inte samma sak som ett jobb som **hindrar merge** — det senare
kräver att jobbnamnet står som required status check i master-rulesetet. Tabellen är den
kanoniska bilden av skillnaden (verifierad mot rulesetet `Protect master` 2026-07-29):

| Jobb | Failar hårt? | Required (blockerar merge)? |
| --- | --- | --- |
| `quality` | Ja | **Ja** |
| `backoffice-tests` | Ja | **Ja** |
| `schema-drift` | Ja | **Ja** |
| `review-window` | Håller pending | **Ja** |
| `build` | Ja | Nej — nytt jobb 2026-07-29, required är ett separat rulesetbeslut |
| `preview-host-guards` | Ja | Nej |
| `dead-code` (orphan-filgrind) | Ja | Nej |
| `db-blob-sync` | Ja | Nej — och på PR körs den utan credentials (ren script-smoke) |
| `stability` | Nej (`continue-on-error`) | Nej |

De fyra icke-required jobben som ändå failar hårt syns röda på PR:en men stoppas bara av
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

## Skriva en stabilitetstest

- Namnge filen `<namn>.stability.test.ts` (eller `.tsx`) så plockas den upp av lanen.
- Filen körs **bara** av `test:stability`. Den blockerande sviten (`test:ci`) exkluderar
  `*.stability.test.ts(x)` i [`vitest.config.ts`](../vitest.config.ts), så ett flaky
  stability-case kan aldrig fälla `quality`-grinden medan lanen är warn-only.
- Lägg bara till tester enligt disciplinen i [`delivery-bias.md`](delivery-bias.md).
