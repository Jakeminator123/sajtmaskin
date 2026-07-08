# Scripts

GitHub Actions **CI** (typecheck, lint, test, build) på push/PR till **`master`**: [`.github/workflows/ci.yml`](../.github/workflows/ci.yml).

> **Status (2026-04-21):** **`package.json` är source of truth för npm-script-namn.** Vid avvikelse mellan denna README och `package.json` gäller `package.json`.
>
> **Borttagna pipelines (sektioner längre ned är historisk referens):**
> - **Template-library-pipen** togs bort 2026-04-17 — `template-library:*`, `template-pipeline:refresh`, `references:discover*`, `artifacts:rebuild*`, `build-template-library.ts`, `import-template-discovery.ts`, `hydrate-template-library-cache.ts`, `generate-template-library-embeddings.ts`, `scaffolds:curate`, `promote-to-scaffold.ts`. Inga av dessa finns kvar som npm-script.
> - **Dossier-pipeline v1** togs bort 2026-04-20 — gamla 16-pipelinens scripts ligger i `archive/dossiers-legacy-2026-04-20/`. Aktiv dossier-pipe är **`npm run dossiers:curate`** som anropar `scripts/dossiers/curate-from-reference.ts`.
> - **`scaffold_cli.py`-meta-CLI** är borttagen — aktiva scaffold-script är bara `scaffolds:variant-embeddings`, `scaffolds:variant-patterns`, `scaffolds:variant-patterns:dry`, `scaffolds:validate`.
>
> Arkitekturreferens för borttagningarna: git-historik (`docs/architecture/code-map.md` håller sig medvetet slim och listar inte borttaget — se filens egen "Dokumentationsregel").

## Översikt och inventering

- **Nav:** denna fil + `package.json` — se även [`docs/architecture/code-map.md`](../docs/architecture/code-map.md).

### Overhead-ytor

| Verktyg | Start | Roll |
|------|------|------|
| [`../sajtmaskin_backoffice.py`](../sajtmaskin_backoffice.py) | `npm run backoffice` | Konsoliderad Streamlit-backoffice (konfiguration, scaffolds, dossiers, observability, autofix). Källkod under `backoffice/`. |

Delad logik ligger i `backoffice/shared.py`. `config/dashboard/` håller bara `domain-map.json` (stöddata, mappnamnet är legacy).

### Katalogstruktur (`scripts/`)

| Mapp | Innehåll |
|------|----------|
| [`db/`](db/) | Postgres-init, migrationer, push, sanity (`db-target-guard.mjs` delas här) |
| [`dev/`](dev/) | `next-runner`, `refresh-token`, `check-systemprompt`, `check-unicode-regex` (npm `predev` / `dev` / `build` / `preflight:common`) |
| [`embeddings/`](embeddings/) | Mall- och scaffold-embeddings (template-library-embeddings borttagen 2026-04-17) |
| [`dossiers/`](dossiers/) | AI-curate dossiers från klonade referens-repos (`curate-from-reference.ts`) + legacy-import-kedja (`inventory-legacy.mjs`, `normalize-legacy-prospect.ts`, `validate-all.ts`, `regenerate-capability-map.ts`) |
| [`v0-templates/`](v0-templates/) | Separat v0/runtime/workflow-spår: lokal sync, validering och local refresh av mallkatalog |
| [`scaffolds/`](scaffolds/) | Variant-embeddings, variant-patterns, manifest-validering |
| [`eval/`](eval/) | `run-eval.ts` (eval-output) |
| [`deps/`](deps/) | Baseline `package.json`-verifiering (peer/registry) |
| [`audit/`](audit/) | Shadcn-mirror-repo audit (`mirror:audit*`) |
| [`env/`](env/) | `manage_env.py`, `model_trace_overlay.py` |
| [`observability/`](observability/) | RAG-index, fixer-registry dump och `faults:report` för återkommande fault patterns |

Observability-kommandon: `npm run rag:error-log:reindex`, `npm run rag:error-log:reindex:force`, `npm run fixers:dump`, `npm run faults:report`, `npm run observability:rebuild-all`.

### Next / dev-server (npm hooks)

| Fil | `package.json` |
|-----|------------------|
| [`dev/next-runner.mjs`](dev/next-runner.mjs) | `dev`, `build`, `start` |
| [`dev/check-systemprompt.mjs`](dev/check-systemprompt.mjs) | `predev`, `prebuild` |
| [`dev/refresh-token.mjs`](dev/refresh-token.mjs) | `predev`, `refresh-token` |
| [`db/db-init.mjs`](db/db-init.mjs) | `predev`, `db:init` |

