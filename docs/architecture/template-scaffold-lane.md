# Template/Scaffold-Lanen — botten-till-toppen-karta

**Skapat:** 2026-04-17. Vad detta är: en karta över hela datavägen från **Vercel templates på vercel.com/templates** ända ned till **runtime-prompten LLM:en ser**. Avsedd som ditt eget "lane-ownership"-dokument — när du vill bygga om från grunden ska du kunna börja här och se exakt var varje signal föds, transformeras och konsumeras.

> **Status:** Pipelinen funkar i drift idag, men den är keyword-tung och produerar generiska guidance-strängar i flera lager. Inventariedokumentet (`scaffold-variants-inventory.md`) listar specifika konsekvenser på variant-nivå. Detta dokument fokuserar på _hela kedjan_.

---

## 1. Översiktskarta

```
  ┌────────────────────────────────────────────────────────────────┐
  │ EXTERN KÄLLA: vercel.com/templates                             │
  └────────────────────────────────────────────────────────────────┘
                            │  HTTP scraping (BeautifulSoup)
                            ▼
  ┌─────────────────── STEG 1 — SCRAPE ────────────────────────────┐
  │ scripts/template-library/hamta_sidor_branch_emil.py            │
  │ Output: data/external-template-pipeline/scrape-cache/current/  │
  │   - summary.json (alla skrapade templates)                      │
  │   - summary-cleaned.json (filtrerad)                            │
  │   - per-kategori filer                                          │
  └────────────────────────────────────────────────────────────────┘
                            │  npx tsx import-template-discovery.ts
                            ▼
  ┌─────────────────── STEG 2 — IMPORT ────────────────────────────┐
  │ scripts/template-library/import-template-discovery.ts          │
  │ Output: data/external-template-pipeline/raw-discovery/current/ │
  │   - canonical-formaterad raw discovery JSON                     │
  └────────────────────────────────────────────────────────────────┘
                            │  npx tsx hydrate-template-library-cache.ts
                            ▼
  ┌─────────────────── STEG 3 — CLONE ─────────────────────────────┐
  │ scripts/template-library/hydrate-template-library-cache.ts     │
  │ Output: data/external-template-pipeline/repo-cache/<repo>/     │
  │   - faktisk Git-klonad kod från varje template-repo             │
  └────────────────────────────────────────────────────────────────┘
                            │  npx tsx build-template-library.ts
                            ▼
  ┌─────────────────── STEG 4 — DOSSIERS + LIBRARY ────────────────┐
  │ scripts/template-library/build-template-library.ts             │
  │ Använder: src/lib/gen/template-library/runtime-guidance.ts     │
  │           (deterministisk regelmotor)                           │
  │ Output 1: data/external-template-pipeline/reference-library/   │
  │   dossiers/<id>/                                                │
  │     - manifest.json (metadata + selectedFiles + signals +       │
  │       runtimeGuidance + recommendedScaffoldIds)                 │
  │     - selected_files/ (utdrag av faktisk kod)                   │
  │     - summary.md                                                │
  │   catalog.json (97-191 entries)                                 │
  │   catalog.md                                                    │
  │ Output 2: src/lib/gen/template-library/                        │
  │   template-library.generated.json (1.2 MB, runtime-läsbar)     │
  │ Output 3: src/lib/gen/scaffolds/                               │
  │   scaffold-research.generated.json (per scaffold:               │
  │     qualityChecklist, upgradeTargets, referenceTemplates)      │
  └────────────────────────────────────────────────────────────────┘
                            │  npx tsx generate-*-embeddings.ts
                            ▼
  ┌─────────────────── STEG 5 — EMBEDDINGS ────────────────────────┐
  │ scripts/embeddings/generate-template-library-embeddings.ts     │
  │ scripts/embeddings/generate-scaffold-embeddings.ts             │
  │ Output: src/lib/gen/template-library/template-library-         │
  │           embeddings.json                                       │
  │         src/lib/gen/scaffolds/scaffold-embeddings.json         │
  │ Används vid runtime av matchScaffoldAuto för semantic search    │
  └────────────────────────────────────────────────────────────────┘
                            │  npx tsx derive-variants-from-dossiers.ts
                            ▼
  ┌─────────────────── STEG 6 — VARIANTS ──────────────────────────┐
  │ scripts/scaffolds/derive-variants-from-dossiers.ts             │
  │ Använder: 21 hand-skrivna BLUEPRINTS i toppen av filen          │
  │ Output: config/scaffold-variants/<scaffoldId>/<variantId>.json │
  │ (21 filer; design-axes från blueprint, sourceTemplateIds från   │
  │  ranking mot template-library)                                  │
  └────────────────────────────────────────────────────────────────┘

  ════════════════════════ RUNTIME ═══════════════════════════════
                            │
                            ▼
  ┌─────────────────── STEG 7 — RUNTIME LÄSNING ──────────────────┐
  │ src/lib/gen/scaffolds/registry.ts                              │
  │   Läser 10 scaffold-manifest + scaffold-research.generated.json │
  │ src/lib/gen/scaffold-variants/registry.ts                      │
  │   Läser 21 variant-JSON                                         │
  │ src/lib/gen/template-library/catalog.ts                        │
  │   Läser template-library.generated.json                         │
  │ src/lib/gen/scaffolds/scaffold-search.ts                       │
  │   Läser scaffold-embeddings.json (semantic search)              │
  └────────────────────────────────────────────────────────────────┘
                            │
                            ▼
  ┌─────────────────── STEG 8 — ORCHESTRATION ─────────────────────┐
  │ src/lib/gen/orchestrate.ts → resolveOrchestrationBase          │
  │   matchScaffoldAuto (keyword + embedding)                       │
  │   pickScaffoldVariant (keyword)                                 │
  │   inferCapabilities (keyword regex)                             │
  │   buildRoutePlan, buildBuildSpec, ...                           │
  └────────────────────────────────────────────────────────────────┘
                            │
                            ▼
  ┌─────────────────── STEG 9 — SYSTEM PROMPT ─────────────────────┐
  │ src/lib/gen/system-prompt.ts → buildDynamicContext             │
  │   ## Scaffold (serialiserad)                                    │
  │   ## Scaffold Variant (motif, fonts, themeTokens, promptHints)  │
  │   ## Scaffold Research Priorities (qualityChecklist + upgrades) │
  │   ## Structural References (selectedFiles från dossier)         │
  │   ## Component References (shadcn examples)                     │
  └────────────────────────────────────────────────────────────────┘
                            │
                            ▼
                       LLM-anrop
```

