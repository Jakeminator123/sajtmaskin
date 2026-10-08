# DB-migrationer: uttrycklig apply, läsande automatik

Workflow-ägare: [CI](../../.github/workflows/ci.yml),
[schemalagd paritet](../../.github/workflows/db-schema-parity.yml),
[hook-installation](../../scripts/dev/install-git-hooks.mjs) och
[dev-start](../../scripts/dev/predev.mjs). Kort agentregel:
[db-env-parity](../../.cursor/rules/db-env-parity.mdc).

## Gränsen mellan kod och databas

Vercel Preview och Development använder **samma DEV-Postgres** enligt
[`config/db-targets.json`](../../config/db-targets.json). Production använder
PROD. Lokal utveckling använder DEV eller en lokal throwaway-databas.
Preview testar därför med DEV-konton och DEV-data. Redis och Blob kan fortfarande
vara gemensamma; databasgränsen isolerar inte alla externa resurser.

Git-push, checkout, pull, rebase, dev-start och vanlig CI-dispatch är **inte**
migrationsmandat. De får inte automatiskt applicera migrationer, reparera data
eller skapa prestandaindex. Vercel-deploy kör inte heller migrationer.

## Automatiska kontroller

| Ingång                       | Vad händer?                                                                                                                                  |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `pre-push`                   | Fail-closed `verify:pr --plan`; ingen DB-apply.                                                                                              |
| Git-posthooks                | De tre tidigare managed DB-posthookarna pensioneras av `hooks:install`. Främmande/nyare hooks stoppar installationen; de rörs inte.          |
| Dev-start                    | `next-runner` kör `ensure-schema --check-only --soft --quiet-ok` i bakgrunden. Drift varnar men stoppar inte servern.                        |
| Cursor-molnstart             | Samma read-only/soft-kontroll, ingen DB-init.                                                                                                |
| `pretest:postgres`           | `ensure-schema --check-only --quiet-ok`; drift stoppar testlanen. CI initierar sin separata, efemära testdatabas uttryckligt innan testerna. |
| CI `prod-migrations-applied` | Läser prod-ledgern efter credential- och målguard. Kör på betrodda `preview`/`master` push/dispatch, aldrig med secrets på PR.               |
| CI `db-schema-parity`        | Jämför dev och prod **read-only**. Ingen dev-synk eller indexering.                                                                          |
| Vercel `prebuild`            | `db:check-target --vercel` verifierar alla DB-URL:er mot miljömappningen. Preview/Development kräver DEV och Production kräver PROD.         |
| Schemalagd paritet           | Daglig läsande kontroll. Schedule från defaultbranchen tillåts men checkar ut `master`; manuell non-master-dispatch nekas före secrets.      |

På huvudrepot är saknade DB-secrets ett fel, inte ett grönt kvitto. Forkar
utan secrets kan rapportera skip. Läskontrollernas röda resultat döljs inte:
pending migrationer eller avsiktlig dev/prod-skillnad behöver inspekteras och
en separat DB-plan. Ett grönt PR-jobb utan live-creds är inte live-DB-bevis.

`npm run hooks:install` behövs efter workflowuppdatering. Endast de tre
exakta gamla markerägda DB-hookkropparna ersätts efter att alla kopierats
till en avgränsad temporär återställningsmapp. Passiva versionsmärkta stoppfiler
kör bara `exit 0`: äldre checkouts får inte återskapa de aktiva hookarna.
`pre-push` behålls.
Länkade worktrees delar normalt hookkatalogen; äldre checkouts får inte
nedgradera den nyare hooken.

## Uttryckliga kommandon

Verifiera alltid målet först med `npm run db:check-target -- --expect=dev|prod`.
Guarden visar sanitiserad identitet, inte lösenord eller hela URL:en.

