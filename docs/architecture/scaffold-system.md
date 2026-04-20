# Scaffold-systemet — Schema och Inventarium

**Senast uppdaterad:** 2026-04-20. **Kod är source of truth** (`src/lib/gen/scaffolds/`, `config/scaffold-variants/`).

Detta dokument täcker både runtime-arkitekturen (steg, typer, pipeline) och per-scaffold/per-variant inventariumet med kvalitetsbedömning.

---

## 1. De tio scaffolds — översikt

| ID | Label | siteKind | complexity | allowedBuildIntents | Variants | Default-variant |
|---|---|---|---|---|---|---|
| `base-nextjs` | Base Next.js | marketing | simple | website, template | 4 | `starter-neutral` |
| `landing-page` | Landing Page | marketing | medium | website, template | **5** | `corporate-grid` |
| `saas-landing` | SaaS Landing | marketing | medium | website, template | 2 | `friendly-saas` |
| `portfolio` | Portfolio | editorial | medium | website, template | 2 | `minimal-studio` |
| `blog` | Blog | editorial | medium | website, template | 2 | `editorial-serif` |
| `dashboard` | Dashboard | app | advanced | app | 2 | `glass-frosted` |
| `auth-pages` | Auth Pages | app | simple | website, app, template | 1 | `clean-auth` |
| `ecommerce` | E-handel | commerce | advanced | website, template | 3 | `megastore-clean` |
| `content-site` | Content Site | marketing | medium | website, template | 1 | `warm-editorial` |
| `app-shell` | App Shell | app | medium | app | 2 | `clean-utility` |

**Totalt:** 10 scaffolds, 26 variants. Variants ojämnt fördelade.

### Variant-detaljer (sammanfattning)

Per scaffold finns en eller flera variants med design-axes (label, description, keywords, fontPairings, signatureMotif, themeTokens, promptHints, colorMode, default).

**Sedan 2026-04-17 (Val A genomförd):** fälten `styleRules`, `sectionInventory`, `avoidPatterns`, `worldClassRubric` är borttagna ur `ScaffoldVariant`-typen och alla 21 variant-JSON-filer. Variants levererar nu enbart **högsignal design-axes**. Generic regelmotor-genererat brus är borta från prompten.

**Variant-kvalitet:** `corporate-grid` (landing-page) och `base-nextjs`-varianterna är handredigerade referenser. Övriga har bra design-axes men kan ha generiska sourceTemplateIds.

---

## 2. Konsoliderings-rekommendationer (öppna)

### 2.1 `content-site` ↔ `landing-page`

**Fakta:** Båda `siteKind: marketing`, `complexity: medium`, samma `allowedBuildIntents`. `content-site.description` säger "Great for landing pages, portfolios, and blogs" — direkt överlapp. `content-site` har 1 variant; `landing-page` har 5. Båda matchas av `LANDING_KEYWORDS` och `CONTENT_KEYWORDS` i `matcher.ts` — keyword-listorna delar 7 ord.

**Rekommendation:** Slå ihop. Flytta `warm-editorial` som sjätte landing-page-variant. Ta bort content-site-scaffolden. **−1 scaffold.**

### 2.2 `dashboard` ↔ `app-shell`

**Fakta:** Båda `siteKind: app`, båda har sidebar+tables. Distinktion: dashboard är analytics-tung (`charts`), app-shell är operations/CRM (`settings`, `dash-widgets`). Templates rekommenderar ofta båda samtidigt.

**Rekommendation:** Behåll separat men skriv om descriptionerna så distinktionen är skarp. Alternativt slå ihop till `dashboard` med variants `analytics-cockpit` vs `operations-shell`.

### 2.3 `auth-pages` som egen scaffold?

**Fakta:** Endast 1 variant. `recommendedScaffoldIds` på Clerk-dossiern är `["auth-pages", "dashboard", "app-shell"]` — auth-sidor är nästan alltid del av en app.