**v0-mallar (builderns Mallar-tab, Blob-data):** [`v0-templates/upload-mallar-blob.mjs`](v0-templates/upload-mallar-blob.mjs) (kanonisk och **enda** skrivväg till Blob-katalogen), [`v0-templates/validate-templates.mjs`](v0-templates/validate-templates.mjs), [`v0-templates/verify-mallar-blob.mjs`](v0-templates/verify-mallar-blob.mjs), [`v0-templates/audit-template-repos.mjs`](v0-templates/audit-template-repos.mjs), [`embeddings/generate-template-embeddings.ts`](embeddings/generate-template-embeddings.ts) — `templates:blob:upload`, `templates:validate`, `templates:embeddings`. Kanonisk katalog-generering: `upload-mallar-blob.mjs --write-catalog`. Fullständigt flöde + guardrails: [`docs/architecture/templates.md`](../docs/architecture/templates.md). Legacy v0-auto-fetch (`sync-v0-templates.mjs`, `refresh-local-v0-catalog.mjs`, `templates:sync/refresh/local:refresh`, `/api/admin/templates/sync`, `TEMPLATE_SYNC_*`) **togs bort 2026-07-08** och parallell-skrivvägen `sync-blob-catalog.mjs` (`templates:blob:sync`) **togs bort 2026-07-09** — Blob-vägen via `upload-mallar-blob.mjs` är enda sättet.

**Externa referenser (dossier-curation):** klonade referens-repon ligger i `data/template-references/repos/`. Kura en dossier från en referens med `npm run dossiers:curate` (anropar [`dossiers/curate-from-reference.ts`](dossiers/curate-from-reference.ts)).

**Borttaget 2026-04-17:** template-library-pipens scrape/import/hydrate/build/embeddings-kedja, inkl. `template-library/hamta_sidor_branch_emil.py`, `template-library/full_template_refresh.py`, `vercel_template_cli.py`, `references:discover*`, `artifacts:rebuild*`. Den ersattes av dossier-curation.

### shadcn registry sync

Använd dessa när du vill hålla den lokala shadcn-primitivytan uppdaterad:

```bash
npm run shadcn:sync
npm run shadcn:sync:write
```

- `shadcn:sync` jämför lokal `SHADCN_COMPONENTS` mot officiella registret och skriver inte filer.
- `shadcn:sync:write` uppdaterar `src/lib/gen/data/shadcn-components.ts`.
- UI Recipes hämtas via `src/lib/gen/data/shadcn-ui-recipes.ts`; den gamla `data/shadcn-examples/`-cachen är borttagen.
- `predev` kör också `shadcn:sync:soft` automatiskt som en non-blocking kontroll innan `npm run dev`.

## Tre separata spår

1. **`v0-mallar`** — Builderns Mallar-tab. Runtimefiler: `src/lib/templates/*`, genererade från Vercel Blob via `templates:blob:upload` (`upload-mallar-blob.mjs --write-catalog`, "mallar"-intake). En valfri gitignored `templates_v0/`-ZIP fungerar som lokal dev-override vid import. Se [`docs/architecture/templates.md`](../docs/architecture/templates.md).

2. **Dossiers (legoklossar)** — Återanvändbara byggblock injicerade i codegen-prompten. Källa: `data/dossiers/{hard|soft}/*/manifest.json`. Curation: `npm run dossiers:curate` från en klonad referens i `data/template-references/repos/`. Schema: `docs/schemas/strict/dossier.schema.json`. Arkitektur: `docs/contracts/dossier-system.md`.

3. **Scaffolds** — Interna runtime-startpunkter i `src/lib/gen/scaffolds/*` som own-engine använder vid codegen.

## Aktiva scaffold-kommandon

`scaffold_cli.py`-meta-CLI:n är borttagen. Aktiva npm-kommandon för scaffold-spåret:

```bash
npm run scaffolds:validate           # vitest-validering av scaffold-manifest
npm run scaffolds:variant-embeddings # regenerera variant-embeddings
npm run scaffolds:variant-patterns   # auto-curate variant-patterns
npm run scaffolds:variant-patterns:dry
```

Den interna runtime-scaffold-registryn ligger i `src/lib/gen/scaffolds/`.

## v0-mallar (Blob-katalog)

Detta spår är **builderns Mallar-tab / `v0-mallar`** — inte `template-library`, Vercel-mallar eller scaffolds. Katalogen genereras från Vercel Blob; inga online-anrop till v0.app görs. Fullständig arkitektur + preview-host-guardrails: [`docs/architecture/templates.md`](../docs/architecture/templates.md).

