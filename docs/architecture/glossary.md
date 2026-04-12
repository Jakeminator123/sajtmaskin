# Glossary — Sajtmaskin Terminology

Enda kanoniska ordlistan för begrepp i Sajtmaskin: LLM-pipeline, scaffold/research, preview/VM, builder-runtime och produkttermer.

**Kod är alltid source of truth.** Det här dokumentet är ett navigationshjälpmedel, inte en ersättning för att läsa koden.

Syftet är att:

- ge **en** auktoritativ term per koncept
- markera vilka äldre/dubbla namn som ska fasas ut
- ge LLM-agenter ett stabilt ankare vid kodändringar och docs-uppdateringar
- fånga **namnskuggor** (ett ord, flera betydelser) så att tvetydigheter syns

Snabb förväxlingstabell: `.cursor/rules/terminology.mdc`.
Signallagrens tabell: `docs/schemas/orchestration-signal-contract.md`.

---

## Strategi för terminologihantering

### Principer

1. **En term per koncept.** Om två namn beskriver samma sak ska bara ett vara kanoniskt. Det andra markeras som alias, legacy eller dödat.
2. **Kod vinner över docs.** Om ett exporterat symbolnamn redan är etablerat i koden är det starkaste kandidaten, även om docs kallar det något annat.
3. **Docs-only-termer måste motiveras.** Om en term bara lever i mermaid/docs men inte i kod behöver den antingen mappa tydligt till en kodsymbol eller fasas ut.
4. **Sammansatta samlingsnamn undviks.** Termer som `PostChecksAndQualityGate` eller `PromptAssistOrDeepBrief` som klumpar ihop distinkta steg ska ersättas med sina beståndsdelar.
5. **Fasindelning styr.** Varje term tillhör en fas. Om en term används i flera faser dokumenteras det, men den "ägs" av den fas där den skapas.

### Livscykelstatus

| Status | Betydelse |
|--------|-----------|
| **kanonisk** | Korrekt term i ny kod och nya docs |
| **alias** | Accepterat alternativnamn; behöver inte döpas om i befintlig kod men ska inte introduceras i nya sammanhang |
| **legacy** | Bör fasas ut; ny kod ska använda den kanoniska termen |
| **döda** | Ska inte användas alls; ta bort vid nästa rensning |

### Uppdateringspolicy

- **Ny term skapas** → agenten lägger till den här med status, fas och kodreferens.
- **Term byter betydelse** → markera gammal betydelse som legacy, lägg till ny rad.
- **Term försvinner ur koden** → markera som legacy/döda.
- **Periodisk audit** → sök på döda termer och rensa docs/kommentarer.
- **Sammanslagningsregel** → om två termer har ≥80 % överlapp i syfte, slå ihop till en.

---

## Prompttyper och anropsklasser

Systemet hanterar flera fundamentalt olika typer av prompter/anrop. De delar infrastruktur men har olika syfte, flöde och kontext.

| Prompttyp | Kodsymbol / trigger | Vad det är | Fas | Kontext som skickas med |
|---|---|---|---|---|
| **Create-chat (init)** | `generationMode: "init"`, `createOwnEngineGenerationStream()` | Första genereringen från rå prompt. Hela orkestreringskedjan körs: brief → scaffold → route plan → contracts → BuildSpec → dynamic context → generation. | 1→2→3 | Rå prompt, ev. deep brief, scaffold, allt byggs från scratch |
| **Follow-up** | `generationMode: "followUp"`, follow-up stream | Efterföljande ändringsförfrågan i samma chat. Konservativare: befintliga filer wrappas med continuity, persisted scaffold återanvänds, route plan fryser ofta befintliga routes. | 1→2→3 | Tidigare filer, persisted scaffold, wrapped user turn, ev. fryst route plan |
| **Prompt Rewrite** | `buildRewriteSystemPrompt()`, `/api/ai/chat` | LLM förbättrar användarens prompt (lane: Förbättra). Ingen kodgenerering — bara bättre prompttext. | 1 | Rå prompt |
| **Prompt Polish** | `buildPolishSystemPrompt()` | Lätt copy-edit av promptfältet (lane: Skriv om). Ingen kodgenerering. | 1 | Rå prompt |
| **Deep Brief** | `generateSiteBriefObject()`, `/api/ai/brief` | LLM genererar strukturerad sajtbrief. Ingen kodgenerering — producerar brief-objekt som sedan matar in i init/follow-up. | 1 | Rå prompt |
| **Plan Mode** | `PlanArtifact`, `createPlanModePipelineStream()` | Planner-LLM som returnerar en strukturerad plan (JSON), inte sajtkod. Planen kan sedan godkännas och exekveras. | 1→2 | Rå prompt + orchestration context |
| **Repair / Autofix** | `runLlmFixer()`, server-verify loop | LLM-driven reparation av genererad kod efter syntax-/quality-fel. Arbetar med felloggar och befintliga filer, inte ny prompt. | 3 | Felloggar, befintliga filer, fixer-systemprompt |
| **Verifier Pass** | `runVerifierPass()` | Read-only LLM-granskning av genererad kod. Producerar findings, inte ny kod. | 3 | Genererade filer, verifier-systemprompt |
| **Clarification** | `resolveFollowUpClarification()`, `askClarifyingQuestion()` | Agenten ställer en motfråga till användaren istället för att generera. | 1 | Föregående konversation |

### Viktiga skillnader

**Create-chat vs Follow-up:** Init bygger allt från scratch (scaffold, routes, contracts). Follow-up är konservativ — den återanvänder scaffold, fryser routes, och wrapprar user turn med befintlig filkontext. Capability-tunga follow-ups (3D, karuseller) ska dock inte degraderas till lättaste banan.

**Prompt Rewrite/Polish vs Deep Brief:** Prompt Rewrite och Polish ändrar *texten i promptfältet* — användaren ser den förbättrade prompten. Deep Brief genererar ett *strukturerat objekt* som matar in i orkestreringskedjan men inte syns direkt som prompttext.

**Plan Mode vs Generation:** Plan mode producerar en plan (JSON-artefakt med steg, faser, kontrakts-antaganden). Generation producerar sajtkod. Planen kan godkännas och sedan exekveras som en generation.

**Repair vs Follow-up:** Repair arbetar med felloggar och befintliga filer — det är inte en ny användarförfrågan utan en automatisk reparationsloop. Follow-up är en medveten ny önskan från användaren.

---

## Fas 1 — Före orkestrering

Allt som händer innan `resolveOrchestrationBase()`: tolkning, förbättring och strukturering av användarens önskan, modellval, intent-klassificering.

### 1.1 Prompt-bearbetning

