# Scripts

GitHub Actions **CI** (typecheck, lint, test, build) på push/PR till **`main`** och **`master`**: [`.github/workflows/ci.yml`](../.github/workflows/ci.yml).

## Översikt och inventering

- **Nav:** denna fil + `package.json` — se även [`docs/architecture/repository-and-platform.md`](../docs/architecture/repository-and-platform.md).

### Katalogstruktur (`scripts/`)

| Mapp | Innehåll |
|------|----------|
| [`db/`](db/) | Postgres-init, migrationer, push, sanity (`db-target-guard.mjs` delas här) |
| [`dev/`](dev/) | `next-runner`, `refresh-token`, `check-systemprompt` (npm `predev` / `dev` / `build`) |
| [`embeddings/`](embeddings/) | Mall-, template-library- och scaffold-embeddings |
| [`template-library/`](template-library/) | Extern mallkedja: scrape-cache, discovery-import, build, hydrate, v0-sync, `hamta_sidor_branch_emil.py`, `full_template_refresh.py` |
| [`scaffolds/`](scaffolds/) | Kandidatrapport, kurering, promote, `sync-scaffold-refs.mjs` |
| [`eval/`](eval/) | `run-eval.ts` (eval-output) |
| [`deps/`](deps/) | Baseline `package.json`-verifiering (peer/registry) |
| [`audit/`](audit/) | Shadcn-mirror + runtime component-library snapshot |
| [`cli/`](cli/) | `builder-generate.py` (batch mot own-engine API) |
| [`env/`](env/) | `manage_env.py`, `model_trace_overlay.py` |
| [`manual/`](manual/) | Övriga manuella verktyg (`scaffold-pipeline.py`) |

### Next / dev-server (npm hooks)

| Fil | `package.json` |
|-----|------------------|
| [`dev/next-runner.mjs`](dev/next-runner.mjs) | `dev`, `build`, `start` |
| [`dev/check-systemprompt.mjs`](dev/check-systemprompt.mjs) | `predev`, `prebuild` |
| [`dev/refresh-token.mjs`](dev/refresh-token.mjs) | `predev`, `refresh-token` |
| [`db/db-init.mjs`](db/db-init.mjs) | `predev`, `db:init` |

**Mallflöde (v0-templates i repo, enbart lokal data):** [`template-library/sync-v0-templates.mjs`](template-library/sync-v0-templates.mjs), [`template-library/validate-templates.mjs`](template-library/validate-templates.mjs), [`template-library/refresh-local-v0-catalog.mjs`](template-library/refresh-local-v0-catalog.mjs), [`embeddings/generate-template-embeddings.ts`](embeddings/generate-template-embeddings.ts) — `templates:sync`, `templates:validate`, `templates:refresh`, `templates:local:refresh`, `templates:local:refresh:embeddings`, `templates:embeddings`.
- **Delade TS-moduler (ingen egen CLI):** [`template-library/template-library-discovery.ts`](template-library/template-library-discovery.ts) (JSON/summary-hjälp) används av build/hydrate/import/promote/verify, tester och `e2e/vercel-templates/scrape-catalog.spec.ts`. [`scaffolds/scaffold-candidate-report.ts`](scaffolds/scaffold-candidate-report.ts) anropas från `build-template-library` och `curate-scaffold-candidates`. Kör dem via npm eller `npx tsx` enligt avsnitten nedan.
- **Vercel use-case-skrapning (Python):**
  - **Kanonisk entrypoint:** [`template-library/hamta_sidor_branch_emil.py`](template-library/hamta_sidor_branch_emil.py) — tierad utdata, rapporter, bred research-intake som kan markera `framework_match: false` i stället för att kasta bort poster direkt.
  - **Nuvarande standardflöde:** bred intake med `--legacy-wide-use-cases --per-category 999` till `data/external-template-pipeline/scrape-cache/current`, därefter import + hydrate + build + embeddings via den kanoniska refresh-kedjan.
  - **Kärnlistan** i skriptet = **`USE_CASES_CORE` (12 Vercel-sluggar)** + valfritt **`USE_CASES_EXTENDED` (2)** med `--extended-scrape`; den breda researchlistan = **`USE_CASES_LEGACY_WIDE` (25)**. Detta är **osammanhängande** med t.ex. **`EVAL_PROMPTS` (15 eval-promptar)** i `src/lib/gen/eval/prompts.ts` — olika domäner, räkna dem inte ihop.
  - **Icke-kanon:** lokal **`vercel_templates_levels/`** (gitignored); använd **inte** som källa för “hur många kategorier” produkten har. Spårat alternativ: **`e2e/vercel-templates/`**.
  - Se [`repository-and-platform.md`](../docs/architecture/repository-and-platform.md).
  - Kanonisk mutable data ligger i **`data/external-template-pipeline/`**. Om du behöver återanvända en annan scrape-cache ska du ange den **explicit** med `--scrape-output` / `--from`, inte förlita dig på path-fallbackar.
