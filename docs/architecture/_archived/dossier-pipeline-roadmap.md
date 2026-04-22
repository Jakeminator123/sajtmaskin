# Dossier-pipeline — Roadmap och Lane-karta

**Senast uppdaterad:** 2026-04-20.

Trackar fasen "scaffolds + dossiers + kurationer + embeddings" från Vercel-katalogen ned till runtime-prompten LLM:en ser.

> **Status:** ~85% färdigt. Fas 0-3 + 5-7 klara. Fas 4 (manuell kuration), 8 (variant embeddings) och 9 (avveckling) återstår.

---

## 1. Faser

| Fas | Status | Vad |
|---|---|---|
| 0. Format + 2 manuella exempel | KLAR | dossier-format.md, JSON Schema, 2 hand-curated dossiers (payments-stripe-checkout, ui-pricing-tier-table) |
| 1. Legacy-städning | KLAR | 97 gamla dossiers raderade. `data/external-template-pipeline/reference-library/` borttagen |
| 2. Skript-infrastruktur | KLAR | 11 npm-scripts (`dossiers:scrape/enrich/import/queue/promote/clone-repos/extract-files/index/recommend/embeddings/rebuild`) |
| 3. Skrap + enrich + import | KLAR | 419 unika templates skrapade, alla enriched med Vercel-badges. 149 dossier-kandidater i 8 kategorier |
| 4. Kuration → riktiga dossiers | DELVIS | 27 drafts skapade. **20 av 27 auto-populerade** med 2-5 nyckelfiler + dependencies + envVars. Återstår: skriv instructions.md per dossier + sätt `_status: "active"`. ~5-7 h handarbete |
| 5. Master-index + embeddings | KLAR | master.json + by-category.json + scaffold-recommendations.json (290 entries över 10 scaffolds, JSON Schema validerad). Embeddings för 29 dossiers |
| 6. Runtime-migration | KLAR | `orchestrate.ts` kallar `selectDossiersForRequest`. `system-prompt.ts` injicerar `## Available Dossiers` + `## Selected Dossier Instructions`. Feature-flag `useDossierPipeline` (default på i dev, av i prod) |
| 7. Backoffice + docs sync | KLAR | `backoffice/pages/dossiers.py` (6 flikar) med extraktion-status. JSON Schema. Lane-doc + format-doc + glossary uppdaterade |
| 8. Embedding-byte för variant + scaffold | Återstår | Variant `keywords` ersätts av embedding-matching. Scaffold matcher prioriterar embedding över keyword |
| 9. Avveckling av gammal pipeline | Återstår | Radera `runtime-guidance.ts` regelmotorn. Avveckla `template-library.generated.json` + `scaffold-research.generated.json`. Avveckla `derive-variants-from-dossiers.ts` |

---

## 2. Pipeline översikt — botten till topp

