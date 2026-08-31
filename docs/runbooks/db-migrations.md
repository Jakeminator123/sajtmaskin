# DB-migrationer: automatik, vakter och CI

Den operativa regeln bor i [`.cursor/rules/db-env-parity.mdc`](../../.cursor/rules/db-env-parity.mdc). Den här filen beskriver maskineriet runtomkring — vad som applicerar migrationer åt dig, vad som larmar när något ligger efter, och varför varje lager finns.

## Ledgern

Runners (`db:migrate`, `db:migrate:prod`, `db:init`) bokför varje applicerad migration i tabellen `schema_migrations` (idempotent, best-effort/warn-only). Alla gates nedan läser den.

Ledgern är **deny-by-default** sedan 2026-08-19 (SM-057): RLS på, inga policies, och `anon`/`authenticated` fråntagna sina rättigheter. Innan dess kunde den läsas, skrivas och TRUNCATE:as med den publika anon-nyckeln över PostgREST, vilket räckte för att lura varje gate nedan — och i värsta fall få en runner att köra om migrationer. Runners påverkas inte: tabellägaren `postgres` är samma roll de ansluter med, och en ägare kringgår RLS. Skyddet bor på två ställen som ska hållas i lockstep — `ensureMigrationLedger` (nya databaser) och `harden-schema-migrations-ledger.sql` (befintliga).

| Kommando                        | Vad                                                 |
| ------------------------------- | --------------------------------------------------- |
| `npm run db:migrate:check`      | Lokalt mot dev. Rött = DB:n ligger efter            |
| `npm run db:migrate:check:prod` | Read-only mot prod-snapshot                         |
| `npm run db:ensure`             | Fixkommandot: kollar → `db:migrate` → verifierar om |

## Lokal auto-apply och vakt

`db:init` (via `predev`) applicerar hela `MIGRATION_ORDER` vid varje `npm run dev`, så dev-DB:n hålls i synk automatiskt.

Utöver det kör `next-runner.mjs` `scripts/db/ensure-schema.mjs --check-only --soft --quiet-ok` i bakgrunden vid varje dev-start: tyst när allt är rätt, ramad varning när DB:n ligger efter. Det täcker `SKIP_PREDEV=1`, direktstart och en tyst `db:init:soft`-miss.

Vakten kör **aldrig DDL själv** — den delegerar till `run-migrations.ts`, som äger apply-loopen och prod-skrivskyddet.

## Git-hooks: verifiering före push och dev-symmetri mot prod

Samma installerare äger fyra managed hooks med olika hårdhet:

| Hook            | Kör                                   | Hårdhet                                                          |
| --------------- | ------------------------------------- | ---------------------------------------------------------------- |
| `pre-push`      | `npm run verify:pr -- --plan`         | **Fail-closed:** röd plan eller saknat `npm` stoppar pushen. Full `verify:pr` körs av agenten och i CI. |
| `post-merge`    | `ensure-schema.mjs --soft --quiet-ok` | Soft; avbryter aldrig pull/merge                                 |
| `post-checkout` | Samma DB-synk vid grenbyte            | Soft                                                             |
| `post-rewrite`  | Samma DB-synk efter rebase            | Soft                                                             |

`pre-push` gör den lokala plan-kontrollen svår att glömma (färsk base, path-
impact, protected/Backoffice). Full `verify:pr` är agentens och CI:s ansvar.
Endast ett uttryckligt ägarbeslut får använda
`SAJTMASKIN_SKIP_VERIFY_HOOKS=1`; verifiera och dokumentera i så fall varför
pushen behöver gå förbi den lokala grinden.

DB-logiken är oförändrad: prod får migrationer när kod pushas till master, dev
när master dras hem — alltså precis där driften uppstår.

**Varför tre DB-posthooks?** En merge-pull, ett grenbyte och en rebase-pull är tre olika vägar hem. `git pull --rebase` kör aldrig `post-merge`, och rebase med merge-backenden (default sedan git 2.26) ger inget pålitligt `post-checkout` heller. `post-checkout` kör bara vid grenbyten (arg 3 = 1), `post-rewrite` bara för `rebase` (inte `amend`).

Installeras obligatoriskt i agentstarten med `npm run hooks:install` och som
extra mjukt skydd via `predev` (`hooks:install:soft`). En färsk clone som ännu
inte har kört någon av vägarna har inga managed hooks; därför står bootstrapen
uttryckligt i `AGENTS.md` och `pr-workflow`.
DB-posthookarna är tysta, soft och står över i CI eller vid
`SAJTMASKIN_SKIP_DB_HOOKS=1`. `pre-push` är däremot medvetet blockerande och har
sin separata escape hatch ovan.
Test-escape-hatchen hoppar inte över non-fast-forward-kontrollen; `master`
force-pushas aldrig och en annan befintlig remote-ref kräver reasoned
break-glass.