- **~~vercel_template_cli.py~~** (borttagen) — använd `hamta_sidor_branch_emil.py` eller Playwright-discover i stället.

## Lokala v0-mallar (`templates_v0/`)

Detta spår är till för **builderns mallgalleri**, inte för `template-library` eller Vercel-template research. All data hämtas lokalt — inga online-anrop till v0.app görs längre.

### Mappstruktur

Se [`templates_v0/README.txt`](../templates_v0/README.txt) för komplett mappstruktur. Kort:

- `templates_v0/scripts/` — Python-skript (Playwright) som skrapar v0.app interaktivt.
- `templates_v0/out/` — Lokal manifestdata, metadata-JSON per mall, loggar (gitignorerat).
- `templates_v0/downloads/` — ZIP-arkiv och bilder per kategori/mall (gitignorerat).

### Kanoniska datakällor

| Fil | Roll |
|-----|------|
| `templates_v0/out/collected-template-ids.json` | **Krävs.** Lokal manifestfil med alla insamlade mall-ID:n. |
| `templates_v0/out/template-metadata/*.json` | Titel, beskrivning, og:image per mall — läses av sync-scriptet. |
| `templates_v0/out/downloaded.jsonl` | Valfri. Logg per nedladdad ZIP, ger extra kategorisignal. |
| `src/lib/templates/templates.json` | **Genererad** katalog som appen läser vid runtime. |
| `src/lib/templates/template-categories.json` | **Genererad** kategorimappning för kategorisidor och modaler. |
| `src/lib/templates/template-embeddings.json` | Embeddings för semantisk mallsökning. Fallback till keyword-sökning om filen saknas. |

### Kommandon

```bash
npm run templates:local:refresh              # Sync + validering (enbart lokal data)
npm run templates:local:refresh:embeddings   # Sync + validering + regenerera embeddings
```

### Bra att veta

- `templates:sync` arbetar **enbart** mot lokala manifest — ingen remote-html-fallback finns kvar.
- När en mall finns som lokal ZIP i `templates_v0/downloads/` initierar builderns mallflöde own-engine direkt från filerna i arkivet.
- Preview-bilderna i galleriet kommer från `preview_image_url` i katalogen (hämtad ur lokal metadata, pekar på Vercel Blob CDN).
- Nya ZIP-filer eller metadata-filer blir inte synliga i appen förrän ett sync-kommando har uppdaterat `src/lib/templates/*`.

## Arkiverat labb (`archive/scripts-labs-testning_scarf/`)

**Inte produktion.** Tidigare `scripts/labs/testning_scarf/` — flyttat till [`archive/scripts-labs-testning_scarf/`](../archive/scripts-labs-testning_scarf/) (se [`archive/README.md`](../archive/README.md)). Inga `npm run`-alias längre; kör skripten manuellt från repo-root, t.ex.:

| Tidigare npm | Ersätt med (exempel) |
|--------------|----------------------|
| `prompt:trace` | `npx tsx archive/scripts-labs-testning_scarf/trace-generation-context.ts --prompt-file …` |
| `scaffold:suite` | `python archive/scripts-labs-testning_scarf/run_scaffold_suite.py` |
| `first-llm:lab` / live | `python archive/scripts-labs-testning_scarf/first_llm_promptlab.py` / `npx tsx archive/scripts-labs-testning_scarf/run_first_llm_live.ts …` |
| `testning:codegen-print` | `python archive/scripts-labs-testning_scarf/print_codegen_context.py` |

## Builder batch-generering (`cli/builder-generate.py`)

Interaktivt Python-skript som anropar Sajtmaskins API:er direkt (HTTP + SSE) utan Builder-UI:t. Används för att massproducera och jämföra genererade sidor.

```bash
# Kräver npm run dev (eller SAJTMASKIN_URL=https://…)
python scripts/cli/builder-generate.py
```

**Menyval:** prompt, modell-tier (`fast`/`pro`/`max`/`codex`/`anthropic`), deep brief, scaffold-läge, build intent, thinking, image generations.

**Output:** `output/generations/{timestamp}-{slug}/` med `metadata.json`, `files/`, och `brief.json` (vid deep brief). Output-mappen är gitignored.

**Beroenden:** Python 3.10+, inga pip-paket (stdlib only).

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

## sync-scaffold-refs (`scaffolds/sync-scaffold-refs.mjs`)

Hämtar externa GitHub-referenser till `_template_refs/` för scaffold- och hemsidemallsarbete.

**OBS:** `_template_refs/` används inte vid runtime. Skriptet behövs endast om du utvecklar nya scaffolds från externa referenser. Om mappen inte finns i din checkout är det normalt; skapa/fyll den först när du faktiskt arbetar med externa scaffold-referenser.

### Användning

```bash
node scripts/scaffolds/sync-scaffold-refs.mjs
node scripts/scaffolds/sync-scaffold-refs.mjs --force
node scripts/scaffolds/sync-scaffold-refs.mjs --only=nextjs-saas-starter,ibelick-nim
```

### Vad skriptet gör

1. Klonar eller sparse-checkout:ar utvalda referensrepon
2. Sparar dem under `_template_refs/`
3. Gör det lättare att hålla scaffold-kandidater reproducerbara mellan chats

### Exempel på referenser

- `nextjs/saas-starter`
- `auth0-developer-hub/auth0-b2b-saas-starter`
- `dzlau/stripe-supabase-saas-template`
- `vercel/examples` (`solutions/blog`)
- `vercel/next.js` (`examples/blog-starter`, `examples/with-cloudinary`)

## build-template-library.ts

Auditerar rå extern template-research och bygger ett kuraterat
`reference-library`-lager för agenter och scaffold-arbete.

### Användning

```bash
npm run template-library:build
npx tsx scripts/template-library/build-template-library.ts --source="data/external-template-pipeline/raw-discovery/current"
```

Det här skriptet ska nu läsa **en explicit eller kanonisk raw-discovery-root**. Äldre lokala `_sidor`-, `scraped-vercel-scorefolds`- och syskonfallbackar ska inte användas som normal drift.

### Viktig arbetsordning

Kör i denna ordning när du vill bygga om forskningsytan reproducerbart:

```bash
py scripts/template-library/full_template_refresh.py
```

Diskreta steg finns kvar för riktad felsökning, men `full_template_refresh.py` är den kanoniska orkestratorn.

### Vad skriptet gör

1. Läser det kanoniska `summary.json`-kontraktet från raw discovery
2. Inspekterar shallow-clonade repos från `data/external-template-pipeline/repo-cache/`
3. Faller bara tillbaka till äldre `_sidor`-repo paths om den valda source-roten
   fortfarande pekar på en legacy-datasetmapp
4. Separerar extern use-case, site form och technical pattern i katalogens klassificering
5. Deduplicerar repo-överlapp och demoterar blocklistade / icke-Next referenser till research-only
6. Skapar `data/external-template-pipeline/reference-library/` med katalog + dossiers
7. Genererar kuraterade research-artefakter för runtime-sökning i `src/lib/gen/template-library/`
8. Genererar scaffold research metadata i `src/lib/gen/scaffolds/scaffold-research.generated.json`
9. Skriver en prioriterad scaffold-kandidatsrapport till `data/external-template-pipeline/reports/scaffold-candidates-curated.json`

