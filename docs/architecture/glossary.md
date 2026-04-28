# Glossary — Sajtmaskin

Kanonisk ordlista. **Korta entries** — för djupare ändringshistorik, läs git log eller relevant fas-doc.

> **Kod är alltid source of truth.** Behöver du kodsymbol — grepa. Behöver du pipeline-detaljer — läs `fas{1,2,3}-*.md`. Behöver du målbilden — läs [`llm-flow-target-worldclass.md`](./llm-flow-target-worldclass.md).
>
> **Användare, LLM:er och docs kan ha fel.** Vid tvekan: verifiera mot koden innan du döper om eller drar slutsatser.

Snabbtabell vid förväxling: [`.cursor/rules/terminology.mdc`](../../.cursor/rules/terminology.mdc).
Signal-ägarmatris: [`llm-signal-flow.md`](./llm-signal-flow.md).

---

## Strategi

1. **En term per koncept.** Två namn för samma sak → ett kanoniskt + ett alias.
2. **Kod vinner över docs.** Etablerade kodsymboler slår docs-namn.
3. **Sammansatta samlingsnamn undviks.** `PostChecksAndQualityGate` → "Post-Checks" + "Quality Gate".
4. **Fasindelning styr ägarskap.** Termen ägs av fasen där den skapas.

**Status:** *kanonisk* (använd) · *alias* (accepterat alternativ) · *legacy* (fasa ut) · *död* (använd ej).

**Uppdateringspolicy:** Ny term → lägg rad. Term byter mening → markera gammal som legacy + ny rad. Försvinner ur kod → markera legacy/död.

---

## Promptsteg och anropsklasser

| Typ | Vad | Fas |
|-----|-----|-----|
| **Init / Create-chat** | Första generering — hela orkestreringskedjan | 1→2→3 |
| **Follow-up** | Ändringsförfrågan i existerande chat — återanvänder scaffold/variant/quality | 1→2→3 |
| **Deep Brief** | LLM-anrop som producerar strukturerad sajtbrief; expanderas server-side i `buildDynamicContext()` | 1 |
| **Server Auto-Brief** | Fallback om klient inte skickade brief | 1 |
| **Snapshot-Brief** | Minimal brief rehydrerad från `orchestration_snapshot.briefSummary` på follow-up | 1 |
| **Plan Mode** | Planner-LLM som returnerar plan (JSON), inte sajtkod | 1→2 |
| **Repair** | LLM-fix efter genereringsfel; mekanisk autofix kommer först | 3 |
| **Verifier Pass** | Read-only LLM-granskning som producerar findings (advisory + LLM-fix-feed) | 2/3 |
| **Clarification** | Agent ställer motfråga via `askClarifyingQuestion`-tool istället för att generera | 1 |

---

## Fas 1 — Före orkestrering

