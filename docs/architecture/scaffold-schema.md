# Scaffold-systemet — Strukturerat schema

Verifierat mot koden 2026-04-12. Uppdaterad efter ScaffoldFamily-kollaps. Kod är source of truth.

> **Beslutsunderlag:** För konkret per-scaffold och per-variant inventarium med kvalitetsbedömning + förslag på vad som bör tas bort/slås ihop, se [`scaffold-variants-inventory.md`](./scaffold-variants-inventory.md).

---

## Genomförda förenklingar

| Ändring | Detalj |
|---------|--------|
| `ScaffoldFamily` → `ScaffoldId` | Union-typen döpt om. `ScaffoldFamily` finns som deprecated alias. |
| `family`-fält borta från `ScaffoldManifest` | `id` (nu typat som `ScaffoldId`) är ensam primärnyckel. |
| `getScaffoldByFamily()` borta | Alla anropare bytta till `getScaffoldById()`. |
| `getScaffoldFamilies()` → `getScaffoldIds()` | Returnerar `ScaffoldId[]`. |
| `detectScaffoldMode()` borttagen | Var död kod — aldrig anropad i production. |
| `scripts/template-library/sync-v0-templates.mjs` borttagen | **Återställd** — var inte en duplikat utan implementationen som `v0-templates/sync-v0-templates.mjs` delegerar till. |
| `scripts/dev/db-debug.mjs` borttagen | Hårdkodade stale IDn. |
| `scaffold-traits.ts` borttagen | Traits konsoliderade direkt i varje manifest.ts. |
| Merge-pipeline förenklad | `applyScaffoldTraits()` borttagen — 2 steg istället för 3. |

---

## Bedömning av mental modell + konversation

### Vad som stämmer

| Påstående | Verifierat i |
|-----------|-------------|
| Det finns exakt 10 scaffold-ids | `ScaffoldId` i `types.ts` |
| Build Intent = `template \| website \| app` | `BuildIntent` i `build-intent.ts` |
| Build Method = `wizard \| category \| audit \| freeform \| kostnadsfri` | `BuildMethod` i `build-intent.ts` |
| Scaffold Mode = `off \| auto \| manual` | `ScaffoldMode` i `types.ts` |
| Serialize Mode = `structural \| inspirational` | `ScaffoldSerializeMode` i `serialize.ts` |
| Family ≈ scaffold id (1:1 idag) | `registry.ts` — en manifest per family |
| Dossiers/template-library är buildtime, inte runtime | `registry.ts` kommentar + `template-library/README.md` |
| Matchning: keyword först → embedding kan ta över | `matchScaffoldAuto()` i `matcher.ts` |
| Scaffold traits konsoliderade i manifests | Traits (siteKind etc.) definieras direkt i varje manifest.ts |
| 4 axlar (intent, entry, selection, serialize) är korrekta | Bekräftat i kod |

### Vad som är felaktigt eller missvisande

| Påstående i konversation/modell | Verkligheten i koden |
|---------------------------------|---------------------|
| "inspirational" triggas av kreativa nyckelord i prompten | `detectScaffoldMode()` exporteras och testas men **anropas aldrig i production**. I `orchestrate.ts` (rad 354–357) bestäms mode rent mekaniskt: `init` → inspirational, `followUp` eller `heavy` contextPolicy → structural. Nyckelorddetektering är i praktiken död kod. |
| "Scaffold" som runtime-typ | Typen heter `ScaffoldManifest`, inte "Scaffold". Ingen exporterad typ med det namnet. |
| Family och scaffold beskrivs som separata men överlappande | Korrekt observation men ofullständig: `family` är ett **fält** på `ScaffoldManifest`. `ScaffoldFamily` är en union type. `getScaffoldByFamily()` hittar "första med den familyn" — designat för framtida N:1 men idag 1:1. |
| Template-library "används för validation/tooling/pipeline" | Mer exakt: `scaffold-research.ts` validerar att referenceTemplate-IDn finns i template-library-katalogen. Template-library-search exporteras men injiceras **inte** i system-prompt vid runtime. |

### Vad som saknas i mental modell

| Saknat koncept | Var i koden | Varför viktigt |
|----------------|------------|----------------|
| `allowedBuildIntents` på varje scaffold | `ScaffoldManifest.allowedBuildIntents` | Filtrerar vilka scaffolds som kan matcha vilken intent. `dashboard` tillåter bara `app`, `landing-page` tillåter `website \| template`. |
| `InferredCapabilities` | `capability-inference.ts` | Auth, ecommerce, forms, 3D etc. Botar matchning + prioriterar filer i serialisering. |
| `BuildSpec` och contextPolicy | `build-spec.ts` | Styr token-budgetar, scaffold-chars, quality target, om contextPolicy=heavy → structural. |
| `OrchestrationContract` | `orchestration-contract.ts` | Binder scaffold → routes → valideringsförväntningar. Kärnan i "vad ska genereras och kontrolleras". |
| `persistedScaffoldId` | `orchestrate.ts` | Follow-up återanvänder scaffold från init. Ignoreras bara vid `ignorePersistedScaffoldForMatch`. |
| Research/SEO merge-pipeline | `registry.ts` → `scaffold-research` → `seo-defaults` | Varje manifest går genom 2 merge-steg (traits definieras direkt i manifest). |
| `RoutePlan` provenance | `route-plan.ts` | Brief-routes > scaffold-routes > prompt-routes. Provenance spårar primärkälla. |
| Scaffold-aware retry | `scaffold-aware-retry.ts` | Om generation misslyckas kan systemet föreslå scaffold-pivot. |
| Prompt Orchestration ≠ Scaffold Selection | `promptOrchestration.ts` vs `orchestrate.ts` | `orchestratePromptMessage()` hanterar bara prompttext (budget, strategi). Scaffold-val sker i `resolveOrchestrationBase()`. Dessa är separata steg. |

