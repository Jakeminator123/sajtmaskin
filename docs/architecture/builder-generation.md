# Builder — generering, modeller, prompt och SSE

**Senast uppdaterad:** 2026-04-10 (partial-file fail-fast + repair guardrails)

## Steg 4 — post-stream (finalize, validering, preflight)

Efter codegen-streamen körs **`finalizeAndSaveVersion`** (autofix → URL-expansion → syntaxvalidering/fixer → ev. bildmaterialisering + verifier → parse/merge/preflight → sparad version). **Djupkarta, blocking vs observability och gräns mot Steg 5:** `docs/architecture/step4-post-generation.md`. **Samlad slutbild:** `5-steg.txt`.

## Modellbanor (UI ↔ API)

Tre **lanes** + flaggor (detalj + mermaid i arkiv: `builder-model-routing-and-trace.md`):

1. **Byggmodell (model lane)** — `fast` | `pro` | `max` | `codex` | `anthropic` — styr **själva generation/refine-streamen**. **Default är nu `pro`** (`gpt-5.3-codex`), medan `max`/\"Tanker\" pekar på `gpt-5.4`.
2. **Produkt-/promptlane** — modell för *Förbättra*, *Djup brief*, m.m. (`/api/ai/chat`, `/api/ai/brief`).
3. **Polish** — billig omskrivning av promptfältet (`Skriv om`, `SAJTMASKIN_POLISH_MODEL`).
4. **Resonemang (`Thinking`)** — metadata/reasoning i generationen, **inte** en tredje modellbana i samma bemärkelse. Server-side default styrs av `SAJTMASKIN_DEFAULT_THINKING` i `.env.local` (`true` = on). Klienten skickar flaggan explicit bara om användaren ändrat togglen i UI; annars gäller serverns env-default. `SAJTMASKIN_SHOW_THINKING` stöds bara som legacy-alias under migrering av äldre miljöer.

**Anthropic-jämförelse** — preset som linjerar build + produktlane mot Anthropic.

Primär kod: `BuilderHeader.tsx`, `useBuilderState.ts`, `usePromptAssist.ts`, `src/lib/models/catalog.ts`, `selection.ts`, samt **`src/lib/api/engine/chats/`** (kanonisk stream-handlers) med tunna **`/api/v0/chats/...`-compat**-routes.

## OpenClaw / Sajtagenten ligger bredvid

`OpenClaw` / `Sajtagenten` är **inte** en lane i builderns generationskedja. Den ytan lever separat via `src/components/openclaw/`, `/api/openclaw/*` och den isolerade `D-ID`-pilotytan `/avatar` + `/api/did/chat`.

- Använd **builderns `LLM`-flöde / `LLM`-pipeline** när du menar prompt assist, brief, spec-first, own-engine generation, verifiering, polish och repair.
- Använd **OpenClaw / Sajtagenten** när du menar den hjälpassistent som kan läsa builderkontext, ge tips, föreslå textfältsinnehåll och göra djupare review på begäran.
- Om Sajtagenten får mer kod- eller builderinsyn för review betyder det **inte** att own-engine-routen har bytt motor.

## Builder-entry före modellen

Innan modellen ser någonting normaliserar buildern nu URL-ingången i
`src/app/builder/builder-entry.ts` till en intern `entryKind` / `entryState`.

- **`appProjectId`** är builderns kanoniska projekt-id.
- **`externalProjectId`** är builder-lagrets namn för extern/legacy-identitet och ska inte blandas ihop med `appProjectId`.
- **`source=audit`** är kompat-/transportlager; resten av buildern ska hellre utgå från normaliserad `entryKind: "audit"` än från rå querytolkning.

Kanoniskt mänskligt kontrakt: `docs/schemas/builder-entry-contract.md`.

## Promptlager och träd