| Term | Kort | Status |
|------|------|--------|
| Raw Prompt | Obearbetad användarprompt | kanonisk |
| Prompt Formatting | `formatPrompt()` minimal MÅL/TILLGÄNGLIGHET-wrapper. Fallback utan brief. | kanonisk |
| Prompt Orchestration | Strategi-/budget-/trunkerings-gate; väljer PromptStrategy | kanonisk |
| Prompt Strategy | `direct` · `phase_plan_build_refine` · `preserved` | kanonisk |
| Prompt Type | `wizard` · `freeform` · `technical` · `app` · `template` etc. | kanonisk |
| Brief (`meta.brief`) | Strukturerat JSON-objekt (~24 fält). Bär designintention. Schema: `siteBriefSchema`. `briefQuality`: `full` / `server-auto` / `none` | kanonisk |
| Deep Brief | UI-term för brief-generering på init. `canUseDeepBrief = !chatId` | kanonisk |
| Server Auto-Brief | `tryGenerateServerAutoBrief` när klient inte skickade brief | kanonisk |
| Snapshot-Brief | `buildFollowUpBriefFromSnapshot` — hydreras från `briefSummary` på follow-up så capabilities/domän/style/tone lever vidare utan ny LLM-runda | kanonisk |
| Brief Guidance Override | Brief-LLM-fält (`domainProfile`, `motionLevel`, `qualityBar`, `seasonalHints`) som overridar deterministisk inferens | kanonisk |
| Variant Pre-Match | Snabb keyword-only scaffold+variant-match (~1ms) före brief-generering. Producerar `VariantHints` som injiceras i brief-prompten. | kanonisk |
| Variant Hints | Kompakt sammanfattning av variant-defaults som ges till Brief-LLM | kanonisk |
| Delta-Brief | Vid `clear-redesign`: `tryGenerateServerAutoBrief` med redesign-prompt + `priorDesignContext` + variant-hints | kanonisk |
| Build Intent | `template` / `website` / `app` — vad användaren vill bygga | kanonisk |
| Build Method | `wizard` / `category` / `audit` / `freeform` / `kostnadsfri` — entry-källa | kanonisk |
| Generation Mode | `init` / `followUp` | kanonisk |
| Follow-up Intent | `clear-refine` / `clear-redesign` / `ambiguous-redesign` / `ambiguous-followup` / `neutral` / **`capability-add`** / **`capability-modify`** från `classifyFollowUpIntent` (regex + LLM-fallback ≥80 ord). Plan 12 lade till `capability-modify` för "ändra/förenkla befintlig komponent". Källa: `src/lib/gen/follow-up-intent-types.ts`. | kanonisk |
| Event Bus | `src/lib/logging/event-bus*.ts` — engine-events (`emit`-API) som projekteras till `versionStatus` via `selectVersionStatus(events)`. UI ska gradvis flippa från DB-flaggor till denna projektion (Plan 06 / OMTAG fas 3). | kanonisk |
| Scaffold-Required-Files Gate | Plan 11: `finalize-preflight.ts` blockerar promotion om scaffold-deklarerade kärnfiler (t.ex. `app/page.tsx`) saknas eller har trivialt innehåll. | kanonisk |
| Count-Parity Gate | Plan 11: `finalize-preflight.ts` kontrollerar att `completeProjectFiles.length === nextFilesJson.length` (parsed code-project = materialiserad fil-bag). | kanonisk |
| Variant-Lock | Plan 11/12: scaffold-variant väljs deterministiskt vid init och låses för follow-ups inom samma chat så stilen inte driver mellan rundor. | kanonisk |
| Plan Mode | Planner-LLM med plan-artefakt; `PlanPhase`: plan/build/refine/verify/done | kanonisk |
| Build Profile | `fast` · `pro` · `max` · `codex` · `anthropic` — UI-tier för codegen | kanonisk |
| Generation Phase | `planner` · `generator` · `fixer` · `verifier` · `deploy-assistant` — per-fas modellrouting | kanonisk |
| Per-Tier Policy Fields | `perTierTimeouts` / `perTierRepairPolicies` / `perTierBriefing` i `manifest.json` | kanonisk |
| Thinking | Reasoning-flagga, inte separat lane | kanonisk |
| Core Rules | Oföränderliga produktregler i `config/prompt-core/*.md` (laddas via `codegen-core-manifest.json`) | kanonisk |
| Static Core | Alias för Core Rules | alias |
| Per-Request Signal Cascade | EXPLICIT (brief-fält) > INDICATED (brief-LLM) > INFERRED (heuristik) > DEFAULT (variant) > FALLBACK (statiska) | kanonisk |

---

## Fas 2 — Orkestrering och byggnation

Scaffold-val → route plan → contracts → BuildSpec → dynamic context → system prompt → generation.

