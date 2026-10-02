# DB-migrationer: uttrycklig apply, läsande automatik

Workflow-ägare: [CI](../../.github/workflows/ci.yml),
[schemalagd paritet](../../.github/workflows/db-schema-parity.yml),
[hook-installation](../../scripts/dev/install-git-hooks.mjs) och
[dev-start](../../scripts/dev/predev.mjs). Kort agentregel:
[db-env-parity](../../.cursor/rules/db-env-parity.mdc).

## Gränsen mellan kod och databas

Vercel Preview och Production använder **samma prod-Postgres** enligt
[`config/db-targets.json`](../../config/db-targets.json). Lokal dev och
Vercel Development har ett annat mål. Den här policyn isolerar inte
preview-appens vanliga runtime-skrivningar från produktionen.

Git-push, checkout, pull, rebase, dev-start och vanlig CI-dispatch är **inte**
migrationsmandat. De får inte automatiskt applicera migrationer, reparera data
eller skapa prestandaindex. Vercel-deploy kör inte heller migrationer.

## Automatiska kontroller

| Ingång | Vad händer? |
| --- | --- |
| `pre-push` | Fail-closed `verify:pr --plan`; ingen DB-apply. |
| Git-posthooks | De tre tidigare managed DB-posthookarna pensioneras av `hooks:install`. Främmande/nyare hooks stoppar installationen; de rörs inte. |
| Dev-start | `next-runner` kör `ensure-schema --check-only --soft --quiet-ok` i bakgrunden. Drift varnar men stoppar inte servern. |
| Cursor-molnstart | Samma read-only/soft-kontroll, ingen DB-init. |
| `pretest:postgres` | `ensure-schema --check-only --quiet-ok`; drift stoppar testlanen. CI initierar sin separata, efemära testdatabas uttryckligt innan testerna. |
| CI `prod-migrations-applied` | Läser prod-ledgern efter credential- och målguard. Kör på betrodda `preview`/`master` push/dispatch, aldrig med secrets på PR. |
| CI `db-schema-parity` | Jämför dev och prod **read-only**. Ingen dev-synk eller indexering. |
| Schemalagd paritet | Daglig läsande kontroll. Schedule från defaultbranchen tillåts men checkar ut `master`; manuell non-master-dispatch nekas före secrets. |

På huvudrepot är saknade DB-secrets ett fel, inte ett grönt kvitto. Forkar
utan secrets kan rapportera skip. Läskontrollernas röda resultat döljs inte:
pending migrationer eller avsiktlig dev/prod-skillnad behöver inspekteras och
en separat DB-plan. Ett grönt PR-jobb utan live-creds är inte live-DB-bevis.

`npm run hooks:install` behövs efter workflowuppdatering. Endast de tre
exakta gamla markerägda posthook-filerna tas bort, efter att alla kopierats
till en avgränsad temporär återställningsmapp. `pre-push` behålls.
Länkade worktrees delar normalt hookkatalogen; äldre checkouts får inte
nedgradera den nyare hooken.

## Uttryckliga kommandon

Verifiera alltid målet först med `npm run db:check-target -- --expect=dev|prod`.
Guarden visar sanitiserad identitet, inte lösenord eller hela URL:en.

| Kommando | Betydelse |
| --- | --- |
| `npm run db:init` | Initiera en tom lokal/throwaway dev-DB efter målverifiering. Innehåller även repair/data-DDL; är inte en harmlös allmän statuskontroll. |
| `npm run db:ensure` | Kontrollera → applicera pending migrationsfiler → verifiera, för en redan initierad dev-DB. |
| `npm run db:migrate:check` | Read-only ledgerstatus. Ingen URL kan ge skip; explicit begärd env utan användbar URL ska falla. |
| `npm run db:migrate:additive-check` | Read-only riskgrind, inte ett bevis att SQL är ofarlig eller ett apply-mandat. |
| `npm run db:perf-indexes:dry` | Läsande plan för index. |
| `npm run db:perf-indexes` | Uttrycklig index-apply efter granskad plan/mål/reason. Kan låsa och ändra constraints; ingår inte i dev-start eller CI. |
| `npm run db:migrate:prod` | Separat ägarauktoriserad live-apply, aldrig en normal följd av kodmerge. |

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