- **Statisk kärna** + dynamisk kontext (scaffold, route plan, kontrakt, brief, tema och övrig request-specifik kontext) byggs i `system-prompt.ts` m.m.
- **Statisk kärna är stabil produktpolicy, inte request-payload.** `config/prompt-static/*.md` ska beskriva varaktiga regler för output/runtime. Request-specifika signaler som component palette, design references, scaffold payloads, media aliases, follow-up-kontext och kontrakt ska i stället komma via den dynamiska kontexten eller via user-turn wrappers.
- **Visible `<Thinking>` är inte del av normalkontraktet längre.** Reasoning kan fortfarande exponeras separat när `thinking` är aktiverat, men själva projektsvaret ska hållas i CodeProject-format utan synlig wrapper före filblocken.
- **shadcn-reglerna är nu tvålagriga:** modellen ska i första hand använda projektets lokala `@/components/ui/*`, men request-specifik shadcn-/registry-/palette-kontext får utöka komponentvokabulären när hosten redan skickat sådan payload.
- **Fan-in före modellen:** `prepareGenerationContext()` / `resolveOrchestrationBase()` bygger nu ett litet **`BuildSpec`** (`src/lib/gen/build-spec.ts`) som bär styrsignaler som `generationMode`, `changeScope`, `contextPolicy`, `previewPolicy` och `verificationPolicy`. Det används för att hålla scaffold-/referensbudget, follow-up-policy och previewpolicy deterministiska.
- **`GenerationInputPackage` är kanonisk fan-in-artefakt för generationen.** Den bär bl.a. `engineSystemPrompt`, `dynamicContext`, `dynamicContextPruning`, `dynamicContextBlocks` och `lineageHash`, och skrivs till prompt-dumps för observability.
- **Deep brief default-on (2026-04-08):** `DEFAULT_PROMPT_ASSIST.deep` är nu `true`. Alla nya chattar kör Deep brief som standard. Briefens output driver side-/sektionsstruktur, visuell riktning och SEO i den dynamiska kontexten. **Scaffoldvalet konsulterar nu briefen** via `ScaffoldQueryContext` (`briefPages`, `styleKeywords`, `domainHints`) som matas in i `matchScaffoldAuto()` — keyword-scores boostar med +2 per matchande domän, och embedding-prompten berikas med brief-fragment. Keyword-lagret kan fortfarande dominera vid mycket starka träffar. *Vertikal* (t.ex. restaurang) vs *sidtyp* (landning, flersidor) är medvetet inte en första klass-modell i scaffold-registret ännu — brief + dynamisk kontext bär mer av den friheten än scaffold-etiketten.
- **Deep Brief är kanonisk semantisk expansion för init (2026-04-13).** Brief-objektet skickas via `meta.brief` och konsumeras av serverns `buildDynamicContext()`. Brief-deriverad prose sammanfogas **inte** längre med `customInstructions` — `customInstructions` bär enbart användarens egna instruktioner plus eventuellt palette-/spec-suffix. `formatPrompt()` (MÅL/CONSTRAINTS-wrappning) körs **bara som fallback** när brief saknas; init skickar rå user-text. Init-pathen skippar addendum-beräkning (`skipAddendum: true`). Brief-schemat inkluderar nu `mustHave`/`avoid` och `uiNotes` emitteras som `## UX & UI Notes` i dynamic context. Server Auto-Brief (`shouldRunServerAutoBrief`) körs nu även för korta underspecificerade website-prompts som fallback; skip kvarstår för audit, technical, follow-up och redan tydligt strukturerade prompts. Follow-ups skickar inte `meta.brief` — de förlitar sig på persisted scaffold, orchestration snapshot och tidigare filer.
- **Signal- och rollöversikter:** Den kanoniska tabellen över LLM-roller finns i `docs/schemas/llm-role-matrix.md`. Den kanoniska tabellen över signallager finns i `docs/schemas/orchestration-signal-contract.md`. Flödesöversikten för hur dessa lager samspelar finns i `docs/architecture/llm-signal-flow.md`.
- **Narrow follow-up policy:** `BuildSpec` använder nu `normal` som standard även för vanliga follow-ups. `light` används mest när prompten tydligt signalerar en liten lokal copy-/layoutändring; då hålls den dynamiska kontexten märkbart smalare och bred KB/template-retrieval hoppas över.
- **Capability-heavy follow-ups:** follow-ups som tydligt signalerar t.ex. karusell, 3D eller större visuella effekter ska inte lika lätt behandlas som de allra minsta lokala tweaksen. Capability inference används därför också som en skyddssignal mot att sådana ändringar degraderas till för lätt context-/verification-policy.
- **Follow-up wrappers ligger på user-turnen, inte i systemprompten.** `chat-message-stream-post.ts` använder `prompt-wrapper-contract.ts` för att prefixa follow-ups med sektioner som `## Continuity (from previous generation)`, `## Existing Project Files (reference)` och `## Follow-up Editing Mode`. `messageAdapter.ts` tar sedan bort kända wrappers i UI-visningen så användaren ser sin faktiska prompt, inte hela transportomslaget.
- **Scaffold research i prompten:** `buildDynamicContext()` injicerar nu `qualityChecklist`, `upgradeTargets` och ett budgeterat urval av `referenceTemplates` som **Reference inspirations**. Urvalet begränsas primärt av `BuildSpec.tokenBudgets.refsTokens` (med `refsChars` som kompat-fallback).
- **Template-library och prompten:** den kuraterade `template-library`-datan lever kvar som externa referenser / researchartefakter och används för scaffold research, validering och lokala kontrollflöden. **Nuvarande own-engine-hot-path injicerar inte `template-library`-sökning direkt i prompten på samma sätt som scaffold-kontexten gör.** Däremot kan kondenserad extern research nå prompten indirekt via scaffold research (`referenceTemplates` i `scaffold-research.generated.json`). Den direkta promptkontexten bär i övrigt scaffold-kontext, route plan, kontrakt, brief, tema och request-specifik information.
- **Prompt tree** (alla lager och parametrar): se arkiv `prompt-tree.md` och kod: `config/prompt-static/`, `codegen-static-prompt.json`.