| Term | Kort | Status |
|------|------|--------|
| Orchestration Input | Alla inputs till orkestreraren | kanonisk |
| Orchestration Base | Resolved scaffold + route plan + contracts + BuildSpec | kanonisk |
| Finalized Orchestration | Dynamic context + engineSystemPrompt färdiga | kanonisk |
| Scaffold | Runtime-startpunkt (9 st). Metadata i `manifest.ts`, filer under `files/` | kanonisk |
| Scaffold Selection | Keyword + capability-boost → embedding challenge | kanonisk |
| Capability (dossier) | Sträng i `brief.requestedCapabilities`. 1:1 mot dossier (default-tie-break via `defaultForCapability`) | kanonisk |
| Capability Map | Snabbklass: auth/ecommerce/forms/3D/motion/charts/physics | kanonisk |
| Scaffold Mode | `off` / `auto` / `manual` | kanonisk |
| Scaffold Serialize Mode | `structural` (follow-up/heavy) / `inspirational` (init) | kanonisk |
| Scaffold Variant | Visuellt uttryck inom scaffold: typsnitt, motif, theme tokens, prompt hints. Lås:as via `persistedVariantId` på follow-up | kanonisk |
| Variant Structural Files | Init-only kodreferenser från variantens sourceTemplateIds + capability-driven | kanonisk |
| Variant Signature Patterns | Per variant: `{ layouts[], motifs[], antiPatterns[] }`. Konkret visuell guidance | kanonisk |
| Variant Embedding Pick | `pickScaffoldVariantAsync()`. På create-chat låses keyword-pre-match-resultatet via `persistedVariantId`; embedding-pick körs bara vid stale id / plan-mode / eval | kanonisk |
| Locale Alternate Routes | `deduplicateLocaleAlternateRoutes` håller bara en av `/contact↔/kontakt`, `/about↔/om`, `/services↔/tjanster`, `/blog↔/blogg` | kanonisk |
| Href Route Cross-Check | Preflight-check som flaggar interna hrefs som inte matchar någon route. Severity: warning (gate-flip till error planerad) | kanonisk |
| Canonical Route Paths | Strikt sektion i system-prompten med exakta tillåtna paths | kanonisk |
| Route Plan | IA/ruttlista. Provenance: brief > scaffold > prompt | kanonisk |
| Route Realization | Policylager: vilka routes realiseras i denna generation | kanonisk |
| Contract Plan | Auth, payment, database, env vars, integrations | kanonisk |
| Build Policy / BuildSpec | Runtime-körpolicy från `deriveBuildSpec()`. Fält: `changeScope`, `qualityTarget`, `contextPolicy`, `verificationPolicy`, `previewPolicy`, `tokenBudgets`, `routeRealization`, `stylePack`, `forbiddenPatterns` | kanonisk |
| Finalize Path | `full` (hela kedjan) eller `light` (skip image/verifier) | kanonisk |
| Orchestration Contract | Binder scaffold→routes→valideringsförväntningar | kanonisk |
| Design Priority | Hierarki: user-locked theme → brief → variant defaults → scaffold CSS baseline | kanonisk |
| Dynamic Context | Request-specifik promptdel byggd i `buildDynamicContext()`. Prunad mot tokenbudget | kanonisk |
| System Prompt | Core Rules + separator + Dynamic Context | kanonisk |
| Generation Package | Kanonisk fan-in: systemPrompt + dynamicContext + pruning + lineageHash | kanonisk |
| Your Toolkit | Scaffold-medveten shadcn-sammanfattning i prompten | kanonisk |
| Google Font Registry | Central fontdatapost (~75 fonts) i `google-font-registry.ts` | kanonisk |
| Component References | Lokala exempel + officiellt register + community-registries | kanonisk |
| Agent Tools | Tool-definitioner för planner/agent-flöden (`suggestIntegration`, `requestEnvVar`, `askClarifyingQuestion`, `emitPlanArtifact`) | kanonisk |
| Template-Library | Kuraterad referensartefakt byggd från externa Vercel-templates | kanonisk |
| Dossier | Återanvändbar legokloss (capability-baserad) som injiceras i codegen-prompten. Klass: `hard` (env-secrets) / `soft`. Fidelity: `verbatim` / `rewritable` | kanonisk |
| Dossier System (v2) | `data/dossiers/{hard,soft}/<id>/`. `selectDossiersForRequest` matchar `brief.requestedCapabilities` 1:1. Inga embeddings, ingen domain-veto. | kanonisk |
| Element Preservation Guard | Skydd mot att follow-up tappar high-value-element (`<video>`, `<canvas>`, `<iframe>`, R3F `<Canvas>`, Rapier `<Physics>`, sektionslandmärken). Avvisas mekaniskt + bubblas via SSE `done.rejectedStructural` | kanonisk |
| Recurring Failures Block | `### Recurring failures on this site` i system-prompten. Topp-5 från `readRecurringPatternsForChat`. Bara på follow-ups | kanonisk |
| Error-Log RAG | Vector RAG över historiska fault/fix-events. Producer/indexer/retriever. Injicerar `### Lessons from similar past builds` | kanonisk |