**Viktigt:** dossiers i `reference-library/` används inte direkt av runtime-own-engine. De fungerar som mellanlager för research/kurering. Den data som faktiskt når LLM-prompten efter build-steget är de commitade generated artefakterna i `src/lib/gen/template-library/` och `src/lib/gen/scaffolds/`.

### Produktionsgräns

Det här skriptet är build-time/research-time. Vercel-produktion ska läsa de
kuraterade JSON-filerna som commitas i repot, inte rå discovery, repo-cache
eller råa lokala datasetmappar.

## import-template-discovery.ts

Normaliserar discovery-data till den kanoniska research-lagret under
`data/external-template-pipeline/raw-discovery/current/`.

### Användning

```bash
npm run template-library:import
npx tsx scripts/template-library/import-template-discovery.ts --from="data/external-template-pipeline/scrape-cache/current"
npx tsx scripts/template-library/import-template-discovery.ts --from="data/external-template-pipeline/raw-discovery/current/playwright-catalog.json" --format=playwright-catalog
```

Om den valda mappen innehåller både `summary-cleaned.json` och `summary.json` används den
städade filen först. Normal drift ska peka explicit på den kanoniska scrape-cachen i `data/external-template-pipeline/`.

## hydrate-template-library-cache.ts

Gör shallow clones av GitHub-repon som refereras i den kanoniska raw-discoveryn.

### Användning

```bash
npm run template-library:hydrate-cache
npx tsx scripts/template-library/hydrate-template-library-cache.ts --max=20
```

### Regler

- shallow clone only
- ingen `install` eller `build`
- output hamnar i `data/external-template-pipeline/repo-cache/` som är gitignorerad
- `repo-cache` betyder lokal repo-spegel, inte runtime-cache
- `monorepo-examples` och poster med `framework_match: false` klonas inte i hydrate-steget
### Begrepp

- `data/external-template-pipeline/raw-discovery/`
  Rå och brusig discovery-output. Bra för triage, inte canonical.
- `data/external-template-pipeline/reference-library/`
  Kuraterad extern referensyta med per-template dossiers.
- `src/lib/gen/template-library/`
  Genererade research-artefakter som används av validering, curation och lokala sök-/kontrollverktyg.
- `src/lib/gen/scaffolds/`
  Den riktiga runtime-scaffold-registryt.

## generate-template-library-embeddings.ts

Genererar embeddings för den kuraterade externa referensytan så att agenter och
framtida scaffold-logik kan söka semantiskt i externa referensmallar.

Detta skriver den stora generated-filen
`src/lib/gen/template-library/template-library-embeddings.json`. Filen kan vara
lokal och viktig för curation-/kontrollflöden samtidigt som den hålls utanför
normal Cursor-indexering för att minska brus och kontextkostnad.

### Användning

```bash
npm run template-library:embeddings
```

## scaffolds:validate

Kör manifestvalidering för de interna runtime-scaffolds som redan finns i
`src/lib/gen/scaffolds/`.

```bash
npm run scaffolds:validate
```

## curate-scaffold-candidates.ts / scaffolds:curate

Bygger eller uppdaterar den prioriterade scaffold-kandidatsrapporten från samma
kuraterade template-library-data som `build-template-library.ts` använder.

### Användning

```bash
npm run scaffolds:curate
npx tsx scripts/scaffolds/curate-scaffold-candidates.ts
npx tsx scripts/scaffolds/curate-scaffold-candidates.ts --input="src/lib/gen/template-library/template-library.generated.json"
```

Behandla `npm run scaffolds:curate` och TypeScript-skriptet ovan som det
kanoniska gränssnittet för curation.

Rapporten i `data/external-template-pipeline/reports/scaffold-candidates-curated.json` är en reproducerbar
arbetsartefakt för scaffold-triage, inte en runtime-källa. Behandla den som en
kandidat för lokal-only output och regenerera den vid behov.

