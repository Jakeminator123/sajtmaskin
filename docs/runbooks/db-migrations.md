# DB-migrationer: automatik, vakter och CI

Den operativa regeln bor i [`.cursor/rules/db-env-parity.mdc`](../../.cursor/rules/db-env-parity.mdc). Den här filen beskriver maskineriet runtomkring — vad som applicerar migrationer åt dig, vad som larmar när något ligger efter, och varför varje lager finns.

## Ledgern och den gemensamma körplanen

Kontroll (`db:migrate:check`, additive-check) och applicering (`db:migrate`, `db:init`, CI `prod-migrations-apply`) delar **en** plan i [`scripts/db/migration-plan.mjs`](../../scripts/db/migration-plan.mjs). Köraren exekverar bara planens `toApply` — inte rutinmässigt varje fil i mappen.

Ledgern `schema_migrations` bokför `filename` plus valfri `checksum` (sha256 av filinnehåll vid lyckad applicering).

| Situation | Beteende |
| --------- | -------- |
| Fil saknas i ledgern | Körs (transaktionellt om SQL saknar `CONCURRENTLY`) och checksum sparas |
| Fil i ledgern med matchande checksum | Hoppas över |
| Fil i ledgern **utan** checksum (legacy) | Hoppas över; **backfylls inte** med dagens filhash; körs inte om för att fylla luckan |
| Fil i ledgern med **avvikande** checksum | Fail — skriv en ny migrationsfil, skriv inte om historik |
| `already-exists` på oledgerad fil | Fail — registreras **inte** (är inte bevis att hela filen applicerats) |
| SQL lyckades men ledger-skrivning misslyckas | Fail (avbryt) — annars kan nästa körning tro att den är oledgerad |
| Samtidiga körningar | Session-level `pg_advisory_lock` serialiserar apply |

`ensureMigrationLedger` får lägga till nullable `checksum`-kolumnen. Befintliga prod-rader lämnas orörda (NULL checksum).

### Checksum-övergång (engångs, kräver Jakob-godkännande)

1. Merga den här körplans-PR:n till preview (observera DB-effekt nedan).
2. Låt nya migrationer få checksum automatiskt vid lyckad apply.
3. **Backfyll inte** historiska rader med dagens filhash — det vore falskt bevis för historiskt innehåll.
4. Om en legacy-fil måste ändras: lägg en **ny** fil i `MIGRATION_ORDER`, rör inte den gamla.

Ändra inte den levande prod-ledgern manuellt utan uttryckligt ägarbeslut.

## Lokal auto-apply och vakt

`db:init` (via `predev`) anropar samma `applyPendingMigrations` som `db:migrate`.

`next-runner.mjs` kör `scripts/db/ensure-schema.mjs --check-only --soft --quiet-ok` i bakgrunden vid varje dev-start: tyst när allt är rätt, ramad varning när DB:n ligger efter.

Vakten kör **aldrig DDL själv** — den delegerar till `run-migrations.ts` / den delade planen.

| Kommando                        | Vad                                                 |
| ------------------------------- | --------------------------------------------------- |
| `npm run db:migrate:check`      | Lokalt mot dev. Rött = pending eller checksum-mismatch |
| `npm run db:migrate:check:prod` | Read-only mot prod-snapshot                         |
| `npm run db:ensure`             | Fixkommandot: kollar → `db:migrate` → verifierar om |

## Git-hooks: verifiering före push och DB-synk

Samma installerare äger fyra managed hooks med olika hårdhet:

| Hook            | Kör                                   | Hårdhet                                                                                                                          |
| --------------- | ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `pre-push`      | `npm run verify:pr -- --plan`         | **Fail-closed:** röd plan eller saknat `npm` stoppar pushen. Riktade kontroller körs lokalt; CI publicerar tung profil eller light-kvitto. |
| `post-merge`    | `ensure-schema.mjs --soft --quiet-ok` | Soft; avbryter aldrig pull/merge                                                                                                 |
| `post-checkout` | Samma DB-synk vid grenbyte            | Soft                                                                                                                             |
| `post-rewrite`  | Samma DB-synk efter rebase            | Soft                                                                                                                             |