---

## Fas 3 — Repair, verifiering, quality gate

### Mekanisk autofix vs LLM-fix

`FixCategory = "mechanical" | "llm"`. Alla fixar loggas som `FixEntry` med kategori.

- **Mekanisk autofix** — pipeline av många små, specialiserade fixers (`autofix/pipeline.ts`). Deterministisk. Bilig.
- **LLM-fix** — `runLlmFixer`-anrop när mekaniken inte räcker. Dyrt + icke-deterministiskt. Eskaleras medvetet.

**Skriv aldrig bara "autofix"** utan kvalificering. Säg **mekanisk autofix** eller **LLM-fix**. Äldre synonymer ("deterministisk autofix", "fixer", "repair") ska inte introduceras i ny kod.

### Termer

| Term | Kort | Status |
|------|------|--------|
| Autofix (mekanisk) | Pipeline av fixers — se ovan | kanonisk |
| Validate and Fix | Syntax → progressiv mekanisk→LLM→mekanisk fix-loop | kanonisk |
| LLM Fixer | LLM-fix med fixer-prompt | kanonisk |
| Finalize | Samlad pipeline: URL-expansion → autofix → validate → image materialize → ev. verifier → save | kanonisk |
| Image Materialize | Materialiserar bildalias/placeholders | kanonisk |
| Verifier Pass | Read-only LLM-granskning. Blocking-fynd matas in i `runLlmFixer` direkt efter (samma `phaseRouting.fixer`-modell) | kanonisk |
| Verifier Re-Run After Fix | Efter `runLlmFixer` lyckas på blocking findings: re-kör verifier 1× för att bekräfta | kanonisk |
| Run-Dir Resolver | `resolveRunDirFromContext()` slår upp aktiv run-katalog via runId/chatId. Eliminerar `could not resolve run dir`-warnings | kanonisk |
| Reasoning Tokens | Separat token-mätvärde för LLM-reasoning vs visible output | kanonisk |
| Version-Mismatch Overlay | UX-mekanism mellan ny version sparad och preview-VM reload. Konsumeras av `VersionMismatchOverlay`-komponenten. **Dispatch-vägen ej wirad ännu** | kanonisk |
| Preflight | Teknisk kontroll inför preview: routing, filkonsistens, blocking | kanonisk |
| Quality Gate | Binärt pass/fail. Två lanes: `designPreview` (F2) och `integrationsBuild` (F3) | kanonisk |
| Quality Gate Tiers | Manifeststyrda check-profiler i `manifest.json` `qualityGateTiers` | kanonisk |
| `designPreview` (lane) | F2. `["typecheck"]` (warm pre-VM) | kanonisk |
| `integrationsBuild` (lane) | F3. `["typecheck", "build", "lint"]` | kanonisk |
| Server Verify | Asynk verify + repair-loop efter finalize | kanonisk |
| Repair Loop Core (`runRepairLoop`) | Delad repair-kärna för server-verify och manuell `/repair` | kanonisk |
| Warm Repair | Targeted repair där bara trasiga filer (+ imports) skickas till LLM-fixer | kanonisk |
| Repair Available | Versionstatus när serverrepair passerat quality gate men väntar på explicit accept | kanonisk |
| Accept Repair | API-steg som applicerar `repaired_files_json` till `files_json` | kanonisk |
| Repair Accept Timeout | Manifeststyrd `repairAcceptTimeoutMinutes` för auto-accept | kanonisk |
| Repair Error Manifest | Strukturerat felunderlag per fil (diagnostics + import-impact) | kanonisk |
| Fixer Registry | Single source of truth för alla ~40 fixers i `fixer-registry.ts`. Backoffice-sida `Fixer Registry` läser snapshot | kanonisk |
| Repair-Pass-Index Pruning | Best-effort delete av äldre `engine_version_error_logs` när repair på samma `versionId` saknar preflight-/syntaxblockers. Verifier-only-fynd i senaste passet behålls, men stoppar inte städning av äldre pass. Adresserar SAJ-25 | kanonisk |
| Install Cache Share | Verify-lane signal: `node_modules` delning via dependency fingerprint | kanonisk |
| Install Peer Fallback | Verify-lane signal: peer-konflikt + `--legacy-peer-deps` | kanonisk |
| Post-Checks | Client-side post-genererings-orkestrering | kanonisk |
| Engine Version Lifecycle | `draft` → `verifying` → `repairing` → `repair_available` / `failed` / `promoted` | kanonisk |
| Scaffold Retry | Sen diagnos + scaffoldpivot-förslag vid misslyckad generation | kanonisk |
| `verbatim_content_drift` | Reason-kod i `dossier_verbatim_restored`-event: LLM modifierade en verbatim-fil och systemet tvingades återställa det kanoniska innehållet. Emitteras av `verbatim-policy.ts`. | kanonisk |
| `warmTscSkipped` | Boolean i `site.done`-devLog: `true` när warm-tsc hoppades över i `validate_syntax` eftersom quality gate planerades köra tsc ändå. Latency-vinst-mätning (wave 7). | kanonisk |
| `recurringPatternsInCreatePrompt` | FEATURE-flagga (implementerad, default `false`): Injicera recurring failure patterns även på init/create-generering (idag bara på follow-ups). Kräver även `FEATURES.recurringPatternsInMainPrompt === true` för att blocket faktiskt ska injiceras (gate i `route-plan.ts`). Bakom eval-gate tills signal/noise-kvoten verifierats. | alias |