## 2. Per-fil ansvar

### Steg 1: Scrape
- **`scripts/template-library/hamta_sidor_branch_emil.py`** (Python, BeautifulSoup)
  - Skrapar `vercel.com/templates` via HTTP. Itererar genom use-case-kategorier (`USE_CASES_CORE` 12 st + `USE_CASES_EXTENDED` 2 st + `LEGACY_WIDE_USE_CASES` ~25 st).
  - Plockar metadata: titel, URL, kategori, GitHub-repo-url, demo-url, beskrivning.
  - Skriver till `scrape-cache/current/summary.json`.
  - **Ingen LLM-användning. Pure scraping.**
  - Bör röras om: vi vill ändra vilka kategorier vi skrapar, eller hur vi avgör "framework=Next.js".

### Steg 2: Import → canonical raw discovery
- **`scripts/template-library/import-template-discovery.ts`** (TS)
  - Tar `summary.json` → normaliserar till canonical format under `raw-discovery/current/`.
  - Avgör format-kompatibilitet, dedupar.
  - **Ingen LLM-användning.**

### Steg 3: Clone repo-cache
- **`scripts/template-library/hydrate-template-library-cache.ts`** (TS)
  - Klonar varje GitHub-repo till `repo-cache/<repo-namn>/`.
  - Resultat: faktisk källkod tillgänglig för Steg 4.
  - **Ingen LLM-användning. Pure git operations.**

