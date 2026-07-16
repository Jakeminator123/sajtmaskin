# Testning

Repots tester körs med [Vitest](https://vitest.dev). Den fulla sviten (`npm run test:ci`)
körs på varje PR och push via [`.github/workflows/ci.yml`](../.github/workflows/ci.yml).
Ovanpå den finns en **kuraterad, snabb stabilitets-lane**.

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
| Bred termtäckning | Rådgivande signal; historikytor ingår inte | `npm run check:terms` |

Ändra först den kanoniska ägaren. Kör därefter eventuell generator och sist
kontrollerna. Redigera inte en generated-fil manuellt för att få CI grön.

## Skriva en stabilitetstest

- Namnge filen `<namn>.stability.test.ts` (eller `.tsx`) så plockas den upp av lanen.
- Filen körs **bara** av `test:stability`. Den blockerande sviten (`test:ci`) exkluderar
  `*.stability.test.ts(x)` i [`vitest.config.ts`](../vitest.config.ts), så ett flaky
  stability-case kan aldrig fälla `quality`-grinden medan lanen är warn-only.
- Lägg bara till tester enligt disciplinen i [`delivery-bias.md`](delivery-bias.md).