---

## Verklighetsmatris: vad fungerar i koden

| Steg | Begrepp | Kodsymbol | Fil | Fungerar? | Kommentar |
|------|---------|-----------|-----|-----------|-----------|
| 1 | Användarens prompt | `prompt` | `OrchestrationInput` | Ja | Rå text, ev. förbättrad via Prompt Rewrite/Polish |
| 2 | Vad ska byggas | `BuildIntent` | `build-intent.ts` | Ja | `template \| website \| app`. Default: `website` |
| 3 | Hur kom requesten in | `BuildMethod` | `build-intent.ts` | Ja | `wizard \| category \| audit \| freeform \| kostnadsfri` |
| 4 | Prompt-typ klassificering | `PromptType` | `promptOrchestration.ts` | Ja | `wizard \| freeform \| template \| audit \| followup_*` |
| 5 | Prompt-budget & strategi | `PromptStrategy` | `promptOrchestration.ts` | Ja | `direct \| summarize \| phase_plan_build_refine \| preserved` |
| 6 | Deep Brief generering | `generateSiteBriefObject()` | `site-brief-generation.ts` | Ja | Strukturerat objekt med pages, visualDirection, SEO etc. |
| 7 | Scaffold mode | `ScaffoldMode` | `types.ts` | Ja | `off \| auto \| manual`. Default `auto` |
| 8a | Keyword-matchning | `matchScaffold()` | `matcher.ts` | Ja | Synkront, 9 keyword-listor + intent-boosting |
| 8b | Embedding-matchning | `searchScaffoldsWithDiagnostics()` | `scaffold-search.ts` | Ja | Cosine-similarity, kan override keyword-val |
| 8c | Brief context boost | `ScaffoldQueryContext` | `matcher.ts` + `orchestrate.ts` | Ja | briefPages, styleKeywords, domainHints berikar matchning |
| 9 | Capability-inferens | `inferCapabilities()` | `capability-inference.ts` | Ja | Auth, ecommerce, forms, 3D etc. |
| 10 | Route plan | `buildRoutePlan()` | `route-plan.ts` | Ja | Mergar brief-routes + scaffold-defaults + prompt-patterns |
| 11 | Pre-generation contracts | `inferPreGenerationContracts()` | `pre-generation-contracts.ts` | Ja | Auth, payment, database, env vars |
| 12 | Build spec | `deriveBuildSpec()` | `build-spec.ts` | Ja | Token-budgetar, contextPolicy, quality target |
| 13 | Orchestration contract | `buildOrchestrationContract()` | `orchestration-contract.ts` | Ja | scaffold → routes → validation förväntningar |
| 14 | Scaffold serialisering | `serializeScaffoldForPrompt()` | `serialize.ts` | Ja | Budgeterad markdown-injection i systemprompt |
| 14a | Serialize mode auto-detect | `detectScaffoldMode()` | `serialize.ts` | **Oanvänd** | Exporterad + testad men aldrig anropad i production. Mode bestäms mekaniskt i orchestrate.ts |
| 15 | Dynamic context | `buildDynamicContext()` | `system-prompt.ts` | Ja | scaffold + routes + contracts + brief + tema + capabilities → prioriterad + prunad |
| 16 | System prompt | `composeEngineSystemPrompt()` | `system-prompt.ts` | Ja | Core Rules + Directives + Dynamic Context |
| 17 | Kodgenerering | `generateCode()` | `engine.ts` | Ja | LLM-anrop med systemprompt + user turn |
| 18 | Follow-up kontinuitet | `persistedScaffoldId` | `orchestrate.ts` | Ja | Återanvänder scaffold från init i follow-up |
| 19 | Scaffold-aware retry | `inferScaffoldRetrySuggestion()` | `scaffold-aware-retry.ts` | Ja | Föreslår scaffold-pivot vid misslyckad generation |
| 20 | Template-library runtime guidance | `resolveTemplateGuidance()` | `orchestrate.ts` | **Auto i dev** | Scaffold-ankrad runtimeGuidance via `SAJTMASKIN_RUNTIME_TEMPLATE_GUIDANCE`. Auto-on i `NODE_ENV=development`, explicit opt-in i prod. Init only. `searchTemplateLibrary()` ej använd i runtime. |
| 21 | Variant structural files | `selectVariantStructuralFiles()` + `selectCapabilityStructuralFiles()` | `scaffold-variants/structural-files.ts`, `orchestrate.ts` | **Auto i dev** | Två pass: (1) variant-driven från `sourceTemplateIds` (max 3 filer), (2) capability-driven från hela katalogen baserat på `InferredCapabilities` (max 2 extra). Injecteras i `## Structural References (this variant)` via `SAJTMASKIN_VARIANT_STRUCTURAL_FILES`. Init / first-code-generation only. |
| 22 | Variant signature patterns | `signaturePatterns` per variant | `config/scaffold-variants/<scaffold>/<variant>.json`, `system-prompt.ts` | Ja (auto i dev) | Konkreta layouts/motifs/antiPatterns som ersatte de fyra borttagna guidance-fälten 2026-04-17 (`styleRules`, `sectionInventory`, `avoidPatterns`, `worldClassRubric`). Fylls i av `scripts/scaffolds/auto-curate-variant-patterns.ts` (GPT-5.4 + Zod). Renderas i `## Scaffold Variant`-blocket i systemprompten. |
| 23 | Embedding-driven variant pick | `pickScaffoldVariantAsync()` | `scaffold-variants/matcher.ts`, `orchestrate.ts` + 3 stream-endpoints | Ja (sedan 2026-04-17) | Embeddar prompten via OpenAI, cosine vs precomputed `config/scaffold-variants/_index/variant-embeddings.json`, top-3 + deterministisk seed. Faller graciöst tillbaka till keyword-matchning (`pickScaffoldVariant`) när embeddings/API-key saknas. |

