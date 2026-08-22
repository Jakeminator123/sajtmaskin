# Scaffold-systemet

**Senast uppdaterad:** 2026-08-21. **Kod är source of truth** (`src/lib/gen/scaffolds/`, `config/scaffold-variants/`, `data/dossiers/`).

Snabb översikt över runtime-scaffolds, scaffold-variants och hur de samspelar med dossiers. Rent kontrakt finns i [`../schemas/scaffold-contract.md`](../schemas/scaffold-contract.md).

---

## 1. Aktuell scaffold- och variantkatalog

Identiteter, antal, defaults och ägarrelationer genereras deterministiskt från
runtime-källorna. Läs de aktuella vyerna i
[`scaffolds.generated.md`](../generated/scaffolds.generated.md) och
[`variants.generated.md`](../generated/variants.generated.md). Det här
handskrivna kontraktet äger stabil semantik och arbetsflöden, inte flyktiga
inventarier.

> Historisk not (2026-04-23, OMTAG fas 2·B / M1): den tidigare marketing-scaffolden
> för multi-section brand storytelling slogs ihop med `landing-page`. Dess två
> varianter (`warm-editorial`, `minimalist-mag`) flyttades till landing-page. Se
> `docs/architecture/glossary.md` § "Legacy / undvik i ny text" för detaljer.

### Variant-detaljer (sammanfattning)

Per scaffold finns en eller flera variants med design-axes (label, description, keywords, fontPairings, signatureMotif, themeTokens, promptHints, colorMode, default).

**Sedan 2026-04-17 (Val A genomförd):** fälten `styleRules`, `sectionInventory`, `avoidPatterns`, `worldClassRubric` är borttagna ur `ScaffoldVariant`-typen och alla variant-JSON-filer. Variants levererar nu enbart **högsignal design-axes**. Generic regelmotor-genererat brus är borta från prompten.

**Variant-kvalitet:** `corporate-grid` (landing-page) och `base-nextjs`-varianterna är handredigerade referenser.

**`sourceTemplateIds`:** alla variants pekar på **riktiga v0-mall-Blob-id:n** i `src/lib/templates/template-blob-manifest.json` (legacy-slugs från den borttagna external-template-pipelinen remappades 2026-07-22). Listan är en ordnad kandidatpool; init och `clear-redesign` väljer **högst en** mall via `template-inspiration.ts`. Preview-kompatibla kandidater rangordnas deterministiskt mot prompt + Deep Brief; användbara addendumutdrag premieras och källordningen bryter lika resultat. Tillåtna helprojektskategorier är `landing-pages`, `website-templates`, `apps-and-games`, `dashboards`, `login-and-sign-up`, `e-commerce` och `blog-and-portfolio`. `ai` väljs normalt inte, med ett explicit granskat undantag för `h4nibkqysVJ` (AEGIS-Ω), vars id, kategori och arkiv-SHA måste matcha den låsta runtime-allowlisten. `animations`, `components`, `layouts` och `design-systems` väljs inte. Den valda stillbilden skickas som style-only visionreferens. Frontendutdragen hämtas från det SHA-bundna `config/variant-template-addenda.json`. Ett `hit` ger högst tre, totalt 9 000 tecken långa utdrag (huvudsida, direkt komponent, global CSS/layout). `disabled`, `missing`, `stale` och `invalid` ger inga kodutdrag och hämtar inte Blob-ZIP:en i användarflödet; stillbilden skickas ändå. Scaffold, brief, routes och kontrakt äger fortfarande implementationen; mallens brand, assets, paketversioner, routes och backend antas aldrig. Fristående komponent-/blockinspiration väljs separat av UI Recipes. Arkivläsning hör till offline-kommandot `templates:addenda` och till verbatim-import (`POST /api/template`).

**Integritetsgrind:** `src/lib/gen/scaffold-variants/variant-integrity.test.ts` (körs i `npm run scaffolds:validate` + test-sviten) blockerar halvfärdiga variants: saknade/tunna `signaturePatterns`, döda `sourceTemplateIds`, embeddings-index som inte matchar variant-setet, samt allt annat än exakt en default per scaffold.

---

## 2. Konsoliderings-rekommendationer (öppna)

### 2.1 ~~Landing-familjens sammanslagning~~ (avklarad 2026-04-23)