**Rekommendation:** Behåll som scaffold för "skapa bara login-flödet"-use-case, men säkerställ att den inte automatiskt väljs för bredare prompts.

### 2.4 Ingen ändring för

`base-nextjs` (bra fallback), `landing-page` (bredast), `saas-landing`, `portfolio`, `blog`, `ecommerce` (tydliga nischer, bra design-axes).

---

## 3. Pipeline — hur variants byggs

```
Vercel-templates (skrapad data)
        │
        ▼
data/dossiers/<id>/  (sedan dossier-pipen migrerad 2026-04)
   ├─ manifest.json    ← per-template metadata + selectedFiles
   ├─ summary.md
   └─ selected_files/  ← faktiska TSX/CSS-utdrag
        │
        │ scripts/template-library/build-template-library.ts
        ▼
src/lib/gen/template-library/template-library.generated.json
   (97 entries med runtimeGuidance från regelmotor)
        │
        │ scripts/scaffolds/derive-variants-from-dossiers.ts
        │ (21 hand-skrivna BLUEPRINTS med design-axes)
        ▼
config/scaffold-variants/<scaffoldId>/<variantId>.json
   (rena design-axes; guidance-fält borttagna 2026-04-17)
```

| Lager | Källa | Kvalitet |
|---|---|---|
| Dossier `selectedFiles` | Skrapad riktig Vercel-kod | Hög — riktig kod, används i `## Structural References` när enabled |
| Dossier `strengths`, `signals`, `recommendedScaffoldIds` | Kuration | Hög |
| Dossier `summary`, `description` | Skrapad | Hög |
| Variant `design-axes` | Hand-skrivna BLUEPRINTS | Hög — specifika, scaffold-relevanta |

---

## 4. Begrepps-hierarki (inte samma dimension — blanda inte)

| Dim | Fråga | Typ | Värden |
|---|---|---|---|
| 1 | VAD ska byggas? | `BuildIntent` | `template` / `website` / `app` |
| 2 | HUR kom requesten in? | `BuildMethod` | `wizard` / `category` / `audit` / `freeform` / `kostnadsfri` |
| 2 | Prompt-typ | `PromptType` | `wizard` / `freeform` / `template` / `audit` / `followup_*` |
| 3 | VILKEN startstruktur? | `ScaffoldMode` + `ScaffoldId` | `off` / `auto` / `manual` × 10 scaffold-ids |
| 4 | HUR MYCKET styr scaffolden? | `ScaffoldSerializeMode` | `structural` / `inspirational` (init/followUp + contextPolicy) |
| 5 | VAD BERIKAR scaffolden? | Buildtime artifacts | `template-library.generated.json`, `scaffold-research.generated.json`, `scaffold-embeddings.json` |

---

## 5. Runtime-flödet steg för steg

### STEG 1 — Prompt-bearbetning (`promptOrchestration.ts`)
Klassificerar `PromptType` och väljer `PromptStrategy` (`direct` / `summarize` / `phase_plan_build_refine` / `preserved`). Output: budgeterad `finalMessage`. Scope: bara prompttext, ingen scaffold-logik.

### STEG 2 — Deep Brief (`site-brief-generation.ts`)
Strukturerat objekt: projectTitle, brandName, oneSentencePitch, pages[], visualDirection, imagery, uiNotes, seo, mustHave, avoid. Trigger: client-side eller `shouldRunServerAutoBrief()`. Matar scaffold-matchning, route plan och dynamic context.

### STEG 3 — Scaffold-val (`orchestrate.ts` → `matcher.ts`)

```
scaffoldMode?
├─ "off"     → inget scaffold
├─ "manual"  → getScaffoldById(scaffoldId)
├─ persisted → getScaffoldById(persistedScaffoldId)  [follow-up]
└─ "auto"    → matchScaffoldAuto(prompt, buildIntent, options)
                 ├─ 3a Keyword (synkron): 9 listor + intent-boost + brief context
                 ├─ 3b Embedding (parallell): cosine vs förgenererade vektorer
                 └─ 3c Merge-policy: agreement / keyword vinner / embedding override
```