---

## Fullständigt schema: flödet steg för steg

```
ANVÄNDARENS REQUEST
│
├─ prompt (fritext)
├─ buildIntent: template | website | app
├─ buildMethod: wizard | category | audit | freeform | kostnadsfri
├─ scaffoldMode: off | auto | manual
├─ scaffoldId: (vid manual)
├─ brief: (Deep Brief om genererad)
│
▼
```

### STEG 1 — Prompt-bearbetning (`promptOrchestration.ts`)

| Fält | Värde | Beskrivning |
|------|-------|-------------|
| Input | Rå prompt + buildMethod + buildIntent | |
| Klassificerar | `PromptType` | wizard, freeform, template, audit, followup_general, followup_technical |
| Väljer | `PromptStrategy` | direct (kort), summarize (lång), phase_plan_build_refine (komplex), preserved (API) |
| Output | `finalMessage` + `strategyMeta` | Budgeterad/trunkerad prompt |

Scope: bara prompttext. Ingen scaffold-logik.

---

### STEG 2 — Deep Brief (`site-brief-generation.ts`)

| Fält | Värde | Beskrivning |
|------|-------|-------------|
| Trigger | Manuell eller server-auto-brief | `shouldRunServerAutoBrief()` |
| Input | Rå prompt | |
| Output | Strukturerat objekt | `projectTitle`, `brandName`, `oneSentencePitch`, `targetAudience`, `primaryCallToAction`, `toneAndVoice`, `pages[]`, `visualDirection` (styleKeywords, colorMood), `imagery`, `uiNotes`, `seo` |

Downstream-effekt: matar scaffold-matchning, route plan och dynamic context.

---

### STEG 3 — Scaffold-val (`orchestrate.ts` → `matcher.ts`)

```
scaffoldMode?
├─ "off"     → inget scaffold
├─ "manual"  → getScaffoldById(scaffoldId)
├─ persisted → getScaffoldById(persistedScaffoldId)  [follow-up]
└─ "auto"    → matchScaffoldAuto(prompt, buildIntent, options)
                 │
                 ├─ 3a. Keyword-matchning (synkron)
                 │   ├─ 9 keyword-listor (landing, saas, portfolio, blog, ...)
                 │   ├─ intent-baserade boostar
                 │   ├─ brief context boost (pages, styleKeywords, domainHints)
                 │   └─ → bästa keyword-match med score
                 │
                 ├─ 3b. Embedding-matchning (parallell, asynkron)
                 │   ├─ scaffold-embeddings.json (förgenererade vektorer)
                 │   ├─ expandQuery() med SV/EN hints
                 │   ├─ cosine similarity
                 │   └─ → bästa embedding-match med score
                 │
                 └─ 3c. Merge-policy
                     ├─ Keyword + embedding pekar på samma id → agreement (boostad confidence)
                     ├─ Stark keyword-match → keyword vinner
                     ├─ Generisk keyword (landing-page/base-nextjs) → embedding kan override
                     ├─ Safety guards (auth veto, app intent, portfolio)
                     └─ → ScaffoldSelectionResult { scaffold, meta }
```

| Meta-fält | Värden | Beskrivning |
|-----------|--------|-------------|
| `selectionMethod` | off, manual, persisted, keyword, embedding, agreement, default | Hur scaffolden valdes (`agreement` = keyword + embedding pekar på samma scaffold) |
| `selectionConfidence` | high, medium, low | Tillförlitlighet |
| `keywordScores` | Record<id, score> | Poäng per scaffold |
| `embeddingTopResult` | { id, score } \| null | Bästa embedding-träff |
| `embeddingOverrideReason` | string \| null | Varför embedding tog över |
| `briefContextApplied` | boolean | Om brief-data boostade matchningen |

---