| Kanonisk term | Kodsymbol | Fil | Vad det är | Status |
|---|---|---|---|---|
| **Raw Prompt** | `prompt` i `OrchestrationInput` | `orchestrate.ts` | Användarens obearbetade prompttext. | kanonisk |
| **Prompt Formatting** | `formatPrompt()` | `promptAssist.ts` | Mekanisk strukturering till MÅL, STIL, CONSTRAINTS, ASSETS, TILLGÄNGLIGHET. | kanonisk |
| **Prompt Rewrite** | `buildRewriteSystemPrompt()` | `promptAssist.ts` | LLM-driven förbättring (lane: Förbättra). | kanonisk |
| **Prompt Polish** | `buildPolishSystemPrompt()` | `promptAssist.ts` | Lätt copy-editor (lane: Skriv om). | kanonisk |
| **Prompt Orchestration** | `orchestratePromptMessage()` | `promptOrchestration.ts` | Strategi-/budget-/trunkerings-gate; väljer `PromptStrategy`. | kanonisk |
| **Prompt Strategy** | `PromptStrategy` | `promptOrchestration.ts` | `direct`, `summarize`, `phase_plan_build_polish`, `preserved`. | kanonisk |
| **Prompt Type** | `PromptType` | `promptOrchestration.ts` | `wizard`, `freeform`, `technical`, `app`, `template`, etc. | kanonisk |
| **Prompt Source** | `PromptSourceKind`, `buildPromptSourceMessage()` | `prompt-builder.ts` | Kompositör från wizard/shadcn/ai-element/page-block-källor. | kanonisk |
| **Prompt Limits** | `MAX_*_CHARS`, `ORCHESTRATION_SOFT_TARGET_*` | `promptLimits.ts` | Char-budgetar för chat + orkestreringsfaser. | kanonisk |
| **Prompt Wrapper** | `PROMPT_WRAPPER_HEADINGS`, `wrapWithSection()` | `prompt-wrapper-contract.ts` | Sektionsrubriker för follow-up-kontinuitet. | kanonisk |
| **URL Compression** | `compressUrls()` / `expandUrls()` | `url-compress.ts` | Komprimerar URL:er i prompten; expanderar i finalize. | kanonisk |
| ~~Prompt Assist~~ (paraply) | — | docs | Otydligt samlingsnamn för flera steg. | **legacy** — använd specifik term |

### 1.2 Brief och spec

| Kanonisk term | Kodsymbol | Fil | Vad det är | Status |
|---|---|---|---|---|
| **Deep Brief** | `siteBriefSchema`, `generateSiteBriefObject()` | `site-brief-generation.ts` | LLM-genererad strukturerad sajtbrief: `projectTitle`, `brandName`, `oneSentencePitch`, `targetAudience`, `primaryCallToAction`, `toneAndVoice`, `pages[]`, `visualDirection`, `imagery`, `uiNotes`, `seo`. | kanonisk |
| **Server Auto-Brief** | `tryGenerateServerAutoBrief()`, `shouldRunServerAutoBrief()` | `site-brief-generation.ts`, `server-auto-brief-policy.ts` | Server-side auto-brief på create-chat-banan. | kanonisk |
| **Brief** (interface) | `Brief` | `system-prompt.ts` | Runtime-representation av deep brief med typade fält. | alias (av Deep Brief) |
| **Brief from Prompt** | `buildPromptFromBrief()` | `promptAssist.ts` | Bygger kodgenereringsprompt från briefobjekt. Obs: använder lokal `type Brief = any`, inte det typade interfacet. | kanonisk |
| **Dynamic Instruction Addendum** | `buildDynamicInstructionAddendumFromBrief()`, `buildDynamicInstructionAddendumFromPrompt()` | `promptAssist.ts` | Markdown-addendum för brief resp. rå prompt. | kanonisk |
| **WebsiteSpec** | `WebsiteSpec`, `websiteSpecSchema`, `processPromptWithSpec()` | `promptAssistContext.ts` | Spec-first: LLM-genererat strukturerat spec-objekt via zod. | kanonisk |
| **SajtmaskinSpec** | `SajtmaskinSpec`, `briefToSpec()`, `promptToSpec()` | `promptAssistContext.ts` | Persisterad spec-fil (`sajtmaskin.spec.json`-format). | kanonisk |
| **Prompt Corpus** | `getPromptCorpus()` | `pre-generation-contracts.ts` | Sammanslagen textmassa av prompt + brief-fält; intern för contracts-inferens. | kanonisk (intern) |
| ~~StructuredBrief~~ | — | `llm-signal-flow.md` | Docs-synonym för Deep Brief; ingen kodsymbol. | **döda** |
| ~~PromptAssistOrDeepBrief~~ | — | `llm-signal-flow.md` | Klumpar ihop Prompt Rewrite + Deep Brief. | **döda** |

### 1.3 Intent, entry och mode

| Kanonisk term | Kodsymbol | Fil | Vad det är | Status |
|---|---|---|---|---|
| **Build Intent** | `BuildIntent` | `build-intent.ts` | `"template" \| "website" \| "app"`. Vad användaren vill bygga. `resolveBuildIntentWithScaffold()` koersar till `app` vid manuellt val av app-scaffold (`dashboard`, `app-shell`). | kanonisk |
| **Build Method** | `BuildMethod`, `normalizeBuildMethod()` | `build-intent.ts` | `wizard`, `category`, `audit`, `freeform`, `kostnadsfri`. Hur entry skedde. | kanonisk |
| **Landing Entry Mode** | `LandingEntryMode`, `isTemplateEntryMode()` | `build-intent.ts` | Landningssidans entry-klassificering. | kanonisk |
| **Generation Mode** | `BuildSpecGenerationMode` | `build-spec.ts` | `"init" \| "followUp"`. Återanvänds på `OrchestrationInput`, `DynamicContextOptions`, `buildRoutePlan`. | kanonisk |
| **Follow-up Intent** | `FollowUpIntentMode`, `classifyFollowUpIntent()` | `follow-up-clarification.ts` | Klassificering av follow-up-requests. | kanonisk |
| **Follow-up Clarification** | `FollowUpClarification`, `resolveFollowUpClarification()` | `follow-up-clarification.ts` | Gating-mekanism för tvetydiga follow-ups. | kanonisk |
| **Plan Mode** | `planMode` (boolean), `PlanArtifact`, `PlanPhase` | `parse-chat-request-meta.ts`, `plan/schema.ts` | Planner-LLM som returnerar plan/JSON, inte sajtkod. `PlanPhase`: `plan`, `build`, `polish`, `verify`, `done`. | kanonisk |

**Löst namnskugga — `buildIntents` → `allowedBuildIntents`:** Scaffold-fältet döptes om till `allowedBuildIntents` för att inte kollidera med `BuildIntent`-typen i `build-intent.ts`.

### 1.4 Modellval och lanes

| Kanonisk term | Kodsymbol | Fil | Vad det är | Status |
|---|---|---|---|---|
| **Build Profile** | `BUILD_PROFILE_IDS`, `getBuildProfileId()` | `catalog.ts` | `fast`, `pro`, `max`, `codex`, `anthropic`. UI-tiername för codegen. | kanonisk |
| **Model Tier** | `ModelTierOption`, `MODEL_TIER_OPTIONS` | `defaults.ts` (builder) | Samma som build profile men från builder-UI-perspektiv. | alias |
| **Generation Phase** | `GenerationPhase` | `phase-routing.ts` | `planner`, `generator`, `fixer`, `verifier`, `deploy-assistant`. Per-fas modellrouting. | kanonisk |
| **Phase Model Override** | `PhaseModelOverride`, `resolvePhaseModel()` | `phase-routing.ts` | Override per fas. | kanonisk |
| **Canonical Model ID** | `CanonicalModelId`, `canonicalizeModelId()` | `catalog.ts` | Normaliserat modell-id. | kanonisk |
| **Model Selection** | `resolveModelSelection()`, `resolveEngineModelId()` | `selection.ts` | Mappar UI-tier → engine-modell. | kanonisk |
| **Model Trace** | `ModelTraceSnapshot`, `buildModelTraceSnapshot()` | `trace.ts` | Observability-snapshot för routing, assist, brief-eligibility. | kanonisk |
| **Thinking** | `thinking` (boolean), `ReasoningEffort` | `generation-stream.ts`, `engine.ts` | Reasoning-flagga, inte en separat lane. | kanonisk |
| **Assist Model** | `ASSIST_MODEL`, `normalizeAssistModel()` | `defaults.ts`, `promptAssist.ts` | Modell för prompt-assist/brief. | kanonisk |
| **Polish Model** | `POLISH_MODEL`, `DEFAULT_PROMPT_POLISH_MODEL` | `defaults.ts` | Modell för Skriv om-lanen. | kanonisk |
| **Spec Model** | `SPEC_MODEL` | `defaults.ts` | Modell för spec-first. | kanonisk |
| ~~LEGACY_ALIAS~~ | `LEGACY_ALIAS`, `LEGACY_MODEL_IDS` | `catalog.ts` | Gamla modell-id-strängar. | **legacy** |
| ~~Gateway Assist Models~~ | `GATEWAY_ASSIST_MODELS` | `promptAssist.ts` | Assist-modeller från borttagen AI Gateway. | **legacy** |