Den tidigare marketing-scaffolden för multi-section brand storytelling slogs
ihop med `landing-page` i OMTAG fas 2·B / M1. `LANDING_KEYWORDS` absorberade
det gamla `CONTENT_KEYWORDS`-banket, och de två varianterna
(`warm-editorial`, `minimalist-mag`) flyttades till `landing-page`. Se
`docs/architecture/glossary.md` § "Legacy / undvik i ny text".

### 2.2 `dashboard` ↔ `app-shell`

**Fakta:** Båda `siteKind: app`, båda har sidebar+tables. Distinktion: dashboard är analytics-tung (`charts`), app-shell är operations/CRM (`settings`, `dash-widgets`). Templates rekommenderar ofta båda samtidigt.

**Rekommendation:** Behåll separat men skriv om descriptionerna så distinktionen är skarp. Alternativt slå ihop till `dashboard` med variants `analytics-cockpit` vs `operations-shell`.

### 2.3 `auth-pages` som egen scaffold?

**Fakta:** Endast 2 varianter (`clean-auth`, `glass-modern`). Auth-sidor är nästan alltid del av en app (jfr `dashboard`/`app-shell`). Fältet `recommendedScaffoldIds`, som tidigare kodade den kopplingen på Clerk-dossiern, är borttaget ur dossier-manifesten.

**Rekommendation:** Behåll som scaffold för "skapa bara login-flödet"-use-case, men säkerställ att den inte automatiskt väljs för bredare prompts.

### 2.4 Ingen ändring för

`base-nextjs` (bra fallback), `landing-page` (bredast), `saas-landing`, `portfolio`, `blog`, `ecommerce` (tydliga nischer, bra design-axes).

---

## 3. Pipeline — nuläge

```
Prompt / Deep Brief
        │
        ├─ scaffold match → src/lib/gen/scaffolds/*
        │       └─ scaffold-variant → config/scaffold-variants/*
        │
        └─ capability inference → selected dossiers
                └─ data/dossiers/{hard,soft}/<id>/
```

| Lager               | Källa                                                                                                               | Kvalitet                                                                     |
| ------------------- | ------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Scaffold            | `src/lib/gen/scaffolds/<id>/manifest.ts` + `files/`                                                                 | Startstruktur, routes, baseline-filer, checklistor                           |
| Variant             | `config/scaffold-variants/<scaffoldId>/<variantId>.json`                                                            | Visuellt uttryck: motif, fontpar, theme tokens, prompt hints                 |
| Variant-template    | En allowlistad mall + stillbild vald från variantens `sourceTemplateIds`; SHA-addendum i användarflödet, ZIP bara offline/`templates:addenda` + verbatim-import | Init- och `clear-redesign`-inspiration: stilbild + begränsad frontendstruktur, aldrig projektägare |
| Dossier             | `data/dossiers/{hard,soft}/<id>/`                                                                                   | Capability-bunden referens/instruktion, validerad mot strict schema          |
| Research/embeddings | Genererade artefakter under `src/lib/gen/scaffolds/` och `config/scaffold-variants/_index/`                         | Stöd för matchning och prioritering, inte ny sanningskälla                   |

Legacy external-template/template-library-flöden är historik. Kontraktsdokumentet
och skripten togs bort ur repot 2026-07-09 — arkivkopia finns i syskonmappen
`../gamla-skript-till-scaffolds/` utanför repot och i git-historiken (`4ba06d96e`).
Den nya en-template-vägen läser SHA-bundna addendumutdrag i init och
`clear-redesign`. Blob-ZIP:en hör till offline `templates:addenda` och
verbatim-import — inte till codegen-hot-path. Den återinför därför inte den
gamla repo-cache-/template-library-mappen.

---

## 4. Begrepps-hierarki (inte samma dimension — blanda inte)

| Dim | Fråga                       | Typ                           | Värden                                                                    |
| --- | --------------------------- | ----------------------------- | ------------------------------------------------------------------------- |
| 1   | VAD ska byggas?             | `BuildIntent`                 | `template` / `website` / `app`                                            |
| 2   | HUR kom requesten in?       | `BuildMethod`                 | `wizard` / `category` / `audit` / `freeform` / `kostnadsfri`              |
| 2   | Prompt-typ                  | `PromptType`                  | `wizard` / `freeform` / `template` / `audit` / `followup_*`               |
| 3   | VILKEN startstruktur?       | `ScaffoldMode` + `ScaffoldId` | `off` / `auto` / `manual` × 10 scaffold-ids                               |
| 4   | HUR MYCKET styr scaffolden? | `ScaffoldSerializeMode`       | `structural` / `inspirational` (init/followUp + contextPolicy)            |
| 5   | VAD BERIKAR scaffolden?     | Buildtime/runtime stöddata    | dossiers, `scaffold-research.generated.json`, scaffold/variant embeddings |

