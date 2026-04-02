# Builder — generering, modeller, prompt och SSE

**Senast uppdaterad:** 2026-04-02

## Modellbanor (UI ↔ API)

Tre **lanes** + flaggor (detalj + mermaid i arkiv: `builder-model-routing-and-trace.md`):

1. **Byggmodell (model lane)** — `fast` | `pro` | `max` | `codex` | `anthropic` — styr **själva generation/refine-streamen**.
2. **Produkt-/promptlane** — modell för *Förbättra*, *Djup brief*, m.m. (`/api/ai/chat`, `/api/ai/brief`).
3. **Polish** — billig omskrivning av promptfältet (`Skriv om`, `SAJTMASKIN_POLISH_MODEL`).
4. **Resonemang (`Thinking`)** — metadata/reasoning i generationen, **inte** en tredje modellbana i samma bemärkelse.

**Anthropic-jämförelse** — preset som linjerar build + produktlane mot Anthropic.

Primär kod: `BuilderHeader.tsx`, `useBuilderState.ts`, `usePromptAssist.ts`, `src/lib/models/catalog.ts`, `selection.ts`, samt **`src/lib/api/engine/chats/`** (kanonisk stream-handlers) med tunna **`/api/v0/chats/...`-compat**-routes.

## Promptlager och träd

- **Statisk kärna** + dynamisk kontext (scaffold, brief, tema, KB) byggs i `system-prompt.ts` m.m.
- **Fan-in före modellen:** `prepareGenerationContext()` / `resolveOrchestrationBase()` bygger nu ett litet **`BuildSpec`** (`src/lib/gen/build-spec.ts`) som bär styrsignaler som `generationMode`, `changeScope`, `contextPolicy`, `previewPolicy` och `verificationPolicy`. Det används för att hålla scaffold-/referensbudget, follow-up-policy och previewpolicy deterministiska.
- **Narrow follow-up policy:** när `BuildSpec` landar i `followUp + light + fast` hålls dynamisk kontext märkbart smalare: scaffold serialiseras lättare och bred KB/template-retrieval hoppas över för lokala copy/layout-ändringar.
- **Template-library i prompten:** runtime-guidance (`style rules`, `section inventory`, `avoid patterns`, `world-class rubric`) är nu uttryckligen primär signal före kodsnippets. Prompten kan också signalera när template-libraryn är tom eller när retrieval faller tillbaka till keyword/hybrid-läge, och snippets trycks ned för mer scoped edits.
- **Prompt tree** (alla lager och parametrar): se arkiv `prompt-tree.md` och kod: `config/prompt-static/`, `codegen-static-prompt.json`.

## Nuvarande kodflöde

1. **Prompt in** via Builder eller `scripts/cli/builder-generate.py`.
2. **Före-build prompt-verktyg (valfritt):** "Skriv om" (polish) eller "Förbättra" (rewrite) via `/api/ai/chat` + guardrails i `usePromptAssist.ts`. Redigerar text i realtid utan att skicka iväg.
3. **Första prompten (create-chat SSE):** `orchestratePromptMessage()` körs alltid (budget/skydd). Om klienten **inte** skickat `meta.brief` kan servern fylla **`brief`** via Deep Brief (`src/lib/builder/site-brief-generation.ts`, styrt av `server-auto-brief-policy.ts`). **Briefen genereras alltid från originalprompt** — inte den orkestrerade/summarerade versionen. Auto-brief blockeras för follow-ups, audit och tekniska prompts.
4. **Spec-first chain (valfritt, `specMode=true`):** Om briefen finns konverteras den till en `WebsiteSpec` via `briefToSpec()` i `promptAssistContext.ts`, annars via `promptToSpec()`. Specfilen bifogas som strukturerad kontext till systemprompten.
5. **`resolveOrchestrationBase()`** i `src/lib/gen/orchestrate.ts` väljer scaffold (`manual` / persisted / `auto`), bygger route plan, pre-generation contracts och `BuildSpec`.
4. **Scaffoldval i `auto`:** `matchScaffold()` är primär keyword-path; `matchScaffoldWithEmbeddings()` använder scaffold-embeddings bara när keyword-resultatet saknas eller blir generiskt (`landing-page` / `base-nextjs`).
5. **`buildDynamicContext()`** i `system-prompt.ts` lägger på scaffold-kontext, KB och template-library guidance. Template-library-diagnostik (`embedding`, `hybrid_keyword_blend`, `keyword_fallback`, `empty_catalog`) följer sedan med i `streamMeta.templateLibrarySearch`.
6. **Streamen** producerar innehåll; efteråt kör `finalizeAndSaveVersion()` i `src/lib/gen/stream/finalize-version.ts` autofix, URL-expansion, ev. deep-path-steg, syntaxvalidering, parse/merge/preflight och sparar versionen innan sandbox följer upp.
7. **Saved version** hämtas sedan via chat/version/files-routes; sandbox-start kan komma efter `done`.

Snabba lokala orienteringsfiler för nästa agent:

- `src/lib/gen/README.md`
- `src/lib/gen/scaffolds/README.md`
- `src/lib/gen/template-library/README.md`

