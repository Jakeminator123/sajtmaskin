# Scrapade Vercel-scorefolds → template-library → prompt

`scraped-vercel-scorefolds/` är **gitignorerad** lokalt; denna fil dokumenterar hur den kopplas till repots pipeline och till **egen motor**s promptlager.

## 1. Verifiera `summary.json`

Kör från repo-root:

```bash
pnpm run template-library:verify-summary
# eller
npx tsx scripts/verify-discovered-summary.ts --path=scraped-vercel-scorefolds
```

Skriptet läser `summary.json`, kör samma `normalizeLegacySummary` som `build-template-library.ts`, och rapporterar antal kategorier och mallposter. Scrapes kan ha **extra fält** (t.ex. `css_tags`); kärnfälten som krävs beskrivs i [research/external-templates/raw-discovery/SCHEMA.md](../../research/external-templates/raw-discovery/SCHEMA.md).

## 2. Explicit källa till byggskriptet

Undvik att fel rot väljs automatiskt:

```bash
npx tsx scripts/build-template-library.ts --source="<repo>/scraped-vercel-scorefolds"
```

`SOURCE_ROOT_CANDIDATES` i `build-template-library.ts` provar `scraped-vercel-scorefolds` **först**, men explicit `--source=` är tydligast i CI och dokumentation.

## 3. Varför `curatedTemplates` kan vara 0

Kurering kräver bland annat `qualityScore >= 45` och visse `verdict` filtreras bort. Utan klonade repon under `research/external-templates/repo-cache/` kan inspektion av `package.json` misslyckas (`hasNext: false`, låg score → **0 kuraterade** trots `totalTemplates: 69`).

**Åtgärd:** kör hydrate mot samma källa, bygg om:

```bash
npx tsx scripts/hydrate-template-library-cache.ts --source="<repo>/scraped-vercel-scorefolds" --max=50
npx tsx scripts/build-template-library.ts --source="<repo>/scraped-vercel-scorefolds"
```

När `entries.length > 0` i `template-library.generated.json`:

```bash
pnpm run template-library:embeddings
```

## 4. Relation till runtime-scaffolds

- **Template-library** (kuraterade poster + dossiers) = extern **referens** för `rankTemplateReferences` och valda kodutdrag.
- **Tio interna scaffolds** i `src/lib/gen/scaffolds/registry.ts` = det som **matchas** (`matchScaffold` / `matchScaffoldWithEmbeddings`) och **serialiseras** till prompten.

Scrape-mappen skapar **inte** automatiskt nya registry-scaffolds; se [research/external-templates/reference-library/PROMOTION_WORKFLOW.md](../../research/external-templates/reference-library/PROMOTION_WORKFLOW.md).

## 5. Statisk vs dynamisk prompt (egen motor)

| Lager | Var | Innehåll |
|--------|-----|----------|
| **Statisk** | `config/codegen-static-prompt.json` + `config/prompt-static/*.md` via `static-core-loader.ts` | Regler, tech stack, output-format, **08-scaffold-starters** (generella scaffold-regler). Ingen per-request scaffold-body. |
| **Dynamisk** | `buildDynamicContext()` i `system-prompt.ts` | Build intent, **serialized scaffold** (+ ev. research priorities), KB, **template-library-träffar**, route plan, contracts, m.m. |
| **Helhet** | `buildSystemPrompt()` | `getStaticCoreFromWorkspace()` + separator + dynamisk kontext (statisk först, dynamisk efter). |

v0-läget: `prepareGenerationContext` i `orchestrate.ts` särskiljer `engineSystemPrompt` och `v0EnrichmentContext`; trace-snapshot skriver båda under `scripts/testning_scarf/output/codegen_snapshot/*/`.

## 6. Test: svensk hemsida-prompt

Exempelfil: [scripts/testning_scarf/restaurang_hemsida_prompt.txt](../../scripts/testning_scarf/restaurang_hemsida_prompt.txt).

```bash
npx tsx scripts/testning_scarf/trace-generation-context.ts ^
  --prompt-file scripts/testning_scarf/restaurang_hemsida_prompt.txt ^
  --build-intent website --scaffold-mode auto ^
  --write-codegen-snapshot scripts/testning_scarf/output/codegen_snapshot/restaurang_sv_demo
```

Granska `02_engine_system_prompt.txt` (statisk + dynamisk sammanslaget), `04_snapshot_meta.json` (`resolvedScaffoldId`), och `trace`-JSON för embedding-topplista.

## 7. Automatiska tester (extern template-library)

Vitest-filen [`src/lib/gen/template-library/template-library-external-integration.test.ts`](../../src/lib/gen/template-library/template-library-external-integration.test.ts) verifierar att den **inbyggda** katalogen (`template-library.generated.json` + embeddings) är konsistent och att samma kodvägar som prompten använder fungerar:

- Katalogen har poster; **embedding-id:n** matchar katalog-id:n ett-till-ett.
- Poster har fält som promptberikning förväntar sig (`title`, `categoryName`, `summary`, `recommendedScaffoldFamilies`, `qualityScore`, `selectedFiles`).
- Nyckelordsökning (`searchTemplateLibraryKeywordsOnly`) returnerar träffar för typiska engelska frågor.
- `getTemplateLibraryEntryById` och `selectTemplateReferenceFiles` ger icke-tomma utdrag när `selectedFiles` finns.
- Om `OPENAI_API_KEY` är satt körs även semantisk sökning (`searchTemplateLibrary`); annars hoppas det testet över.

Kör bara den filen:

```bash
pnpm exec vitest run src/lib/gen/template-library/template-library-external-integration.test.ts
```

Hela CI-sviten: `pnpm run test:ci`.
