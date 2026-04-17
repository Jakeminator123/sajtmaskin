# Dossier-pipeline — roadmap

**Skapat:** 2026-04-17. Trackar fasen "scaffolds + dossiers + kurationer + embeddings" till 100% färdigt.

> **Status:** ~85% av "allt funkar". Fas 0-3 + 5-7 klara. Fas 4 (manuell kuration), 8 (variant embeddings) och 9 (avveckling) återstår.

## Faser

| Fas | Status | Vad |
|---|---|---|
| **0. Format + 2 manuella exempel** | ✅ KLAR | dossier-format.md, JSON Schema, 2 hand-curated dossiers (payments-stripe-checkout, ui-pricing-tier-table) |
| **1. Legacy-städning** | ✅ KLAR | 97 gamla dossiers raderade. `data/external-template-pipeline/reference-library/` borttagen. tsconfig exclude lagt till. |
| **2. Skript-infrastruktur** | ✅ KLAR | 11 npm-scripts (`dossiers:scrape/enrich/import/import-light/queue/promote/clone-repos/extract-files/index/recommend/embeddings/rebuild`) |
| **3. Skrap + enrich + import** | ✅ KLAR | 419 unika templates skrapade, alla enriched med riktiga Vercel-badges (useCases/stack/database/cms/auth/repo). 149 dossier-kandidater i 8 kategorier. |
| **4. Kuration → riktiga dossiers** | ⏳ DELVIS | 27 drafts skapade. **20 av 27 auto-populerade** med 2-5 nyckelfiler + dependencies + envVars från `_repo-cache/` via `extract-files-from-cache.ts`. Återstår: skriv instructions.md per dossier + sätt `_status: "active"`. ~5-7 h handarbete (mot tidigare 16-22 h). |
| **5. Master-index + embeddings** | ✅ KLAR | master.json + by-category.json + scaffold-recommendations.json (290 entries över 10 scaffolds, JSON Schema validerad). Embeddings genererade för 29 dossiers. |
| **6. Runtime-migration** | ✅ KLAR | `orchestrate.ts` kallar `selectDossiersForRequest`. `system-prompt.ts` injicerar `## Available Dossiers` + `## Selected Dossier Instructions`. Feature-flag `useDossierPipeline` (default på i dev, av i prod). 6/6 unit tests grön. |
| **7. Backoffice + docs sync** | ✅ KLAR | `backoffice/pages/dossiers.py` (6 flikar) med extraktion-status. JSON Schema för scaffold-recommendations. Lane-doc + format-doc + glossary uppdaterade. |
| **8. Embedding-byte för variant + scaffold** | ⏳ Återstår | Variant `keywords` ersätts av embedding-matching. Scaffold matcher prioriterar embedding över keyword. |
| **9. Avveckling av gammal pipeline** | ⏳ Återstår | Radera `runtime-guidance.ts` regelmotorn. Avveckla `template-library.generated.json` + `scaffold-research.generated.json`. Avveckla `derive-variants-from-dossiers.ts`. |

## Vad runtime-migrationen (Fas 6) konkret innebär

| Fil | Före | Efter |
|---|---|---|
| `src/lib/gen/orchestrate.ts` | `resolveTemplateGuidance()` läser scaffold.research.referenceTemplates → `template-library.generated.json` | `resolveDossiersForRequest()` läser `dossier-embeddings.json` → cosine match top N per category från prompt+brief |
| `src/lib/gen/system-prompt.ts` | `## Scaffold Research Priorities` block | `## Available Dossiers` (lista) + `## Selected Dossier Instructions` (för matchade) |
| `src/lib/gen/template-library/catalog.ts` | `getTemplateLibraryEntries()` | Ersätts av `getDossierEntries()` (läser `_index/master.json`) |
| `src/lib/gen/scaffold-variants/structural-files.ts` | Slår upp variant.sourceTemplateIds → template-library | Slår upp variant.relatedDossierIds → dossier components/ |
| `src/lib/gen/scaffolds/registry.ts` | scaffold-research mergas in vid load | Inget — scaffold-manifest har bara intrinsisk metadata |

## Filer som ska bort i Fas 9 (sista städningen)

| Fil | Varför bort |
|---|---|
| `src/lib/gen/template-library/runtime-guidance.ts` | Regelmotor som producerade generic boilerplate. Inte längre använd. |
| `src/lib/gen/template-library/runtime-guidance.test.ts` | Test för regelmotorn. |
| `src/lib/gen/template-library/template-library.generated.json` | Gammal output, ersatt av `_index/master.json`. |
| `src/lib/gen/scaffolds/scaffold-research.generated.json` | Gammal output, scaffold-research är nu intrinsisk i manifest. |
| `src/lib/gen/template-library/template-library-embeddings.json` | Gammal embedding-fil, ersatt av `dossier-embeddings.json`. |
| `scripts/scaffolds/derive-variants-from-dossiers.ts` | BLUEPRINTS-baserad variant-byggare som läste från template-library. Variants är handeditade + embedding-matchade i nya pipen. |
| `scripts/template-library/build-template-library.ts` | Bygger template-library — inte längre nödvändigt. |
| `scripts/template-library/full_template_refresh.py` | Wrapper runt gamla pipen. |
| `scripts/embeddings/generate-template-library-embeddings.ts` | Gammalt skript. |
| `data/external-template-pipeline/raw-discovery/` | Mellanlandning för Playwright-output. Behåll så länge Playwright-skriptet skriver dit. |

## Vad jag inte rör i denna fas

- Scaffold-systemets 10 manifest-filer — innehåll oförändrat. Bara `referenceTemplates`-fältet kommer städas i Fas 9.
- Backoffice — uppdateras i Fas 7 efter att master.json + dossier-embeddings finns.
- Eval-suiten — uppdateras i Fas 6 när orchestrate.ts byter till dossier-flödet.

## Embedding-strategi sammanfattning

| Yta | Idag | Mål-arkitektur |
|---|---|---|
| Scaffold matchning | Keyword + embedding (hybrid) | Embedding primärt, keyword som veto-säkerhet |
| Variant matchning | Keyword (per-variant `keywords` array) | Embedding på `signatureMotif + description + promptHints` |
| Domain inferens | `domain-rules.json` keywords | Behålls (domän-listan är hanterbar). Embedding-fallback för okända prompts. |
| **Dossier matchning** | **Finns inte ännu** | **Embedding** (det här är hela poängen med Fas 5) |
| Capability inferens | Keyword regex | Behålls — capabilities ska vara billiga och deterministiska |

## Hänvisningar

- Format: `docs/architecture/dossier-format.md`
- Schema: `docs/schemas/strict/dossier.schema.json`
- Lane-karta: `docs/architecture/template-scaffold-lane.md`
- Inventarium: `docs/architecture/scaffold-variants-inventory.md`