---

## 5. Runtime-flödet steg för steg

### STEG 1 — Prompt-bearbetning (`prompt-orchestration.ts`)

Klassificerar `PromptType` och väljer `PromptStrategy` (`direct` / `summarize` / `phase_plan_build_refine` / `preserved`). Output: budgeterad `finalMessage`. Scope: bara prompttext, ingen scaffold-logik.

### STEG 2 — Deep Brief (`site-brief-generation.ts`)

Strukturerat objekt: projectTitle, brandName, oneSentencePitch, pages[], visualDirection, imagery, uiNotes, seo, mustHave, avoid. Trigger: client-side eller `shouldRunServerAutoBrief()`. Matar scaffold-matchning, route plan och dynamic context.

### STEG 3 — Scaffold-val (`orchestrate.ts` → `matcher.ts`)

```
scaffoldMode?
├─ "off"     → projekt-bas-app (fritext/init; importerade repo:n förblir scaffold-lösa)
├─ "manual"  → getScaffoldById(scaffoldId)
├─ persisted → getScaffoldById(persistedScaffoldId)  [follow-up]
└─ "auto"    → matchScaffoldAuto(prompt, buildIntent, options)
                 ├─ 3a Keyword (synkron): 9 auto-listor + intent-boost + brief context
                 ├─ 3b Embedding (parallell): cosine vs förgenererade vektorer
                 └─ 3c Merge-policy: agreement / keyword vinner / embedding override
```

`projekt-bas-app` är den tionde registrerade scaffolden men är uttryckligen
utesluten ur Auto-matchning. Den används bara som tunn bas för `off` i
fritext/init, medan importerade repo-flöden fortfarande kör utan scaffold.

| Meta-fält                 | Värden                                                                             |
| ------------------------- | ---------------------------------------------------------------------------------- |
| `selectionMethod`         | `off` / `manual` / `persisted` / `keyword` / `embedding` / `agreement` / `default` |
| `selectionConfidence`     | `high` / `medium` / `low`                                                          |
| `embeddingOverrideReason` | `string` / `null`                                                                  |
| `briefContextApplied`     | `boolean`                                                                          |

### STEG 4 — Capability-inferens (`capability-inference.ts`)

Flaggor: `needsAuth`, `needsEcommerce`, `needsAppShell`, `needsForms`, `needsCharts`, `needs3D`, `needsMotion`, m.fl. + `hasHeavyCapabilities()`. Boostar matchning + prioriterar filer + matar BuildSpec.

### STEG 5 — Route Plan (`src/lib/gen/route-plan/`)

Källprioritet: brief pages > scaffold defaults > prompt patterns. Output: `RoutePlan { routes[], siteType, provenance }`. Scaffold defaults härleds ur manifestets `routeContract` (fyra kategorier: required/optional/declared/dynamic) — manifesten äger listorna, och en deterministisk grind jämför scaffoldens länkar mot kontraktet. Se [`../schemas/scaffold-contract.md`](../schemas/scaffold-contract.md) § Route contract.

### STEG 6 — Pre-generation Contracts (`pre-generation-contracts.ts`)

Auth, Payment, Database, Env vars, Integrations. Output: `contracts[]`, `unresolvedDecisions[]`, `confirmedAnswers[]`.

### STEG 7 — Build Spec (`src/lib/gen/build-spec/`)

`contextPolicy` (`light` / `normal` / `heavy`), `qualityTarget`, `previewPolicy`, `verificationPolicy`, `tokenBudgets.{scaffoldChars, scaffoldTokens}`. Se [llm-pipeline.md](../architecture/llm-pipeline.md) § FAS 2 för token-budget-tabellen. Byggvals `complexityHint` (init-only) deltar: `complex` golvar `qualityTarget` på premium och ger +2 i context-score, `simple` ger −1 (demotar aldrig quality — multipage-/signal-promotions vinner).

### STEG 8 — Orchestration Contract (`orchestration-contract.ts`)

Binder scaffold + routes + validering till `OrchestrationContract { scaffoldToRoute, generationToValidate }`.

