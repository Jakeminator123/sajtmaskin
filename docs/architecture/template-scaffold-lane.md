# Template/Scaffold/Dossier-Lanen — botten-till-toppen-karta

**Skapat:** 2026-04-17. Uppdaterat: 2026-04-17 efter Pass-2 (dossier-pipen byggd).
Vad detta är: en karta över hela datavägen från **Vercel templates på vercel.com/templates** ned till **runtime-prompten LLM:en ser**. Avsedd som "lane-ownership"-dokument.

> **Status:** Nya dossier-pipen är byggd och funktionell. Runtime-migration (orchestrate.ts läser nya formatet) är nästa stora steg.

---

## 1. Två parallella spår just nu

| Spår | Vad | Status |
|---|---|---|
| **Gammal pipeline** (template-library/dossiers under `data/external-template-pipeline/reference-library/`) | 97 dossiers, generic regelmotor, runtime läser `template-library.generated.json` | Avvecklas. 97 gamla dossiers raderade 2026-04-17. Generated artifacts ligger kvar tills runtime migrerats. |
| **Ny pipeline** (`data/dossiers/`) | Pool av legoklossar med möbleringsbart register | Byggd. 2 active + 27 draft + 122 skiss-kandidater. Väntar på handcurering + runtime-migration. |

---

## 2. Nya pipens översiktskarta

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
   Output: data/dossiers/_raw/_enriched/<slug>.json  (en fil per template)
   Inkrementell skrivning, try/catch per template (resumable)
   Hämtar äkta Vercel-badges:
     - useCases (Authentication, AI, SaaS, …)
     - stack    (Next.js, Tailwind, …)
     - database (Postgres, Supabase, …)
     - cms      (Sanity, Payload, …)
     - authentication (Clerk Auth, Auth0, …)
     - framework (Next.js, …)
     - repoUrl  (GitHub Repo-sektion)
     - demoUrl
   Tid: ~14 min för 419 templates
        │
        ▼
STEG 3 — IMPORT TILL SKISS  (npm run dossiers:import)
   scripts/dossiers/import-from-enriched.ts
   Output: data/dossiers/_raw/<id>/skiss.json  (en mapp per kandidat)
   Klassificering: prioriterar äkta provider-badges över titel-gissning
   Skip-regler: non-Next-framework (~214 st), Edge/CDN/Web3 (~20), no-classifier-match (~35)
   Resultat: ~149 skiss-kandidater över 8 kategorier (auth/payments/database/cms/realtime/ai/ui-content/ui-marketing)
        │
        ▼
STEG 4 — KURATION-KÖ  (npm run dossiers:queue)
   scripts/dossiers/build-curation-queue.ts
   Output: data/dossiers/_raw/_curation-queue.md  (mänsklig markdown)
   Lista per kategori med checkboxar — du markerar [x] på de du vill ha
        │
        ▼
STEG 5 — PROMOTE TILL DRAFT  (npm run dossiers:promote)
   scripts/dossiers/promote-skiss-to-dossier.ts
   Input:  scripts/dossiers/curated-promotions.txt  (lista med id:n)
   Output: data/dossiers/<id>/manifest.json (_status: "draft")
            data/dossiers/<id>/instructions.md (skeleton)
   Drafts visas i master.json men exkluderas från runtime
        │
        ▼
STEG 6a — REPO-CACHE  (npm run dossiers:clone-repos)
   scripts/dossiers/clone-draft-repos.ts
   Output: data/dossiers/_repo-cache/<dossier-id>/  (shallow clone, --depth=1)
   Skip om sourceRepoUrl saknas eller redan klonad
   Tid: ~1-2 min för 27 repon, ~290 MB total
        │
        ▼ (manuell kuration)
STEG 6b — KOD + INSTRUCTIONS  (manuellt)
   - Inspektera repon i _repo-cache/<id>/
   - Plocka 2-5 nyckelfiler till data/dossiers/<id>/components/
     (auth-flow, middleware, api-route, layout)
   - Skriv komplett instructions.md (When to use / How to integrate / UX rules / Avoid / Verification)
   - Lägg till .env.example om providers-integration
   - Ändra _status till "active"
        │
        ▼