---

## Preview, VM, sandbox

| Term | Kort | Status |
|------|------|--------|
| preview | Det användaren ser i buildern | kanonisk |
| VM / `preview_host` | Primär tier-2 live-preview via Fly.io | kanonisk |
| `preview-session` | Bootstrap-route för tier-2-preview | kanonisk |
| `previewPending` | Finalize klar, preview väntas | kanonisk |
| `previewUrlHint` | Temporär VM-hint, inte slutlig previewUrl | kanonisk |
| Fidelity 2 (F2) | `previewPolicy: fidelity2` (design-loopen, npm install + next dev). Default | kanonisk |
| Fidelity 3 (F3) | `previewPolicy: fidelity3` (integrationer, install + build + dev). Triggas explicit via `POST /finalize-design`. Auto-startar codegen via `useSendMessage` med `meta.lifecycleStage: "integrations"` + `meta.parentVersionId` | kanonisk |
| LifecycleStage | `"design"` (F2) eller `"integrations"` (F3). Persisteras i `engine_versions.lifecycle_stage`. F3-versioner pekar på sin F2-fork via `parent_version_id` | kanonisk |
| Tier-3 Integration | Integration vars env-keys måste ha riktiga värden vid runtime (Stripe-secret, DB-URL, Redis, OpenAI). F3-gate blockar bara på keys där dossier-`enforcement: "build"` | kanonisk |
| Tier3BuildSpec | Strukturerat F3-byggkontrakt med per-integration `requiredRealEnvKeys`, `placeholderOkEnvKeys`, `featureRuntimeEnvKeys`, `warnOnlyEnvKeys`, `buildInstructions[]`, `setupGuide` | kanonisk |
| `placeholderHarmless` | Boolean per env-key. Harmlösa keys (Stripe-publishable, AUTH_SECRET, GA-id) får placeholdras även i F3 | kanonisk |
| `allowPlaceholdersInF3` | Toggle på `project_data.meta`. När true: placeholder-täckta build-keys passerar F3-gaten med varning | kanonisk |
| Validate-step | Konsoliderat finalize-steg `validate_syntax`: esbuild-syntax + warm tsc + LLM-fixer-loop. F3 sätter `forceTsc: true`. Wave 7: warm tsc kan hoppas över via `skipWarmTsc` när `quality_gate_planned` redan signalerar kommande tsc i quality gate. | kanonisk |
| F2 SDK Guard | Mekanisk fixer som strippar tier-3 SDK-imports från F2-output (Stripe/Supabase/Clerk/Auth.js/Redis/OpenAI/...). Deny-lista: `config/integrations/tier3-sdk-deny.json` | kanonisk |
| F2 Contract (system-prompt) | Hård sektion i system-prompten (`## Generation Stage: F2 / Design (HARD CONTRACT)`) som förbjuder tier-3 SDKs i F2 | kanonisk |
| Project env file (`env.example`) | Auto-genererad användarsynlig hjälpfil i `versions.files_json`. Listar harmless + tier-3 stub placeholders. Next.js läser INTE filen | kanonisk |
| Tier-2 downgrade-guard | Skyddar etablerad tier-2 URL från att skrivas över av shim-URL | kanonisk |
| Preview-URL invalidation | `updateVersionFiles()` nollställer `preview_url` vid `files_json`-mutation | kanonisk |
| Observability metrics | `/api/metrics` (Prometheus). Bearer-auth via `SAJTMASKIN_METRICS_TOKEN`. Backoffice: `pages/observability.py` | kanonisk |
| Brief cache (Redis) | `/api/ai/brief`-output cacheas 24h. Header: `X-Brief-Cache: hit\|miss\|skip` | kanonisk |
| `SAJTMASKIN_SHIM_PREVIEW_DISABLED` | Default ON. Stänger av legacy compatibility shim. `0`/`false`/`off`/`no` reaktiverar | kanonisk |
| `VersionMismatchOverlay` | UX-komponent mellan ny version sparad och preview-VM reload. **Dispatch-vägen ej wirad** | kanonisk |
| `SAJTMASKIN_AUTO_REPAIR_BUILD_ERROR` | Default ON i dev/Vercel preview, OFF i prod. Loopar `build-error` SSE in i `runRepairLoop` | kanonisk |
| EnvVar enforcement (P31) | Per envVar i hard-dossier: `build` (default) / `feature-runtime` / `warn-only`. Styr F3-gate | kanonisk |
| `f2TimeMs` | Planerad telemetri-distinktion: tid i ms för F2-fasen (design-loop, validate + preflight). Fält i `site.done`-devLog. **Idag null** — TODO-markerat i `generation-stream-post-finalize.ts`. | kanonisk |
| `f3TimeMs` | Planerad telemetri-distinktion: tid i ms för F3-fasen (integrationer, build + verify). Fält i `site.done`-devLog. **Idag null** — aktiveras när F2/F3-telemetri-uppdelning implementeras. | kanonisk |
| `site.aborted` | Telemetri-event när stream rivs **innan** version skapats — provider-abort, klient-disconnect, transport-fel, eller stale `in_progress` > 30 min. Olikt `site.done` (lyckad finalize) och `site.failed` (verifier-rejected real content). Strict schema: [`site-aborted.schema.json`](../schemas/strict/site-aborted.schema.json). Resolver: `generation-log-writer.resolveStatusDetails` mappar till `meta.status = "aborted"`. | kanonisk |
| Versionless chat | Chat utan `versionId`-rad i DB — strömmen abortades innan finalize hann persista version. **Kan inte repairas**, bara restartas. Server-409 (`error: "versionless_chat_aborted"`) blockar `followup_general` mot dessa. UI visar "Starta om generation" istället för "Försök reparera preview". `useVersions` slutar polla när `chatStatus.status === "aborted" && !chatStatus.hasVersion`. | kanonisk |

