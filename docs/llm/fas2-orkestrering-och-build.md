# Fas 2 — Orkestrering och Build (pedagogisk genomgång)

Syfte: förstå vad som händer från att Fas 1 levererar prompt + brief
till att en version är sparad i databasen.

---

## Ordlista — vanliga ord i Fas 2

| Ord | Vad det betyder | Förväxlingsrisk |
|-----|-----------------|-----------------|
| **Orchestration** | Samla alla signaler (brief, scaffold, route plan, contracts) till en komplett LLM-input | Förväxlas med "prompt orchestration" (Fas 1) som bara hanterar budget/trunkering |
| **BuildSpec** | Normaliserad policy-bundle: intent, läge, scope, budget, kvalitet, preview/verify-policy | Förväxlas med Spec File — BuildSpec styr *hur* generering körs, Spec File var ett *dataformat* |
| **Scaffold** | Startpunkt-mall (~10 st: landing-page, blog, ecommerce, dashboard, etc.) som ger fil-skelett och regler | Förväxlas med "template" — scaffold styr codegen-ramverk, template är galleri-produkter |
| **Route Plan** | Vilka URL-routes appen ska ha (`/`, `/meny`, `/boka`). Drivs av brief eller scaffold. | — |
| **Dynamic Context** | 20+ markdown-block med `##`-rubriker som bildar systemprompten | — |
| **Static Core** | `config/prompt-static/*.md` — fasta regler som alltid gäller (format, tillgänglighet, korstil) | — |
| **Finalize** | Allt som händer *efter* att LLM:en svarat: autofix, syntax, bilder, verifier, parse, persist | Förväxlas med "deploy" — finalize sparar i DB, deploy skickar till Vercel |
| **Finalize Path (`full` / `light`)** | `full` = hela finalize-kedjan (bilder + verifier). `light` = hoppar över bilder och verifier för låg-risk follow-ups. | Förväxlas med "deep/fast" (äldre etiketter i telemetri) |
| **Autofix** | 28 mekaniska fixers (imports, JSX, fonts, metadata, etc.) — inga LLM:er | Förväxlas med LLM-fixer — autofix är deterministisk regex/AST |
| **LLM Fixer** | Eskalerad reparation av syntax-fel med LLM. Dyrt, icke-deterministiskt. | Förväxlas med autofix — LLM-fixer körs bara som sista utväg |
| **Verifier Pass** | Read-only LLM-granskning som rapporterar `blocking`/`quality` findings utan att ändra kod | Förväxlas med quality gate (Fas 3). `blocking` här är **advisory** och stoppar inte persist i finalize. |
| **Preflight** | Slutkontroller före DB-persist: sanity, SEO, route-matchning, partial-file-detektering | — |
| **PartialFileOutputError** | LLM genererade avhuggna/ofullständiga filer. Ingen version sparas. | — |
| **Image Materialization** | Byta placeholder-bilder mot riktiga Unsplash-foton | — |

---

## Steg för steg: vad som händer i Fas 2

### Steg 1 — Orkestrering (`resolveOrchestrationBase`)

```
IN: prompt + brief + modell + scaffold-hint (från Fas 1)
│
├── 1. inferCapabilities(prompt)
│      → "3D", "motion", "karusell", "auth", "ecommerce" etc.
│
├── 2. buildScaffoldQueryContext(brief)
│      → pages[], styleKeywords[], domainHints[] (för scaffold-matchning)
│
├── 3. SCAFFOLD-VAL:
│      ├── off → ingen scaffold
│      ├── manual → getScaffoldById("ecommerce")
│      ├── persisted (follow-up) → befintlig scaffold
│      └── auto → matchScaffoldAuto()
│          ├── KEYWORD-BANA: domänord + brief-boost (+2/kategori)
│          │   Poängsättning per scaffold-id, MIN_SCORE=2
│          │   T.ex. "restaurang" → landing-page +2, content-site +2
│          ├── EMBEDDING-BANA (parallellt): cosine similarity
│          │   Kräver score ≥0.35 (generisk kräver ≥0.45)
│          └── MERGE: embedding kan override keyword om score
│              ≥ keywordStrength × 0.82 (bias, env-konfigurerbar)
│
├── 4. buildRoutePlan()
│      → routes med provenance: "brief" | "scaffold" | "prompt"
│      Brief-sidor prioriteras vid init.
│      Vid follow-up: befintliga routes fryses oftast.
│
├── 5. inferPreGenerationContracts()
│      → auth?, payment?, database?, CMS?
│      Kontraktspunkter som modellen ska respektera.
│
├── 6. deriveBuildSpec()
│      → Den centrala policy-bundlen:
│        ├── generationMode: "init" | "followUp"
│        ├── changeScope: "integration" | "redesign" | "page-addition" | "copy" | "local-layout"
│        ├── qualityTarget: "standard" | "premium" | "release-candidate"
│        ├── previewPolicy, verificationPolicy, contextPolicy
│        ├── tokenBudgets: { systemContextTokens, scaffoldTokens, refsTokens }
│        └── routeRealization: { mode: "full" | "primary+shells", paths... }
│
├── 7. serializeScaffoldForPrompt()
│      → Scaffold → markdown-text (budgeterat)
│      Follow-up: "structural" (filträd). Init: "inspirational" (traits).
│
└── 8. Ladda shadcn-referenser + community blocks (parallellt med auto-match)
       → Capability-matchade kodexempel (max 8 + 3 community)
```