```
EXTERN KÄLLA: vercel.com/templates  (~419 unika Next.js-templates)
        │  Playwright (JS-rendering nödvändig)
        ▼
STEG 1 — KATALOG-SKRAPA  (npm run dossiers:scrape)
   e2e/vercel-templates/scrape-catalog-light.spec.ts
   Output: data/dossiers/_raw/playwright-catalog-light.json   (~3 min, 419 templates)
   Innehåll: titel, URL, beskrivning, vercel-kategori per template
        │
        ▼
STEG 2 — DETALJ-ENRICH  (npm run dossiers:enrich)
   e2e/vercel-templates/enrich-template-details.spec.ts
   Output: data/dossiers/_raw/_enriched/<slug>.json  (en fil per template, ~14 min för 419)
   Hämtar äkta Vercel-badges:
     - useCases, stack, database, cms, authentication, framework, repoUrl, demoUrl
        │
        ▼
STEG 3 — IMPORT TILL SKISS  (npm run dossiers:import)
   scripts/dossiers/import-from-enriched.ts
   Output: data/dossiers/_raw/<id>/skiss.json  (en mapp per kandidat)
   Klassificering: prioriterar äkta provider-badges över titel-gissning
   Skip-regler: non-Next-framework (~214), Edge/CDN/Web3 (~20), no-classifier-match (~35)
   Resultat: ~149 skiss-kandidater över 8 kategorier
        │
        ▼
STEG 4 — KURATION-KÖ  (npm run dossiers:queue)
   scripts/dossiers/build-curation-queue.ts
   Output: data/dossiers/_raw/_curation-queue.md  (mänsklig markdown)
        │
        ▼
STEG 5 — PROMOTE TILL DRAFT  (npm run dossiers:promote)
   scripts/dossiers/promote-skiss-to-dossier.ts
   Input:  scripts/dossiers/curated-promotions.txt  (lista med id:n)
   Output: data/dossiers/<id>/manifest.json (_status: "draft")
            data/dossiers/<id>/instructions.md (skeleton)
        │
        ▼
STEG 6a — REPO-CACHE  (npm run dossiers:clone-repos)
   Output: data/dossiers/_repo-cache/<dossier-id>/  (shallow clone, --depth=1)
   Skip om sourceRepoUrl saknas eller redan klonad. Tid: ~1-2 min för 27 repon, ~290 MB
        │
        ▼
STEG 6b — AUTO-EXTRAKTION  (npm run dossiers:extract-files)
   Per draft med _repo-cache:
     - Plocka 2-5 nyckelfiler enligt prioriterade regex
       (middleware, app/layout.tsx, app/api/*/route.ts, lib/{auth,stripe,...}.ts)
     - Stöder src/ + monorepo-prefix
     - Kopiera till data/dossiers/<id>/components/
     - Parsa package.json → dependencies
     - Parsa .env.example → envVars
   Resultat: 20 av 27 drafts populerade. Sparar ~7-8h handarbete
        │
        ▼ (manuell kuration kvar)
STEG 6c — INSTRUCTIONS + ACTIVATE  (manuellt)
   - Verifiera extraherade filer
   - Skriv komplett instructions.md
   - Ändra _status till "active"
   - Kör npm run dossiers:rebuild
        │
        ▼
STEG 7 — INDEX  (npm run dossiers:index)
   Output:
     data/dossiers/_index/master.json       (alla dossiers, för backoffice)
     data/dossiers/_index/by-category.json  (active-only, för runtime)
        │
        ▼
STEG 8 — RECOMMENDATIONS  (npm run dossiers:recommend[:merge|:force])
   Output: data/dossiers/_index/scaffold-recommendations.json
   Per scaffold-id: { alwaysInclude, primaryRecommended, suggested }
   - Default: visar diff utan att skriva (skyddar manuella edits)
   - --merge: lägger till nya, behåller dina, släpper stale id:n
   - --force: full regenerering
        │
        ▼
STEG 9 — EMBEDDINGS  (npm run dossiers:embeddings)
   Output: data/dossiers/_index/dossier-embeddings.json
   Embedding på "${label}\n${kind}\n${category}\n${description}\n${summary}\nTags: …"
   Modell: text-embedding-3-small, 1536 dims. Endast active dossiers
        │
        ▼ ════════════════ RUNTIME (Fas 6 KLAR) ════════════════
        ▼
STEG 10 — ORCHESTRATION (orchestrate.ts)
   selectDossiersForRequest({ prompt, brief, scaffold, capabilities }):
     vector = embed(prompt + brief + scaffold-context)
     candidates = cosine_search(dossier-embeddings, vector, top=20)
     ranked = candidates + recommendation-boost (alwaysInclude/primary/suggested)
     return top 3-5 per category (cap: max 1/kategori, max 5 totalt)
        │
        ▼
STEG 11 — SYSTEM PROMPT (system-prompt.ts)
   ## Available Dossiers (poolen — kompakt lista)
   ## Selected Dossier Instructions (för matchade — full instruction)
   ## Dossier Files To Emit Verbatim (Fas 1.5)
        │
        ▼
LLM-anrop
```