### Steg 4: Dossiers + library
- **`scripts/template-library/build-template-library.ts`** (TS) — _hjärtat i pipelinen_
  - Per template (191 st): bygger `dossiers/<id>/manifest.json` med:
    - **Metadata** (title, description, qualityScore, repo)
    - **Classification** (`useCaseTags`, `siteFormTags`, `technicalPatternTags`)
    - **Signals** (auth, dashboard, pricing, blog, portfolio, ecommerce, docs, ai, multiTenant, cms — alla bool)
    - **selectedFiles** (3-5 filer från repot — package.json, layout.tsx, page.tsx, .env.example) med `path`, `reason`, `excerpt`
    - **runtimeGuidance** (4 fält av guidance-strängar genererade via `deriveTemplateRuntimeGuidance`)
    - **recommendedScaffoldIds** (vilka av våra 10 scaffolds som matchar)
  - Per template även: `selected_files/` (faktiska filerna)
  - Aggregerar till `template-library.generated.json` (runtime) + `catalog.json` (kuration)
  - Producerar `scaffold-research.generated.json` (per scaffold: qualityChecklist + upgradeTargets + referenceTemplates)
  - **Använder `deriveTemplateRuntimeGuidance` i `runtime-guidance.ts` — regelmotor med ~15-20 fixerade strängar.**

- **`src/lib/gen/template-library/runtime-guidance.ts`** — regelmotorn
  - Läser `entry.signals.dashboard`, `entry.signals.pricing`, etc.
  - Pushar fix-strängar in i 4 arrays (`styleRules`, `sectionInventory`, `avoidPatterns`, `worldClassRubric`).
  - Returnerar `{ styleRules: limit(arr,4), sectionInventory: limit(arr,5), ... }`
  - **Detta är var det generiska bruset föds.** Variants som plockar 4 entries får en aggregerad version av samma fixstring-pool.

### Steg 5: Embeddings
- **`scripts/embeddings/generate-template-library-embeddings.ts`**
- **`scripts/embeddings/generate-scaffold-embeddings.ts`**
  - Använder OpenAI text-embedding-3-small (eller motsvarande)
  - Genererar vektorer för varje template + varje scaffold
  - Sparar som JSON för cosine similarity vid runtime

### Steg 6: Variants
- **`scripts/scaffolds/derive-variants-from-dossiers.ts`** (TS)
  - 21 hand-skrivna `BLUEPRINTS` i toppen av filen — varje har:
    - **Design-axes:** label, description, keywords, fontPairings, signatureMotif, themeTokens, promptHints, colorMode, default
    - **Selectors:** matchningsregler för att hitta relevanta template-entries (`titleIncludes`, `signals`, `useCaseTags`)
  - Per blueprint: `scoreEntry` rankar template-entries → top 4 → `pickSourceTemplateIds`
  - **Tidigare gjorde `aggregateGuidance` flatMap över entries' runtimeGuidance — borttagen 2026-04-17 (Val A).** Nu skrivs bara `sourceTemplateIds`.

### Steg 7-9: Runtime
- **`registry.ts`** (scaffolds + scaffold-variants + template-library) — läser disk-data, cachar i minne.
- **`orchestrate.ts`** — väljer scaffold (keyword + embedding hybrid), variant (keyword), capabilities (keyword regex), bygger BuildSpec.
- **`system-prompt.ts`** — bygger ## Scaffold, ## Scaffold Variant, ## Scaffold Research Priorities, ## Structural References block.

---

## 3. Var keyword-search används idag (potentiella embedding-byten)