### STEG 4 — Capability-inferens (`capability-inference.ts`)

| Capability | Vad den detekterar |
|------------|-------------------|
| `needsAuth` | Login, signup, användarhantering |
| `needsEcommerce` | Produkter, varukorg, checkout |
| `needsAppShell` | Dashboard, admin, settings |
| `needsForms` | Kontaktformulär, bokning |
| `needsCharts` | Diagram, analytics |
| `needs3D` | Three.js, 3D-visualisering |
| `needsMotion` | Animationer, transitions |
| `hasHeavyCapabilities()` | Kombinerad flagga → påverkar serialize mode & follow-up policy |

Downstream: boostar scaffold-matchning + prioriterar filer i serialisering + matar BuildSpec.

---

### STEG 5 — Route Plan (`route-plan.ts`)

| Källa | Prioritet | Beskrivning |
|-------|-----------|-------------|
| Brief pages | Högst | `pages[]` från Deep Brief |
| Scaffold defaults | Mellan | Scaffoldens inbyggda routes |
| Prompt patterns | Lägst | Detekterade rutter från prompttext |

| Output-fält | Typ | Beskrivning |
|-------------|-----|-------------|
| `provenance.primarySource` | `"brief" \| "scaffold" \| "prompt"` | Vilken källa som dominerade |
| `routes[]` | `PlannedRoute` | `path`, `name`, `intent`, `required` |
| `siteType` | string | Infererad typ |

---

### STEG 6 — Pre-generation Contracts (`pre-generation-contracts.ts`)

| Contract | Detekterar |
|----------|-----------|
| Auth | Behöver login/signup? |
| Payment | Behöver betalning? |
| Database | Behöver datalagring? |
| Env vars | Behöver externa API-nycklar? |
| Integrations | Tredjepartstjänster |

Output: `contracts[]`, `unresolvedDecisions[]`, `confirmedAnswers[]`.

---

### STEG 7 — Build Spec (`build-spec.ts`)

| Fält | Värden | Effekt |
|------|--------|--------|
| `contextPolicy` | `light \| normal \| heavy` | Styr scaffold-serialiseringsnivå |
| `qualityTarget` | string | Validerings-/quality gate-nivå |
| `previewPolicy` | string | Hur preview byggs |
| `verificationPolicy` | string | Om verifier körs |
| `tokenBudgets.scaffoldChars` | number | Max chars för scaffold i prompt |
| `tokenBudgets.scaffoldTokens` | number | Token-budget |

---

### STEG 8 — Orchestration Contract (`orchestration-contract.ts`)

Binder ihop scaffold + routes + validering:

```
OrchestrationContract
├── scaffoldToRoute
│   ├── scaffoldId
│   ├── routeSource (brief | scaffold | prompt)
│   ├── plannedRoutes[] (path, name, required)
│   └── requiredRoutePaths[]
│
└── generationToValidate
    ├── requiredRoutePaths[]
    ├── requiredFiles (alltid: app/layout.tsx, app/page.tsx)
    ├── previewPolicy
    ├── verificationPolicy
    └── qualityTarget
```

---

### STEG 9 — Scaffold-serialisering (`serialize.ts`)

| Serialize mode | Triggas av | Vad som injiceras |
|----------------|-----------|-------------------|
| `inspirational` | `init` + INTE heavy contextPolicy | Filträd + layout/theme-filer. Modellen skapar design fritt. "Invent a unique page flow." |
| `structural` | `followUp` ELLER heavy contextPolicy | Full/kritisk filstruktur. Modellen följer scaffoldens baseline. |

OBS: `detectScaffoldMode()` med kreativa nyckelord finns men **anropas inte**. Mode bestäms mekaniskt i orchestrate.ts rad 354–357.

Viktiga serialiserings-features:
- `selectCriticalScaffoldFiles()` prioriterar filer baserat på: kritiska patterns (layout, globals, page, package.json) + route-relevans + capability-relevans
- Placeholder-instruktioner: alla `[Butiksnamn]`, `{{PRODUCT_NAME}}` etc. MÅSTE ersättas
- Färgadaptation: scaffoldens palette är placeholder, måste bytas

---

### STEG 10 — Dynamic Context + System Prompt (`system-prompt.ts`)

```
System Prompt = Core Rules + Directives + Dynamic Context

Core Rules (config/prompt-core/*.md via codegen-core-manifest.json):
├── 00-core-contract (stack, format, Lucide)
├── 01-behavioral-contract (a11y, import, beteende)
└── 02-component-contract (shadcn patterns)

Directives (config/prompt-directives/*.md, Level 4 defaults via Directive Cascade):
├── visual-design, images, scaffold-starters, follow-up-scope
├── motion, quality-bar, domain-hints, seasonal-palette
├── design-priority, content-voice, creative-extensions, integration-contracts
└── Cascade: EXPLICIT (brief) > INDICATED (Brief-LLM) > INFERRED (resolvers) > DEFAULT (directive)

Dynamic Context (request-specifik, prioriterad + prunad):
├── scaffold context (serialiserad scaffold)
├── route plan
├── contracts
├── brief (om finns, inkl. domainProfile, motionLevel, qualityBar, seasonalHints)
├── scaffold variant (signaturmotiv, fontpar, variant-hints, tema-tokens)
├── guidance-resolvers (brief-override > deterministisk fallback)
├── capability hints
├── scaffold research priorities
└── your toolkit (registry-synced local shadcn summary + capability-hints)
```