### Steg 2 — Bygga systemprompten (`buildDynamicContext`)

20+ markdown-block med `##`-rubriker, prioriterade för budgetering:

```
PRIORITET 100 (alltid kvar):
├── ## Generation Mode: Follow-Up        (om follow-up)
├── ## Custom Instructions                (användarens egna)

PRIORITET 90-95 (nästan alltid kvar):
├── ## Build Intent: Website/App/Template (regler per typ)
├── ## Generation Profile                 (stilpaket, kvalitetsmål)
├── ## Scaffold                           (serialiserad scaffold-text)
├── ## Route Plan                         (alla routes + realization-mode)
├── ## Pre-Generation Contracts           (auth/payment/db-krav)

PRIORITET 80-88 (behålls vid normal budget):
├── ## Project Context                    (från brief: titel, pitch, audience, CTA, ton)
├── ## Your Toolkit                       (shadcn-komponenter + capabilities)
├── ## Pages & Sections                   (brief-drivna sidor med rubriker/bullets)
├── ## Component References               (kodexempel)
├── ## Media Catalog                      (om media-assets finns)

PRIORITET 60-78 (kan prunas vid tight budget):
├── ## Scaffold Variant                   (visuell variant)
├── ## Visual Identity                    (färger, typografi, tema)
├── ## Structural References              (layout/page-utdrag, bara init)
├── ## Scaffold Research Priorities        (kvalitetschecklista, referensmallar)
├── ## Design References                  (extern inspiration)
├── ## Imagery                            (Unsplash-ledning)
├── ## SEO                                (title, meta, keywords)
├── ## Must Have / Avoid / UX & UI Notes  (brief-constraints)
```

**Budgetering:**
1. Block delas vid `##`-rubriker → `splitContextIntoBudgetBlocks`
2. Sorteras fallande på prioritet
3. Fylls in till `systemContextTokens`-budgeten (default 30 000 tokens)
4. Required-block trunkeras hellre än kastas
5. Heuristik: ~3.2 tecken/token

**Slutresultat:**
```
composeEngineSystemPrompt() = [statisk kärna] + [separator] + [dynamisk kontext]
```

### Steg 3 — Codegen-stream

```
streamText({
  model: getOpenAIModel(engineModel),  ← t.ex. gpt-5.4 eller claude-opus-4.6
  system: engineSystemPrompt,          ← från steg 2
  messages: [user-turn + ev. historik],
  tools: getAgentTools(),
  │   ├── suggestIntegration  (execute ✓ → non-blocking)
  │   ├── requestEnvVar       (execute ✓ → non-blocking)
  │   ├── askClarifyingQuestion (NO execute → blocking)
  │   └── emitPlanArtifact    (NO execute → plan mode)
  maxSteps: 4,                         ← tillåter multi-step efter tool result
  maxOutputTokens: 131072              ← ENGINE_MAX_OUTPUT_TOKENS
})
```

SSE-events till klienten under streaming:
- `meta` (modell, tier, scaffold, contracts)
- `thinking` (resonemang, om aktiverat)
- `content` (kodchunks — ackumuleras)
- `integration` (env-hints)
- `tool-call` (clarification/plan)
- `progress` (pipeline-steg)
- `ping` (var 15s)

### Steg 4 — Finalize-pipeline (`finalizeAndSaveVersion`)