| Kommando                            | Betydelse                                                                                                                               |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run db:init`                   | Initiera en tom lokal/throwaway dev-DB efter målverifiering. Innehåller även repair/data-DDL; är inte en harmlös allmän statuskontroll. |
| `npm run db:ensure`                 | Kontrollera → applicera pending migrationsfiler → verifiera, för en redan initierad dev-DB.                                             |
| `npm run db:migrate:check`          | Read-only ledgerstatus. Ingen URL kan ge skip; explicit begärd env utan användbar URL ska falla.                                        |
| `npm run db:migrate:additive-check` | Read-only riskgrind, inte ett bevis att SQL är ofarlig eller ett apply-mandat.                                                          |
| `npm run db:perf-indexes:dry`       | Läsande plan för index.                                                                                                                 |
| `npm run db:perf-indexes`           | Uttrycklig index-apply efter granskad plan/mål/reason. Kan låsa och ändra constraints; ingår inte i dev-start eller CI.                 |
| `npm run db:migrate:prod`           | Separat ägarauktoriserad live-apply, aldrig en normal följd av kodmerge.                                                                |

## DEV-synk för delad Preview/Development

Verifierat 2026-10-07: synken är genomförd på DEV, live-pariteten visar **0**
schemaavvikelser (tidigare 13) och inga registrerade migrationer är pending.
Preview är omdeployad från oförändrad `ab68d9edb4bf`; den aktiva domänens
skrivfria API-prov matchar DEV. [Deployment-kvitto](https://vercel.com/jakeminator123s-projects/sajtmaskin/FY6hd5AbAUEmh6VWuYqXXj1GZPsk).

[`scripts/db/align-dev-preview.mjs`](../../scripts/db/align-dev-preview.mjs) äger
den avgränsade synken. Den tar endast det registrerade DEV-projektet via
direct/session mode på port 5432. `npm run db:align-dev-preview` visar en
read-only plan; `--apply --reason=<ägarbeslut>` utför den efter uttryckligt mandat.

- Schemaägare för mejlhändelser är den befintliga
  [`add-kostnadsfri-mail-events.sql`](../../src/lib/db/migrations/add-kostnadsfri-mail-events.sql).
  Synken kör den bara när både ledgerposten och dess schema saknas.
- `kostnadsfri_pixel_hits` och `stripe_billing_events` är pensionerade
  DEV-objekt utan konsument i aktuell kod. Synken kräver tomma tabeller och inga
  externa FK-/view-/triggerberoenden, låser och kontrollerar dem igen, och flyttar
  dem med index/sekvenser till `sajtmaskin_dev_archive`. Arkivet har ingen schema-
  åtkomst för PUBLIC, anon, authenticated eller service_role. Ingen tabell raderas.
- DDL och den nya ledgerposten delar transaktion och advisory lock. Historiska
  ledgerposter bevaras. Detta kommando ersätter inte den generella runnern:
  `db:migrate`/`db:init` måste fortfarande granskas enligt live-apply-grinden.

Efter synken: kör read-only ledger- och dev/prod-paritetskontroller. Kopiera sedan
Development-värdena för både `POSTGRES_URL` och `POSTGRES_URL_NON_POOLING` till
Vercel Preview och kontrollera eventuella branch/fallback-alias. Deploya Preview
på nytt och verifiera att den aktiva deploymenten använder DEV. Production-
variabler och GitHub-secrets ändras inte. Gamla deployment-URL:er behåller äldre
env; byt inte tillbaka till dem som rollback utan att först kontrollera DB-målet.

Arkivflytten kan återställas av DB-ägaren med `ALTER TABLE ... SET SCHEMA public`
för exakt de pensionerade objekten; det återinför också den avsiktligt borttagna
public-schema-avvikelsen. Behåll den additiva mejlmigrationen och dess ledgerpost.

## Innan live-apply

1. Läs faktisk pending-plan mot rätt databas och granska SQL **och** separat
   indexkod. Ledgerstatus ensam bevisar inte faktiskt schema.
2. Kräv fail-closed körplan/ledgerhantering: bara pending ska köras, checksum-
   eller ledgeroklarhet ska stoppa, och `already-exists` är inte ett apply-kvitto.
   Workflowstädningen ändrar inte runner/ledger-semantiken; de måste granskas
   separat innan nästa live-apply.
3. Bevara historisk ledger. Backfyll inte gamla NULL-checksums med dagens
   filhashar och kör inte om redan ledgerförda migrationer för att få grönt.
4. Använd verifierad direkt eller **session-mode** Postgres-anslutning för DDL
   med sessionsbundet advisory lock. Transaction-pooling är inte ett giltigt
   serialiseringsbevis. Anta inte detta från secretnamnet eller ordet poolad.
5. Redovisa kompatibilitet med både aktuell master och preview, tidsordning
   och DB-effekt för ägaren. Additiv DDL kan låsa, ändra beteende eller påverka
   skrivningar. Brytande DDL kräver separat expand/contract-plan.
6. Kräv uttryckligt apply-mandat. Efter godkänd körning: verifiera ledger,
   schema och runtime separat. Kodmerge/promote och Vercel-deploy är inte atomiska.

## Återställning

En kodrevert återställer **inte** schema, index, ledger eller användardata.
Radera inte historiska ledger-rader och kör inte automatisk backfill/repair.
Vid oklar eller delvis applicerad migration: stoppa och utred faktisk DB-status.