**Löst namnskugga — `PlanPhase "polish"` → `"refine"`:** Plan-artefaktens fas döptes om från `"polish"` till `"refine"` för att inte kollidera med builder-lanens Prompt Polish (`Skriv om`). Gamla lagrade artefakter med `"polish"` coercas automatiskt till `"refine"` i `normalizePlanArtifact()`.

### 1.5 Statisk promptkonfiguration

| Kanonisk term | Kodsymbol | Fil | Vad det är | Status |
|---|---|---|---|---|
| **Static Core** | `getStaticCoreFromWorkspace()` | `static-core-loader.ts` | Stabila produktpolicyregler från `config/prompt-static/*.md`. | kanonisk |
| **Prompt Static Fragments** | `config/prompt-static/*.md` | `config/` | Enskilda sektioner: intro, output-format, planning, intent-fidelity, accessibility m.m. | kanonisk |

---

## Fas 2 — Orkestrering och byggnation

`resolveOrchestrationBase()` → scaffoldval → route plan → contracts → BuildSpec → dynamic context → system prompt → generation.

### 2.1 Orkestrering

| Kanonisk term | Kodsymbol | Fil | Vad det är | Status |
|---|---|---|---|---|
| **Orchestration Input** | `OrchestrationInput` | `orchestrate.ts` | Alla inputs till orkestreraren: prompt, brief, scaffoldMode, scaffoldId, persistedScaffoldId, generationMode, etc. | kanonisk |
| **Orchestration Base** | `OrchestrationBase`, `resolveOrchestrationBase()` | `orchestrate.ts` | Löst scaffold + route plan + contracts + BuildSpec (utan full static core). | kanonisk |
| **Finalized Orchestration** | `FinalizedOrchestrationContext`, `finalizeOrchestrationPrompts()` | `orchestrate.ts` | Dynamic context + `engineSystemPrompt` färdiga. | kanonisk |
| **Generation Context** | `prepareGenerationContext()` | `orchestrate.ts` | End-to-end: base → finalize → `GenerationInputPackage` + prompt dump. | kanonisk |
| **Style Direction (this generation)** | `pickStyleDirection()` + promptblocket `"## Style Direction (this generation)"` | `data/style-directions.ts`, `system-prompt.ts` | Deterministiskt variationsspår per request: layout, rytm, motiv, fontmood. | kanonisk |
| **Your Toolkit** | promptblocket `"## Your Toolkit"` | `system-prompt.ts`, `data/shadcn-components.ts`, `capability-inference.ts` | Samlad verktygsyta för modellen: säkra shadcn-importer + capability-hints + ev. component palette. | kanonisk |
| **Orchestration Contract** | `OrchestrationContract`, `buildOrchestrationContract()` | `orchestration-contract.ts` | Samlad kontraktsyta: scaffold-ruttkontrakt (`ScaffoldRouteContract`) + valideringsförväntningar (`GenerationValidateContract`). Bindemedel, inte primär domänmodell. | kanonisk |
| **Orchestration Snapshot** | `buildPersistedOrchestrationSnapshot()`, `mergePersistedOrchestrationSnapshots()` | `orchestration-snapshot.ts` | K-019 persisterad snapshot för follow-up-kontinuitet. | kanonisk |
| **Pre-generation Contract Gate** | `createPreGenerationContractGateReadableStream()` | `pre-generation-contract-gate.ts` | SSE-gate innan static core betalas. | kanonisk |

### 2.2 Scaffold — matchning och val

| Kanonisk term | Kodsymbol | Fil | Vad det är | Status |
|---|---|---|---|---|
| **Scaffold** | `ScaffoldManifest` | `scaffolds/types.ts` | Runtime-startpunkt: `id` (typat som `ScaffoldId`, inte `string`), `label`, `description`, `structureProfile?`, `contentProfile?`, `siteKind?`, `complexity?`, `features?`, `promptHints?`, `tags?`, `allowedBuildIntents`, `files`, `qualityChecklist?`, `research?`. Fältet `family` är borttaget — använd `id`. | kanonisk |
| **Scaffold Family** | `ScaffoldFamily` (deprecated, use ScaffoldId) | `scaffolds/types.ts` | Collapsed into `ScaffoldId`. The `ScaffoldFamily` type is a deprecated alias for `ScaffoldId`. The `family` field was removed from `ScaffoldManifest` — use `id` instead. Tidigare: union av scaffold-id; primärnyckel i registry/matcher är nu `ScaffoldId` via `id`. | **legacy** |
| **Scaffold Selection** | `matchScaffoldAuto()` → `ScaffoldSelectionResult` | `scaffolds/matcher.ts` | Två lager: keyword+capability-boost → embedding challenge. | kanonisk |
| **Scaffold Selection Meta** | `ScaffoldSelectionMeta` | `scaffolds/matcher.ts` | `selectionMethod` (`keyword`/`embedding`/`manual`/`persisted`/`default`/`off`), `selectionConfidence`, `keywordScores`, `embeddingTopResult`, `embeddingOverrideReason`, `briefContextApplied`, `topCandidates`, `embeddingAvailable/Failed`, `semanticUnavailableReason`. | kanonisk |
| **Scaffold Query Context** | `ScaffoldQueryContext`, `buildScaffoldQueryContext()` | `matcher.ts`, `orchestrate.ts` | Brief-deriverat: `briefPages`, `styleKeywords`, `domainHints`. | kanonisk |
| **Scaffold Keyword Match** | `matchScaffold()` | `scaffolds/matcher.ts` | Synkront keyword/heuristik-steg; delsteg i auto. | kanonisk |
| **Scaffold Mode** | `ScaffoldMode` | `scaffolds/types.ts` | `"off" \| "auto" \| "manual"`. | kanonisk |
| **Scaffold Prompt Context** | `serializeScaffoldForPrompt()` | `scaffolds/serialize.ts` | Budgeterad textserialisering för systemprompt. | kanonisk |
| **Scaffold Serialize Mode** | `ScaffoldSerializeMode` | `scaffolds/serialize.ts`, `orchestrate.ts` | `"structural" \| "inspirational"`. Init kör inspirational som default; follow-up/heavy policy kör structural. | kanonisk |
| **Persisted Scaffold** | `persistedScaffoldId` i `OrchestrationInput` | `orchestrate.ts` | Senast sparade scaffold-id; återanvänds i follow-up om inte redesign låser upp. | kanonisk |