### STEG 9 — Scaffold-serialisering (`serialize.ts`)

| Mode            | Triggas av                           | Vad som injiceras                                                                                                               |
| --------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| `inspirational` | `init` + INTE heavy contextPolicy    | Filträd + layout/theme-filer. "Invent a unique page flow."                                                                      |
| `structural`    | `followUp` ELLER heavy contextPolicy | Filträd + kritiska filer renderade per **Scaffold Contract V2** (full/excerpt/signature). Modellen följer scaffoldens baseline. |

`detectScaffoldMode()` med kreativa nyckelord finns men **anropas inte i production**. Mode bestäms mekaniskt i `orchestrate.ts`.

`selectCriticalScaffoldFiles()` prioriterar baserat på kritiska patterns + route-relevans + capability-relevans. Rangordningen i `CRITICAL_PATH_PATTERNS` sätter nästlade route-filer (`app/blog/page.tsx`, nästlad `layout.tsx`) **över** generiska `components/**`, och statiska routes över dynamiska (`[slug]`) — route-sidor är `llm-owned`/`mustEmit`, så en struken sida blir en sida modellen aldrig skriver.

**Scaffold Contract V2 (2026-04-29):** varje vald kritisk fil renderas via `(role, serialization)`. Defaults härleds från path så befintliga manifest fungerar oförändrade. Manifest kan overrida via valfria fält på `ScaffoldFile` (`role`, `serialization`, `maxPromptChars`). Resultat: `app/page.tsx` renderas som `FileContract` (inte halv TSX), shared `components/*` som `FileContract`-signatur (imports + exports + struktur), medan små `layout.tsx`/`globals.css`/config-filer kan vara kompletta source-fences. Stora `full`-filer faller tillbaka till FileContract så `## Critical Scaffold Files` håller 6k-capen. Se [`docs/schemas/scaffold-contract.md`](../schemas/scaffold-contract.md) för fullständig policy-tabell.

### STEG 10 — System Prompt (`src/lib/gen/system-prompt/`)

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

Se [llm-pipeline.md](../architecture/llm-pipeline.md) § FAS 2 för finalize-pipeline. Scaffold-aware retry: `inferScaffoldRetrySuggestion()` föreslår scaffold-pivot vid misslyckad generation.

---

## 6. Komplett scaffold-matris

| ID             | Site Kind | Complexity | Structure Profile       | Content Profile      | Allowed Intents   | Typiska features                              |
| -------------- | --------- | ---------- | ----------------------- | -------------------- | ----------------- | --------------------------------------------- |
| `base-nextjs`  | marketing | simple     | starter-nextjs          | generic              | website, template | routing-basics, seo-metadata, component-ready |
| `landing-page` | marketing | medium     | one-page-marketing      | service-business     | website, template | hero, trust-signals, cta                      |
| `saas-landing` | marketing | medium     | multi-section-marketing | saas-growth          | website, template | pricing, feature-grid, comparison, cta        |
| `portfolio`    | editorial | medium     | showcase-site           | creator-portfolio    | website, template | gallery, project-cases, contact-cta           |
| `blog`         | editorial | medium     | editorial-hub           | long-form-content    | website, template | article-list, taxonomy, author-bio            |
| `dashboard`    | app       | advanced   | dashboard-app           | operations-analytics | app               | auth, navigation-shell, tables, charts        |
| `auth-pages`   | app       | simple     | auth-surface            | authentication       | website, app      | login, signup, password-reset                 |
| `ecommerce`    | commerce  | advanced   | commerce-storefront     | product-catalog      | website, template | product-grid, cart, checkout, product-detail  |
| `app-shell`    | app       | medium     | application-shell       | workspace-tools      | app               | auth, sidebar-layout, settings, dash-widgets  |

Inventering och defaults ägs av [`scaffolds.generated.md`](../generated/scaffolds.generated.md).
`projekt-bas-app` är `Scaffold: Av`-basen och syns där, inte i tabellen ovan.

### Webb-hero (K2, 2026-08-21)

De tre webbscaffoldsen har **olika** grundkomposition i `files/app/page.tsx`.
Varianter muterar inte filer — de bär tokens, prompt hints och
`signaturePatterns.layouts`. Default-variantens layouts ska beskriva samma
komposition som filen.

