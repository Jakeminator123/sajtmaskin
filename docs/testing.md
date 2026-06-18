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

| Körläge | Kommando / trigger | Blockerande? |
|---|---|---|
| Lokalt | `npm run test:stability` (innan commit, sekunder) | — |
| PR | jobbet `stability` i CI på `pull_request` | **Nej** — warn-only |
| Push | jobbet `stability` i CI på push till `master` | **Nej** — warn-only |

CI-jobbet är medvetet `continue-on-error` (warn-only) i ett första skede — ett rött
stabilitets-resultat blockerar alltså inte merge ännu. Blockering kopplas in först när lanen
är stabil (separat beslut).

## Skriva en stabilitetstest

- Namnge filen `<namn>.stability.test.ts` (eller `.tsx`) så plockas den upp av lanen.
- Filen körs **bara** av `test:stability`. Den blockerande sviten (`test:ci`) exkluderar
  `*.stability.test.ts(x)` i [`vitest.config.ts`](../vitest.config.ts), så ett flaky
  stability-case kan aldrig fälla `quality`-grinden medan lanen är warn-only.
- Lägg bara till tester enligt disciplinen i [`delivery-bias.md`](delivery-bias.md).