### Datakällor

| Fil | Roll |
|-----|------|
| `src/lib/templates/template-blob-manifest.json` | **Källa.** Blob-manifest (id → `archiveUrl` + SHA-256 + previewFit) för uppladdade ZIP:ar. Genererat av `upload-mallar-blob.mjs`. |
| `src/lib/templates/templates.json` | **Genererad** katalog som appen läser vid runtime (från manifestet). |
| `src/lib/templates/template-categories.json` | **Genererad** kategorimappning för kategorisidor och modaler. |
| `src/lib/templates/template-embeddings.json` | Embeddings för semantisk sökning i Mallar-tab. Commitad; byggs om via script, inte via blob/cron i drift. |
| `templates_v0/` (gitignored) | Valfri lokal dev-override: finns en mall som lokal ZIP (via `out/downloaded.jsonl`) läser `local-v0-template-source.ts` den före Blob. Finns aldrig i prod. |

### Kommandon

```bash
npm run templates:blob:upload -- --upload --write-catalog --source=../mallar  # kanonisk: ladda upp + regenerera katalogen
npm run templates:validate                                                    # validera templates.json + kategorimappning
node scripts/v0-templates/verify-mallar-blob.mjs                              # verifiera manifestets arkiv mot preview-host-taken
node scripts/v0-templates/audit-template-repos.mjs                            # granska mallarnas preview-host-kompatibilitet
```

### Bra att veta

- Kanonisk katalog-generering: `upload-mallar-blob.mjs --write-catalog` från `../mallar`-intaket. Legacy v0-auto-fetch togs bort 2026-07-08 — Blob-vägen är enda sättet.
- Mallar som överskrider preview-host-taken (500 filer / 2 MiB per fil / 12 MiB totalt) laddas upp till Blob men **exkluderas ur galleriet** (`previewFits:false`).
- Dessutom är vissa mallar manuellt exkluderade i `src/lib/templates/template-data.ts` (`EXCLUDED_TEMPLATE_IDS`) för att de inte kan boota (saknar `package.json`/`dev`, eller kraschar på okuvrad env).
- Import: finns en lokal ZIP i `templates_v0/downloads/` startar mallflödet direkt från den; annars hämtas ZIP:en från Blob-manifestet.
- Nya ZIP-/metadata-filer syns inte i appen förrän `--write-catalog` uppdaterat `src/lib/templates/*`.

## Arkiverat labb (`archive/scripts-labs-testning_scarf/`)

**Inte produktion.** Tidigare `scripts/labs/testning_scarf/` — flyttat till [`archive/scripts-labs-testning_scarf/`](../archive/scripts-labs-testning_scarf/) (se [`archive/README.md`](../archive/README.md)). Inga `npm run`-alias längre; kör skripten manuellt från repo-root, t.ex.:

| Tidigare npm | Ersätt med (exempel) |
|--------------|----------------------|
| `prompt:trace` | `npx tsx archive/scripts-labs-testning_scarf/trace-generation-context.ts --prompt-file …` |
| `scaffold:suite` | `python archive/scripts-labs-testning_scarf/run_scaffold_suite.py` |
| `first-llm:lab` / live | `python archive/scripts-labs-testning_scarf/first_llm_promptlab.py` / `npx tsx archive/scripts-labs-testning_scarf/run_first_llm_live.ts …` |
| `testning:codegen-print` | `python archive/scripts-labs-testning_scarf/print_codegen_context.py` |

## Env-verktyg (`scripts/env/`)

Kanonisk plats: `scripts/env/`.

| Verktyg | Syfte |
|---------|-------|
| `scripts/env/manage_env.py` | Kanonisk env-CLI: status, add, set, push, pull, audit, reconcile |
| `scripts/env/model_trace_overlay.py` | Synkar GUI-modell-envs i `.env.local` + öppnar trace-overlay |

### Databas (lokal sanity + sync)