| Plats | Använder keyword | Användning | Embedding-byte? |
|---|---|---|---|
| `src/lib/gen/scaffolds/matcher.ts` | 11 keyword-listor (LANDING, SAAS, PORTFOLIO, BLOG, DASHBOARD, APP, AUTH, ECOMMERCE, CONTENT, HOSPITALITY, STRONG_ECOMMERCE) | Scaffold matching | **Hybrid finns redan.** Embedding kan ta över för non-generic keyword picks. Listor används som "veto" vid edge-cases (hospitality vs ecommerce). |
| `src/lib/gen/scaffold-variants/matcher.ts` | Per-variant `keywords` array | Variant picking | **Bra kandidat för embedding.** Variant-keywords är korta listor (8-12) — embedding mot variant `signatureMotif` + `description` skulle vara mycket starkare. |
| `src/lib/gen/capability-inference.ts` | Regex per capability (3D, charts, auth, ecommerce, etc.) | Capability detection | **Behåll keyword.** Capability-detection vill vara billig och deterministisk. Embedding skulle ge falska positiver. |
| `src/lib/builder/domain-inference.ts` | `domain-rules.json` (11 domäner med Sv+En keywords) | Domain inference | **Hybrid lämpligt.** Keyword för välkända fall, embedding-fallback för okända. |
| `scripts/scaffolds/derive-variants-from-dossiers.ts` | `selectors.titleIncludes`, `signals` | Variant blueprint matching mot dossier | **Bra kandidat för embedding.** Blueprint→dossier-matchning skulle vinna mycket på semantic search istället för titel-substring. |
| `src/lib/gen/template-library/runtime-guidance.ts` | `entry.signals.<x>` boolean-checks | Generic guidance generation | **Tas bort eller ersätts.** Detta är var det generiska bruset föds — embedding hjälper inte här. Smart embedding kan _föreslå_ kuraterad guidance per template, men det kräver LLM-pass. |

---

## 4. "Världsklass-rebuild"-väg (det stora spåret du nämnde)

Om du vill bygga om från grunden så att hela kedjan blir koherent och du _äger_ den, här är en stegvis plan i ordning av (a) bygg-ordning (b) lägsta koppling till resten:

### Fas A — Förstå källan (1-2 sittningar)
1. **Granska `hamta_sidor_branch_emil.py`** i detalj. Förstå vilka kategorier som skrapas, vilka URL:er som inte hämtas, hur "framework=Next.js" detekteras. Bestäm om scrapen ska bli mer fokuserad (10 kategorier) eller bredare (alla 25).
2. **Granska 10-20 dossier-`manifest.json` slumpmässigt** under `data/external-template-pipeline/reference-library/dossiers/` — verifiera att `selectedFiles` faktiskt fångar relevant kod, att `signals` är korrekt klassificerade.
3. **Bestäm:** ska dossier-mappstrukturen ändras? `runtimeGuidance` på dossier-nivå vill du förmodligen ta bort eller dramatiskt göra om (samma argument som Val A för variants).

### Fas B — Bygg om dossier→library (1-3 sittningar)
4. **Skriv om `runtime-guidance.ts`**. Två alternativ:
   - **Alt 1: Ta bort regelmotorn helt.** Dossier `runtimeGuidance` blir tomt eller försvinner från typen. `template-library.generated.json` blir mindre och renare. Inga "generic strängar" injiceras längre.
   - **Alt 2: Ersätt med ett LLM-pass per template.** Vid build-time, skicka template-metadata + selectedFiles till en small LLM som producerar 3-5 _specifika_ guidance-strängar per template. Mycket dyrare men kvaliteten skulle vara enorm.
5. **Bygg om `recommendedScaffoldIds`-mappningen.** Idag baseras den på regler i `build-template-library.ts`. Skulle kunna byggas via embedding similarity mellan template `summary` och scaffold `description + promptHints`.
6. **Lägg till en CI-check** som verifierar att `template-library.generated.json` är konsistent med `dossier-manifest.json`-filerna.

