# Scripts

GitHub Actions **CI** (typecheck, lint, test, build) på push/PR till **`main`** och **`master`**: [`.github/workflows/ci.yml`](../.github/workflows/ci.yml).

## Översikt och inventering

- **Nav:** [docs/architecture/scripts-scaffolds-inventory.md](../docs/architecture/archive/pre-2026-03-consolidation/scripts-scaffolds-inventory.md) — vilka skript som hänger ihop med package.json, hamta_sidor-varianter, runtime scaffolds, .cursorignore.
- **Vercel use-case-skrapning (Python):** under `scripts/` (ingen kopia i repo-roten).
  - **Kanonisk entrypoint:** [`scripts/hamta_sidor_branch_emil.py`](hamta_sidor_branch_emil.py) — kärnkategorier, valfritt `--extended-scrape`, valfritt `--legacy-wide-use-cases` (historisk bred lista, ~25 use cases), tierad utdata, rapporter. **Standard** för manuell inhämtning.
  - **Tidigare:** `scripts/hamta_sidor.py` (borttagen) motsvaras av `python scripts/hamta_sidor_branch_emil.py --legacy-wide-use-cases` om du **medvetet** behöver jämföra mot historisk bred lista — **inte** som standard i produktions- eller kanon-researchflöden.
  - **Kärnlistan** i skriptet = **`USE_CASES_CORE` (12 Vercel-sluggar)** + valfritt **`USE_CASES_EXTENDED` (2)** med `--extended-scrape`. Det är **osammanhängande** med t.ex. **`EVAL_PROMPTS` (15 eval-promptar)** i `src/lib/gen/eval/prompts.ts` — olika domäner, räkna dem inte ihop.
  - **Icke-kanon:** lokal **`vercel_templates_levels/`** (gitignored); använd **inte** som källa för “hur många kategorier” produkten har. Spårat alternativ: **`e2e/vercel-templates/`**.
  - Se [`docs/architecture/scripts-scaffolds-inventory.md`](../docs/architecture/archive/pre-2026-03-consolidation/scripts-scaffolds-inventory.md).
  - Standard-output ligger **utanför repot** (`../vercel-scrape` eller `SAJTMASKIN_VERCEL_SCRAPE_DIR`); för kanonisk `raw-discovery/current/` se import-steget i [`research/external-templates/README.md`](../research/external-templates/README.md) (**Intake tools**) och Playwright-vägen `e2e/vercel-templates/scrape-catalog.spec.ts`.
- **Vercel template-katalog (Python, repo root):** `vercel_template_cli.py` — filtergrupper på vercel.com/templates → JSON eller kandidatfil för scaffold-kedjan (se avsnitt nedan).

## Lab / debug (`scripts/labs/testning_scarf/`)

**Inte produktion.** Python/TS-verktyg för spårning, scaffold-suite, första-LLM-lab och utskrift av codegen-kontext. Anropas från `package.json`:

| npm-script | Entry |
|------------|--------|
| `npm run prompt:trace` | `scripts/labs/testning_scarf/trace-generation-context.ts` |
| `npm run scaffold:suite` | `scripts/labs/testning_scarf/run_scaffold_suite.py` |
| `npm run first-llm:lab` | `scripts/labs/testning_scarf/first_llm_promptlab.py` |
| `npm run first-llm:live` | `scripts/labs/testning_scarf/run_first_llm_live.ts` |
| `npm run testning:codegen-print` | `scripts/labs/testning_scarf/print_codegen_context.py` |

Om du flyttar labbfiler **måste** dessa npm-rader uppdateras. Inventering: [`docs/architecture/scripts-scaffolds-inventory.md`](../docs/architecture/archive/pre-2026-03-consolidation/scripts-scaffolds-inventory.md).

## vercel_template_cli.py (repo root)

Offline-verktyg som skrapar Vercels **template directory** (flera filterdimensioner: use case, framework, CSS, database, m.m.) och kan exportera GitHub-repo-länkar. **Körs inte i produktion**; det stödjer kurering av externa mallar innan de blir interna scaffolds.

### Förutsättningar

```bash
pip install requests beautifulsoup4
```

### Exempel

```bash
python vercel_template_cli.py --groups use-case,framework --slugs ai,next.js --json templates.json
python vercel_template_cli.py --candidates data/scaffold-candidates-vercel-cli.json
```

Fullständig pipeline och flaggor beskrivs i filens modul-docstring. Därefter: `npm run scaffolds:curate` (eller er interna rapportkedja), manuell granskning, `sync-scaffold-refs.mjs`, arbeta i `src/lib/gen/scaffolds/`.

## sync-scaffold-refs.mjs

Hämtar externa GitHub-referenser till `_template_refs/` för scaffold- och hemsidemallsarbete.