---

## Dokumenterade namnskuggor

Samma ord, flera kontexter. Skriv full term när det finns risk för missförstånd.

| Tvetydigt ord | Kontext A | Kontext B | Skriv |
|---------------|-----------|-----------|-------|
| `brief` | Deep Brief-objektet | "kort sammanfattning" | "Deep Brief" / "snapshot-brief" |
| `scaffold` | ScaffoldManifest (data) | Scaffold Selection (process) | "scaffold" vs "scaffold selection" |
| `context` | Dynamic Context (prompt-block) | generellt "kontext" | Stor bokstav: "Dynamic Context" |
| `contracts` | Contract Plan (integrations) | Orchestration Contract (bindemedel) | Skriv full term |
| `reference` | ScaffoldReferenceTemplate / DesignReferenceAsset / referenceCategories | flera | Skriv full term |
| `quality gate` | Finalize quality gate (pass/fail) | Preview quality gate (verify lane) | "finalize" / "preview" quality gate |
| `preflight` | `runFinalizePreflight()` | generellt "förkontroll" | Stor bokstav: "Preflight" |
| `autofix` | Mekanisk pipeline | LLM-reparation | **mekanisk autofix** / **LLM-fix** |

---

## Produkttermer

| Term | Vad | Förväxla inte med |
|------|-----|-------------------|
| `v0-mallar` / Mallar-tab | Builderns mallkatalog | template-library, scaffolds |
| Vercel-mallar | Extern research från Vercel Templates | v0-mallar, scaffolds |
| `template-library` | Kuraterad referensartefakt | v0-mallar, scaffolds |
| scaffolds | Interna runtime-startpunkter | template-library, Vercel-mallar |
| `Group` (lucide vs three) | Lucide ikon vs Three.js noden — samma PascalCase. Autofix får inte lägga till lucide-`Group` när filen har `import type { Group } from "three"` | — |
| own-engine | Enda aktiva codegen-vägen | OpenClaw, gammal v0-runtime |
| `backoffice` | Lokal Streamlit-app — start: `npm run backoffice` (entry-skript: `sajtmaskin_backoffice.py` i repo-roten, sidkod under `backoffice/pages/*.py`) | Next.js API-server, preview-VM, "dashboard" (legacy) |
| `sajtmaskin_backoffice.py` | Entry-skript för backoffice (alias-namn). När operatören säger "backoffice", "streamlit", "pythonskriptet i roten", "backoffice-frontenden" syftar de på det här skriptet. Behöver inte läsas vid varje fråga. | "backoffice/" (mapp med sidkod, inte entry) |
| OpenClaw / Sajtagenten | Separat assistent-/agentyta | Builderns LLM-flöde |
| `appProjectId` vs `chatId` | App-project = användarens projekt; chat = own-engine-konversation | `VERCEL_PROJECT_ID` (det är något helt annat) |