### 2.3 Scaffold — data, traits, research

| Kanonisk term | Kodsymbol | Fil | Vad det är | Status |
|---|---|---|---|---|
| **Scaffold Traits** | _(borttagen)_ | _(var `scaffold-traits.ts`)_ | Per-scaffold trait-bundle (`siteKind`, `complexity`, `structureProfile`, `contentProfile`, `features`) definieras nu direkt i varje `manifest.ts`. `applyScaffoldTraits()` borttagen. | borttagen |
| **Scaffold Research** | `ScaffoldResearchMetadata` | `scaffolds/types.ts` | `upgradeTargets`, `referenceTemplates`. | kanonisk |
| **Scaffold Research File** | `ScaffoldResearchFile`, `getScaffoldResearchOverrides()` | `scaffold-research.ts` | Genererad fil `scaffold-research.generated.json`. Override per scaffold. | kanonisk |
| **Scaffold Research Priorities** (prompt) | `"## Scaffold Research Priorities"` | `system-prompt.ts` | Promptblock som kombinerar `qualityChecklist` + `upgradeTargets` + referensrader. | kanonisk |
| **Scaffold Quality Checklist** | `qualityChecklist?: string[]` | `scaffolds/types.ts` | Per-scaffold checklista; optional manifest-fält. | kanonisk |
| **Scaffold Reference Template** | `ScaffoldReferenceTemplate` | `scaffolds/types.ts` | Extern template-ref: `id`, `title`, `category`, `score`, `strengths`. ID:n måste finnas i template-library. | kanonisk |
| **Scaffold Registry** | `getAllScaffolds()`, `getScaffoldById()` | `scaffolds/registry.ts` | Mergerad registry: base manifests + research + traits + SEO defaults. | kanonisk |
| **Scaffold SEO Defaults** | `applyScaffoldSeoDefaults()` | `scaffolds/seo-defaults.ts` | Injicerar SEO-metadata i manifest-filer. | kanonisk |
| **Scaffold Scoring** | `ScaffoldScore`, `computeScaffoldScores()`, `getScaffoldBoost()` | `scaffold-scoring.ts` | Telemetri/scoring; boost för orkestreringsretry. | kanonisk |
| **Scaffold Eval** | `ScaffoldEvalCase`, `runScaffoldSelectionEval()` | `scaffold-eval.ts` | Eval-harness för matchern. | kanonisk |

### 2.4 Scaffold — embeddings och semantisk sökning

| Kanonisk term | Kodsymbol | Fil | Vad det är | Status |
|---|---|---|---|---|
| **Scaffold Embeddings** | `ScaffoldEmbeddingsFile`, `ScaffoldEmbeddingEntry` | `scaffold-embeddings-core.ts` | Förgenererade vektorer i `scaffold-embeddings.json`. | kanonisk |
| **Scaffold Embedding Locale** | `ScaffoldEmbeddingLocale`, `SCAFFOLD_EMBEDDING_LOCALE` | `scaffold-embedding-locale.ts` | Tvåspråkiga (SV/EN) labels/beskrivningar/nyckelord per scaffold (`ScaffoldId`). | kanonisk |
| **Scaffold Search** | `searchScaffolds()`, `searchScaffoldsWithDiagnostics()` | `scaffold-search.ts` | Cosine-similarity ranking av scaffolds. | kanonisk |
| ~~Semantic Matching~~ (informellt) | — | docs | Informellt namn för embedding-banan. | **legacy** — säg "scaffold embedding search" |

### 2.5 Scaffold — retry

| Kanonisk term | Kodsymbol | Fil | Vad det är | Status |
|---|---|---|---|---|
| **Scaffold Retry** | `ScaffoldRetrySuggestion`, `inferScaffoldRetrySuggestion()` | `scaffold-aware-retry.ts` | Sen diagnos + scaffoldpivot-förslag. | kanonisk |
| **Scaffold Retry Failure Type** | `ScaffoldRetryFailureType` | `scaffold-aware-retry.ts` | Taxonomi av felorsaker. | kanonisk |

### 2.6 Scaffold — manifest-validering

| Kanonisk term | Kodsymbol | Fil | Vad det är | Status |
|---|---|---|---|---|
| **Scaffold Manifest Validation** | `validateScaffoldManifest()`, `runScaffoldManifestChecks()` | `scaffold-manifest-validation.ts` | Strukturella kontroller per manifest. | kanonisk |

### 2.7 Template-library (extern research-katalog)

| Kanonisk term | Kodsymbol | Fil | Vad det är | Status |
|---|---|---|---|---|
| **Template-Library Entry** | `TemplateLibraryEntry` | `template-library/types.ts` | En kuraterad extern template-rad. | kanonisk |
| **Template-Library Catalog** | `TemplateLibraryCatalogFile`, `getTemplateLibraryCatalog()` | `template-library/types.ts`, `catalog.ts` | Full genererad katalog `template-library.generated.json`. | kanonisk |
| **Template-Library Verdict** | `TemplateLibraryVerdict` | `template-library/types.ts` | Kuraterad disposition (inkl. `research_only`). | kanonisk |
| **Template-Library Signals** | `TemplateLibrarySignals` | `template-library/types.ts` | Boolean feature-flaggor från repo. | kanonisk |
| **Template-Library Classification** | `TemplateLibraryClassification` | `template-library/types.ts` | `useCaseTags`, `siteFormTags`, `technicalPatternTags`. | kanonisk |
| **Template-Library Runtime Guidance** | `TemplateLibraryRuntimeGuidance`, `deriveTemplateRuntimeGuidance()` | `template-library/runtime-guidance.ts` | Stilregler, sektionsinventering, rubrik. | kanonisk |
| **Template-Library Search** | `searchTemplateLibrary()`, `searchTemplateLibraryWithDiagnostics()` | `template-library/search.ts` | Embedding + keyword-sökning i extern katalog. | kanonisk |
| **Template-Library Embeddings** | `TemplateLibraryEmbeddingsFile`, `generateTemplateLibraryEmbeddings()` | `template-library/embeddings-core.ts` | Vektorer, parallell struktur med scaffold embeddings. | kanonisk |

### 2.8 Dossiers och extern pipeline

| Kanonisk term | Kodsymbol | Fil | Vad det är | Status |
|---|---|---|---|---|
| **Dossier** | Mapp under `data/external-template-pipeline/reference-library/dossiers/<id>/` | `scripts/`, `docs/` | Build-time researchartefakt per extern template: `manifest.json` + filer. Upstream av template-library och scaffold research. | kanonisk |
| **Reference Library** | `REFERENCE_LIBRARY_ROOT` | `template-library-discovery.ts` | Rotmapp för dossiers. | kanonisk |
| **External Template Pipeline** | `data/external-template-pipeline/` | `docs/schemas/external-template-pipeline-contract.md` | Hela scrape → discovery → curation → dossier → promote-kedjan. | kanonisk |
| **Discovery** | `RawTemplateRecord`, `CanonicalDiscoveryCatalogEntry` | `template-library-discovery.ts` | Rå och normaliserad intake från Vercel Templates. | kanonisk |
| **Curation** | `curate-scaffold-candidates.ts`, `scaffold-candidates-curated.json` | `scripts/scaffolds/` | Bedömning/scoring av scaffold-kandidater. | kanonisk |
| **Scaffold Candidate Report** | `ScaffoldCandidateRecord`, `buildScaffoldCandidateReport()` | `scaffold-candidate-report.ts` | Prioriterad kandidatlista i tier-buckets. | kanonisk |
| **Promote to Scaffold** | `promote-to-scaffold.ts` | `scripts/scaffolds/` | Dossier → `ScaffoldManifest` TS-fil. | kanonisk |
| ~~Legacy Candidate~~ | `LegacyCandidate` (intern) | `curate-scaffold-candidates.ts` | Gammalt import-format. | **legacy** |
| ~~Legacy Summary~~ | `normalizeLegacySummary()`, `"legacy-summary"` | `template-library-discovery.ts` | Gammalt intake-format. | **legacy** |