## Nuvarande kodflöde

1. **Prompt in** via Builder (kanonisk väg) eller direkt mot own-engine API-routes.
2. **Före-build prompt-verktyg (valfritt):** "Skriv om" (polish) eller "Förbättra" (rewrite) via `/api/ai/chat` + guardrails i `usePromptAssist.ts`. Redigerar text i realtid utan att skicka iväg.
3. **Första prompten (create-chat SSE):** `orchestratePromptMessage()` körs alltid (budget/skydd). Om klienten **inte** skickat `meta.brief` kan servern fylla **`brief`** via Deep Brief (`src/lib/builder/site-brief-generation.ts`, styrt av `server-auto-brief-policy.ts`). **Briefen genereras alltid från originalprompt** — inte den orkestrerade/summarerade versionen. Auto-brief körs nu även för korta underspecificerade website-prompts; skip kvarstår för follow-ups, audit, tekniska prompts och **redan strukturerade website-prompts** där användaren redan specificerat flera sektioner/styrsignaler. Brief-deriverad prose dubbleras **inte** i `customInstructions`; brief-objektet via `meta.brief` är den kanoniska semantiska signalen.
4. **Spec-first chain (valfritt, `specMode=true`):** Om briefen finns konverteras den till en `WebsiteSpec` via `briefToSpec()` i `promptAssistContext.ts`, annars via `promptToSpec()`. Specfilen bifogas som strukturerad kontext till systemprompten.
5. **`resolveOrchestrationBase()`** i `src/lib/gen/orchestrate.ts` orkestrerar generationen: väljer scaffold (`manual` / persisted / `auto`), bygger route plan, pre-generation contracts och `BuildSpec`.
   **`RoutePlan.provenance`:** `primarySource` är `brief` när briefens sidor styr strukturen, annars `scaffold` när scaffold-defaults faktiskt lagt till nya routes utöver promptmönster, annars `prompt`. `sources[]` listar alla bidrag i ordning (t.ex. `["prompt","scaffold"]` när båda bidragit). Persisted JSON kan fortfarande ha äldre fältet `source`; runtime tolkar det via `parseRoutePlanFromUnknown` / `getRoutePlanPrimarySource`.
   **Follow-up / redesign:** tydliga redesign-signaler kan låsa upp persisted scaffold (ny scaffold-match) i auto-läge utan explicit scaffold-pin — se `shouldIgnorePersistedScaffoldForMatch` i `follow-up-clarification.ts` och anrop i `chat-message-stream-post.ts`.