| Meta-fält | Värden |
|---|---|
| `selectionMethod` | `off` / `manual` / `persisted` / `keyword` / `embedding` / `agreement` / `default` |
| `selectionConfidence` | `high` / `medium` / `low` |
| `embeddingOverrideReason` | `string` / `null` |
| `briefContextApplied` | `boolean` |

### STEG 4 — Capability-inferens (`capability-inference.ts`)
Flaggor: `needsAuth`, `needsEcommerce`, `needsAppShell`, `needsForms`, `needsCharts`, `needs3D`, `needsMotion`, m.fl. + `hasHeavyCapabilities()`. Boostar matchning + prioriterar filer + matar BuildSpec.

### STEG 5 — Route Plan (`route-plan.ts`)
Källprioritet: brief pages > scaffold defaults > prompt patterns. Output: `RoutePlan { routes[], siteType, provenance }`.

### STEG 6 — Pre-generation Contracts (`pre-generation-contracts.ts`)
Auth, Payment, Database, Env vars, Integrations. Output: `contracts[]`, `unresolvedDecisions[]`, `confirmedAnswers[]`.

### STEG 7 — Build Spec (`build-spec.ts`)
`contextPolicy` (`light` / `normal` / `heavy`), `qualityTarget`, `previewPolicy`, `verificationPolicy`, `tokenBudgets.{scaffoldChars, scaffoldTokens}`. Se [fas2-orchestration-and-build.md](./fas2-orchestration-and-build.md) för token-budget-tabellen.

### STEG 8 — Orchestration Contract (`orchestration-contract.ts`)
Binder scaffold + routes + validering till `OrchestrationContract { scaffoldToRoute, generationToValidate }`.

### STEG 9 — Scaffold-serialisering (`serialize.ts`)

| Mode | Triggas av | Vad som injiceras |
|---|---|---|
| `inspirational` | `init` + INTE heavy contextPolicy | Filträd + layout/theme-filer. "Invent a unique page flow." |
| `structural` | `followUp` ELLER heavy contextPolicy | Full/kritisk filstruktur. Modellen följer scaffoldens baseline. |

`detectScaffoldMode()` med kreativa nyckelord finns men **anropas inte i production**. Mode bestäms mekaniskt i `orchestrate.ts`.

`selectCriticalScaffoldFiles()` prioriterar baserat på kritiska patterns + route-relevans + capability-relevans.

### STEG 10 — System Prompt (`system-prompt.ts`)

```
Core Rules (config/prompt-core/*.md via codegen-core-manifest.json):
├── 00-core-contract (stack, format, Lucide)
├── 01-behavioral-contract (a11y, import, beteende, F2/F3-pekare)
├── 02-component-contract (shadcn patterns)
├── 03-visual-design (visual quality, color system, typography, polish, charts)
└── 04-coding-direction (default voice, domain examples, tone adaptation)

(directive cascade togs bort 2026-04-18)

Dynamic Context (request-specifik, prioriterad + prunad):
├── scaffold context · route plan · contracts
├── brief (incl. domainProfile, motionLevel, qualityBar)
├── scaffold variant (signaturmotiv, fontpar, tema-tokens)
├── guidance-resolvers (brief-override > deterministisk fallback)
├── capability hints · scaffold research priorities
└── your toolkit (registry-synced local shadcn summary + capability-hints)
```

### STEG 11 — Kodgenerering (`engine.ts`)
LLM tar emot system prompt + user turn + bilagor. Producerar `CodeFile[]`.

### STEG 12 — Post-generation
Se [fas2-orchestration-and-build.md](./fas2-orchestration-and-build.md) för finalize-pipeline. Scaffold-aware retry: `inferScaffoldRetrySuggestion()` föreslår scaffold-pivot vid misslyckad generation.