| Scaffold | Hero i filerna | Default-variant |
| --- | --- | --- |
| `landing-page` | Split 60/40: text vänster, kort höger | `corporate-grid` |
| `saas-landing` | Centrerad produkt-scen: rubrik/CTA i mitten, produktyta under, full bredd | `friendly-saas` |
| `portfolio` | Bilddominant editorial: stor featured-yta, intro överlagd nederst | `minimal-studio` |

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
   └─ scaffold-research.generated.json → qualityChecklist, upgradeTargets
        │
        ▼
2. withDefaultIcon(scaffold)
   └─ registry.ts → adds protected `app/icon.svg` favicon default
      │
      ▼
3. applyScaffoldSeoDefaults(scaffold, options?)
   └─ seo-defaults.ts → SEO-metadata
      │
      ├─ no options                  → noop (ingen global domän/example.com-leak)
      ├─ options.siteUrl (string)    → verifierad/projektspecifik URL
      ├─ options.siteUrl: null       → explicit noop
      └─ options.brand               → fyller layout-metadata-fallbacks
                                        (scaffold-content vinner för title/description;
                                         brand vinner för locale)
        │
        ▼
ALL_SCAFFOLDS (registry.ts)
```

`applyScaffoldTraits()` borttagen 2026-04 — traits konsoliderade direkt i varje manifest.ts.

---

## 7b. File merge policy vid generation

`mergeGeneratedProjectFiles()` i [`src/lib/gen/stream/finalize-merge.ts`](../../src/lib/gen/stream/finalize-merge.ts) styr hur scaffold-filer och LLM-emitterade filer kombineras till final `files_json`. Två motsatta path-set styr policyn:

| Set                        | Beteende                                                                                                                                                            | Default-innehåll                               |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| `LLM_ONLY_PATHS`           | Scaffold-versionen **filtreras bort**. Om LLM inte emitterar en egen version saknas filen → versionen markeras verification-blocked via `missingEmittedEssentials`. | `app/page.tsx`, `src/app/page.tsx`             |
| `SCAFFOLD_PROTECTED_PATHS` | LLM-emissionen **filtreras bort**. Scaffold-default (init) eller previous-version (follow-up) vinner alltid. Logg: `scaffold-protected-overwrite-blocked`.          | `app/icon.svg`, `app/api/placeholder/route.ts` |

`SCAFFOLD_PROTECTED_PATHS` är endast för rena utility-filer utan brand/copy/affärslogik. `app/api/placeholder/route.ts` lades till 2026-04-27 efter att eval-rapporten visade att 6/13 fail-prompts berodde på att LLM:n regenererade filen som JSX i `.ts` (`Expected ">" but found "style"`). `app/icon.svg` är en minimal favicon-default som tar bort preview-404 utan att bära kundspecifik brand. Att låsa scaffold-versionen är deterministiskt och byter inte några brand-relaterade beslut.

Lägg endast till nya entries om filen är ren utility (verifierad korrekt scaffold-version, ingen kund vill anpassa).

### Baseline-owned helpers och extension-kollisioner (2026-05-01)

`buildCompleteProject()` i [`src/lib/gen/export/project-scaffold.ts`](../../src/lib/gen/export/project-scaffold.ts) injicerar runtime-helpers som scaffolden alltid äger (t.ex. `hooks/use-reduced-motion.ts`, `lib/utils.ts`). Två regler styr hur dessa skyddas:

1. **Cross-file-import-checker stubbar inte baseline-helpers.** `@/hooks/use-reduced-motion` står i [`src/lib/gen/autofix/runtime-imports.ts`](../../src/lib/gen/autofix/runtime-imports.ts) `RUNTIME_PROVIDED_EXACT`. Listan delas av cross-file-stubbern, preview-renderern, snapshot-repair och dossier-validering — så samma definition gäller överallt.
2. **Generated siblings dedupas mot baseline-stem.** Om LLM eller en tidig autofix-runda emitterar `hooks/use-reduced-motion.tsx` parallellt med scaffold-baselinens `.ts`, droppas LLM-filen i `buildCompleteProject` innan merge. Bundler-resolver är annars non-deterministisk för samma module-stem med olika extension — den tidigare buggen plockade `.tsx`-stubben (med `return {}` truthy) i stället för matchMedia-baselinen och frös all motion.

`runProjectSanityChecks()` i [`src/lib/gen/validation/project-sanity.ts`](../../src/lib/gen/validation/project-sanity.ts) kompletterar med två deterministiska guards:

- **Bare language-fence-token på rad 1** (`ts`/`tsx`/`js`/`jsx`/`typescript`/`javascript`) blockas som `code_structure_failure`. Detta fångar LLM-fixar som returnerar fenced markdown-block som filinnehåll och annars kraschar runtime med `ReferenceError: ts is not defined`.
- **Duplicate module-stems** med olika source-extensions blockas. Ingen import-specifier får ha både `.ts` och `.tsx` som potentiella resolutionsmål i samma artifact.

Verifier-pass har en kompletterande check ([`checkUseReducedMotionStub`](../../src/lib/gen/verify/verifier-pass.ts)) som flaggar `useReducedMotion`-funktioner vars body är exakt `return {}` eller `return null` — fångar regression om någon framtida autofix återinför stub-shapen.

### Källa och konsumenter (2026-04-27 P0)

`SCAFFOLD_PROTECTED_PATHS` + partition/reinjection-helpers bor i [`src/lib/gen/scaffolds/protected-paths.ts`](../../src/lib/gen/scaffolds/protected-paths.ts) — en gemensam källa för alla pipelines som persisterar `files_json`:

| Pipeline                                                                           | Callsite                                                                                   | Källa                                           |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ----------------------------------------------- |
| Init / follow-up merge                                                             | `mergeGeneratedProjectFiles` partition                                                     | `finalize-merge.ts`                             |
| Post-merge preflight (initial parse + post-mekanisk-autofix + post-LLM-escalation) | tre guards i `runFinalizePreflight` med `branch: "post-merge-…"`                           | `finalize-preflight.ts`                         |
| Server-verify auto-repair (quality-gate eller VM build-error)                      | `tryPromoteAfterGate` partition + reinject från `codeFiles`                                | `repair-execution.ts`                           |
| Server-verify diagnostisk deterministisk persist                                   | `verify-run` partition + reinject                                                          | `verify-run.ts`                                 |
| Manuell repair-knapp                                                               | `promoteIfPostRepairGatePasses` partition + reinject från persisterad `version.files_json` | `app/api/engine/chats/[chatId]/repair/route.ts` |

Full-project persist kräver att varje skyddad path **finns** i den slutliga listan, även när modellen aldrig nämnde den. `fullProjectProtectedDroppedPaths` unionerar emit-and-drop med utelämnade paths innan reinject; tom `droppedPaths` är annars en no-op. Partial-file- och targeted-repair har eget skydd och går inte den vägen.

Ny path läggs ENDAST i `SCAFFOLD_PROTECTED_PATHS`-set:et i `protected-paths.ts`. Alla persist-pipelines plockar då upp den automatiskt — inget mer att synka.

### Eval-mätning (2026-04-27)

`src/lib/gen/eval/runner.ts` mäter gate-checks (`syntax`, `project-sanity`, `imports`, `required-files`, `exports`) på den **canonical persist-payloaden** efter `runFinalizePreflight`, inte på raw LLM-stream. `deriveEvalCheckSources` i samma fil skiljer också `generatedSurfaceFiles` (LLM-emitterade app-ytefiler) från `finalProjectFiles` (komplett körbart Next-projekt efter scaffold/finalize-materialisering). Evalrapportens `Surface/Final`, t.ex. `7/27`, betyder därför 7 genererade app-ytefiler och 27 finala projektfiler. Scaffold-defaults, placeholder-routes, config och andra runtime/support-filer räknas inte mot surface-budgeten. Ett LLM-emitterat `app/api/placeholder/route.ts` med JSX-i-`.ts` som droppas av guarden rapporteras inte längre som eval-syntax-fel — bara reella content-buggar i LLM-owned filer (`app/page.tsx` etc.) faller eval-gaten.

---

## 8. Variant signature patterns

Sedan 2026-04-17 ersätter `signaturePatterns` (konkreta layouts/motifs/antiPatterns) de fyra borttagna guidance-fälten. Fylls i av `scripts/scaffolds/auto-curate-variant-patterns.ts` (GPT-5.4 + Zod). Renderas i `## Scaffold Variant`-blocket.