### Fas C — Bygg om scaffold→variant-pipelinen (2-4 sittningar)
7. **Granska de 21 BLUEPRINTS** i `derive-variants-from-dossiers.ts`. Bekräfta att varje variant har en tydlig nisch. Slå ihop / ta bort de som överlappar (corporate-grid, friendly-saas, glass-frosted är välmärkta — andra kan vara tveksamma).
8. **Byt blueprint-selectors från titleIncludes till embedding similarity.** En variant pekar idag på 4 dossier via titel-substring; med embeddings skulle matchningen vara semantisk ("editorial-lux" matchar mot dossiern's `summary` istället för titel). Bättre, mindre brittle.
9. **Lägg blueprintens design-axes i en JSON-fil** (en per blueprint) istället för hard-codad i TS. Backoffice kan då redigera dem direkt utan kod-ändring. JSON-schemat finns redan delvis i `docs/schemas/strict/scaffold-variant.schema.json`.

### Fas D — Bygg om matcher (2-3 sittningar)
10. **Embedding-driven scaffold matching som primär.** Idag är keyword primärt och embedding "challenger". Vänd på det: embedding är primärt, keyword är veto/säkerhetsnät för domain mismatch (hospitality, auth).
11. **Embedding-driven variant matching.** Variant `keywords` array tas bort — embedding mot prompt + brief avgör.
12. **Behåll `inferCapabilities` som keyword-regex.** Capabilities är binära flaggor som ska vara billiga och säkra.

### Fas E — Lana, dokumentation, backoffice (1-2 sittningar)
13. **Uppdatera backoffice**: lägg till en "lane status"-vy som visar status på alla pipelinedata: dossier-räkning, library-räkning, embedding-räkning, senaste rebuild-tid.
14. **Skriv ett "lane runbook"** under `docs/architecture/template-scaffold-lane-runbook.md` som steg-för-steg förklarar hur man kör om hela pipen från scratch.
15. **Lägg till lane-tester** under `tests/lane/` som verifierar att varje pipelinesteg producerar förväntad output (smoke-test).

---

## 5. Var jag rekommenderar att börja

Du har två naturliga ingångar baserat på din ambitionsnivå:

| Mål | Var börjar du |
|---|---|
| "Jag vill se hur skrapan funkar" | Läs `hamta_sidor_branch_emil.py` topp-till-botten. Kör `python full_template_refresh.py --dry-run` för att se hela kedjan utan att röra något. |
| "Jag vill verifiera att dossiers är bra" | Öppna 5-10 slumpvis valda `dossiers/<id>/manifest.json`. Kontrollera `selectedFiles[].excerpt`, `signals`, `recommendedScaffoldIds`. |
| "Jag vill rensa generic guidance ur dossiers" | Modifiera `runtime-guidance.ts` (tomt eller LLM-driven). Sen kör `npx tsx scripts/template-library/build-template-library.ts` för att regenerera library + research. |
| "Jag vill embedding-driva scaffold matching" | Börja med `src/lib/gen/scaffolds/matcher.ts` — vänd på embedding/keyword priority. Bredare ändring, men contained. |
| "Jag vill embedding-driva variant matching" | `src/lib/gen/scaffold-variants/matcher.ts` — den är liten och isolerad. Bra ställe att experimentera. |

---

## 6. Hänvisningar till körbara skript

```bash
# Hela pipen interaktivt
python scripts/template-library/full_template_refresh.py

# Bara skrapan
python scripts/template-library/hamta_sidor_branch_emil.py --output=tmp-scrape

# Bara bygg dossier+library (förutsätter raw-discovery + repo-cache finns)
npx tsx scripts/template-library/build-template-library.ts

# Bara variants (förutsätter library finns)
npx tsx scripts/scaffolds/derive-variants-from-dossiers.ts --dry-run

# Embeddings
npx tsx scripts/embeddings/generate-template-library-embeddings.ts
npx tsx scripts/embeddings/generate-scaffold-embeddings.ts

# Validering
npx tsx scripts/template-library/validate-runtime-artifacts.ts
```

---

## 7. Kopplingar till andra dokument

- **Vad finns idag i scaffold-systemet:** `docs/architecture/scaffold-variants-inventory.md`
- **Scaffold-systemet schema:** `docs/architecture/scaffold-schema.md`
- **External-template-pipeline-kontrakt:** `docs/schemas/external-template-pipeline-contract.md`
- **Template-library typer:** `src/lib/gen/template-library/types.ts`
- **Skript README:** `scripts/README.md`, `data/external-template-pipeline/README.md`