STEG 7 — INDEX  (npm run dossiers:index)
   scripts/dossiers/build-dossier-index.ts
   Output:
     data/dossiers/_index/master.json       (alla dossiers, för backoffice)
     data/dossiers/_index/by-category.json  (active-only, för runtime)
        │
        ▼
STEG 8 — RECOMMENDATIONS  (npm run dossiers:recommend[:merge|:force])
   scripts/dossiers/build-scaffold-recommendations.ts
   Output: data/dossiers/_index/scaffold-recommendations.json
   Per scaffold-id: { alwaysInclude, primaryRecommended, suggested }
   - Default: visar diff utan att skriva (skyddar dina manuella edits)
   - --merge: lägger till nya, behåller dina, släpper stale id:n
   - --force: full regenerering
   Rebuilds: npm run dossiers:rebuild = index + recommend:merge + embeddings
        │
        ▼
STEG 9 — EMBEDDINGS  (npm run dossiers:embeddings)
   scripts/dossiers/generate-dossier-embeddings.ts
   Output: data/dossiers/_index/dossier-embeddings.json
   Embedding på "${label}\n${kind}\n${category}\n${description}\n${summary}\nTags: …"
   Modell: text-embedding-3-small, 1536 dims
   Endast active dossiers (drafts hoppas över)
        │
        ▼
═══════════════════════ RUNTIME (kommer i Pass-4) ═══════════════════════
        │
        ▼
STEG 10 — ORCHESTRATION (TODO i orchestrate.ts)
   selectDossiersForRequest({ prompt, brief, scaffold, capabilities }):
     vector = embed(prompt + brief + scaffold-context)
     candidates = cosine_search(dossier-embeddings, vector, top=20)
     ranked = candidates + recommendation-boost (alwaysInclude/primary/suggested)
     return top 3-5 per category
        │
        ▼
STEG 11 — SYSTEM PROMPT (TODO i system-prompt.ts)
   ## Available Dossiers (poolen — kompakt lista)
   ## Selected Dossier Instructions (för matchade — full instruction)
        │
        ▼