**`v0` betyder tre saker:** (1) API-versionering `/api/v0/` (2) naming debt i symboler (3) Mallar-tab. `v0-sdk`, `src/lib/v0/`, `V0_API_KEY` är borta ur runtime.

**Builder model lanes:** Byggmodell = Build Profile · Deep Brief = automatisk init-expansion · Thinking = reasoning-flagga, inte lane.

---

## Kärnsamband

**Core Rules ↔ statisk prompt** är samma sak från olika håll:
- *Core Rules* = innehållet (immutable produktregler).
- *statisk prompt* / *static system prompt* / *static core* = den färdig-ihopklistrade prefix-strängen.
- Filer: `config/prompt-core/*.md` listade i `config/codegen-core-manifest.json`.
- Loader: `src/lib/gen/static-core-loader.ts` → `getStaticCoreFromWorkspace()`.
- Compose: `composeEngineSystemPrompt(dynamicContextText)`.

**Dossier-status (HISTORISK v1):** Den gamla `_status`-maskinen togs bort 2026-04-20. v2-manifestet har inga `_status`/`_deprecationReason`/`_replacementUrl`-fält. Runtime walkar `data/dossiers/{hard,soft}/` direkt — alla dossiers där är aktiva. Hand-deprekering = flytta mappen till `archive/`.

---

## Env-lager

1. **Plattformens env:** repoets `.env*`, Vercel env vars, `src/lib/env.ts` + `config/env-policy.json`.
2. **Genererad sajts env:** egen `.env.local` i byggprojektet/previewmiljön.
3. **Project env file (`env.example`):** auto-genererad hjälpfil i `versions.files_json`. Next.js läser INTE filen; det är bara dokumentation.
4. **Felsökningsordning:** preview → project env file → plattforms-env.

### EnvVar enforcement (P31)