6. **Scaffoldval i `auto`:** `matchScaffoldAuto()` kör keyword-scoring och embedding-sökning i parallell väggklocka-tid och **slår ihop** resultaten: semantik får utmana även icke-generiska keyword-val när likhetsgraden är hög nog (justerbart via `SAJTMASKIN_SCAFFOLD_EMBED_VS_KEYWORD_BIAS`). Sätt `SAJTMASKIN_SCAFFOLD_KEYWORD_MATCH=off` för att bara använda intent-baseline (t.ex. `landing-page`) och låta embeddings/brief styra mer — experimentellt.
7. **`buildDynamicContext()`** i `system-prompt.ts` bygger faktisk LLM-input: capability hints, scaffold-kontext, scaffold research-prioriteringar (inkl. budgeterade reference inspirations), route plan, pre-generation contracts, brief-/temasignaler och övrig request-specifik kontext. Den **återanvänder inte** användarens prompt som en extra «Original request»-sektion i system — samma text skickas som **user**-meddelande. Dynamisk kontext budgeteras blockvis med tokenestimat (`BuildSpec.tokenBudgets.systemContextTokens`, minimum 900 tokens i praktiken) och prunar lägre prioritet först; resultatet exponeras som `DynamicContextPruning` på paketet och i prompt-dump `meta.json`. `systemContextChars` / övriga `*Chars`-fält är kompat-/ungefärliga motsvarigheter. Se **`docs/architecture/llm-input-blocks.md`**.
8. **Streamen** producerar innehåll; efteråt kör `finalizeAndSaveVersion()` i `src/lib/gen/stream/finalize-version.ts` autofix, URL-expansion, ev. deep-path-steg, syntaxvalidering, verifier, parse/merge/preflight och sparar versionen. `reasoning_effort` sätts nu adaptivt: vanliga `website`-fall landar oftare på `medium`, medan `app` / integrationer / mer avancerade builds kan ligga kvar på `high`.
9. **Fail-fast mot partial-file-output:** om finalize/preflight ser att outputen innehåller snippet-lika filer (t.ex. överlappande importstarter eller annan ofullständig repair-output) kastas nu `PartialFileOutputError` och **ingen version sparas**. Buildern får då `done` utan `versionId` i stället för en preliminär korrupt version.
10. **Export/download-pipeline:** `buildExportableProject()` i `build-exportable-project.ts` laddar UI-komponentresolvern via `require("./project-scaffold-ui-reader")` för att hålla dynamiska `fs.readFileSync`-anrop utanför Turbopacks statiska bundleanalys. `collectRequiredUiComponents` re-exporteras härifrån; alla anropare (finalize-preflight, preview-session, eval) importerar den i stället för att göra egna `require`-anrop.
11. **Version och preview materialiseras** sedan via chat/version/files-routes och tier-2-preview (`preview_host` / VM). Tier-2-start kan komma efter `done` (med legacy `sandbox`-namn kvar i delar av kontraktet). Om server repair skapar en ny promotad version markeras den tidigare repair-källan nu som **superseded** i stället för att lämnas kvar i `repairing`.

Snabba lokala orienteringsfiler för nästa agent:

- `src/lib/gen/README.md`
- `src/lib/gen/scaffolds/README.md`
- `src/lib/gen/template-library/README.md`

## Prompt-dumps och dashboard-observability

Prompt-dumps är **debug-/observabilityartefakter**, inte source of truth för
runtime. Den kanoniska skrivningen ligger i `src/lib/gen/prompt-dump.ts`, och
båda Python-panelerna läser nu samma statussemantik via
`scripts/dashboard_shared.py`.

Det finns nu tre separata observability-spår som är lätta att blanda ihop:

- **Prompt-dumps på disk** under `data/prompt-dumps/` — full/dynamisk systemkontext och serialiserad `GenerationInputPackage`.
- **Prompt logs i databasen** via `createPromptLog()` / `prompt_logs` — bästa effort-logg av originalprompt, formatterad prompt, trunkerad systemprompt, model tier, build method, thinking, m.m.; visas via admin-API och `app/log/log-viewer`.
- **Dev/runtime-loggar** — request-/stream-/generation-event via dev-loggning och serverterminal.

Det finns **ingen** samlad kanonisk `logs/`-mapp ännu som binder ihop prompt-dumps, prompt logs, evals, verifieringsresultat, modeller, tokens och slutlig scaffold/utfall i en enda körjournal. Dagens läge är i stället uppdelat mellan `data/prompt-dumps/`, databastabeller/UI för prompt logs och vanliga dev-/runtime-loggar.

**Viktigt:** `config/dashboard/app.py`, `scripts/scripts_dashboard.py` och ovriga docs ska **spegla** runtime-sanningen,
inte leda den. Arbetsordningen är: kod → verifiering → docs/dashboard-sync.

Kategorier:

- `orchestration-dynamic` — `latest.md`, `generation-input-package.json`, `meta.json`
- `own-engine-codegen` — `full-system.md`, `dynamic-context.md`, `meta.json`
- `plan-mode-planner` — `planner-preamble.md`, `dynamic-context.md`, `full-system.md`, `meta.json`

Statusord som visas i panelerna:

- `fresh` — nyligen skriven dump
- `stale-risk` — dump finns men ser gammal ut; kontrollera tidsstämpeln
- `disabled` — dumpning är avstängd; gamla payloadfiler kan fortfarande ligga kvar

`config/dashboard/app.py` visar detta i preview-/versionsöversikten som del av
konfigurations- och observabilityytan. `scripts/scripts_dashboard.py` använder
samma statusdata i pipeline-/artifactpanelen.