### 2.9 Policy-lager (capability, route plan, contracts, build spec)

| Kanonisk term | Kodsymbol | Fil | Vad det är | Status |
|---|---|---|---|---|
| **Capability Map** | `inferCapabilities()` → `InferredCapabilities`, `buildCapabilityHints()` | `capability-inference.ts` | Snabb klassificering: motion, 3D, charts, auth, forms, ecommerce, etc. Hint-lager. | kanonisk |
| ~~Capability Pack~~ | — | — | Borttaget i restore `1f4e86956`. `buildCapabilityHints()` i `capability-inference.ts` täcker samma behov direkt. | borttaget |
| ~~Enhancement Pack~~ | — | — | Borttaget i restore `1f4e86956`. Onödig komplexitet — promptar styr via `04-visual-design-quality.md` istället. | borttaget |
| ~~Enhancement Guidance~~ | — | — | Borttaget i restore `1f4e86956`. Fältet existerar inte i OrchestrationBase. | borttaget |
| ~~Scaffold LLM Classifier~~ | — | — | Borttaget i restore `1f4e86956`. Keyword+embedding räcker. | borttaget |
| **Heavy Capabilities** | `hasHeavyCapabilities()` | `capability-inference.ts` | Flagga för capability-tunga requests (påverkar follow-up-policy). | kanonisk |
| **Route Plan** | `buildRoutePlan()` → `RoutePlan` | `route-plan.ts` | Planerad IA/ruttlista. Brief mergeas som startpunkt. `PlannedRoute` med `path`, `name`, `intent`, `required`. `RoutePlan` med `provenance`, `siteType`, `reason`. | kanonisk |
| **Route Plan Provenance** | `RoutePlanProvenance` | `route-plan.ts` | Källspårning: `primarySource`, `sources[]`. | kanonisk |
| **Contract Plan** | `inferPreGenerationContracts()` → `PreGenerationContractContext` | `pre-generation-contracts.ts` | Auth, payment, database, env vars, integrations. `contracts`, `unresolvedDecisions`, `confirmedAnswers`. | kanonisk |
| **Confirmed Contract Answers** | `collectConfirmedContractAnswers()` | `contract/answer-context.ts` | Återbygger bekräftade svar från chatten. | kanonisk |
| **Build Policy** | `deriveBuildSpec()` → `BuildSpec` | `build-spec.ts` | Körpolicy: `changeScope`, `qualityTarget`, `previewPolicy`, `verificationPolicy`, `contextPolicy`, `referenceCategories`, `forbiddenPatterns`, `tokenBudgets`. | kanonisk |
| **Token Budgets** | `BuildSpecTokenBudgets` | `build-spec.ts` | `scaffoldTokens`, `scaffoldChars`, etc. | kanonisk |

### 2.10 System prompt och dynamic context

| Kanonisk term | Kodsymbol | Fil | Vad det är | Status |
|---|---|---|---|---|
| **Dynamic Context** | `buildDynamicContext()` → `BuildDynamicContextResult` | `system-prompt.ts` | Request-specifik promptdel: scaffold, route plan, contracts, brief, tema, imagery, capability hints. Blockprioriterad och token-prunad. | kanonisk |
| **Dynamic Context Pruning** | `DynamicContextPruning`, `DynamicContextBlockTrace` | `system-prompt.ts` | Telemetri per block: token-budget. | kanonisk |
| **Context Block Priority** | `CONTEXT_BLOCK_PRIORITY_RULES`, `resolveContextBlockPriority()` | `system-prompt.ts` (intern) | Regex → prioritet/required för pruning. | kanonisk (intern) |
| **System Prompt** | `composeEngineSystemPrompt()`, `buildSystemPrompt()` | `system-prompt.ts` | Static Core + Dynamic Context = komplett systemprompt. | kanonisk |
| **Prompt Budget** | `buildBudgetedSystemPrompt()`, `PromptBudgetBlock` | `tokens.ts` | Prioritetsbaserad token-budgetering för dynamiska block. | kanonisk |
| **Design Reference** | `DesignReferenceAsset` | `system-prompt.ts` | Figma/bild-referens; inte samma som `ScaffoldReferenceTemplate`. | kanonisk |
| ~~DynamicContextAssembly~~ | — | `llm-signal-flow.md` | Docs-synonym för `buildDynamicContext()`. | **döda** |

### 2.11 Generation

| Kanonisk term | Kodsymbol | Fil | Vad det är | Status |
|---|---|---|---|---|
| **Generation Package** | `GenerationInputPackage`, `buildGenerationInputPackage()` | `generation-input-package.ts` | Kanonisk fan-in: `engineSystemPrompt`, `dynamicContext`, `dynamicContextPruning`, `dynamicContextBlocks`, `lineageHash`. | kanonisk |
| **Generation Pipeline** | `createGenerationPipeline()` | `engine.ts` | Convenience wrapper runt `generateCode()`. | kanonisk |
| **Code Generation** | `generateCode()` | `engine.ts` | Kärnan: anropar LLM med systemprompt + user turn. | kanonisk |
| **Own-Engine Stream** | `createOwnEngineGenerationStream()` | `generation-stream.ts` | Own-engine SSE-adapter + finalize-hook. | kanonisk |
| **Builder Stream Events** | `BuilderStreamEventMap`, `createBuilderStreamEvent()` | `builder-stream-contract.ts` | Typade SSE-eventnamn för builder-UI. | kanonisk |
| **Prompt Dump** | `dumpOwnEngineCodegenFromFullSystem()`, `writeLatestPromptDump()` | `prompt-dump.ts` | Debug-dump av prompt-artefakter. | kanonisk |
| **Plan Mode Stream** | `createPlanModeStream()`, `createPlanModePipelineStream()` | `plan-mode-stream.ts`, `own-engine-plan-mode.ts` | SSE-wrapper för plan mode. | kanonisk |
| **Agent Tools** | `getAgentTools()` | `agent-tools.ts` | Tool-definitioner för planner/agent-flöden. | kanonisk |
| ~~OwnEngineGenerator~~ | — | `llm-signal-flow.md` | Docs-namn utan kodsymbol. | **döda** |

---

## Fas 3 — Repair, verifiering och quality gate

Allt efter att generatorn producerat output.

### 3.1 Autofix och repair

Fas 3 använder två kategorier av fixar:

| Kategori | Kanonisk term | Betydelse |
|---|---|---|
| **Mekanisk fix** | `category: "mechanical"` i `FixEntry` | Deterministisk regex/AST-baserad fix. Gratis, snabb, 100 % reproducerbar. Körs alltid — både på initial codegen-output och efter varje LLM-fix-pass. |
| **LLM-fix** | `category: "llm"` i `FixEntry` | Modelldrivet reparationsanrop. Dyrt, långsamt, icke-deterministiskt. Eskaleras till bara när mekaniska fixar inte räcker. |

Äldre synonymer ("deterministisk autofix", "fixer", "repair") ska inte introduceras i ny kod — använd ovan termer.

| Kanonisk term | Kodsymbol | Fil | Vad det är | Status |
|---|---|---|---|---|
| **Fix Entry** | `FixEntry`, `FixCategory` | `autofix/types.ts` | Kanonisk typ för alla fixar (mekaniska och LLM). | kanonisk |
| **Autofix** | `runAutoFix()` → `AutoFixResult` | `autofix/pipeline.ts` | Mekanisk fix-pipeline (imports, JSX, fonts, lucide, metadata, scroll-smooth, icon-value, basePath, etc.). | kanonisk |
| **Validate and Fix** | `validateAndFix()` → `ValidateFixResult` | `autofix/validate-and-fix.ts` | Syntaxvalidering + progressiv mekanisk→LLM→mekanisk fix-loop. | kanonisk |
| **LLM Fixer** | `runLlmFixer()` → `FixerResult` | `autofix/llm-fixer.ts` | LLM-fix; används av validate-and-fix och server-verify. | kanonisk |
| **Fixer Prompt** | `FIXER_SYSTEM_PROMPT`, `buildFixerUserPrompt()` | `autofix/fixer-prompt.ts` | System- och user-promptar för LLM-fixern. | kanonisk |
| **Repair Generated Files** | `repairGeneratedFiles()` | `autofix/repair-generated-files.ts` | Tunn wrapper som kör samma mekaniska fixar på `CodeFile[]` (preflight-ingång). | kanonisk |
| **Autofix Events** | `AUTO_FIX_EVENT_NAME`, `dispatchAutoFixEvent()` | `auto-fix-events.ts` | DOM-events för autofix i UI. | kanonisk |
| **Autofix Hook** | `useAutoFix()` | `useAutoFix.ts` | Client-side autofix-hook. | kanonisk |
| ~~deterministisk autofix~~ | — | — | Äldre synonym för "mekanisk fix". | alias |

### 3.2 Finalize-pipeline

| Kanonisk term | Kodsymbol | Fil | Vad det är | Status |
|---|---|---|---|---|
| **Finalize** | `finalizeAndSaveVersion()` → `FinalizeResult` | `finalize-version.ts` | Samlad pipeline: autofix → URL-expansion → syntax validate/fix → image materialize → ev. verifier → parse/merge/preflight → save. | kanonisk |
| **Finalize Empty/Partial** | `finalizeOrHandleEmptyGeneration()`, `EmptyGenerationError`, `PartialFileOutputError` | `shared-own-engine-helpers.ts`, `finalize-version.ts` | Fail-fast för tom eller partiell output. | kanonisk |
| **Image Materialize** | `materializeImages()` → `MaterializeResult` | `post-process/image-materializer.ts` | Materialiserar bildalias/placeholders. | kanonisk |
| **URL Expansion** | `expandUrls()` | `url-compress.ts` | Återställer komprimerade URL:er. | kanonisk |

### 3.3 Verifier

| Kanonisk term | Kodsymbol | Fil | Vad det är | Status |
|---|---|---|---|---|
| **Verifier Pass** | `runVerifierPass()` → `VerifierFindings` | `verify/verifier-pass.ts` | LLM-driven read-only granskning. | kanonisk |
| **Verifier Pass Policy** | `resolveVerifierPassPolicy()` | `stream/finalize-version.ts` (intern) | Bestämmer om verifier körs, baserat på BuildSpec. | kanonisk (intern) |

### 3.4 Preflight och sanity

| Kanonisk term | Kodsymbol | Fil | Vad det är | Status |
|---|---|---|---|---|
| **Preflight** | `runFinalizePreflight()` → `preflightIssues`, `previewBlockingReason`, `finalizedFilesForPreview` | `finalize-preflight.ts` | Teknisk kontroll inför preview: routing, filkonsistens, blocking. | kanonisk |
| **Preflight Logs** | `buildFinalizePreflightLogBundle()` | `finalize-preflight-logs.ts` | Strukturerade loggar. | kanonisk |
| **Project Sanity** | `runProjectSanityChecks()` → `SanityResult` | `validation/project-sanity.ts` | Fil- och projektkonsistenskontroller. | kanonisk |
| **SEO Preflight** | `runSeoPreflightChecks()` → `SeoPreflightIssue[]` | `validation/seo-preflight.ts` | SEO-kontroller på genererade filer. | kanonisk |

### 3.5 Post-checks

| Kanonisk term | Kodsymbol | Fil | Vad det är | Status |
|---|---|---|---|---|
| **Post-Checks** | `runPostGenerationChecks()` | `post-checks.ts` | Client-side post-genererings-orkestrering. | kanonisk |
| **Post-Check Baseline** | `buildPostCheckBaseline()` → `PostCheckBaseline` | `post-checks-analysis.ts` | Djupanalys: routes, SEO, analytics, editorial, business workflows, sanity. | kanonisk |
| **Post-Check Artifacts** | `buildPostCheckArtifacts()` → `PostCheckArtifacts` | `post-checks-results.ts` | Paketerade artefakter för UI/loggar. | kanonisk |
| **Post-Check Summary** | `buildPostCheckSummary()`, `appendPostCheckSummaryToMessage()` | `post-checks-summary.ts` | Användarsiktlig sammanfattning. | kanonisk |
| **Post-Check Preview** | `readPreviewPreflight()`, `getPreviewUnavailableQualityGateFailure()` | `post-checks-preview.ts` | Preview-preflight + quality-gate-felhantering i UI. | kanonisk |

### 3.6 Quality gate

| Kanonisk term | Kodsymbol | Fil | Vad det är | Status |
|---|---|---|---|---|
| **Quality Gate** | `qualityGateResult` telemetri (`preflight_passed` / `preflight_failed`) | `finalize-version.ts` | Binärt pass/fail-beslut i finalize. | kanonisk |
| **Quality Gate Checks** | `QUALITY_GATE_CHECK_VALUES`, `QualityGateCheck` | `verify/quality-gate-checks.ts` | Vilka npm-checks som körs. | kanonisk |
| **Quality Gate Lanes** | `INTERACTIVE_QUALITY_GATE_CHECKS`, `PROMOTION_QUALITY_GATE_CHECKS`, `TIER2_QUALITY_GATE_CHECKS`, `SERVER_VERIFY_QUALITY_GATE_CHECKS` | `verify/quality-gate-checks.ts` | Vilka checks per lane (interaktiv, promotion, tier-2, server-verify). | kanonisk |
| **Preview Quality Gate** | `runQualityGateChecks()`, `runQualityGateOnExportable()` | `verify/preview-quality-gate.ts` | Preview-host verify-lane + ev. visuell QA. | kanonisk |
| **Server Verify** | `triggerServerVerification()`, `isServerVerifyEligible()` | `verify/server-verify.ts` | Asynkron verify + repair-loop efter finalize. | kanonisk |
| **Server Verify Log Meta** | `buildServerVerifyQualityGateMeta()`, `buildServerRepairOutcomeMeta()` | `verify/server-verify-log-meta.ts` | Logg/meta för server-verify. | kanonisk |
| ~~PostChecksAndQualityGate~~ | — | `llm-signal-flow.md` | Sammansatt docs-term. | **döda** |