LLM-anrop
```

---

## 3. Filer på disk — vad är vad

### Source of truth (committeras, hand-redigeras)
| Sökväg | Vad | Storlek |
|---|---|---|
| `data/dossiers/<id>/manifest.json` | En dossier per fil. Hand-curated eller draft. | ~1-2 KB |
| `data/dossiers/<id>/instructions.md` | LLM-instruktion för dossiern | ~1-3 KB |
| `data/dossiers/<id>/components/` | Faktisk TSX/TS-kod LLM kopierar | varierar |
| `data/dossiers/<id>/.env.example` | Env-vars dossier behöver | ~0.5 KB |
| `scripts/dossiers/curated-promotions.txt` | Lista med id:n att promote | ~3 KB |
| `docs/architecture/dossier-format.md` | Schema-doc | ~7 KB |
| `docs/schemas/strict/dossier.schema.json` | JSON Schema | ~5 KB |

### Genererat (gitignored, cursorignored)
| Sökväg | Genereras av | Storlek |
|---|---|---|
| `data/dossiers/_raw/playwright-catalog-light.json` | dossiers:scrape | ~700 KB |
| `data/dossiers/_raw/_enriched/<slug>.json` | dossiers:enrich | ~419 filer × ~1-3 KB ≈ 500 KB total |
| `data/dossiers/_raw/<id>/skiss.json` | dossiers:import | ~149 filer × ~0.8 KB |
| `data/dossiers/_raw/_curation-queue.md` | dossiers:queue | ~30 KB |
| `data/dossiers/_raw/_import-summary.json` | dossiers:import | ~3 KB |
| `data/dossiers/_index/master.json` | dossiers:index | ~5-100 KB (skalas med antal dossiers) |
| `data/dossiers/_index/by-category.json` | dossiers:index | ~1-10 KB |
| `data/dossiers/_index/scaffold-recommendations.json` | dossiers:recommend | ~10-50 KB |
| `data/dossiers/_index/dossier-embeddings.json` | dossiers:embeddings | ~30 dossiers × 6 KB ≈ 200 KB |
| `data/dossiers/_repo-cache/<id>/` | dossiers:clone-repos | varierar (shallow clone, ~1-50 MB per repo) |

**Cursor-ignorerade** så indexering inte sväller. Generera vid behov med `npm run dossiers:rebuild`.

---

## 4. Skript-översikt (`scripts/dossiers/`)

| Skript | npm-script | Vad |
|---|---|---|
| `scrape-catalog-light.spec.ts` (e2e) | `dossiers:scrape` | Skrapa Vercel-katalog (419 templates, 3 min) |
| `enrich-template-details.spec.ts` (e2e) | `dossiers:enrich` | Hämta riktiga Vercel-badges (419 templates, 14 min) |
| `import-from-enriched.ts` | `dossiers:import` | Klassificera + skapa skiss-filer |
| `import-from-playwright.ts` | `dossiers:import-light` | Legacy — använd om enriched saknas |
| `build-curation-queue.ts` | `dossiers:queue` | Bygg läsbar kuration-kö |
| `promote-skiss-to-dossier.ts` | `dossiers:promote` | Skapa draft-dossier från curated-promotions.txt |
| `clone-draft-repos.ts` | `dossiers:clone-repos` | Shallow-clone alla draft-repon till _repo-cache/ |
| `build-dossier-index.ts` | `dossiers:index` | Aggregera manifests → master.json + by-category.json |
| `build-scaffold-recommendations.ts` | `dossiers:recommend[:merge|:force]` | Bygg möbleringsbart register |
| `generate-dossier-embeddings.ts` | `dossiers:embeddings` | Embeddings för active dossiers |

**Kombinationsskript:** `dossiers:rebuild` = `index → recommend:merge → embeddings`.

---

## 5. Backoffice

`backoffice/pages/dossiers.py` — Streamlit-sida med 6 flikar:
- **Översikt** — metrics, kategorifördelning
- **Lista** — alla dossiers med filter
- **Möblera** — pick-list per scaffold för recommendations (sparar JSON)
- **Kurations-kö** — visar `_curation-queue.md`
- **Pipeline** — knappar för korta åtgärder, kommandon för långa
- **Filer** — sanity-check vilka pipeline-filer som finns

URL-alias: `?page=dossiers` öppnar direkt.

---

## 6. Embedding-strategi (kärnpunkt för pool-modellen)

| Yta | Idag | Ny pipeline |
|---|---|---|
| Scaffold matchning | Keyword + embedding (hybrid) | Behåll som det är (10 scaffolds är hanterbart) |
| Variant matchning | Keyword (per-variant `keywords` array) | Embedding på `signatureMotif + description + promptHints` (Pass-4) |
| **Dossier matchning** | **Finns inte** | **Embedding** primärt + recommendation-boost |
| Capability inferens | Keyword regex | Behåll — capabilities ska vara billiga och deterministiska |
| Domain inferens | `domain-rules.json` keywords | Behåll, lägg embedding-fallback för okända prompts |

---

## 7. Vad som ska bort i Fas 9 (avveckling)

| Fil | Varför bort |
|---|---|
| `src/lib/gen/template-library/runtime-guidance.ts` | Regelmotor för generic guidance — inte längre använd när dossiers är källa |
| `src/lib/gen/template-library/runtime-guidance.test.ts` | Test för regelmotorn |
| `src/lib/gen/template-library/template-library.generated.json` | Ersatt av `_index/master.json` |
| `src/lib/gen/scaffolds/scaffold-research.generated.json` | Scaffold-research nu intrinsisk i manifest |
| `src/lib/gen/template-library/template-library-embeddings.json` | Ersatt av `_index/dossier-embeddings.json` |
| `scripts/scaffolds/derive-variants-from-dossiers.ts` | BLUEPRINTS-baserad variant-byggare som läste från template-library |
| `scripts/template-library/build-template-library.ts` | Bygger template-library — ej längre nödvändigt |
| `scripts/template-library/full_template_refresh.py` | Wrapper runt gamla pipen |
| `scripts/embeddings/generate-template-library-embeddings.ts` | Gammalt skript |
| `data/external-template-pipeline/raw-discovery/` | Mellanlandning för Playwright-output (gamla spec) |

---

## 8. Hänvisningar

- Format/schema: `docs/architecture/dossier-format.md` + `docs/schemas/strict/dossier.schema.json`
- Roadmap: `docs/architecture/dossier-pipeline-roadmap.md`
- Inventarium (scaffolds + variants): `docs/architecture/scaffold-variants-inventory.md`
- Backoffice: `backoffice/pages/dossiers.py`
- Skript: `scripts/dossiers/`