---

## 3. Vad runtime-migrationen (Fas 6) konkret innebar

| Fil | Före | Efter |
|---|---|---|
| `src/lib/gen/orchestrate.ts` | `resolveTemplateGuidance()` läste scaffold.research.referenceTemplates → `template-library.generated.json` | `selectDossiersForRequest()` läser `dossier-embeddings.json` → cosine match top N per category från prompt+brief |
| `src/lib/gen/system-prompt.ts` | `## Scaffold Research Priorities` block | `## Available Dossiers` (lista) + `## Selected Dossier Instructions` (för matchade) |
| `src/lib/gen/template-library/catalog.ts` | `getTemplateLibraryEntries()` | Ersätts av `getDossierEntries()` (läser `_index/master.json`) |
| `src/lib/gen/scaffold-variants/structural-files.ts` | Slår upp variant.sourceTemplateIds → template-library | Slår upp variant.relatedDossierIds → dossier components/ |
| `src/lib/gen/scaffolds/registry.ts` | scaffold-research mergas in vid load | Inget — scaffold-manifest har bara intrinsisk metadata |

---

## 4. Filer på disk

### Source of truth (committeras, hand-redigeras)

| Sökväg | Vad | Storlek |
|---|---|---|
| `data/dossiers/<id>/manifest.json` | En dossier per fil. Hand-curated eller draft | ~1-2 KB |
| `data/dossiers/<id>/instructions.md` | LLM-instruktion | ~1-3 KB |
| `data/dossiers/<id>/components/` | Faktisk TSX/TS-kod LLM kopierar | varierar |
| `data/dossiers/<id>/.env.example` | Env-vars dossier behöver | ~0.5 KB |
| `scripts/dossiers/curated-promotions.txt` | Lista med id:n att promote | ~3 KB |
| `docs/architecture/dossier-format.md` | Schema-doc | ~7 KB |
| `docs/schemas/strict/dossier.schema.json` | JSON Schema | ~5 KB |

### Genererat (gitignored, cursorignored)

| Sökväg | Genereras av | Storlek |
|---|---|---|
| `data/dossiers/_raw/playwright-catalog-light.json` | dossiers:scrape | ~700 KB |
| `data/dossiers/_raw/_enriched/<slug>.json` | dossiers:enrich | ~419 × ~1-3 KB ≈ 500 KB |
| `data/dossiers/_raw/<id>/skiss.json` | dossiers:import | ~149 × ~0.8 KB |
| `data/dossiers/_raw/_curation-queue.md` | dossiers:queue | ~30 KB |
| `data/dossiers/_index/master.json` | dossiers:index | ~5-100 KB |
| `data/dossiers/_index/by-category.json` | dossiers:index | ~1-10 KB |
| `data/dossiers/_index/scaffold-recommendations.json` | dossiers:recommend | ~10-50 KB |
| `data/dossiers/_index/dossier-embeddings.json` | dossiers:embeddings | ~30 × 6 KB ≈ 200 KB |
| `data/dossiers/_repo-cache/<id>/` | dossiers:clone-repos | varierar, shallow |

Generera vid behov med `npm run dossiers:rebuild` (= `index → recommend:merge → embeddings`).

---

## 5. Skript-översikt (`scripts/dossiers/`)

