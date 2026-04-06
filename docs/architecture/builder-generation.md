# Builder — generering, modeller, prompt och SSE

**Senast uppdaterad:** 2026-04-06

## Modellbanor (UI ↔ API)

Tre **lanes** + flaggor (detalj + mermaid i arkiv: `builder-model-routing-and-trace.md`):

1. **Byggmodell (model lane)** — `fast` | `pro` | `max` | `codex` | `anthropic` — styr **själva generation/refine-streamen**. **Default är nu `pro`** (`gpt-5.3-codex`), medan `max`/\"Tanker\" pekar på `gpt-5.4`.
2. **Produkt-/promptlane** — modell för *Förbättra*, *Djup brief*, m.m. (`/api/ai/chat`, `/api/ai/brief`).
3. **Polish** — billig omskrivning av promptfältet (`Skriv om`, `SAJTMASKIN_POLISH_MODEL`).
4. **Resonemang (`Thinking`)** — metadata/reasoning i generationen, **inte** en tredje modellbana i samma bemärkelse.

**Anthropic-jämförelse** — preset som linjerar build + produktlane mot Anthropic.

Primär kod: `BuilderHeader.tsx`, `useBuilderState.ts`, `usePromptAssist.ts`, `src/lib/models/catalog.ts`, `selection.ts`, samt **`src/lib/api/engine/chats/`** (kanonisk stream-handlers) med tunna **`/api/v0/chats/...`-compat**-routes.

## OpenClaw / Sajtagenten ligger bredvid

`OpenClaw` / `Sajtagenten` är **inte** en lane i builderns generationskedja. Den ytan lever separat via `src/components/openclaw/`, `/api/openclaw/*` och den isolerade `D-ID`-pilotytan `/avatar` + `/api/did/chat`.

- Använd **builderns `LLM`-flöde / `LLM`-pipeline** när du menar prompt assist, brief, spec-first, own-engine generation, verifiering, polish och repair.
- Använd **OpenClaw / Sajtagenten** när du menar den hjälpassistent som kan läsa builderkontext, ge tips, föreslå textfältsinnehåll och göra djupare review på begäran.
- Om Sajtagenten får mer kod- eller builderinsyn för review betyder det **inte** att own-engine-routen har bytt motor.

## Promptlager och träd

- **Statisk kärna** + dynamisk kontext (scaffold, brief, tema, KB) byggs i `system-prompt.ts` m.m.
- **Fan-in före modellen:** `prepareGenerationContext()` / `resolveOrchestrationBase()` bygger nu ett litet **`BuildSpec`** (`src/lib/gen/build-spec.ts`) som bär styrsignaler som `generationMode`, `changeScope`, `contextPolicy`, `previewPolicy` och `verificationPolicy`. Det används för att hålla scaffold-/referensbudget, follow-up-policy och previewpolicy deterministiska.
- **Narrow follow-up policy:** när `BuildSpec` landar i `followUp + light + fast` hålls dynamisk kontext märkbart smalare: scaffold serialiseras lättare och bred KB/template-retrieval hoppas över för lokala copy/layout-ändringar.
- **Scaffold research i prompten:** `buildDynamicContext()` injicerar nu `qualityChecklist`, `upgradeTargets` och ett budgeterat urval av `referenceTemplates` som **Reference inspirations**. Urvalet begränsas av `BuildSpec.tokenBudgets.refsChars`.
- **Template-library i prompten:** runtime-guidance (`style rules`, `section inventory`, `avoid patterns`, `world-class rubric`) är nu uttryckligen primär signal före kodsnippets. Prompten kan också signalera när template-libraryn är tom eller när retrieval faller tillbaka till keyword/hybrid-läge, och snippets trycks ned för mer scoped edits. KB-sök och template-library-rankning körs nu parallellt när båda behövs.
- **Prompt tree** (alla lager och parametrar): se arkiv `prompt-tree.md` och kod: `config/prompt-static/`, `codegen-static-prompt.json`.