```
accumulatedContent (rå LLM-output)
│
├── 1. AUTOFIX (28 mekaniska fixers)
│      import-validator, react-import, next-image, lucide-link,
│      metadata-client-conflict, cn-import, jsx-checker,
│      dep-completer, scroll-smooth, font-import, icon-value, ...
│      Max DETERMINISTIC_AUTOFIX_MAX_PASSES (manifest-styrt)
│
├── 2. URL EXPAND
│      expandUrls() — komprimerade URL:er tillbaka till fulla
│
├── 3. VALIDATE SYNTAX (+ ev. LLM-fixer)
│      validateAndFix():
│      ├── Mekanisk autofix
│      ├── validateGeneratedCode() → syntax-fel?
│      │   └── Om ja: LLM-fixer (resolvePhaseModel → fixer-modell)
│      │       ├── Max SYNTAX_FIX_MAX_PASSES
│      │       ├── Timeout: 180s
│      │       ├── bestContent-rollback vid regression
│      │       └── Ge upp vid: fixer_noop, no_improvement, time_budget
│      └── Returnerar: passed | partial | failed | pipeline-error
│
├── 4. MATERIALIZE IMAGES (bara deep path)
│      ├── Söker placeholder.svg?text=... i koden
│      ├── sanitizeQuery() + isViableImageQuery()
│      ├── Unsplash Search (8s timeout, concurrency 2)
│      ├── Cap: 6 bilder (8 vid premium/fidelity3)
│      └── Non-fatal: vid fel → logga, fortsätt
│
├── 5. VERIFIER PASS (bara full path + policy)
│      ├── Read-only LLM-granskning
│      ├── Rapporterar: blocking | quality findings
│      └── Non-fatal: findings loggas men stoppar inte persist
│          ("blocking" i verifier-fynd = advisory severity, inte pipeline-gate)
│
├── 6. PARSE / MERGE / PREFLIGHT
│      ├── parseFilesFromContent() → CodeFile[]
│      ├── mergeGeneratedProjectFiles() → sammanslagna filer
│      ├── runFinalizePreflight():
│      │   ├── repairGeneratedFiles() (en till mekanisk fix-pass)
│      │   ├── sanity checks (partial-file-detektering)
│      │   ├── SEO preflight
│      │   └── route-plan vs filer-matchning
│      └── injectIntegrationManifestIntoFilesJson()
│
├── 7. FAIL-FAST STRUKTURGRIND
│      Om sanity hittar: "partial repair snippet",
│      "overlapping import statements", etc.
│      → PartialFileOutputError → INGEN VERSION SPARAS
│
├── 8. PERSIST
│      addAssistantMessageAndCreateDraftVersion()
│      → assistant-meddelande + engine_versions.files_json (atomiskt)
│
└── 9. EFTERARBETE (best-effort)
       ├── orchestration_snapshot → chat
       ├── preflight-loggar → engine_version_error_logs
       ├── generation telemetry
       ├── generation log (chatRepo.logGeneration)
       └── Om verification-blocking preflight-fel:
           failVersionVerification()
```

### Light path vs Full path

| Villkor | Path | Bilder | Verifier |
|---------|------|--------|----------|
| Init, normal | Full (`full`) | Körs (cap 6) | Körs om policy |
| Follow-up, normal | Full | Körs | Körs |
| Follow-up, `verificationPolicy: "fast"` + `contextPolicy: "light"` + `changeScope: copy/local-layout` | Light (`light`) | **Hoppas över** | **Hoppas över** |
| Repair-pass (`repairPassIndex > 0`) | Full (tvingat) | Körs | Körs |

---

## SSE efter finalize

```
done {
  versionId: "...",
  previewPending: true/false,    ← signal att Fas 3 preview-start kommer
  previewUrlHint: "...",         ← tillfällig boot-hint, INTE kanonisk URL
  awaitingInput: false,          ← true bara vid askClarifyingQuestion
}
```

`done` = version är sparad. Preview är INTE redo ännu.

---

## Legacy och döda stigar

| Vad | Status | Var |
|-----|--------|-----|
| `imageGenerations` param i `buildDynamicContext` | Bindas som `_imageGenerations`, oanvänd | `system-prompt.ts` |
| `AutoFixEntry` typ | `@deprecated`, ersatt av `FixEntry` | `autofix/types.ts` |
| `repair-generated-files.ts` | Delvis duplicerar `runAutoFix` — parallell väg i preflight | `autofix/` |
| Priority-regler för `spec file`, `quality bar`, `coding direction` | Finns i `CONTEXT_BLOCK_PRIORITY_RULES` men skapas sällan av `buildDynamicContext` | `system-prompt.ts` |
| `layout-provider-fixer.ts` | Inte listad i `runAutoFix` pipeline — kan vara äldre/separat | `autofix/` |
| Verifier-findings blockerar inte persist | `blocking` i verifiern är advisory-severity; `done` skickas fortfarande | `finalize-version.ts` |

---

## BUILD_INTENT_GUIDANCE — dubbletten

Finns på **två** ställen:

| Plats | Syfte |
|-------|-------|
| `system-prompt.ts` (rad 70) | Regler för codegen: "Template → compact, reusable layout", "Website → rich, multi-section" |
| `promptAssist.ts` (rad 140) | Samma regler men för rewrite/polish-prompter |

Kommentaren: *"Keep in sync but do not merge (circular import risk)"*

Risken: om en uppdateras men inte den andra kan rewrite ge andra signaler
än codegen — modellen tror att det är en "template" i rewrite men en "website"
i codegen.

---

## Vanliga felscenarion i Fas 2

| Scenario | Vad som händer | Var |
|----------|----------------|-----|
| LLM genererar bara tool calls, ingen kod | `handleEmptyGeneration()` → `done_empty_output` | `generation-stream.ts` |
| LLM genererar avhuggna filer | `PartialFileOutputError` → ingen version | `finalize-version.ts` |
| Syntax-fel överlever alla fix-pass | `validateAndFix` returnerar `failed` → version sparas ändå men med varningar | `validate-and-fix.ts` |
| Unsplash-timeout / garbage-query | Non-fatal → fallback-bild eller hoppas över | `image-materializer.ts` |
| Budget sprängs (för lång dynamisk kontext) | Lågprio-block prunas: SEO, imagery, design refs slängs först | `tokens.ts` |