De borttagna externa scaffold-referenserna finns inte längre i manifesttyp,
genererat research-artefakt, embeddings eller planefterbearbetning. Variantens
enda faktiskt valda Blob-referens renderas i `## Variant Template Inspiration`;
request-specifika komponenter och blocks kommer separat i `## UI Recipes`.

### Embedding-driven variant pick

`pickScaffoldVariantAsync()` embeddar prompten via OpenAI och cosine-söker mot
precomputed variant-embeddings. **Source of truth:** Vercel Blob
(`embeddings/variant-embeddings.json`). Lokal fil under
`config/scaffold-variants/_index/` är bara cache. Public URL finns i
[`config/embeddings-blob-manifest.json`](../../config/embeddings-blob-manifest.json).

Regenerate: `npm run scaffolds:variant-embeddings` (skriver Blob när
`BLOB_READ_WRITE_TOKEN` finns). Backoffice-knapparna skickar `--require-blob`
så en saknad token failar stängt i stället för att bara skriva lokal cache.
Sync cache: `npm run embeddings:sync`.
Promote befintlig lokal JSON: `npm run embeddings:promote`.

**Sedan 2026-04-18:** `create-chat-stream-post.ts` låser keyword-pre-match-varianten via `OrchestrationInput.persistedVariantId`, så orchestrate hämtar samma variant via `getVariantById` istället för att köra async-pickaren. Async körs då bara som fallback (id stale, plan-mode, eval). Eliminerar drift mellan brief-LLM-hint och codegen-variant.