Block prioriteras och prunas mot token-budget.

---

### STEG 11 — Kodgenerering (`engine.ts`)

LLM tar emot:
- System prompt (steg 10)
- User turn (bearbetad prompt från steg 1)
- Ev. bilagor

Producerar: `CodeFile[]` (filvägar + innehåll).

---

### STEG 12 — Post-generation (fas 3)

```
Genererad kod
│
├── Mekaniska fixar (imports, JSX, fonts, lucide, metadata...)
├── Syntaxvalidering
├── LLM-fix (vid behov)
├── Mekaniska fixar igen
├── Verifier pass (read-only granskning)
├── Preflight
├── Quality Gate
└── Sparad version → Preview
```

Scaffold-aware retry: om generation misslyckas kan `inferScaffoldRetrySuggestion()` föreslå scaffold-pivot.

---

## De 10 runtime scaffolds — komplett matris

| ID | Family | Site Kind | Complexity | Structure Profile | Content Profile | Allowed Intents | Typiska features |
|----|--------|-----------|------------|-------------------|-----------------|-----------------|-----------------|
| `base-nextjs` | base-nextjs | marketing | simple | starter-nextjs | generic | website, template | routing-basics, seo-metadata, component-ready |
| `landing-page` | landing-page | marketing | medium | one-page-marketing | service-business | website, template | hero, trust-signals, cta |
| `saas-landing` | saas-landing | marketing | medium | multi-section-marketing | saas-growth | website, template | pricing, feature-grid, comparison, cta |
| `portfolio` | portfolio | editorial | medium | showcase-site | creator-portfolio | website, template | gallery, project-cases, contact-cta |
| `blog` | blog | editorial | medium | editorial-hub | long-form-content | website, template | article-list, taxonomy, author-bio |
| `dashboard` | dashboard | app | advanced | dashboard-app | operations-analytics | app | auth, navigation-shell, tables, charts |
| `auth-pages` | auth-pages | app | simple | auth-surface | authentication | website, app | login, signup, password-reset |
| `ecommerce` | ecommerce | commerce | advanced | commerce-storefront | product-catalog | website, template | product-grid, cart, checkout, product-detail |
| `content-site` | content-site | marketing | medium | content-marketing-site | brand-storytelling | website, template | hero, feature-sections, testimonials, cta |
| `app-shell` | app-shell | app | medium | application-shell | workspace-tools | app | auth, sidebar-layout, settings, dash-widgets |

---

## Scaffold-manifestets merge-pipeline

Varje scaffold går igenom 3 steg innan den hamnar i `ALL_SCAFFOLDS`:

```
base manifest (per scaffold-mapp, t.ex. blog/manifest.ts)
  innehåller: id, label, description, siteKind, complexity,
  structureProfile, contentProfile, features, allowedBuildIntents,
  tags, promptHints, files, qualityChecklist, research
        │
        ▼
1. scaffold-research merge
   └─ scaffold-research.generated.json → upgradeTargets, referenceTemplates, qualityChecklist
        │
        ▼
2. applyScaffoldSeoDefaults()
   └─ seo-defaults.ts → SEO-metadata i manifest-filer
        │
        ▼
ALL_SCAFFOLDS (registry.ts)
```

---

## Begrepps-hierarki (inte samma dimension — blanda inte)

```
Dimension 1: VAD ska byggas?
└─ BuildIntent: template | website | app

Dimension 2: HUR kom requesten in?
└─ BuildMethod: wizard | category | audit | freeform | kostnadsfri
└─ PromptType: wizard | freeform | template | audit | followup_*

Dimension 3: VILKEN startstruktur?
└─ ScaffoldMode: off | auto | manual
└─ ScaffoldFamily: 10 stycken (se tabell ovan)
└─ ScaffoldManifest: fullt paket med filer, hints, traits, research

Dimension 4: HUR MYCKET styr scaffolden modellen?
└─ ScaffoldSerializeMode: structural | inspirational
   (bestäms av init/followUp + contextPolicy, inte kreativa nyckelord)

Dimension 5: VAD BERIKAR scaffolden?
└─ template-library → scaffold-research.generated.json (buildtime)
└─ dossiers → template-library.generated.json (buildtime)
└─ scaffold-embeddings.json (förgenererade vektorer)
```

---

## Kvar som teknisk skuld (ej åtgärdat ännu)