## Nuvarande kodflöde

1. **Prompt in** via Builder eller `scripts/cli/builder-generate.py`.
2. **Före-build prompt-verktyg (valfritt):** "Skriv om" (polish) eller "Förbättra" (rewrite) via `/api/ai/chat` + guardrails i `usePromptAssist.ts`. Redigerar text i realtid utan att skicka iväg.
3. **Första prompten (create-chat SSE):** `orchestratePromptMessage()` körs alltid (budget/skydd). Om klienten **inte** skickat `meta.brief` kan servern fylla **`brief`** via Deep Brief (`src/lib/builder/site-brief-generation.ts`, styrt av `server-auto-brief-policy.ts`). **Briefen genereras alltid från originalprompt** — inte den orkestrerade/summarerade versionen. Auto-brief blockeras för follow-ups, audit, tekniska prompts och nu även för **redan strukturerade website-prompts** där användaren redan specificerat flera sektioner/styrsignaler.
4. **Spec-first chain (valfritt, `specMode=true`):** Om briefen finns konverteras den till en `WebsiteSpec` via `briefToSpec()` i `promptAssistContext.ts`, annars via `promptToSpec()`. Specfilen bifogas som strukturerad kontext till systemprompten.
5. **`resolveOrchestrationBase()`** i `src/lib/gen/orchestrate.ts` väljer scaffold (`manual` / persisted / `auto`), bygger route plan, pre-generation contracts och `BuildSpec`.
6. **Scaffoldval i `auto`:** `matchScaffold()` är primär keyword-path; `matchScaffoldWithEmbeddings()` använder scaffold-embeddings bara när keyword-resultatet saknas eller blir generiskt (`landing-page` / `base-nextjs`).
7. **`buildDynamicContext()`** i `system-prompt.ts` lägger på scaffold-kontext, scaffold research-prioriteringar (inkl. budgeterade reference inspirations), route plan, pre-generation contracts, brief-/temasignaler och övrig request-specifik kontext. Dynamisk kontext trunkeras till `BuildSpec.tokenBudgets.systemContextChars`, och systemet loggar nu faktisk truncation och orkestreringstider per fas.
8. **Streamen** producerar innehåll; efteråt kör `finalizeAndSaveVersion()` i `src/lib/gen/stream/finalize-version.ts` autofix, URL-expansion, ev. deep-path-steg, syntaxvalidering, verifier, parse/merge/preflight och sparar versionen innan tier-2-preview följer upp. `reasoning_effort` sätts nu adaptivt: vanliga `website`-fall landar oftare på `medium`, medan `app` / integrationer / mer avancerade builds kan ligga kvar på `high`.
9. **Saved version** hämtas sedan via chat/version/files-routes; tier-2-start kan komma efter `done` (primärt `preview_host`, med legacy `sandbox`-namn kvar i delar av kontraktet). Om server repair skapar en ny promotad version markeras den tidigare repair-källan nu som **superseded** i stället för att lämnas kvar i `repairing`.

Snabba lokala orienteringsfiler för nästa agent:

- `src/lib/gen/README.md`
- `src/lib/gen/scaffolds/README.md`
- `src/lib/gen/template-library/README.md`

## SSE / stream-scope (W3)

Builder **egen motor** använder SSE på engine-routes — det är **kanon** för chat/generation. Övriga SSE-ytor (admin, observability) är **inte** samma backlog som W3; K-009 är stängd — nya behov = ny planrad (tidigare `own-engine-sse-scope.md` i arkivet).

### Livscykel: `done` och tier-2 preview

Eventet **`done`** betyder att **versionen är finaliserad och sparad** (assistant + `files_json`), inte att alla sidoeffekter är klara. **Efter `done`** kan servern fortfarande skicka t.ex. **`preview-ready`** eller **`build-error`**, och klienten ska fortsätta lyssna tills tier-2-steget är avslutat eller fel rapporterats. Fält som `sandboxPending` på `done` signalerar att tier-2-preview kan komma strax. Byggaren skiljer nu tydligare på **genererar kod**, **verifierar version**, **startar VM-preview** och **byter till reparerad version** när en ny version tar över.