| Skript | npm-script | Vad |
|---|---|---|
| `scrape-catalog-light.spec.ts` (e2e) | `dossiers:scrape` | Skrapa Vercel-katalog (419, 3 min) |
| `enrich-template-details.spec.ts` (e2e) | `dossiers:enrich` | Hämta riktiga Vercel-badges (419, 14 min) |
| `import-from-enriched.ts` | `dossiers:import` | Klassificera + skapa skiss-filer |
| `import-from-playwright.ts` | `dossiers:import-light` | Legacy — använd om enriched saknas |
| `build-curation-queue.ts` | `dossiers:queue` | Bygg läsbar kuration-kö |
| `promote-skiss-to-dossier.ts` | `dossiers:promote` | Skapa draft-dossier från curated-promotions.txt |
| `clone-draft-repos.ts` | `dossiers:clone-repos` | Shallow-clone alla draft-repon till `_repo-cache/` |
| `extract-files-from-cache.ts` | `dossiers:extract-files` | Plocka 2-5 nyckelfiler + deps + envVars från klonade repon |
| `build-dossier-index.ts` | `dossiers:index` | Aggregera manifests → master.json + by-category.json |
| `build-scaffold-recommendations.ts` | `dossiers:recommend[:merge|:force]` | Bygg möbleringsbart register |
| `generate-dossier-embeddings.ts` | `dossiers:embeddings` | Embeddings för active dossiers |

---

## 6. Backoffice

`backoffice/pages/dossiers.py` — Streamlit-sida med 6 flikar:

| Flik | Innehåll |
|---|---|
| Översikt | Metrics, kategorifördelning |
| Lista | Alla dossiers med filter |
| Möblera | Pick-list per scaffold för recommendations (sparar JSON) |
| Kurations-kö | Visar `_curation-queue.md` |
| Pipeline | Knappar för korta åtgärder, kommandon för långa |
| Filer | Sanity-check vilka pipeline-filer som finns |

URL-alias: `?page=dossiers` öppnar direkt.

---

## 7. Embedding-strategi

| Yta | Idag | Mål-arkitektur (Fas 8) |
|---|---|---|
| Scaffold matchning | Keyword + embedding (hybrid) | Embedding primärt, keyword som veto-säkerhet |
| Variant matchning | Keyword (per-variant `keywords` array) | Embedding på `signatureMotif + description + promptHints` |
| Domain inferens | `domain-rules.json` keywords | Behålls. Embedding-fallback för okända prompts |
| **Dossier matchning** | **Embedding** (Fas 5 KLAR) | Behålls |
| Capability inferens | Keyword regex | Behålls — capabilities ska vara billiga och deterministiska |

---

## 8. Filer som ska bort i Fas 9

| Fil | Varför bort |
|---|---|
| `src/lib/gen/template-library/runtime-guidance.ts` | Regelmotor som producerade generic boilerplate |
| `src/lib/gen/template-library/runtime-guidance.test.ts` | Test för regelmotorn |
| `src/lib/gen/template-library/template-library.generated.json` | Ersatt av `_index/master.json` |
| `src/lib/gen/scaffolds/scaffold-research.generated.json` | Scaffold-research nu intrinsisk i manifest |
| `src/lib/gen/template-library/template-library-embeddings.json` | Ersatt av `dossier-embeddings.json` |
| `scripts/scaffolds/derive-variants-from-dossiers.ts` | BLUEPRINTS-baserad variant-byggare som läste från template-library |
| `scripts/template-library/build-template-library.ts` | Bygger template-library — ej längre nödvändigt |
| `scripts/template-library/full_template_refresh.py` | Wrapper runt gamla pipen |
| `scripts/embeddings/generate-template-library-embeddings.ts` | Gammalt skript |
| `data/external-template-pipeline/raw-discovery/` | Mellanlandning för Playwright-output (gamla spec) |

---

## 9. Vad jag inte rör i denna fas

- Scaffold-systemets 10 manifest-filer — innehåll oförändrat. Bara `referenceTemplates`-fältet kommer städas i Fas 9.
- Eval-suiten — uppdateras vid behov.

---

## Hänvisningar

- Format: [dossier-format.md](./dossier-format.md) + `docs/schemas/strict/dossier.schema.json`
- Promotion-flöde: [dossier-promotion-flow.md](./dossier-promotion-flow.md)
- Scaffold-inventarium: [scaffold-system.md](./scaffold-system.md)
- Backoffice: `backoffice/pages/dossiers.py`
- Skript: `scripts/dossiers/`