### 3.7 Eval-checks (verifieringsnära)

| Kanonisk term | Kodsymbol | Fil | Vad det är | Status |
|---|---|---|---|---|
| **Eval Checks** | `checkProjectSanity()`, `checkTier2Readiness()`, `checkSeoPublishReadiness()`, `checkVisualQuality()` | `eval/checks.ts` | Namngivna kontroller i eval-harnessen. Visual QA i `verify/visual-qa.ts`. | kanonisk |

### 3.8 Loggning och telemetri (Fault & Fix)

| Kanonisk term | Kodsymbol | Fil | Vad det är | Status |
|---|---|---|---|---|
| **Fault & Fix Index** | `FaultFixRow`, `FAULT_FIX_TYPES`, `collectFaultFixRows()` | `logging/generation-log-writer.ts` | Per-generering fel/fix-rader. Skrivs per run-katalog (`fault-fix-index.md`, `.csv`) och globalt (`error-log.csv`). | kanonisk |
| **Global Error Log** | `appendGlobalFaultFixCsv()`, `logs/llm-segmentts-and-index/error-log.csv` | `logging/generation-log-writer.ts` | Append-only CSV med alla fel/fixar. Kolumner: time, phase, step, severity, scaffold_id, `scaffold_family` (deprecated, use ScaffoldId), serialize_mode, style_direction, file, fixer, resolved, m.fl. | kanonisk |
| **Generation Run** | `logs/generationslogg/<YYYYMMDD-HHMMSS-slug>/` | `logging/generation-log-writer.ts` | Per-körning-katalog: `timeline.ndjson`, `summary.md`, `meta.json`, `fault-fix-index.md/.csv`. | kanonisk |
| **DevLog Append** | `devLogAppend()`, `appendRollingLine()` | `logging/devLog.ts` | Gemensam ingångspunkt för loggning. Matar tre sinks: dev-log-filer, generationslogg/timeline, och global CSV. | kanonisk |
| **Timeline** | `timeline.ndjson`, `StoredGenerationEntry` | `logging/generation-log-writer.ts` | NDJSON-logg per generering. Källa för fault-fix-index och CSV. | kanonisk |
| **Enrich Fault Fix Row** | `enrichFaultFixRow()` | `logging/generation-log-writer.ts` | Backfyller chatId, versionId, scaffoldId, serializeMode, styleDirection från tidigare timeline-poster. | kanonisk |

---

## Sammanfattning: termer att döda eller fasa ut

| Term | Status | Ersätts av | Motivering |
|---|---|---|---|
| `StructuredBrief` | döda | Deep Brief | Bara docs-namn |
| `PromptAssistOrDeepBrief` | döda | Prompt Rewrite / Deep Brief (separat) | Klumpar ihop distinkta steg |
| `DynamicContextAssembly` | döda | Dynamic Context / `buildDynamicContext()` | Onödig process-synonym |
| `PostChecksAndQualityGate` | döda | Post-Checks + Quality Gate | Sammansatt samlingsord |
| `OwnEngineGenerator` | döda | "generation" / "generatorn" | Inget kodnamn |
| `Prompt Assist` (paraply) | legacy | specifik: Prompt Rewrite / Prompt Polish / Deep Brief | Otydligt samlingsnamn |
| `Semantic Matching` (informellt) | legacy | Scaffold Embedding Search | Informellt, oprecist |
| `LEGACY_ALIAS` / `LEGACY_MODEL_IDS` | legacy | Canonical Model ID | Gamla modell-id:n |
| `GATEWAY_ASSIST_MODELS` | legacy | — | AI Gateway borttaget |
| `LegacyCandidate` | legacy | Scaffold Candidate Report | Gammalt import-format |
| `Legacy Summary` / `normalizeLegacySummary` | legacy | Discovery (canonical) | Gammalt intake-format |

---

## Dokumenterade namnskuggor (ett ord, flera betydelser)

| Tvetydigt ord | Kontext A | Kontext B | Risk | Rekommendation |
|---|---|---|---|---|
| `brief` | Deep Brief-objektet | generiskt "kort sammanfattning" | medel | Skriv "Deep Brief" eller "the brief object" |
| ~~`buildIntents`~~ | ~~`ScaffoldManifest.buildIntents`~~ | — | **löst** | Döpt om till `allowedBuildIntents`. |
| ~~`polish` (PlanPhase)~~ | ~~`PlanPhase "polish"`~~ | — | **löst** | Döpt om till `"refine"`; `"polish"` coercas vid inläsning. |
| `scaffold` | ScaffoldManifest (data) | Scaffold Selection (process) | medel | Skriv "scaffold" för data, "scaffold selection" för process |
| `context` | Dynamic Context (prompt-block) | generellt "kontext" | medel | Skriv "Dynamic Context" med stor bokstav |
| `policy` | Build Policy / BuildSpec | generellt "policy" | låg | Skriv "Build Policy" eller `BuildSpec` |
| `preflight` | `runFinalizePreflight()` (teknisk kontroll) | generellt "förkontroll" | medel | Skriv "Preflight" med stor bokstav |
| `contracts` | Contract Plan (integrations-/env-kontrakt) | Orchestration Contract (bindemedel) | **hög** | Skriv "Contract Plan" resp. "Orchestration Contract" |
| `reference` | `ScaffoldReferenceTemplate` (extern template-ref) | `DesignReferenceAsset` (figma/bild) | medel | Skriv full term |
| `reference` | Reference Library (dossier-rot) | `referenceCategories` på BuildSpec | medel | Skriv full term |
| `siteKind` | `ScaffoldSiteKind` (trait-fält) | `RoutePlanSiteType` | medel | Olika koncept; scaffold-karaktär vs routing-klassificering |
| `features` | `ScaffoldManifest.features` (capability-lista) | `TemplateLibrarySignals` (boolean flags) | låg | Olika katalog; inga namnkollisioner i kod men förvirrande i diskussion |
| `traits` | `ScaffoldTraits` (intern trait-bundle) | `TemplateLibraryClassification` (tags) | låg | Olika system; behöver inte döpas om |
| `quality gate` | `qualityGateResult` (binärt pass/fail i finalize) | `runQualityGateChecks()` (preview-host verify lane) | medel | Finalize quality gate vs preview quality gate |

---

---

## Preview, VM och sandbox

| Kanonisk term | Vad det är | Status |
|---|---|---|
| **preview** | Det användaren ser i buildern. | kanonisk |
| **VM / `preview_host`** | Primär tier-2-live-preview via Fly.io. Riktningen framåt. | kanonisk |
| **`preview-session`** | Kanonisk bootstrap-route för tier-2-preview; startar eller återanvänder preview. | kanonisk |
| **`preview-status`** | Recover-/statusroute: `running`, `starting`, `stopped`, `missing`, `version_mismatch`. `starting` = boot grace period (90s). | kanonisk |
| **`startOutcome`** | Hur session löstes: `reused_url`, `resumed`, `recreated`. | kanonisk |
| **`previewPending`** | Finalize klar, preview väntas. | kanonisk |
| **`previewUrlHint`** | Temporär VM-hint medan preview bootar; inte slutlig `previewUrl`. | kanonisk |
| **`legacyShimPreviewUrl`** | Shim-/fallback-URL till `/api/preview-render`; inte primär preview. | legacy |
| **`sandboxId`** | Id för aktiv tier-2-runtime/session; inte `chatId` eller `appProjectId`. | kanonisk |
| ~~sandbox~~ (generell term) | Legacy-/compat-term. | **legacy** — använd VM / `preview_host` |
| **Fidelity 2** | Normal tier-2 live-preview via VM. | kanonisk |
| **Fidelity 3** | Striktare lane där `next build` ingår i quality gate. | kanonisk |