Se även: [`src/lib/gen/stream/builder-stream-contract.ts`](../../src/lib/gen/stream/builder-stream-contract.ts) och post-finalize i `generation-stream-post-finalize.ts`.

**Progress efter codegen:** `progress.step` för finalize-pipelinen följer `OwnEnginePostStreamPhaseId` i [`finalize-pipeline-contract.ts`](../../src/lib/gen/stream/finalize-pipeline-contract.ts) (t.ex. `validate_syntax`, `verifier`, `parse_merge_preflight`), inte äldre alias som `validation` / `finalizing`.

**Integration-SS:** eventet `integration` bär kanoniskt `{ items: BuilderIntegrationItemPayload[] }` (se `builder-stream-contract.ts`); klienten tolererar fortfarande en rå array via `coerceIntegrationSignals`.

## Generationsloop och felminne

- Efter stream: `finalizeAndSaveVersion`, autofix-pipeline (loopas `DETERMINISTIC_AUTOFIX_MAX_PASSES` gånger, manifest-styrt med 15 deterministiska fixers inkl. lucide-link/image-fixers), syntaxvalidering (`validateAndFix`, eskalerar till LLM-fixer vid behov men stoppar tidigt vid fixer-noop eller utebliven förbättring), därefter capad/bounded-parallel bildmaterialisering i deep path, och sedan ev. verifier-pass (read-only blocking/quality), kvalitetsgrind — se `generation-loop-and-error-memory.md` i arkivet och `llm-pipeline-flow.html` för visuellt flöde.
- **Repair-modellval:** alla fixer-vägar (`validate-and-fix`, `server-verify`, `repair/route`) använder `resolvePhaseModel(tier, "fixer")` så att fixern matchar generatorns tier. Reparationspass-begränsningar styrs via `repairPolicies` i `manifest.json`. LLM-fixern inkluderar kontextrader från quality-gate-output och kan skapa nya filer (inte bara ändra befintliga). Repair-loopen använder bestContent-rollback vid regression mellan pass och stoppar nu tidigare vid fixer-noop eller utebliven förbättring. När repair lyckas och en ny version promotas markeras den tidigare raden som ersatt, och äldre valda versioner faller inte längre tyst tillbaka till den senaste previewn.
- **Finalize-path policy:** finalize kör nu ett tydligare **fast path / deep path**-kontrakt. För lätta follow-ups (`verificationPolicy: fast`) kan deep-path-delar som bildmaterialisering hoppas över, medan parse/merge/preflight/persist fortfarande sker innan `done`.
- **Agentlogg** / replay av fel: `runtime-lane-refactor-and-log-viewer.md` i arkivet.

## UX-kontrakt och projektinställningar

- **Preview/iframe-kontrakt** (toast, laddning, `previewUrl`, legacy `demoUrl`): `builder-ux-contracts-and-preview.md` i arkivet + `PreviewPanel.tsx`.
- **Projektfrågor / inställningar** som styr builder: `project-settings-and-builder-questions.md` i arkivet.

## Meritmind / särskilda flöden

Det finns inte längre någon separat kanonisk `meritmind-build-flows.md` i trädet. Vid äldre domänspecifika specialfall: läs relevant fil i `docs/plans/avklarat/` eller använd git-historik i stället för att leta efter en fristående flow-fil.

## Preview-shim vs sandbox — problemtyper (arbetslista)

*Gäller **allt** som genereras från prompt (egen motor): jämförelse mellan **tier‑1** `/api/preview-render` (snabb kompatibilitetsvy) och **Fidelity 2 / tier-2 runtime** (`next dev` i VM), som normalt går via `preview_host` när den är konfigurerad (Vercel Sandbox endast när explicit valt eller som sekundär väg).*