---

## 6. Komplett scaffold-matris

| ID | Site Kind | Complexity | Structure Profile | Content Profile | Allowed Intents | Typiska features |
|---|---|---|---|---|---|---|
| `base-nextjs` | marketing | simple | starter-nextjs | generic | website, template | routing-basics, seo-metadata, component-ready |
| `landing-page` | marketing | medium | one-page-marketing | service-business | website, template | hero, trust-signals, cta |
| `saas-landing` | marketing | medium | multi-section-marketing | saas-growth | website, template | pricing, feature-grid, comparison, cta |
| `portfolio` | editorial | medium | showcase-site | creator-portfolio | website, template | gallery, project-cases, contact-cta |
| `blog` | editorial | medium | editorial-hub | long-form-content | website, template | article-list, taxonomy, author-bio |
| `dashboard` | app | advanced | dashboard-app | operations-analytics | app | auth, navigation-shell, tables, charts |
| `auth-pages` | app | simple | auth-surface | authentication | website, app | login, signup, password-reset |
| `ecommerce` | commerce | advanced | commerce-storefront | product-catalog | website, template | product-grid, cart, checkout, product-detail |
| `content-site` | marketing | medium | content-marketing-site | brand-storytelling | website, template | hero, feature-sections, testimonials, cta |
| `app-shell` | app | medium | application-shell | workspace-tools | app | auth, sidebar-layout, settings, dash-widgets |

---

## 7. Scaffold-manifestets merge-pipeline

```
base manifest (per scaffold-mapp, t.ex. blog/manifest.ts)
  innehåller: id, label, description, siteKind, complexity, structureProfile,
              contentProfile, features, allowedBuildIntents, tags, promptHints,
              files, qualityChecklist, research
        │
        ▼
1. scaffold-research merge
   └─ scaffold-research.generated.json → upgradeTargets, referenceTemplates
        │
        ▼
2. applyScaffoldSeoDefaults()
   └─ seo-defaults.ts → SEO-metadata
        │
        ▼
ALL_SCAFFOLDS (registry.ts)
```

`applyScaffoldTraits()` borttagen 2026-04 — traits konsoliderade direkt i varje manifest.ts.

---

## 8. Variant signature patterns

Sedan 2026-04-17 ersätter `signaturePatterns` (konkreta layouts/motifs/antiPatterns) de fyra borttagna guidance-fälten. Fylls i av `scripts/scaffolds/auto-curate-variant-patterns.ts` (GPT-5.4 + Zod). Renderas i `## Scaffold Variant`-blocket.

### Embedding-driven variant pick

`pickScaffoldVariantAsync()` embeddar prompten via OpenAI, cosine vs precomputed `config/scaffold-variants/_index/variant-embeddings.json`, top-3 + deterministisk seed.

**Sedan 2026-04-18:** `create-chat-stream-post.ts` låser keyword-pre-match-varianten via `OrchestrationInput.persistedVariantId`, så orchestrate hämtar samma variant via `getVariantById` istället för att köra async-pickaren. Async körs då bara som fallback (id stale, plan-mode, eval). Eliminerar drift mellan brief-LLM-hint och codegen-variant.

---

## 9. Sync-checklista vid scaffold-ändring

Vid scaffold-borttagning, sammanslagning eller variantfältsförändring:

| Yta | Fil | Vad |
|---|---|---|
| Runtime-typ | `src/lib/gen/scaffolds/types.ts` | `ScaffoldId` union, `SCAFFOLD_CLIENT_LIST` |
| Runtime-registry | `src/lib/gen/scaffolds/registry.ts` | `BASE_SCAFFOLDS` array |
| Variant-typ | `src/lib/gen/scaffold-variants/types.ts` | Vid fältborttagning |
| Variant-registry | `src/lib/gen/scaffold-variants/registry.ts` | Parser-kod |
| Build-skript | `scripts/scaffolds/derive-variants-from-dossiers.ts` | BLUEPRINTS array |
| Matcher | `src/lib/gen/scaffolds/matcher.ts` | Keyword-listor, `defaultScaffoldForIntent` |
| Embeddings | `src/lib/gen/scaffolds/scaffold-embeddings.json` | Regenereras via `npm run scaffolds:embeddings` |
| Backoffice | `backoffice/pages/scaffolds.py`, `scaffold_lifecycle.py`, `research.py` | Kontroller, sidolist |
| Dokumentation | denna fil + `docs/architecture/glossary.md`, `docs/schemas/scaffold-contract.md`, `docs/architecture/repository-and-platform.md` | Tabeller, distinktioner |
| Cursor-regler | `.cursor/rules/scaffold-rules.mdc`, `.cursor/skills/sajtmaskin-context/SKILL.md` | Lista vid sammanslagning |
| Tester | `src/lib/gen/scaffolds/matcher.test.ts`, `src/lib/gen/orchestration-snapshot.test.ts`, build-spec, eval-prompts | Asserter på scaffold-id |
| Snapshot-data | `data/scaffold-eval/prompts.json` | Scaffold-id i förväntade resultat |

---

## 10. Verktyg

### Scaffold-pipeline (npm-scripts via `scaffold_cli.py`)

| Kommando | Vad |
|---|---|
| `npm run scaffolds:status/import/hydrate/build/embeddings/eval/verify/all` | Kanonisk CLI |
| `npm run scaffolds:promote` | Skapar ny scaffold från dossier |
| `npm run scaffolds:curate` | Rangordnar template-library-entries som kandidater |
| `npm run scaffolds:eval` | Eval-harness för scaffold-matchern |

### Template-library

| Kommando | Vad |
|---|---|
| `npm run template-library:build` | → `template-library.generated.json` + `scaffold-research.generated.json` |
| `npm run template-pipeline:refresh` | Full pipeline: scrape → import → hydrate → build → embeddings |
| `npm run template-library:validate-runtime` | Validerar genererade artefakter |

### Embeddings

| Kommando | Vad |
|---|---|
| `npm run scaffolds:embeddings` | Runtime scaffold-matchning |
| `npm run template-library:embeddings` | Template-library |

### Backoffice

`npm run backoffice` startar Streamlit-app (`sajtmaskin_backoffice.py`). Sidor: Scaffolds, Research & Dossiers, Pipeline, Eval, Autofix & Kvalitet, Mental modell.

---

## 11. config/ — runtime-kritiskt

| Fil | Vad |
|---|---|
| `config/codegen-core-manifest.json` | Fragment-lista för Core Rules |
| `config/prompt-core/*.md` | 6 Core Rules-filer (inkl. `_READ_ME_FIRST.md`) |
| `config/integrations/tier3-sdk-deny.json` | F2 SDK guard + F2 contract-block |
| `config/ai_models/manifest.json` | Build profiles, token-budgetar, embedding-index, phase routing, `qualityGateTiers` (`designPreview` / `integrationsBuild`) |
| `config/ai_models/40-harmless-placeholders.env.txt` | Placeholder env vars OK i F3 |
| `config/ai_models/41-tier3-stub-placeholders.env.txt` | F2-stubbar — strippas i F3 |
| `config/env-policy.json` | Env-audit regler |

---

## 12. Hänvisningar

- [Glossary](./glossary.md)
- [Fas 2 — Orkestrering och Build](./fas2-orchestration-and-build.md)
- [LLM Signal Flow](./llm-signal-flow.md)
- Variant-typ: `src/lib/gen/scaffold-variants/types.ts`
- Build-skript: `scripts/scaffolds/derive-variants-from-dossiers.ts`
- Backoffice: `backoffice/pages/scaffolds.py`, `scaffold_lifecycle.py`