| Problem | Detalj |
|---------|--------|
| Template-library scaffold-anchored guidance (opt-in) | `resolveTemplateGuidance()` i `orchestrate.ts` injicerar runtimeGuidance i `## Scaffold Research Priorities` när `SAJTMASKIN_RUNTIME_TEMPLATE_GUIDANCE=true`. Global `searchTemplateLibrary()` förblir oanvänd i runtime. |
| Variant structural files (opt-in) | Två pass: (1) `selectVariantStructuralFiles()` slår upp variantens `sourceTemplateIds` (max 3 filer), (2) `selectCapabilityStructuralFiles()` söker i hela katalogen efter entries som matchar `InferredCapabilities` (max 2 extra). Merged via `mergeStructuralFiles()` och injiceras i `## Structural References (this variant)` när `SAJTMASKIN_VARIANT_STRUCTURAL_FILES=true`. |
| `PromptType` i kod ≠ glossary | Koden har `wizard \| freeform \| template \| audit \| followup_*`. Glossary nämner även `app` och `technical` som docs-only flavorer. |
| ~~Scaffold inline-filer~~ | **Löst.** Scaffold-filer extraherade till disk under `scaffolds/<id>/files/`. Manifest-filer refererar filer via `loadScaffoldFiles()`. |

---

## Historisk analys (genomförd — behålls som referens)

### Var `ScaffoldFamily` faktiskt används (alla ställen i koden)

| Fil | Hur den används | Kan ersättas av `scaffold.id`? |
|-----|----------------|-------------------------------|
| `types.ts` | Definierar union-typen (10 strängliteraler) | Ja — härled från registry |
| `registry.ts` | `getScaffoldByFamily()` — primary lookup | Ja — byt till `getScaffoldById()` |
| `matcher.ts` | 14 anrop — alla använder `getScaffoldById()` | Genomfört |
| `build-spec.ts` | `scaffoldId: ScaffoldId \| null` fält | Genomfört |
| `template-library/types.ts` | `recommendedScaffoldIds: ScaffoldId[]` | **Nej** — en dossier kan rekommendera flera scaffold-id:n |
| `scaffold-embedding-locale.ts` | Nycklar per family | Ja — byt till id |
| `scaffold-aware-retry.ts` | Retry per family | Ja — byt till id |
| `config/scaffold-variants/` | Variantdata per scaffold (keywords, fontPairings, themeTokens, signaturePatterns) | Ja |
| `diagnostics.ts` | Telemetri | Ja |
| `orchestration-contract.ts` | `scaffoldId` i contract | Genomfört |
| Dossier-manifests (catalog.json) | `recommendedScaffoldIds[]` | **Nej** — extern mapping |

### Rekommendation: KOLLAPSA, inte ta bort

**Konkret plan:**

1. **Ta bort `ScaffoldFamily` union-typen** — härled istället:
   `type ScaffoldFamily = ScaffoldManifest["id"]`
   eller: `type ScaffoldId = (typeof ALL_SCAFFOLD_IDS)[number]`

2. **Ta bort `family`-fältet från `ScaffoldManifest`** — det är alltid === `id`

3. **Byt alla `getScaffoldByFamily()`-anrop till `getScaffoldById()`** (14 st i matcher.ts)

4. **Byt namn** `recommendedScaffoldFamilies` → **`recommendedScaffoldIds`** i template-library-typer och genererad katalog

**Varför inte helt ta bort?**
- `recommendedScaffoldIds` i template-library-typer och dossier-manifests (97 kuraterade) pekar på families. En extern template mappar till *flera* (t.ex. `["ecommerce", "dashboard", "app-shell"]`)
- Om du framtida vill ha varianter (ecommerce-minimal, ecommerce-full) behövs ett grupperingskoncept
- Men just nu orsakar den separata typen + fältet bara förvirring

**Resultat:** ~15 filändringar, netto -20 rader, en mental modell mindre att hålla reda på.

---

## Git-ignorerade stora filer — behövs de?

| Fil | Storlek | Vad den innehåller | Används av | Behövs? |
|-----|---------|-------------------|-----------|---------|
| `reference-library/catalog.json` | ~1.5 MB | 97 kuraterade + 94 icke-kuraterade template-entries med full metadata | `build-template-library.ts` läser den vid build | **Ja** — central byggkälla |
| `reference-library/catalog.md` | ~8 KB | Human-readable sammanfattning av catalog.json | Ingen kod importerar den | **Nej** — ren referens, kan återskapas |
| `reference-library/schema.template-manifest.json` | ~0.6 KB | JSON Schema för dossier-manifest | Ingen kod importerar den | **Nej** — dokumentation, kan återskapas |

---

## Befintliga verktyg i scripts/ — vad som finns och vad som gör vad

### Scaffold-pipeline (aktiv, välstrukturerad)

| Verktyg | Kommando | Vad det gör |
|---------|---------|-------------|
| `scripts/scaffolds/scaffold_cli.py` | `npm run scaffolds:*` | **Kanonisk CLI** — status, import, hydrate, build, embeddings, eval, verify, all |
| `scripts/scaffolds/promote-to-scaffold.ts` | `npm run scaffolds:promote` | Skapar ny scaffold från dossier → `manifest.ts` + uppdaterar types/registry |
| `scripts/scaffolds/curate-scaffold-candidates.ts` | `npm run scaffolds:curate` | Rangordnar template-library-entries som scaffold-kandidater (high/medium/low) |
| `scripts/scaffolds/scaffold-candidate-report.ts` | (importeras) | Bygger curated report JSON — used by curate + build |
| `scripts/scaffolds/eval-scaffold-selection.ts` | `npm run scaffolds:eval` | Kör eval-harness för scaffold-matchern |

### Template-library pipeline (aktiv)