**OBS:** `_template_refs/` används inte vid runtime. Skriptet behövs endast om du utvecklar nya scaffolds från externa referenser. Se `_template_refs/README.md` för mer information.

### Användning

```bash
node scripts/sync-scaffold-refs.mjs
node scripts/sync-scaffold-refs.mjs --force
node scripts/sync-scaffold-refs.mjs --only=nextjs-saas-starter,ibelick-nim
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
npx tsx scripts/build-template-library.ts --source="research/external-templates/raw-discovery/current"
```

För **lokal** `scraped-vercel-scorefolds/` (gitignorerad): verifiera först `summary.json` med `npm run template-library:verify-summary`, bygg sedan med explicit `--source="<repo>/scraped-vercel-scorefolds"`. Utan `repo-cache`-kloning ger många poster låg `qualityScore` → `curatedTemplates: 0`; kör `template-library:hydrate-cache` med samma `--source=` (se [docs/architecture/archive/pre-2026-03-consolidation/scraped-scorefolds-pipeline.md](../docs/architecture/archive/pre-2026-03-consolidation/scraped-scorefolds-pipeline.md)).

Skriptet letar annars automatiskt efter råinput i denna ordning:

1. `research/external-templates/raw-discovery/current`
2. `research/external-templates/raw-discovery`
3. `_sidor/vercel_usecase_next_react_templates`
4. `research/_sidor/vercel_usecase_next_react_templates`
5. den äldre desktop-sökvägen

### Viktig arbetsordning

Kör i denna ordning när du vill bygga om forskningsytan reproducerbart:

```bash
npm run template-library:import-legacy
npm run template-library:hydrate-cache
npm run template-library:build
npm run template-library:embeddings
```

### Vad skriptet gör

1. Läser det kanoniska `summary.json`-kontraktet från raw discovery
2. Inspekterar shallow-clonade repos från `research/external-templates/repo-cache/`
3. Faller bara tillbaka till äldre `_sidor`-repo paths om den valda source-roten
   fortfarande pekar på en legacy-datasetmapp
4. Skapar `research/external-templates/reference-library/` med katalog + dossiers
5. Genererar kuraterade research-artefakter för runtime-sökning i `src/lib/gen/template-library/`
6. Genererar scaffold research metadata i `src/lib/gen/scaffolds/scaffold-research.generated.json`
7. Skriver en prioriterad scaffold-kandidatsrapport till `data/scaffold-candidates-curated.json`

### Produktionsgräns

Det här skriptet är build-time/research-time. Vercel-produktion ska läsa de
kuraterade JSON-filerna som commitas i repot, inte rå discovery, repo-cache
eller råa lokala datasetmappar.

## import-template-discovery.ts

Normaliserar discovery-data till den kanoniska research-lagret under
`research/external-templates/raw-discovery/current/`.

### Användning

```bash
npm run template-library:import-legacy
npx tsx scripts/import-template-discovery.ts --from="C:\\Users\\jakem\\Desktop\\_sidor\\vercel_usecase_next_react_templates\\summary.json"
npx tsx scripts/import-template-discovery.ts --from="research/external-templates/raw-discovery/current/playwright-catalog.json" --format=playwright-catalog
```

## hydrate-template-library-cache.ts

Gör shallow clones av GitHub-repon som refereras i den kanoniska raw-discoveryn.

### Användning

```bash
npm run template-library:hydrate-cache
npx tsx scripts/hydrate-template-library-cache.ts --max=20
```

### Regler

- shallow clone only
- ingen `install` eller `build`
- output hamnar i `research/external-templates/repo-cache/` som är gitignorerad
- `repo-cache` betyder lokal repo-spegel, inte runtime-cache
### Begrepp

- `research/external-templates/raw-discovery/`
  Rå och brusig discovery-output. Bra för triage, inte canonical.
- `research/external-templates/reference-library/`
  Kuraterad extern referensyta med per-template dossiers.
- `src/lib/gen/template-library/`
  Genererade research-artefakter som används av kod vid sökning och promptstöd.
- `src/lib/gen/scaffolds/`
  Den riktiga runtime-scaffold-registryt.

## generate-template-library-embeddings.ts

Genererar embeddings för den kuraterade externa referensytan så att agenter och
framtida scaffold-logik kan söka semantiskt i externa referensmallar.