Genererade filer bär markören `sajtmaskin-managed-hook` — en befintlig hook utan markören rörs aldrig, den rapporteras. Länkade worktrees delar `.git/hooks` med huvudcheckouten (`--git-common-dir`), så en installation räcker för alla.

## Självläkande testlane

`pretest:postgres` kör `ensure-schema.mjs --quiet-ok` före `npm run test:postgres`, så lanen inte kan bli röd av drift i stället för av en riktig bugg. Den felsökningen kostade en gång ett helt pass: nio tester kraschade på en saknad `variant_id`-kolumn långt innan de nådde koden de testade.

**`--soft` utelämnas med flit här.** I DB-posthookarna får ett misslyckat migrationsförsök aldrig avbryta git-kommandot, men i testlanen ska det stoppa körningen — annars kör testerna vidare mot det gamla schemat och man får tillbaka exakt de vilseledande felen. Saknad DB-URL är fortfarande en tyst skip med exit 0, så forkar och CI utan databas påverkas inte.

## Prod-skyddet sitter i registret, inte i en fil

`assertSafeWriteTarget` vägrar skriva när målets Supabase project ref är prod enligt `config/db-targets.json` — oavsett om `.env.vercel.production.pulled` finns. Snapshot-jämförelsen ligger kvar men bara som fallback för mål registret inte känner.

Tidigare var det tvärtom: saknades snapshoten blev det en varning och skrivningen släpptes igenom, alltså inget skydd alls på just de maskiner som aldrig dragit hem prod-env. Det duger inte när git-hookarna gör migrering till en automatisk väg.

Kvittot `DB_ALLOW_PROD_LIKE_WRITE=1` gäller som förut, så `db:migrate:prod` och CI:s `prod-migrations-apply` fungerar oförändrat.

## CI-jobben

| Jobb                      | När                                                                       | Vad                                                                                                                                                                                                  |
| ------------------------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `prod-migrations-apply`   | Push till master eller manuell dispatch (**aldrig** på PR)                | Kör `run-migrations.ts` mot prod. Idempotent → en migration kan inte längre bli deployad utan att köras. Gate:at bakom `quality` + `schema-drift` så prod-schemat aldrig muteras för en trasig merge |
| `prod-migrations-applied` | `needs: prod-migrations-apply`                                            | Läser prod-ledgern EFTER apply. Rött = kör `npm run db:migrate:prod` manuellt                                                                                                                        |
| `db-schema-parity`        | `needs: prod-migrations-apply` + dagligen (cron i `db-schema-parity.yml`) | Auto-applicerar migrationer + perf-index mot **dev** (`POSTGRES_URL_DEV`), kör sedan `npm run db:schema-parity`                                                                                      |

### Varför ledgern inte räcker: live-paritet

`db-schema-parity` (`scripts/db/check-schema-parity.mjs`) jämför de två **levande** databaserna objekt för objekt — tabeller, kolumner, index, constraints. Det behövs eftersom ledgern kan vara grön på båda sidor medan schemat ändå skiljer sig: tabeller födda under äldre `CREATE TABLE IF NOT EXISTS`-definitioner, eller DDL körd direkt i dashboarden, syns aldrig i `schema_migrations`. Exakt det läget rådde 2026-08-05 — 32 avvikelser, avstämda i `align-live-schema-parity.sql`.

Cron-körningen finns för att fånga drift som uppstår **mellan** pushar. Rött = skriv en migration (aldrig dashboard-DDL). Lokalt: `npm run db:schema-parity`.

Samma `prod-migrations-apply`-jobb kör även `npm run db:perf-indexes` mot prod (idempotent `CREATE INDEX IF NOT EXISTS` + dedupe), så nya hot-path-index — deklarerade i `add-performance-indexes.mjs`, utanför SQL-ledgern — auto-appliceras vid push till master. Tidigare nådde de prod bara via backoffice-knappen "Databashälsa".

### Secret-kravet

`POSTGRES_URL_PROD` (poolad prod-URL) måste finnas som GitHub Actions-secret (`gh secret set POSTGRES_URL_PROD`).

- På **huvudrepot** (`Jakeminator123/sajtmaskin`) failar `prod-migrations-apply` **hårt rött** om den saknas. False-green-skydd, fix 2026-07-11 — en tyst skip var exakt varför en saknad migration kunde slinka till prod oupptäckt.
- På **forkar** utan secret SKIP:as apply med en varning i stället för att falla rött.

Prod-secret injiceras bara på trusted events; PR-kod inklusive forkar ser aldrig prod-creds.

## Race mot deploy

Vill du ha helt race-fritt (migrera FÖRE deploy): gate:a Vercel-deployen bakom `prod-migrations-apply` separat. En additiv `ADD COLUMN`-migration parallellt med deploy är annars ofarlig.