## SSE / stream-scope (W3)

Builder **egen motor** använder SSE på engine-routes — det är **kanon** för chat/generation. Övriga SSE-ytor (admin, observability) är **inte** samma backlog som W3; K-009 är stängd — nya behov = ny planrad (tidigare `own-engine-sse-scope.md` i arkivet).

### Livscykel: `done` och tier-2 preview

Eventet **`done`** betyder att **versionen är finaliserad och sparad** (assistant + `files_json`), inte att alla sidoeffekter är klara. **Efter `done`** kan servern fortfarande skicka t.ex. **`preview-ready`** eller **`build-error`**, och klienten ska fortsätta lyssna tills tier-2-steget är avslutat eller fel rapporterats. Fält som `previewPending` på `done` signalerar att tier-2-preview kan komma strax, medan `previewUrlHint` bara är en tillfällig boot-hint. Byggaren skiljer nu tydligare på **genererar kod**, **verifierar version**, **startar VM-preview** och **byter till reparerad version** när en ny version tar över.

Se även: [`src/lib/gen/stream/builder-stream-contract.ts`](../../src/lib/gen/stream/builder-stream-contract.ts) och post-finalize i `generation-stream-post-finalize.ts`.

**Progress efter codegen:** `progress.step` för finalize-pipelinen följer `OwnEnginePostStreamPhaseId` i [`finalize-pipeline-contract.ts`](../../src/lib/gen/stream/finalize-pipeline-contract.ts) (t.ex. `validate_syntax`, `verifier`, `parse_merge_preflight`), inte äldre alias som `validation` / `finalizing`.

**Integration-SS:** eventet `integration` bär kanoniskt `{ items: BuilderIntegrationItemPayload[] }` (se `builder-stream-contract.ts`); klienten tolererar fortfarande en rå array via `coerceIntegrationSignals`.

## Generationsloop och felminne

- Efter stream: `finalizeAndSaveVersion`, autofix-pipeline (loopas `DETERMINISTIC_AUTOFIX_MAX_PASSES` gånger, manifest-styrt med 15 deterministiska fixers inkl. lucide-link/image-fixers), syntaxvalidering (`validateAndFix`, eskalerar till LLM-fixer vid behov men stoppar tidigt vid fixer-noop, utebliven förbättring **eller fixer-budget timeout**), därefter capad/bounded-parallel bildmaterialisering i deep path, och sedan ev. verifier-pass (read-only blocking/quality), kvalitetsgrind — se `generation-loop-and-error-memory.md` i arkivet och `llm-pipeline-flow.html` för visuellt flöde. Repair-/autofix-prompter kräver nu uttryckligen **kompletta filer**, inte snippets, och `project-sanity` stoppar kända partial-file-signaler innan persist.
- **Repair-modellval:** alla fixer-vägar (`validate-and-fix`, `server-verify`, `repair/route`) använder `resolvePhaseModel(tier, "fixer")` så att fixern matchar generatorns tier. Reparationspass-begränsningar styrs via `repairPolicies` i `manifest.json`. LLM-fixern inkluderar kontextrader från quality-gate-output och kan skapa nya filer (inte bara ändra befintliga), och tar nu `abortSignal` för budgetstyrda avbrott. Repair-loopen använder bestContent-rollback vid regression mellan pass och stoppar nu tidigare vid fixer-noop, utebliven förbättring eller tidsbudget. När repair lyckas och en ny version promotas markeras den tidigare raden som ersatt, och äldre valda versioner faller inte längre tyst tillbaka till den senaste previewn.
- **Finalize-path policy:** finalize kör nu ett tydligare **fast path / deep path**-kontrakt. För lätta follow-ups (`verificationPolicy: fast`) kan deep-path-delar som bildmaterialisering hoppas över, medan parse/merge/preflight/persist fortfarande sker innan `done`.
- **Agentlogg** / replay av fel: `runtime-lane-refactor-and-log-viewer.md` i arkivet.

## UX-kontrakt och projektinställningar

- **Preview/iframe-kontrakt** (toast, laddning, `previewUrl`, legacy `demoUrl`): `builder-ux-contracts-and-preview.md` i arkivet + `PreviewPanel.tsx`.
- **Projektfrågor / inställningar** som styr builder: `project-settings-and-builder-questions.md` i arkivet.

## Meritmind / särskilda flöden