Detta skriver den stora generated-filen
`src/lib/gen/template-library/template-library-embeddings.json`. Filen kan vara
committad och runtime-viktig samtidigt som den hålls utanför normal
Cursor-indexering för att minska brus och kontextkostnad.

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
npx tsx scripts/curate-scaffold-candidates.ts
npx tsx scripts/curate-scaffold-candidates.ts --input="src/lib/gen/template-library/template-library.generated.json"
```

Behandla `npm run scaffolds:curate` och TypeScript-skriptet ovan som det
kanoniska gränssnittet för curation.

Rapporten i `data/scaffold-candidates-curated.json` är en reproducerbar
arbetsartefakt för scaffold-triage, inte en runtime-källa. Behandla den som en
kandidat för lokal-only output och regenerera den vid behov.

## promote-to-scaffold.ts / scaffolds:promote

Semi-automatisk scaffold-promotion från ett dossier-manifest till ett nytt
runtime scaffold under `src/lib/gen/scaffolds/`.

### Användning

```bash
npm run scaffolds:promote -- starter-image-gallery-starter --dry-run
npx tsx scripts/promote-to-scaffold.ts starter-image-gallery-starter --id=image-gallery-pro --base=portfolio
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
npx tsx scripts/generate-scaffold-embeddings.ts
```

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

Kör eval-suite + scorecard via `scripts/run-eval.ts`. **Utdata:** katalogen `eval-output/` (gitignored) med `eval-report-YYYY-MM-DD.md` och `scorecard-YYYY-MM-DD.md` — datumet i filnamnet är **körningsdagen**, inte en mystisk import. *(Äldre körningar kan ligga i `EGEN_MOTOR_V2/` — byt till `eval-output/` eller flytta filer.)* Vill du spara en rapport i git, kopiera till t.ex. `docs/` medvetet.

## references:discover / scaffolds:discover

Historiskt hette discovery-flödet `scaffolds:discover`, men det producerar inte
interna runtime-scaffolds. Nu kör det Playwright-baserad extern
template-discovery som normaliseras till `research/external-templates/raw-discovery/current/`.

Använd i första hand:

```bash
npm run references:discover
npm run references:discover:second-pass
npm run references:discover:full
```

Kompatibilitetsalias finns kvar:

```bash
npm run scaffolds:discover
npm run scaffolds:discover:full
```

**OBS:** Playwright-specen ligger under **`e2e/vercel-templates/`** (spårad). Kräver Playwright; kör `npx playwright install` vid behov. Scaffolds uppdateras inte automatiskt — se [`vercel-templates-playwright-scaffold-integration.txt`](../docs/architecture/archive/pre-2026-03-consolidation/vercel-templates-playwright-scaffold-integration.txt). Översikt: [`vercel-templates-discovery.md`](../docs/architecture/archive/pre-2026-03-consolidation/vercel-templates-discovery.md), [`e2e/README.md`](../e2e/README.md).

## ~~extract-static-core.mjs~~ (borttagen, 2026-03-27)

Tidigare: extraherade `STATIC_CORE`-template från `system-prompt.ts` till `config/systemprompt.md`. **Monoliten är borta** — statisk kärna laddas via `getStaticCoreFromWorkspace` / `config/prompt-static/` (se `src/lib/gen/static-core-loader.ts`). Skriptet togs bort som **B3-05**.

## scaffold-pipeline.py (avancerat, ej i package.json)

Interaktivt Python-menyskript som samlar alla steg i template-library-kedjan.
Visar aktuell status (antal dossiers, embeddings, kuraterade entries) och lat
dig valja enskilda steg eller kora hela kedjan.

**Placering:** [`scripts/manual/scaffold-pipeline.py`](manual/scaffold-pipeline.py) (översikt: [`scripts/manual/README.md`](manual/README.md)). Gamla sökvägen `scripts/scaffold-pipeline.py` finns inte längre.

### Användning

```bash
python scripts/manual/scaffold-pipeline.py
```

### Menyval

| Val | Vad det gör |
|-----|-------------|
| 1 | Skrapa nya templates från vercel.com/templates (Playwright) |
| 2 | Importera legacy-dataset från Desktop/_sidor |
| 3 | Ladda ner repos (shallow clones till repo-cache) |
| 4 | Bygg template-library + dossiers |
| 5 | Generera template-library embeddings (OpenAI API) |
| 6 | Generera scaffold embeddings (OpenAI API) |
| 7 | Kör allt från befintlig discovery (2+3+4+5+6) |
| 8 | Kör allt från scratch (1+3+4+5+6) |
| 9 | Visa status |
| 0 | Avsluta |

### Monorepo-skydd

`build-template-library.ts` skippar filval för monorepo-entries där subpath
saknas lokalt, för att undvika att filer från fel del av repot (t.ex.
`apps/bundle-analyzer/` i `vercel/next.js`) hamnar i dossiers. Metadata
(summary, signals, styrkor) behålls.

## recovery/recreate-repo-branch-commit.ps1 (saknas i repot)

Tidigare dokumentation pekade på `scripts/recovery/recreate-repo-branch-commit.ps1`, men **filen finns inte** i denna checkout. För motsvarande arbetsflöde: klona repot manuellt, `git fetch`, `git checkout <commit>` (detached HEAD) i en ny katalog, eller återskapa skriptet från git-historik om du hade en lokal variant.