## SSE / stream-scope (W3)

Builder **egen motor** använder SSE på engine-routes — det är **kanon** för chat/generation. Övriga SSE-ytor (admin, observability) är **inte** samma backlog som W3; K-009 är stängd — nya behov = ny planrad (tidigare `own-engine-sse-scope.md` i arkivet).

### Livscykel: `done` och sandbox

Eventet **`done`** betyder att **versionen är finaliserad och sparad** (assistant + `files_json`), inte att alla sidoeffekter är klara. **Efter `done`** kan servern fortfarande skicka t.ex. **`sandbox-ready`** eller **`build-error`**, och klienten ska fortsätta lyssna tills sandbox-steget är avslutat eller fel rapporterats. Fält som `sandboxPending` på `done` signalerar att preview i sandbox kan komma strax.

Se även: [`src/lib/gen/stream/builder-stream-contract.ts`](../../src/lib/gen/stream/builder-stream-contract.ts) och post-finalize i `generation-stream-post-finalize.ts`.

**Progress efter codegen:** `progress.step` för finalize-pipelinen följer `OwnEnginePostStreamPhaseId` i [`finalize-pipeline-contract.ts`](../../src/lib/gen/stream/finalize-pipeline-contract.ts) (t.ex. `validate_syntax`, `parse_merge_preflight`), inte äldre alias som `validation` / `finalizing`.

**Integration-SS:** eventet `integration` bär kanoniskt `{ items: BuilderIntegrationItemPayload[] }` (se `builder-stream-contract.ts`); klienten tolererar fortfarande en rå array via `coerceIntegrationSignals`.

## Generationsloop och felminne

- Efter stream: `finalizeAndSaveVersion`, autofix-pipeline (loopas `DETERMINISTIC_AUTOFIX_MAX_PASSES` gånger, manifest-styrt), syntaxvalidering (`validateAndFix`, eskalerar till LLM-fixer vid behov), ev. polish-pass, kvalitetsgrind — se `generation-loop-and-error-memory.md` i arkivet.
- **Repair-modellval:** alla fixer-vägar (`validate-and-fix`, `server-verify`, `repair/route`) använder `resolvePhaseModel(tier, "fixer")` så att fixern matchar generatorns tier. Reparationspass-begränsningar styrs via `repairPolicies` i `manifest.json`.
- **Finalize-path policy:** finalize kör nu ett tydligare **fast path / deep path**-kontrakt. För lätta follow-ups (`verificationPolicy: fast`) kan deep-path-delar som bildmaterialisering och polish hoppas över, medan parse/merge/preflight/persist fortfarande sker innan `done`.
- **Agentlogg** / replay av fel: `runtime-lane-refactor-and-log-viewer.md` i arkivet.

## UX-kontrakt och projektinställningar

- **Preview/iframe-kontrakt** (toast, laddning, `previewUrl`, legacy `demoUrl`): `builder-ux-contracts-and-preview.md` i arkivet + `PreviewPanel.tsx`.
- **Projektfrågor / inställningar** som styr builder: `project-settings-and-builder-questions.md` i arkivet.

## Meritmind / särskilda flöden

Om du letar efter domänspecifika byggflöden, se `meritmind-build-flows.md` i arkivet.

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
| P9 | **Hemligheter vs demo** | Stripe/DB utan nycklar: shim kan **visa statiskt innehåll** medan **sandbox quality gate** (`tsc` / `next build`) **faller** — **dubbla sanningar**. |
| P10 | **Verifiering vs förhandsvisning** | **Lyckad** `preview-render` + **misslyckad** server-verify — svårt för medlemmar utan tydlig koppling i UI. |
| P11 | **CSP & eval** | Dev/prod och iframe **CSP** skiljer sig; vissa 3D-/spelbibliotek utlöser **strängare** policy i preview än lokalt. |
| P12 | **Prestanda & DPR** | Hög `dpr`, partiklar, post-processing — **smidigt i sandbox**, **dyrt eller nedbantat** i shim eller på svaga enheter. |
| P13 | **Tillgång till devserver** | Externa webbläsare (t.ex. assistenter i **Cursor IDE**) når ofta **inte** utvecklarens `localhost`; **deployad URL** kan ge annan **auth/data** än lokal DB — förvirring vid felsökning. *Detta är inte en del av Sajtmaskin-produkten.* |
| P14 | **Tredjepartsskript** | Analytics, Stripe.js, kartor — **laddning/blockering** skiljer sig mellan shim-HTML och full app. |

**Produktmål:** medlemmar skapar sidor **via prompt**; **standardpreview** ska vara **sandbox (Fidelity 2)** när miljön tillåter — shim finns som fallback under tid eller vid fel.

## Snabb felsökning

- Fel route eller modell: spåra `selectedModelTier` + stream route i nätverkspanelen.
- Trace overlay: `scripts/env/model_trace_overlay.py` — synkar GUI-relaterade modell-env i `.env.local`; nycklar finns i [`src/lib/env.ts`](../../src/lib/env.ts).