Det finns inte längre någon separat kanonisk `meritmind-build-flows.md` i trädet. Vid äldre domänspecifika specialfall: läs relevant fil i `docs/plans/avklarat/` eller använd git-historik i stället för att leta efter en fristående flow-fil.

## Preview-shim vs sandbox — problemtyper (arbetslista)

*Gäller **allt** som genereras från prompt (egen motor): jämförelse mellan **tier‑1** `/api/preview-render` (snabb kompatibilitetsvy) och **Fidelity 2 / tier-2 runtime** (`next dev` i VM), som normalt går via `preview_host` när den är konfigurerad (Vercel Sandbox endast när explicit valt eller som sekundär väg).*

**Kontrakt (2026-04-08):** För own-engine returnerar chat- och versions-API `previewUrl: null` och sätter ev. shim i **`legacyShimPreviewUrl`**; `demoUrl` finns kvar bara i vissa legacy-/inboundlager. Byggaren väljer **VM-/preview-host-URL** vid versionsbyte och visar quality-tier «preview» först när riktig tier-2-preview finns, inte när bara shim finns.

| # | Problemtyp | Kort beskrivning |
|---|------------|------------------|
| P1 | **Runtime-paritet** | Shim bygger självständig HTML/React-ström; **samma beteende** som full Next + WebGL i VM-preview är **inte garanterad** (t.ex. spelloopar, `canvas`, audio). |
| P2 | **WebGL / Three / R3F** | Fiber + `Canvas` kräver **browser + WebGL-kontext**; server-side tier‑1 kan **förenkla, hoppa över eller feltolka** importer och livscykel jämfört med klientbundle i VM-preview. |
| P3 | **Bundling & sidoeffekter** | Workers, WASM, dynamiska `import()`, villkor beroende på `window` — risk för **skillnad** mellan shim, VM-preview-build och produktion. |
| P4 | **Routing & bas-URL** | Länkar och `next/link` som blir **absoluta mot fel host** i iframe (t.ex. pekar på appens domän i stället för preview-host). |
| P5 | **Flera routes** | Shim styrs ofta med `?route=`; **riktig** App Router har **egna** segment, layouts, `loading.tsx` — paritet saknas ofta. |
| P6 | **API routes / server actions** | Genererade `app/api/*`, server actions och **reella nätverksanrop** körs **inte** som i en riktig Next-server inuti tier‑1. |
| P7 | **Middleware / edge** | Middleware och edge-runtime **ingår inte** i preview-shimens modell. |
| P8 | **Miljövariabler & placeholders** | **`suggestIntegration` / `requestEnvVar`** kan sätta **blocking** utan att projekt-env i UI **räknas** som “svar”; **placeholders i `.env.example`** löser inte automatiskt `awaiting-input` i chatten. |
| P9 | **Hemligheter vs demo** | Stripe/DB utan nycklar: shim kan **visa statiskt innehåll** medan **preview-host verify-lane** (`tsc` / `next build`) **faller** — **dubbla sanningar**. |
| P10 | **Verifiering vs förhandsvisning** | **Lyckad** `preview-render` + **misslyckad** server-verify — svårt för medlemmar utan tydlig koppling i UI. |
| P11 | **CSP & eval** | Dev/prod och iframe **CSP** skiljer sig; vissa 3D-/spelbibliotek utlöser **strängare** policy i preview än lokalt. |
| P12 | **Prestanda & DPR** | Hög `dpr`, partiklar, post-processing — **smidigt i VM-preview**, **dyrt eller nedbantat** i shim eller på svaga enheter. |
| P13 | **Tillgång till devserver** | Externa webbläsare (t.ex. assistenter i **Cursor IDE**) når ofta **inte** utvecklarens `localhost`; **deployad URL** kan ge annan **auth/data** än lokal DB — förvirring vid felsökning. *Detta är inte en del av Sajtmaskin-produkten.* |
| P14 | **Tredjepartsskript** | Analytics, Stripe.js, kartor — **laddning/blockering** skiljer sig mellan shim-HTML och full app. |

**Produktmål:** medlemmar skapar sidor **via prompt**; **standardpreview** ska vara **VM / `preview_host` (Fidelity 2)** när miljön tillåter — shim finns som fallback under tid eller vid fel.

## Snabb felsökning

- Fel route eller modell: spåra `selectedModelTier` + stream route i nätverkspanelen.
- Trace overlay: `scripts/env/model_trace_overlay.py` — synkar GUI-relaterade modell-env i `.env.local`; nycklar finns i [`src/lib/env.ts`](../../src/lib/env.ts).