**Kontrakt (2026-03-30):** För own-engine returnerar chat- och versions-API `previewUrl: null` och sätter ev. shim i **`legacyShimPreviewUrl`**; `demoUrl` finns kvar bara i vissa legacy-/inboundlager. Byggaren väljer **sandbox-URL** vid versionsbyte och visar quality-tier «preview» först när **sandbox** finns, inte när bara shim finns.

| # | Problemtyp | Kort beskrivning |
|---|------------|------------------|
| P1 | **Runtime-paritet** | Shim bygger självständig HTML/React-ström; **samma beteende** som full Next + WebGL i sandbox är **inte garanterad** (t.ex. spelloopar, `canvas`, audio). |
| P2 | **WebGL / Three / R3F** | Fiber + `Canvas` kräver **browser + WebGL-kontext**; server-side tier‑1 kan **förenkla, hoppa över eller feltolka** importer och livscykel jämfört med klientbundle i sandbox. |
| P3 | **Bundling & sidoeffekter** | Workers, WASM, dynamiska `import()`, villkor beroende på `window` — risk för **skillnad** mellan shim, sandbox-build och produktion. |
| P4 | **Routing & bas-URL** | Länkar och `next/link` som blir **absoluta mot fel host** i iframe (t.ex. pekar på appens domän i stället för preview-host). |
| P5 | **Flera routes** | Shim styrs ofta med `?route=`; **riktig** App Router har **egna** segment, layouts, `loading.tsx` — paritet saknas ofta. |
| P6 | **API routes / server actions** | Genererade `app/api/*`, server actions och **reella nätverksanrop** körs **inte** som i en riktig Next-server inuti tier‑1. |
| P7 | **Middleware / edge** | Middleware och edge-runtime **ingår inte** i preview-shimens modell. |
| P8 | **Miljövariabler & placeholders** | **`suggestIntegration` / `requestEnvVar`** kan sätta **blocking** utan att projekt-env i UI **räknas** som “svar”; **placeholders i `.env.example`** löser inte automatiskt `awaiting-input` i chatten. |
| P9 | **Hemligheter vs demo** | Stripe/DB utan nycklar: shim kan **visa statiskt innehåll** medan **preview-host verify-lane** (`tsc` / `next build`) **faller** — **dubbla sanningar**. |
| P10 | **Verifiering vs förhandsvisning** | **Lyckad** `preview-render` + **misslyckad** server-verify — svårt för medlemmar utan tydlig koppling i UI. |
| P11 | **CSP & eval** | Dev/prod och iframe **CSP** skiljer sig; vissa 3D-/spelbibliotek utlöser **strängare** policy i preview än lokalt. |
| P12 | **Prestanda & DPR** | Hög `dpr`, partiklar, post-processing — **smidigt i sandbox**, **dyrt eller nedbantat** i shim eller på svaga enheter. |
| P13 | **Tillgång till devserver** | Externa webbläsare (t.ex. assistenter i **Cursor IDE**) når ofta **inte** utvecklarens `localhost`; **deployad URL** kan ge annan **auth/data** än lokal DB — förvirring vid felsökning. *Detta är inte en del av Sajtmaskin-produkten.* |
| P14 | **Tredjepartsskript** | Analytics, Stripe.js, kartor — **laddning/blockering** skiljer sig mellan shim-HTML och full app. |

**Produktmål:** medlemmar skapar sidor **via prompt**; **standardpreview** ska vara **sandbox (Fidelity 2)** när miljön tillåter — shim finns som fallback under tid eller vid fel.

## Snabb felsökning

- Fel route eller modell: spåra `selectedModelTier` + stream route i nätverkspanelen.
- Trace overlay: `scripts/env/model_trace_overlay.py` — synkar GUI-relaterade modell-env i `.env.local`; nycklar finns i [`src/lib/env.ts`](../../src/lib/env.ts).