`pre-push` gör den lokala plan-kontrollen svår att glömma. Endast ett uttryckligt ägarbeslut får använda `SAJTMASKIN_SKIP_VERIFY_HOOKS=1`.

**Varför tre DB-posthooks?** En merge-pull, ett grenbyte och en rebase-pull är tre olika vägar hem.

Installeras obligatoriskt i agentstarten med `npm run hooks:install`. DB-posthookarna är tysta, soft och står över i CI eller vid `SAJTMASKIN_SKIP_DB_HOOKS=1`.

## Självläkande testlane

`pretest:postgres` kör `ensure-schema.mjs --quiet-ok` före `npm run test:postgres`. **`--soft` utelämnas med flit här.**

## Prod-skyddet sitter i registret, inte i en fil

`assertSafeWriteTarget` vägrar skriva när målets Supabase project ref är prod enligt `config/db-targets.json`. Kvittot `DB_ALLOW_PROD_LIKE_WRITE=1` gäller för `db:migrate:prod` och CI:s `prod-migrations-apply`.

## CI-jobben

| Jobb                      | När                                                                       | Vad                                                                                                                                                                                                  |
| ------------------------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `prod-migrations-apply`   | Push till `master` eller `preview`, eller manuell dispatch (**aldrig** på PR) | Additive-check (bara preview) → `run-migrations.ts` (pending plan) → `db:perf-indexes` mot **prod**. Körs även utan ny SQL |
| `prod-migrations-applied` | `needs: prod-migrations-apply`                                            | Läser prod-ledgern EFTER apply                                                                                                                                                                       |
| `db-schema-parity`        | `needs: prod-migrations-apply` + dagligen (cron i `db-schema-parity.yml`) | Auto-applicerar migrationer + perf-index mot **dev**, kör sedan `npm run db:schema-parity`                                                                                                           |

### Verklig ordning (inte atomär promote)

- **Preview-push** kan köra SQL + perf-indexes mot **delad prod-Postgres** medan `master` och Vercel Production fortfarande kör **gammal kod**.
- **Master-push** kan också köra migrationer + perf-indexes mot samma prod-DB; Vercel-deploy är **separat** och inte gate:ad bakom `prod-migrations-apply`.
- Påståendet att “additivt alltid är ofarligt” eller att “kod och schema byts samtidigt vid promote” är **falskt**. Frånvaro av denylist-träff ≠ bakåtkompatibilitet.

### Schemalagd schema-paritet

GitHub `schedule` kör alltid workflow-filen från repositoryts **default branch** (`preview`). Därför får cron **inte** kräva `github.ref == master` (det hoppade över schemalagd körning). Jobbet i `db-schema-parity.yml`:

- tillåter `schedule` (defaultbranch tip),
- nekar `workflow_dispatch` från annan ref än `master` **innan** secrets,
- checkar ut **`master`-kod** innan kontrollen körs.

### Additive-grinden (preview)

`npm run db:migrate:additive-check` granskar pending-planen plus `add-performance-indexes.mjs`. Automatik för verifierbart säkra fall (`CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`, icke-unikt `CREATE INDEX IF NOT EXISTS`, …). Policies, triggers, funktioner, constraints, backfills, drop index m.m. kräver särskild granskningsväg:

```text
DB_MIGRATION_ALLOW_REVIEWED_BREAKING=1
```

CI sätter aldrig den flaggan. Alternativ: skriv om till säkra former, eller promote med medveten risk.

### Secret-kravet

`POSTGRES_URL_PROD` måste finnas som GitHub Actions-secret. På huvudrepot failar apply hårt rött om den saknas; forkar SKIP:ar. Prod-secret injiceras bara på trusted events.

## Race mot deploy

Vercel-deployen är **inte** gate:ad bakom `prod-migrations-apply`. Luckan är känd: SQL kan landa före eller efter ny kod. Stäng den bara med medveten deploy-grind, inte genom att låtsas att additiv DDL är ofarlig per definition.