| npm-script | Entry |
|------------|--------|
| `npm run db:init` | [`db/db-init.mjs`](db/db-init.mjs) — bootstrapar bas-tabeller + applicerar SQL-migrationer. **Skrivande**: vägrar mot prod-lik target om `.env.local` matchar `.env.vercel.production.pulled`, om inte `DB_ALLOW_PROD_LIKE_WRITE=1` satts. |
| `npm run db:migrate` | [`db/run-migrations.ts`](db/run-migrations.ts) — kör SQL-filer i `src/lib/db/migrations/`. **Skrivande**: samma prod-lik guard som `db:init`. |
| `npm run db:push` | [`db/db-push.mjs`](db/db-push.mjs) — guardad wrapper runt `drizzle-kit push`. **Skrivande**: samma prod-lik guard som `db:init`. |
| `npm run db:check` | [`db/check-dev-db.mjs`](db/check-dev-db.mjs) — read-only sanity-koll av kärntabeller; varnar om targeten ser prod-lik ut. Valfri flagga `--allow-insecure-ssl`. |
| `npm run db:rows` | [`db/db-row-overview.mjs`](db/db-row-overview.mjs) — read-only: `COUNT(*)` per utvald tabell (own-engine + app + legacy); varnar om targeten ser prod-lik ut. Samma env som `db:check`. |

## ~~build-template-library.ts / import-template-discovery.ts / hydrate-template-library-cache.ts / generate-template-library-embeddings.ts / scaffolds:curate / promote-to-scaffold.ts / full_template_refresh.py / artifacts:rebuild~~

**Borttaget 2026-04-17.** Hela template-library-pipelinen togs bort i `4ba06d96e` — externa Vercel-mall-research, dossier-mellanlager, scaffold-promotion-flödet, `npm run template-*`-kommandon och `npm run artifacts:rebuild*`. Den nya dossier-pipen (manuell curation per referens via `npm run dossiers:curate`) ersätter både template-library- och scaffold-research-spåren. Historik finns i `data/external-template-pipeline/` (gitignored) och `archive/dossiers-legacy-2026-04-20/`.

## Aktiv dossier-CLI

```bash
npm run dossiers:curate -- --reference=<id> --class=hard|soft --id=<dossier-id>
```

Anropar `scripts/dossiers/curate-from-reference.ts`. AI-kuraterar EN dossier från en redan klonad referens i `data/template-references/repos/`. Skriver draft till `data/dossiers/{hard|soft}/<id>/manifest.json` + `instructions.md` — kräver hand-review innan den är produktionsmogen.

## devtest

Kör en konservativ repo-smoke-test för vanlig utveckling efter större
struktur- eller dokumentationsändringar.

Ingår:

1. `npm run typecheck`
2. `npm run scaffolds:validate`
3. `npm run dossiers:validate-all`
4. `npm run test:ci`
5. `npm run lint`

```bash
npm run devtest
```

Detta inkluderar inte `next build` som standard, så att kommandot förblir ett
snabbare utvecklingstest snarare än en tyngre release-validering. `lint` körs
sist för att ge mer verifieringssignal även när repot redan har kända lintfel.

## Eval (`npm run eval`)

Kör eval-suite + scorecard via `scripts/eval/run-eval.ts`. **Utdata:** katalogen `eval-output/` (gitignored) med `eval-report-YYYY-MM-DD.md` och `scorecard-YYYY-MM-DD.md` — datumet i filnamnet är **körningsdagen**, inte en mystisk import. *(Äldre körningar kan ligga i `EGEN_MOTOR_V2/` — byt till `eval-output/` eller flytta filer.)* Vill du spara en rapport i git, kopiera till t.ex. `docs/` medvetet.

För prompt-slim/follow-up-budget utan LLM-codegen: kör `npm run eval:followup` (se `src/lib/gen/eval/README.md`).

Nuvarande eval-checkar inkluderar också:

- `project-sanity` för cross-file/dependency-risker som saknade package pins eller kända installproblem
- `no-bracket-placeholders` för kvarlämnade innehållsplaceholders som `[Company Name]`
- `seo-publish-readiness` för metadata/title/description/robots/sitemap/H1 som behövs för riktig företagsleverans
- `visual-quality` för heuristisk layout-/hierarki-/färg-/sektion-/bildsignal på den färdiga projektytan
- `tier2-readiness` för om samma preflight-kontrakt som runtime använder fortfarande skulle tillåta tier-2 preview
- baseline-gaten tittar nu också på `PASS -> FAIL` och `FAIL -> PASS`, inte bara score-delta
- baseline-jämförelsen rapporterar också nya eller borttagna blockerande checks per prompt
- eval-resultat får nu blockerande checks, så `PASS` kräver att kritiska readiness-/sanity-checkar också är gröna, inte bara att medelscoren är okej

## Synk med `package.json`

Alla `npm run …`-namn och deras exakta kommandon ligger i **rot [`package.json`](../package.json)** (`scripts`-fältet). Den här README:n är tematisk; vid avvikelse gäller `package.json`.