| Tag | Betydelse | Exempel |
|-----|-----------|---------|
| `build` (default) | Krävs som riktigt värde innan F3-build kan lyckas | `STRIPE_SECRET_KEY` |
| `feature-runtime` | SDK importeras men dossier-UI visar konfigurations-banner när nyckel saknas | `RESEND_API_KEY` |
| `warn-only` | Koden self-disablar på tom value | `NEXT_PUBLIC_PLAUSIBLE_DOMAIN` |

### F3 placeholder-toggle

`allowPlaceholdersInF3` (boolean på `project_data.meta`, default false). När true: placeholder-täckta `build`-keys passerar F3-gaten med varning.

---

## Legacy som inte ska återintroduceras

Behåll om du ser termen i en gammal commit / chatt — annars använd ersättaren.

| Term | Ersättare |
|------|-----------|
| AI Gateway / `AI_GATEWAY_API_KEY` | Direkt provider (OpenAI/Anthropic) |
| Vercel Sandbox (som primär preview) | VM / `preview_host` |
| `demoUrl` | `previewUrl` |
| `detectScaffoldMode()` / `applyScaffoldTraits()` | Borttaget — traits ligger i manifest |
| `EXTENDED_CUSTOM_INSTRUCTIONS` | `LEGACY_EXTENDED_CUSTOM_INSTRUCTIONS` (compat) |
| `simplifiedBriefSchema` / `StructuredBrief` | `siteBriefSchema` / Brief |
| `GATEWAY_ASSIST_MODELS` / `isGatewayAssistModel()` / `"gateway"` provider | `ASSIST_MODELS` / `isOpenAIAssistModel()` / `"openai"` |
| Spec-first-kedjan (`WebsiteSpec`, `processPromptWithSpec`, `briefToSpec`, `promptToSpec`, `/api/ai/spec`, `SPEC_MODEL`, `DEFAULT_SPEC_MODE`, `specMode`-query) | Deep Brief |
| `SAJTMASKIN_BUILD_SPEC_ENABLED` / `_LIGHTWEIGHT_SCAFFOLD_SERIALIZATION` / `_FOLLOWUP_LIGHT_CONTEXT` / `_FINALIZE_DEEP_PATH_ENABLED` | Hårdkodade ON — ingen flagga längre |
| `content-site` (scaffold) | Slagen ihop med `landing-page` |
| `RELEASE_CANDIDATE_PATTERNS` | F3 är explicit knapp, ingen auto-promotering |
| `qualityGateTiers.tier2` / `serverVerify` / `promotion` / `interactive` | `designPreview` / `integrationsBuild` |
| `Prompt Rewrite` / `Prompt Polish` / `Prompt Assist` (paraply) | Deep Brief |
| `Directives` / `Directive Cascade` | "Per-Request Signal Cascade" + `prompt-core/03-visual-design.md` + `04-coding-direction.md` |
| `Capability Pack` / `Enhancement Pack` / `DynamicContextAssembly` / `OwnEngineGenerator` / `PostChecksAndQualityGate` | Docs-termer utan kodsymbol — använd ägande-modulnamnen |
| `sandbox` (generell term) | VM / `preview_host` |

---

## Domän → mappstruktur

| Domän | Primär plats |
|-------|-------------|
| Orchestration (scaffold + route + contracts + BuildSpec) | `gen/` rot + `gen/orchestrate/` |
| Prompt assembly (system prompt, dynamic context) | `gen/system-prompt/` (OMTAG 03 split) |
| BuildSpec | `gen/build-spec/` (OMTAG 03 split) |
| Scaffold-data och matching | `gen/scaffolds/` |
| Scaffold-varianter | `gen/scaffold-variants/` |
| SSE wire-format | `gen/stream/` |
| Autofix och repair | `gen/autofix/` |
| Finalize-pipeline | `gen/stream/finalize-version/` (OMTAG 03 split) |
| Verifiering och quality gate | `gen/verify/` |
| Preview | `gen/preview/` |
| Export/projektskelett | `gen/export/` |
| Env/config | `lib/` rot |
| Deploy och Vercel API | `lib/deploy/` + `lib/vercel/` |

---

**Detaljerad ändringshistorik:** `git log -- docs/architecture/glossary.md`. Den här filen ska bara visa **det som är aktuellt**, inte berättelsen om hur vi kom hit.