---

## Produkttermer och vanliga förväxlingar

| Kanonisk term | Betyder | Källa | Blanda inte ihop med |
|---|---|---|---|
| **`v0-mallar`** | Builderns Mallar-tab / mallkatalog | `src/lib/templates/*` | `template-library`, scaffolds, Vercel-mallar |
| **Vercel-mallar** | Extern research från Vercel Templates | `data/external-template-pipeline/*` | `v0-mallar`, scaffolds |
| **`template-library`** | Kuraterad referensartefakt byggd från externa referenser | `src/lib/gen/template-library/*` | `v0-mallar`, scaffolds |
| **scaffolds** | Interna runtime-startpunkter för own-engine | `src/lib/gen/scaffolds/*` | `template-library`, Vercel-mallar |
| **own-engine** | Den enda aktiva codegen-vägen | `src/lib/gen/*`, `src/lib/providers/own-engine/*` | OpenClaw, gammal v0-runtime |
| **OpenClaw / Sajtagenten** | Separat assistent-/agentyta | `src/components/openclaw/*`, `/api/openclaw/*` | Builderns LLM-flöde |
| **`appProjectId`** | Användarprojektets projekt-id | `projects.id`, builder-state | `chatId`, `VERCEL_PROJECT_ID` |
| **`chatId`** | Own-engine-chattens id; preview-lanen följer detta | `engine_chats.id` | `appProjectId` |

### `v0` betyder tre olika saker

1. API-versionering i `/api/v0/`.
2. Naming debt i äldre symboler.
3. Builderns Mallar-tab.

`v0-sdk`, `src/lib/v0/` och `V0_API_KEY` är borttagna ur runtime.

### Builder model lanes

| Lane | Kodsymbol | Vad det är |
|------|-----------|-----------|
| **Byggmodell** | Build Profile | Codegen-modellen |
| **Förbättra** | Prompt Rewrite | Prompt-assist lane |
| **Skriv om** | Prompt Polish | Copy-editor lane |
| **Thinking** | `thinking` boolean | Reasoning-flagga, inte en lane |

---

## ID- och ingressord

| Kanonisk term | Vad det är | Status |
|---|---|---|
| **`entryKind`** | Normaliserad ingressgren i buildern. | kanonisk |
| **`externalProjectId`** | Builder-lagrets namn för extern/legacy projektidentitet; inte `appProjectId`. | kanonisk |
| **compat-route** | Bakåtkompatibel HTTP-yta som återanvänder kanonisk runtime. | kanonisk |

---

## Env-lager

1. **Plattformens env**: repoets rot-`.env*`, Vercel env vars, `src/lib/env.ts` + `config/env-policy.json`.
2. **Användarens genererade sajt**: egen `.env.local` i byggprojektet/previewmiljön.
3. **Felsökningsordning**: preview → plattforms-env; saknade nycklar i sajt → användarprojektets env.

---

## Legacy som inte ska återintroduceras

| Term | Varför döda |
|------|------------|
| **AI Gateway** | Borttaget ur runtime; använd direkt OpenAI/Anthropic. |
| `AI_GATEWAY_API_KEY` | Ska inte tillbaka. |
| `Vercel Sandbox` (som primär preview-väg) | VM / `preview_host` är den aktiva vägen. |
| `demoUrl` (som nytt publikt namn) | Legacy naming debt; publikt namn är `previewUrl`. |

---

## Domän → mappstruktur

Kopplar glossaryns domäner till filträdet. Använd tabellen för att avgöra var nya filer hör hemma.

| Domän | Fas | Primär plats |
|-------|-----|-------------|
| Orchestration (scaffold + route + contracts + BuildSpec) | 2 | `gen/` rot (`orchestrate.ts` hub) |
| Prompt assembly (system prompt, dynamic context, tokens) | 2 | `gen/` rot (`system-prompt.ts` hub) |
| Spec/planning (BuildSpec, route plan, capabilities) | 2 | `gen/` rot |
| Scaffold-data och matching | 2 | `gen/scaffolds/` |
| SSE wire-format och parsning | 2–3 | `gen/stream/` (`stream-format.ts`, `sse-parser.ts`) |
| Autofix och repair | 3 | `gen/autofix/` (inkl. `repair-generated-files.ts`, `runtime-imports.ts`) |
| Finalize-pipeline | 3 | `gen/stream/` (`finalize-version.ts` m.fl.) |
| Verifiering och quality gate | 3 | `gen/verify/` (inkl. `post-generation-config.ts`) |
| Preview | 3 | `gen/preview/` |
| Export/projektskelett | 3 | `gen/export/` (`project-scaffold.ts`, `project-scaffold-ui-reader.ts`) |
| Env/config | — | `lib/` rot (`env.ts`, `config.ts`) |
| Deploy och Vercel API | — | `lib/deploy/` + `lib/vercel/` |

## Versionering

| Datum | Ändring |
|-------|---------|
| 2026-04-10 | Initial ordlista (v1). |
| 2026-04-10 | Utökad ordlista (v2): +80 termer, scaffold/dossier/research, namnskuggor. |
| 2026-04-10 | Konsoliderad ordlista (v3): integrerat preview/VM/sandbox, produkttermer, env, legacy. |
| 2026-04-10 | Prompttyper och anropsklasser (v4): klassificering av create-chat, follow-up, plan mode, repair, etc. |
| 2026-04-10 | Namnskuggor lösta (v5): `buildIntents` → `allowedBuildIntents`, `PlanPhase "polish"` → `"refine"`, `PromptStrategy "phase_plan_build_polish"` → `"phase_plan_build_refine"`. |
| 2026-04-10 | gen/ omorganisation (v6): verify/, export/, packs/ undermappar. Sökvägar uppdaterade. |
| 2026-04-11 | Loggning och telemetri (v7): +6 termer (Fault & Fix Index, Global Error Log, Generation Run, DevLog Append, Timeline, Enrich Fault Fix Row). Utökat CSV-schema med scaffold_id, serialize_mode, style_direction, file, fixer, resolved. |
| 2026-04-12 | Intent drift fix (v8): `resolveBuildIntentWithScaffold()` och `isAppScaffold()` tillagda i `build-intent.ts`. Manuellt val av `dashboard`/`app-shell` koersar `buildIntent` till `app`. Server-side guard i `create-chat-stream-post.ts` och `chat-message-stream-post.ts`. `family`-fältet borttaget från plan-review och docs uppdaterade. |

## När detta dokument uppdateras

- När en ny term introduceras i koden.
- När en term döps om eller tas bort.
- När en agent upptäcker inkonsekvent begreppsanvändning.
- Periodiskt vid större refaktorer.
- Agentregeln `.cursor/rules/terminology.mdc` pekar hit och kräver att nya begrepp registreras.