## promote-to-scaffold.ts / scaffolds:promote

Semi-automatisk scaffold-promotion från ett dossier-manifest till ett nytt
runtime scaffold under `src/lib/gen/scaffolds/`.

### Användning

```bash
npm run scaffolds:promote -- starter-image-gallery-starter --dry-run
npx tsx scripts/scaffolds/promote-to-scaffold.ts starter-image-gallery-starter --id=image-gallery-pro --base=portfolio
```

Skriptet:

1. Läser dossier-manifest + `selectedFiles`
2. Väljer ett befintligt runtime-scaffold som bas
3. Genererar ett nytt `manifest.ts`
4. Uppdaterar `src/lib/gen/scaffolds/types.ts`
5. Uppdaterar `src/lib/gen/scaffolds/registry.ts`

Detta är avsiktligt semi-automatiskt: du får en snabb scaffold-startpunkt, men
bör fortfarande granska filinnehåll, matcher-regler och embeddings efteråt.

## generate-scaffold-embeddings.ts / scaffolds:embeddings

Regenererar `src/lib/gen/scaffolds/scaffold-embeddings.json` från de interna
runtime-scaffolds som redan ligger i repot.

Samma princip gäller här: generated-filen kan vara viktig för runtime eller
build-time beteende även om den ligger i `.cursorignore` och normalt inte ska
öppnas utan ett konkret skäl.

### Användning

```bash
npm run scaffolds:embeddings
npx tsx scripts/embeddings/generate-scaffold-embeddings.ts
```

## full_template_refresh.py

Interaktivt "allt-i-ett"-skript for external-template-pipelinen:

1. skrapa nytt material med `template-library/hamta_sidor_branch_emil.py`
2. rensa tidigare genererade research-/embedding-artefakter
3. importera kanonisk `summary-cleaned.json` / `summary.json`
4. hydrera `repo-cache`
5. bygga dossiers + `template-library.generated.json` + `scaffold-research.generated.json`
6. generera template/scaffold embeddings

Kör interaktivt:

```bash
npm run template-pipeline:refresh
py scripts/template-library/full_template_refresh.py
```

Med inga flaggor startar skriptet i interaktivt läge och pausar innan fönstret stängs, vilket gör det lämpligt även för dubbelklick i Windows om `.py` är kopplat till Python.

Nuvarande default för scrape-steget är **bred research-intake**:

- `--legacy-wide-use-cases`
- `--per-category=999`
- output i `data/external-template-pipeline/scrape-cache/current`

Vill du explicit köra det smalare historiska kärnläget använder du `--core-use-cases`.

## devtest

Kör en konservativ repo-smoke-test för vanlig utveckling efter större
struktur- eller dokumentationsändringar.

Ingår:

1. `npm run typecheck`
2. `npm run scaffolds:validate`
3. `npm run test:ci`
4. `npm run lint`

```bash
npm run devtest
```

Detta inkluderar inte `next build` som standard, så att kommandot förblir ett
snabbare utvecklingstest snarare än en tyngre release-validering. `lint` körs
sist för att ge mer verifieringssignal även när repot redan har kända lintfel.

## Eval (`npm run eval`)

Kör eval-suite + scorecard via `scripts/eval/run-eval.ts`. **Utdata:** katalogen `eval-output/` (gitignored) med `eval-report-YYYY-MM-DD.md` och `scorecard-YYYY-MM-DD.md` — datumet i filnamnet är **körningsdagen**, inte en mystisk import. *(Äldre körningar kan ligga i `EGEN_MOTOR_V2/` — byt till `eval-output/` eller flytta filer.)* Vill du spara en rapport i git, kopiera till t.ex. `docs/` medvetet.

Nuvarande eval-checkar inkluderar också:

- `project-sanity` för cross-file/dependency-risker som saknade package pins eller kända installproblem
- `no-bracket-placeholders` för kvarlämnade innehållsplaceholders som `[Company Name]`
- `seo-publish-readiness` för metadata/title/description/robots/sitemap/H1 som behövs för riktig företagsleverans
- `visual-quality` för heuristisk layout-/hierarki-/färg-/sektion-/bildsignal på den färdiga projektytan
- `tier2-readiness` för om samma preflight-kontrakt som runtime använder fortfarande skulle tillåta tier-2 preview
- baseline-gaten tittar nu också på `PASS -> FAIL` och `FAIL -> PASS`, inte bara score-delta
- baseline-jämförelsen rapporterar också nya eller borttagna blockerande checks per prompt
- eval-resultat far nu blockerande checks, sa `PASS` kraver att kritiska readiness-/sanity-checkar ocksa ar gröna, inte bara att medelscoren är okej

## references:discover

Playwright-baserad extern template-discovery som normaliseras till
`data/external-template-pipeline/raw-discovery/current/`.

Använd i första hand:

```bash
npm run references:discover
npm run references:discover:second-pass
npm run references:discover:full
```

**OBS:** Playwright-specen ligger under **`e2e/vercel-templates/`** (spårad). Kräver Playwright; kör `npx playwright install` vid behov. Scaffolds uppdateras inte automatiskt — se [`e2e/README.md`](../e2e/README.md); äldre narrativfiler i git-historik.

## ~~extract-static-core.mjs~~ (borttagen, 2026-03-27)

Tidigare: extraherade `STATIC_CORE`-template från `system-prompt.ts` till `config/systemprompt.md`. **Monoliten är borta** — statisk kärna laddas via `getStaticCoreFromWorkspace` / `config/prompt-static/` (se `src/lib/gen/static-core-loader.ts`). Skriptet togs bort som **B3-05**.

## scaffold-pipeline.py (avancerat, ej i package.json)

Interaktivt Python-menyskript som visar status och exponerar de kanoniska
stegen i template-library-kedjan ovanpå samma pipeline-rot som
`full_template_refresh.py`.

**Placering:** [`scripts/manual/scaffold-pipeline.py`](manual/scaffold-pipeline.py) (översikt: [`scripts/manual/README.md`](manual/README.md)). Gamla sökvägen `scripts/scaffold-pipeline.py` finns inte längre.

### Användning

```bash
python scripts/manual/scaffold-pipeline.py
```

### Menyval

| Val | Vad det gör |
|-----|-------------|
| 1 | Skrapa nya templates till `data/external-template-pipeline/scrape-cache/current` |
| 2 | Importera scrape-cache till `raw-discovery/current` |
| 3 | Ladda ner repos (shallow clones till `repo-cache`) |
| 4 | Bygg template-library + dossiers från explicit `raw-discovery/current` |
| 5 | Generera template-library embeddings (OpenAI API) |
| 6 | Generera scaffold embeddings (OpenAI API) |
| 7 | Kör hela kedjan från befintlig scrape-cache via `full_template_refresh.py --skip-scrape` |
| 8 | Kör hela kedjan från scratch via `full_template_refresh.py` |
| 9 | Visa status |
| 0 | Avsluta |

### Monorepo-skydd

`build-template-library.ts` skippar filval för monorepo-entries där subpath
saknas lokalt, för att undvika att filer från fel del av repot (t.ex.
`apps/bundle-analyzer/` i `vercel/next.js`) hamnar i dossiers. Metadata
(summary, signals, styrkor) behålls.

## Synk med `package.json`

Alla `npm run …`-namn och deras exakta kommandon ligger i **rot [`package.json`](../package.json)** (`scripts`-fältet). Den här README:n är tematisk; vid avvikelse gäller `package.json`.

## recovery/recreate-repo-branch-commit.ps1 (saknas i repot)

Tidigare dokumentation pekade på `scripts/recovery/recreate-repo-branch-commit.ps1`, men **filen finns inte** i denna checkout. För motsvarande arbetsflöde: klona repot manuellt, `git fetch`, `git checkout <commit>` (detached HEAD) i en ny katalog, eller återskapa skriptet från git-historik om du hade en lokal variant.