| Verktyg | Kommando | Vad det gör |
|---------|---------|-------------|
| `scripts/template-library/build-template-library.ts` | `npm run template-library:build` | **Centralt byggsteg** → `template-library.generated.json` + `scaffold-research.generated.json` + catalog |
| `scripts/template-library/full_template_refresh.py` | `npm run template-pipeline:refresh` | Full pipeline: scrape → import → hydrate → build → embeddings |
| `scripts/template-library/template-library-discovery.ts` | (importeras) | Shared lib: paths, normalization, slugify |
| `scripts/template-library/validate-runtime-artifacts.ts` | `npm run template-library:validate-runtime` | Kontrollerar genererade artefakter + scaffold-manifests |
| `scripts/template-library/import-template-discovery.ts` | `npm run template-library:import` | Importerar scrape-data → canonical raw-discovery |
| `scripts/template-library/hydrate-template-library-cache.ts` | `npm run template-library:hydrate-cache` | Klonar repos från discovery → repo-cache |
| `scripts/template-library/hamta_sidor_branch_emil.py` | (kallas av full_template_refresh) | Vercel templates HTTP-scraper |
| `scripts/template-library/verify-discovered-summary.ts` | `npm run template-library:verify-summary` | Validerar scrape-data |
| `scripts/template-library/sync-v0-templates.mjs` | `npm run templates:sync` | Kanonisk v0 template-sync — anropas via trampolin i `v0-templates/` |

### Embeddings (aktiv)

| Verktyg | Kommando | Vad det gör |
|---------|---------|-------------|
| `scripts/embeddings/generate-scaffold-embeddings.ts` | `npm run scaffolds:embeddings` | → `scaffold-embeddings.json` (runtime scaffold-matchning) |
| `scripts/embeddings/generate-template-library-embeddings.ts` | `npm run template-library:embeddings` | → `template-library-embeddings.json` |
| `scripts/embeddings/generate-template-embeddings.ts` | `npm run templates:embeddings` | → `template-embeddings.json` (v0 Mallar, inte gen/scaffolds) |

### Dashboards / Översikt (aktiv)

| Verktyg | Kommando | Vad det gör |
|---------|---------|-------------|
| `backoffice/` | (importeras av entrypoints) | **Kanonisk Streamlit-app** med sidmoduler för config, overhead och artifacts |
| `scripts/scripts_dashboard.py` | `npm run scripts:dashboard` | Legacy-entrypoint till den konsoliderade backoffice-appen |
| `scripts/dashboard_shared.py` | (importeras) | Legacy re-export till `backoffice/shared.py` |
| `config/dashboard/app.py` | `config/dashboard/run.ps1` | Legacy Streamlit-entrypoint till samma konsoliderade backoffice |
| `sajtmaskin_backoffice.py` | `npm run backoffice` | Root-entrypoint till den konsoliderade backoffice-appen |

### Övriga aktiva

| Verktyg | Vad det gör | Scaffold-relevant? |
|---------|-------------|-------------------|
| `scripts/rebuild_artifacts.py` | Full artifact-rebuild (scaffold + template + embeddings + verify) | **Ja** |
| `scripts/eval/run-eval.ts` | Generell eval med scaffold-routing checks | Delvis |
| `scripts/deps/validate-baseline-npm-*.ts` | Verifierar att scaffoldens baseline-paket installeras korrekt | **Ja** |
| `scripts/dev/check-systemprompt.mjs` | Validerar prompt-static fragment | Indirekt |

### Borttagna filer (rensade)

| Fil | Varför borttagen |
|-----|-----------------|
| `scripts/dev/db-debug.mjs` | Hårdkodade IDs som ruttnar — ad-hoc debug |
| `detectScaffoldMode()` i serialize.ts | Aldrig anropad i production — död kod |

### Möjliga framtida rensningar

| Fil | Varför misstänkt |
|-----|-----------------|
| `reference-library/catalog.md` | Genereras av build, inte importeras av kod |
| `reference-library/schema.template-manifest.json` | Dokumentation, inte validerad av kod |

---

## config/ — vad som är "overhead" vs runtime

### Runtime-kritiskt (Next.js-appen läser dessa)

| Fil | Vad |
|-----|-----|
| `config/codegen-core-manifest.json` | Fragment-lista för Core Rules (primär) |
| `config/codegen-directives-manifest.json` | Fragment-lista för Directives |
| `config/prompt-core/*.md` | 3 Core Rules-filer (stack, beteende, komponenter) |
| `config/prompt-directives/*.md` | 12 Directive-filer (adaptiva, Level 4 defaults) |
| `config/codegen-static-prompt.json` | Legacy fallback fragment-lista |
| `config/prompt-static/*.md` | Legacy fragment-filer (fallback om core-manifest saknas) |
| `config/ai_models/manifest.json` | Build profiles, token-budgetar, embedding-index-pekare, phase routing |
| `config/ai_models/40-generated-site-integration-placeholders.env.txt` | Fake env vars för preview |
| `config/env-policy.json` | Env-audit regler |

**Scaffold-direkt:** `config/prompt-static/08-scaffold-starters.md` (scaffold merge-instruktioner för LLM) och `13-intent-fidelity-and-merge.md` (path-baserad scaffold merge).