Tre ingångar till variantvalet (K4, 2026-08-21 — slås inte ihop): sync
`pickScaffoldVariant` (pre-match/fallback), async embeddings-vägen, och
style-pin i `style-choice-variants.ts`. Kommentarerna i
`scaffold-variants/matcher.ts` äger ordningen.

Runtime-modulen `scaffold-scoring.ts` är **borttagen**. Backoffice Scaffold
Performance läser CLI-spegeln `scripts/db/scaffold-scores.mjs`, inte en
TS-boost i matchern. Manifest-`tags` är embeddings-only; matchern läser
`keyword-banks.ts`.

---

## 9. Sync-checklista vid scaffold-ändring

Vid scaffold-borttagning, sammanslagning eller variantfältsförändring:

| Yta              | Fil                                                                                                                                                     | Vad                                                               |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Runtime-typ      | `src/lib/gen/scaffolds/types.ts`                                                                                                                        | `ScaffoldId` union och manifesttyper                              |
| Klientprojektion | `src/lib/gen/scaffolds/scaffold-client-list.generated.ts`                                                                                               | Genererad, browser-safe `SCAFFOLD_CLIENT_LIST` i registry-ordning |
| Runtime-registry | `src/lib/gen/scaffolds/registry.ts`                                                                                                                     | `BASE_SCAFFOLDS` array                                            |
| Variant-typ      | `src/lib/gen/scaffold-variants/types.ts`                                                                                                                | Vid fältborttagning                                               |
| Variant-registry | `src/lib/gen/scaffold-variants/registry.ts`                                                                                                             | Parser-kod                                                        |
| Variant-skript   | `scripts/scaffolds/auto-curate-variant-patterns.ts`, `generate-variant-embeddings.ts`                                                                   | Signature patterns + embeddings                                   |
| Matcher          | `src/lib/gen/scaffolds/matcher.ts`                                                                                                                      | Keyword-listor, `defaultScaffoldForIntent`                        |
| Embeddings       | Vercel Blob `embeddings/scaffold-embeddings.json` (+ lokal cache)                                                                                       | Regenereras via `npm run scaffolds:embeddings`                    |
| Backoffice       | `backoffice/pages/scaffolds.py`, `scaffold_lifecycle.py`, `scaffold_performance.py`                                                                     | Kontroller, sidolist                                              |
| Dokumentation    | denna fil (`docs/contracts/scaffold-system.md`) + `docs/architecture/glossary.md`, `docs/schemas/scaffold-contract.md`, `docs/architecture/code-map.md` | Tabeller, distinktioner                                           |
| Cursor-regler    | `.cursor/rules/scaffold-rules.mdc`, `.cursor/skills/sajtmaskin-context/SKILL.md`                                                                        | Lista vid sammanslagning                                          |
| Tester           | `src/lib/gen/scaffolds/matcher.test.ts`, `src/lib/gen/orchestration-snapshot.test.ts`, build-spec, eval-prompts                                         | Asserter på scaffold-id                                           |
| Snapshot-data    | `data/scaffold-eval/prompts.json`                                                                                                                       | Scaffold-id i förväntade resultat                                 |