### Bara build/audit (inte runtime)

| Fil | Vad |
|-----|-----|
| `config/shadcn-mirror-audit-policy.json` | shadcn mirror version-jämförelse |
| `config/ai_models/manifest.schema.json` | JSON Schema (editor/CI, inte importerad) |

### Bara dokumentation (inte maskintolkad)

| Fil | Vad |
|-----|-----|
| `config/README.md` | Index över config/ |
| `config/ai_models/_READ_ME_FIRST.md` + `*.md` | Modell-dokumentation |
| `config/prompt-core/_READ_ME_FIRST.md` | Core Rules dokumentation |
| `config/prompt-directives/_READ_ME_FIRST.md` | Directives dokumentation |
| `config/prompt-static/_READ_ME_FIRST.md` | Legacy prompt-fragment dokumentation |
| `config/user_degraded_env.txt` | Policy-text, inte parsad |

### Lokal dashboard (valfri GUI)

| Fil | Vad |
|-----|-----|
| `backoffice/pages/runtime_scaffolds.py` | Runtime-scaffolds-sida i den konsoliderade backoffice-appen |
| `config/dashboard/domain-map.json` | Maskin-läsbar karta (parity-testad) |
| `config/dashboard/requirements.txt` | Streamlit beroende |
| `config/dashboard/run.ps1` | Launcher |

---

## data/prompt-dumps/ — debug, inte scaffold-management

- **Gitignorerad** (utom README.md som inte existerar)
- **Skapas av** `src/lib/gen/prompt-dump.ts` — bara om `SAJTMASKIN_PROMPT_DUMP=1`
- **Innehåller** snapshot av senaste generation: system prompt, dynamic context, generation-input-package
- **Användbart för:** debugging av "vilken scaffold såg modellen?" — men inte för att redigera/hantera scaffolds
- Backoffice-ytan visar dump-status via `backoffice/shared.py` (legacy re-export finns kvar i `dashboard_shared.py`)

---

## Sammanfattad förenklingsplan

### Nivå 1 — Snabb mental förenkling (inga kodbyttor)

| Åtgärd | Effekt |
|--------|--------|
| Acceptera att `family === id` och sluta tänka på "families" som separat begrepp | En dimension mindre |
| Använd `scaffold_cli.py` istället för att manuellt navigera filer | CLI gör status/build/eval/verify |
| Använd den konsoliderade backoffice-appens "Runtime scaffolds"-sida för översikt | Streamlit-vy istf. att läsa manifest-filer |

### Nivå 2 — Kodförenkling (15-20 filändringar)

| Åtgärd | Risk | Påverkan |
|--------|------|----------|
| Kollapsa `ScaffoldFamily` → härledd typ från scaffold-ids | Låg | -1 underhållen union, -1 fält |
| Byt `getScaffoldByFamily()` → `getScaffoldById()` i matcher (14 st) | Låg | Tydligare intent |
| Ta bort eller koppla in `detectScaffoldMode()` | Låg | -1 död export |
| Ta bort `scripts/dev/db-debug.mjs` (hårdkodade IDn) | Låg | -1 stale fil |

### Nivå 3 — Strukturell förbättring (större arbete)

| Åtgärd | Risk | Påverkan |
|--------|------|----------|
| Flytta scaffold-filer ur inline-strängar → riktiga filer under `files/` | Medel | Linting, diffbar, redigerbar |
| Ta bort `searchTemplateLibrary()`-export om den förblir oanvänd i runtime | Låg | Rensar oanvänd feature |
| Skapa `data/prompt-dumps/README.md` | Låg | Dokumenterar debug-verktyg |

---

## Backoffice-dashboard

Fristående Streamlit-app: `sajtmaskin_backoffice.py` i repo-roten.

**Starta:** `npm run backoffice` eller `python sajtmaskin_backoffice.py`

### Sidor

| Sida | Innehåll |
|------|----------|
| **Scaffolds** | Tabell med alla scaffolds (id, traits, features, intents, filantal). Detaljvy med manifest-metadata, traits, research overrides, rå manifest.ts. |
| **Research & Dossiers** | catalog.json-vy (kuraterade templates med scores + scaffoldIds). Template-library status. Scaffold-research overrides per scaffold. |
| **Pipeline** | Status-panel + knappar för varje steg (import, hydrate, build, embeddings, eval, verify, all). Live output. Artifact-status. |
| **Eval** | Senaste eval-rapport: accuracy, per-scaffold, per-case tabell. Knapp: kör ny eval. |
| **Autofix & Kvalitet** | Pipelineöversikt, fault/fix-statistik från `error-log.csv`, runtime-gränser för LLM-autofix och centrala repair/token/verifier-kontroller från `config/ai_models/manifest.json`. |
| **Mental modell** | Renderar `docs/architecture/scaffold-schema.md` + snabbfakta (antal scaffolds, IDs, site kinds, complexities). |

Backoffice-ytan ska dela helperlogik via `backoffice/shared.py` när den läser/skriver manifest- eller fault/fix-relaterade data. `config/dashboard/shared_overhead.py` finns kvar som legacy re-export.