---

## 10. Verktyg

### Scaffold / dossier / variant

| Kommando                               | Vad                                                                                    |
| -------------------------------------- | -------------------------------------------------------------------------------------- |
| `npm run scaffolds:client-list:check`  | Blockerar drift mellan runtime-registret och den browser-safe klientprojektionen       |
| `npm run scaffolds:client-list:write`  | Regenererar den committade klientprojektionen från runtime-registret                   |
| `npm run scaffolds:validate`           | Validerar klientprojektion, scaffold-manifest, embeddings-paritet och variants         |
| `npm run scaffolds:embeddings:check`   | Kontrollerar scaffold-embeddings inför build                                           |
| `npm run embeddings:ensure`            | Auto-synk + URL-check + registry-paritet (CI/prebuild)                                 |
| `npm run embeddings:sync`              | Laddar ner embedding-JSON från Blob/manifest → lokal cache                             |
| `npm run embeddings:promote`           | Laddar upp lokal cache → Blob (+ `--untrack` tar bort från git)                        |
| `npm run embeddings:check-untracked`   | Failar om embedding-JSON är git-tracked                                                |
| `npm run eval`                         | Canonical eval; scaffold-selection är en intern lane (se `src/lib/gen/eval/README.md`) |
| `npm run scaffolds:embeddings`         | Regenererar runtime scaffold-embeddings (Blob + cache)                                 |
| `npm run scaffolds:variant-embeddings` | Regenererar variant-embeddings (Blob + cache)                                          |
| `npm run scaffolds:variant-patterns`   | Kuraterar variant signature patterns                                                   |
| `npm run dossiers:curate`              | Kuraterar externa referenser till dossier-pipen                                        |
| `npm run dossiers:validate-all`        | Validerar dossier-manifest + invariants                                                |

### Backoffice

`npm run backoffice` startar Streamlit-appen (`sajtmaskin_backoffice.py`). Byggstenar-ytor (omdöpta 2026-07-24, gamla `?nav=`-slugs fungerar fortfarande): **Byggstenar: översikt** (mental modell, renderad ur glossary + kontraktsdocs), **Scaffolds: titta & justera** (översikt + termguide + detaljer + metadata-redigering), **Scaffolds & varianter: skapa, redigera, klona, ta bort** (skapa/redigera/klona/radera + varianter + baseline-återställning; efter skapande, redigering, **radering och fabriksåterställning** måste matchningen publiceras om till Blob via index-knapparna — annars pekar Auto-match på en post som inte längre speglar filerna), **Guide: ny scaffold eller variant (AI)** (AI-guidat skapande; integritetsklar först när embeddings publicerats och `scaffolds:validate` är grön), **Byggblock (dossiers)** och **Mallar (v0): inspiration & uppladdning**. Telemetri-poängen bor i **Scaffold-poäng** (gruppen Telemetri & loggar). Alla sparningar säkerhetskopieras (sidan **Återställning**).

---

## 11. config/ — runtime-kritiskt

| Fil                                                   | Vad                                                                                                                        |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `config/codegen-core-manifest.json`                   | Fragment-lista för Core Rules                                                                                              |
| `config/prompt-core/*.md`                             | Core Rules-fragment (manifestet styr exakt lista)                                                                          |
| `config/integrations/tier3-sdk-deny.json`             | F2 SDK guard + F2 contract-block                                                                                           |
| `config/ai_models/manifest.json`                      | Build profiles, token-budgetar, embedding-index, phase routing, `qualityGateTiers` (`designPreview` / `integrationsBuild`) |
| `config/ai_models/40-harmless-placeholders.env.txt`   | Placeholder env vars OK i F3                                                                                               |
| `config/ai_models/41-tier3-stub-placeholders.env.txt` | F2-stubbar — strippas i F3                                                                                                 |
| `config/env-policy.json`                              | Env-audit regler                                                                                                           |

---

## 12. Hänvisningar

- [Glossary](../architecture/glossary.md)
- [LLM-fasen — kanoniskt körflöde](../architecture/llm-pipeline.md)
- [Runtime contracts](../architecture/runtime-contracts.md)
- Variant-typ: `src/lib/gen/scaffold-variants/types.ts`
- Variant-skript: `scripts/scaffolds/auto-curate-variant-patterns.ts`
- Backoffice: `backoffice/pages/scaffolds.py`, `scaffold_lifecycle.py`
