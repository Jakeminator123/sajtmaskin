# Fas 2 — Orkestrering och Build

Vad som händer från att Fas 1 levererar prompt + brief till att en version är sparad i databasen.

**Senast uppdaterad:** 2026-04-21. **Kod är source of truth.** Ordlista: [glossary.md](./glossary.md).

---

## Fasgränser

| Fas | Start | Slut |
|---|---|---|
| Fas 1 | Prompt in / assist / brief / intent | Före `resolveOrchestrationBase()` |
| **Fas 2** (denna fil) | `resolveOrchestrationBase()` | Version sparad i `engine_versions` |
| Fas 3 | Efter `done` (preview/deploy) | Preview-host lifecycle + deploy/verify |

Relaterade: [fas1-startprompt-flow.md](./fas1-startprompt-flow.md), [fas3-preview-and-deploy.md](./fas3-preview-and-deploy.md).

---

## Kanoniska källfiler

| Område | Fil |
|---|---|
| Orkestrering | `src/lib/gen/orchestrate.ts` + `src/lib/gen/orchestrate/{scaffold-query-context,scaffold-variant-resolver}.ts` |
| BuildSpec | `src/lib/gen/build-spec/` (OMTAG 03: `builder.ts`, `types.ts`, `policy-inference.ts`, `prompt-patterns.ts`, `references.ts`, `route-realization.ts`, `style-pack.ts`, `token-budgets.ts`, `index.ts`). Gamla monoliten `build-spec.ts` borttagen. |
| System prompt | `src/lib/gen/system-prompt/` (OMTAG 03: `compose.ts` orchestrator + `sections/` peers). Gamla monoliten `system-prompt.ts` borttagen. |
| Tokenbudget / pruning | `src/lib/gen/tokens.ts` |
| Core Rules loader | `src/lib/gen/static-core-loader.ts` |
| Core Rules manifest | `config/codegen-core-manifest.json` |
| Core Rules fragment | `config/prompt-core/*.md` (5 concat-fragment `00..04`; `_READ_ME_FIRST.md` är editorial, inte i manifestet) |
| LLM-anrop | `src/lib/gen/engine.ts` |
| SSE-formatering | `src/lib/gen/stream/stream-format.ts` |
| Scaffold-val / matcher | `src/lib/gen/scaffolds/matcher.ts` + `src/lib/gen/scaffolds/keyword-banks.ts` |
| Scaffold-serialisering | `src/lib/gen/scaffolds/serialize.ts` |
| Route-plan | `src/lib/gen/route-plan/` (`index.ts` + builder/parse/verify/helpers) |
| Finalize | `src/lib/gen/stream/finalize-version/` (OMTAG 03: `runner.ts` orchestrator + phase + persist helpers). Gamla monoliten `finalize-version.ts` borttagen. |
| Finalize-kontrakt (ordning) | `src/lib/gen/stream/finalize-pipeline-contract.ts` |
| Finalize-preflight | `src/lib/gen/stream/finalize-preflight.ts` + `src/lib/gen/stream/finalize-preflight/shell-pages.ts` |
| Deterministisk autofix | `src/lib/gen/autofix/pipeline.ts` + `src/lib/gen/autofix/rules/*.ts` |
| Syntax + warm tsc + LLM-fixer | `src/lib/gen/autofix/validate-and-fix.ts` |
| Warm typecheck-runner | `src/lib/gen/preview/warm-typecheck.ts` |
| Verifier-pass | `src/lib/gen/verify/verifier-pass.ts` |
| Repair-loop | `src/lib/gen/verify/repair-loop.ts` + `src/lib/gen/verify/repair-loop/diagnostics-parser.ts` |
| Parse/merge/preflight | `src/lib/gen/stream/finalize-merge.ts`, `finalize-preflight.ts` |
| Pre-gen contracts | `src/lib/gen/contract/pre-generation-contracts.ts` |
| Efter finalize | `src/lib/providers/own-engine/generation-stream-post-finalize.ts` |

---

## Orkestrering (`orchestrate.ts`)

`prepareGenerationContext()` i tre steg:

1. **`resolveOrchestrationBase()`** — deterministiska beslut
2. **`finalizeOrchestrationPrompts()`** — bygger system prompt
3. **`buildGenerationInputPackage()`** — slutpaket + debug-dump

### Signaler som samlas

| Signal | Källa | Deterministisk? |
|---|---|---|
| Capabilities | `inferCapabilities(prompt)` — regex | Ja |
| Generation mode | `init` / `followUp` (från `persistedScaffoldId`) | Ja |
| Scaffold + variant | `matchScaffoldAuto()` eller `persistedScaffoldId` | Delvis (embedding via API) |
| UI Recipes (shadcn) | `resolveShadcnUiRecipes()` (`shadcn-ui-recipes.ts`) | Nätverk + fallback till tomt block |
| Capability hints | `buildCapabilityHints()` | Ja |
| Route plan | `buildRoutePlan()` | Ja |
| Pre-generation contracts | `inferPreGenerationContracts()` | Ja |
| BuildSpec | `deriveBuildSpec()` | Ja |
| Orchestration contract | `buildOrchestrationContract()` | Ja |
| Scaffold-serialisering | `serializeScaffoldForPrompt()` med budget | Ja |
| Request kind (P32 Fas A) | `classifyRequestKind()` på rå follow-up när filkontext finns | Ja (regex) |

Follow-up: `OrchestrationInput.requestKind` sätts i `chat-message-stream-post.ts`, loggas som `[request_kind_classified]` och i dev-log (`request.kind.classified`). **Styr ännu inte** `deriveBuildSpec()` — se [P32-request-type-taxonomy.md](../plans/active/parked/P32-request-type-taxonomy.md).

---

## BuildSpec (`build-spec/`)

Härledd policy-bundle som styr körningen.

| Parameter | Värden | Vad det styr |
|---|---|---|
| `changeScope` | `copy`, `local-layout`, `page-addition`, `redesign`, `integration` | Hur stor ändring prompten begär |
| `qualityTarget` | `standard`, `premium`, `release-candidate` | Kvalitetskrav. `release-candidate` sätts bara när `previewPolicyOverride === "fidelity3"` |
| `contextPolicy` | `light`, `normal`, `heavy` | Token-budget |
| `previewPolicy` | `fidelity2`, `fidelity3` | F2 = design-loop (default). F3 = "Bygg integrationer" via `POST /api/engine/chats/[chatId]/finalize-design` |
| `verificationPolicy` | `fast`, `standard`, `strict` | Verifier-inställning |
| `routeRealization` | `null`, `primary-full-with-shells` | Om extra routes skjuts upp |
| `forbiddenPatterns` | Symboliska flaggor | T.ex. `unrequested_full_redesign` |

### Token-budgetar per `contextPolicy`

Källa: `BASE_TOKEN_BUDGETS` i `src/lib/gen/build-spec/token-budgets.ts` (efter OMTAG 03 split).

| Policy | scaffoldTokens | refsTokens | systemContextTokens |
|---|---|---|---|
| `light` | 13 000 | 5 000 | 22 000 |
| `normal` | 22 000 | 12 000 | 60 000 |
| `heavy` | 32 000 | 16 000 | 80 000 |

Baserade på 200k-fönster. Skalas av `modelBudgetScale()` mellan **0.6×** och **3.0×** beroende på `modelContextWindowTokens` (1M-fönstermodeller får ~3× systemContextTokens). Char-mirrors räknas ut via `CHARS_PER_TOKEN_RATIO_*`.

---

## System Prompt (`system-prompt/` — paket efter OMTAG 03)

```
┌──── STATISK KÄRNA (prefix-cache) ────────────┐
│  Core Rules (config/prompt-core/*.md)         │
│  Laddas via codegen-core-manifest.json        │
└──────────────────────────────────────────────┘
                 SYSTEM_PROMPT_SEPARATOR
┌──── DYNAMISK KONTEXT (per request) ──────────┐
│  20+ markdown-block med ## rubriker (init)   │
│  Follow-up (light, ej redesign) kör kompakt │
│  Prioriterade och prunade efter token-budget │
└──────────────────────────────────────────────┘
```

### Vad som faktiskt når modellen

| Del | Innehåll | Var det byggs |
|---|---|---|
| System (Core Rules) | `codegen-core-manifest.json` + `prompt-core/*.md` (inkl. `03-visual-design.md` + `04-coding-direction.md`) | `getStaticCoreFromWorkspace()` |
| System (dynamisk kontext) | Scaffold, route plan, contracts, brief, capabilities, refs, BuildSpec-signaler, guidance-resolvers | `buildDynamicContext()` |
| Separator | `SYSTEM_PROMPT_SEPARATOR` | `system-prompt/compose.ts` |
| User-turn | Senaste prompten (ev. URL-komprimerad) | API → pipeline |
| Chathistorik | Tidigare user/assistant-meddelanden | Chat-repo → pipeline |

### Dynamiska block (i ordning)

1. Generation Mode (vid follow-up)
2. Custom instructions + Build Intent
3. Generation Profile (style pack, quality, forbidden patterns)
4. Brief-Locked Design Values (briefens designvärden vinner över variant/scaffold)
5. Scaffold Variant (typografi, motif, theme tokens)
6. Design Priority (locked theme → brief → variant → scaffold CSS)
7. Scaffold (serialiserade filer)
8. Scaffold Research Priorities (checklist, upgrade targets)
9. Your Toolkit (shadcn + capability hints + palett)
10. Route Plan
11. Pre-generation Contracts (data mode, providers, env vars)
12. Project Context (brief-fält, pages, must-have/avoid)
13. Visual Identity + Design References
14. Imagery + Media Catalog
15. UI Recipes (upp till 3 shadcn registry-recept)
16. SEO

**Follow-up compact-läge (2026-04-30):** När `generationMode === "followUp"` och
`BuildSpec` är `contextPolicy: "light"` samt inte `changeScope: "redesign"`,
renderas kortare varianter av `Scaffold Variant`, `Your Toolkit` och `Route Plan`.
`Scaffold Research Priorities` och `Lucide icons`-blocket hoppas över i det läget.
Målet är lägre dynamic context utan att ändra produkttermer eller kontrakt.

`## Structural References` är **borttaget 2026-04-17** — strukturella exempel sköts av dossier-pipen v2 (`data/dossiers/{hard,soft}/<id>/`). `data/dossiers/_index/capability-map.json` är en genererad backoffice-view, inte en runtime-källa.

### Pruning

`splitContextIntoBudgetBlocks()` → prioriteras via `CONTEXT_BLOCK_PRIORITY_RULES` → `buildBudgetedSystemPrompt()` fyller inom `BuildSpec.tokenBudgets.systemContextTokens`. Required-block trunkeras hellre än tappas. Utfallet syns i `DynamicContextPruning` och prompt-dumps.

### Wrappers på user-turn (inte system)

Follow-up-wrappers ligger på user-turnen: `## Continuity`, `## Existing Project Files`, `## Follow-up Editing Mode`. Samma prompt får inte dubbleras som "Original request" i systemprompten.

---

## Scaffold-serialisering (`serialize.ts`)

| Läge | När | Vad LLM:en ser |
|---|---|---|
| `inspirational` | Init (default) | Filträd + korta layout/theme-excerpts + "designa fritt, kopiera inte" |
| `structural` | Follow-up / heavy context | Fullständigt filinnehåll (3–4 kritiska filer), budgeterat mot `maxChars` |

Lightweight structural (default): filträd + `selectCriticalScaffoldFiles()` (3 vid `light`, 4 annars), sorterade efter kritisk path-score justerat för route/capability-relevans.

---

## LLM-anropet (`engine.ts`)

`generateCode()` använder Vercel AI SDK `streamText`:

- **Modell**: OpenAI (default) eller Anthropic (om `modelId` börjar med `claude-`)
- **System**: Komplett system prompt
- **Messages**: Chathistorik + user-meddelande
- **Thinking**: Anthropic `thinking: { type: "adaptive" }` eller OpenAI `reasoningEffort`
- **Tools/Steps**: `maxSteps: 4`

Returnerar `createCodeGenSSEStream()` → SSE.

### SSE-events

| Event | Innehåll |
|---|---|
| `meta` | `chatId`, `versionId` |
| `progress` | `phase`: start → reasoning → awaiting-output → done |
| `thinking` | Reasoning-deltas |
| `content` | Kodtext-deltas |
| `tool-call` | Tool-anrop med args |
| `error` | Felmeddelande |
| `done` | Token-användning + `previewPending` |

### Stream lifecycle: done, failed, aborted

Streamen kan landa i tre slut-tillstånd. `generation-log-writer.resolveStatusDetails` mappar tillstånden till `meta.status` + `meta.statusReason` som UI och backoffice läser via `/versions` (fältet `chatStatus`) respektive `meta.json`.

| Slut-tillstånd | Trigger | Event som loggas till `timeline.ndjson` | `meta.status` | `meta.statusReason` | Repair-able? |
|---|---|---|---|---|---|
| **done** | LLM:s `finishReason !== "abort"`, finalize lyckas, version skapas | `site.done` (innehåller `versionId`, `durationMs`, etc.) | `done` | `null` | n/a — versionen finns |
| **failed** | Verifier underkänner, partial-file-repair ger upp, eller persist throws → version markeras `verification_failed` men finns i DB | `site.failed` med `reason` | `failed` | reason från `site.failed` | Ja — versionId finns, follow-up kan repairas |
| **aborted (versionless)** | Stream rivs INNAN version persistas — provider-abort utan content, klient-disconnect, transport-fel, eller stale `in_progress` > 30 min | `site.aborted` med `reason ∈ {provider_aborted_no_content, provider_aborted_after_content, stream_closed_without_done, stream_error, client_disconnect, staleness_inferred}` | `aborted` | reason från `site.aborted` | **Nej** — chatten har ingen `versionId` |
| **aborted (versionless lazy)** | Status-resolver upptäcker stale `in_progress` (> 30 min sedan senaste entry) utan terminal-event | inget — resolver inferera vid läsning | `aborted` | `staleness_inferred` | Nej |

**Versionless chat-policy**: en chat utan `versionId` kan inte repairas, bara restartas. Server blockar `followup_general` mot sådana chats med HTTP 409 (`error: "versionless_chat_aborted"`) i `chat-message-stream-post.ts`. UI byter "Försök reparera preview" mot "Starta om generation" som navigerar till en ny `/builder?restartedFrom=<chatId>`-entry. Query-parametern är idag bara en cosmetic markör — server-side `restartedFromChatId`-lineage är `out of scope` för P0-fix:en (se `docs/architecture/open-questions.md`).

**Var emitteras `site.aborted`?**

| Källa | Reason | Note |
|---|---|---|
| `src/lib/gen/stream/stream-format.ts` | `provider_aborted_no_content` / `provider_aborted_after_content` | AI SDK `part.type === "abort"` — provider rev streamen |
| `src/lib/gen/stream/stream-format.ts` | `stream_error` | Generic catch — pipe-fel under formatering |
| `src/lib/observability/prompt-to-done-stream.ts` | `client_disconnect` / `stream_closed_without_done` / `stream_error` | Wrapper observerar att `done`-event aldrig skickades |
| `src/lib/logging/generation-log-writer.ts` (resolver) | `staleness_inferred` | Lazy detection när någon läser `meta.json`/`/versions`, ingen separat event-rad |

Strict schema: [`docs/schemas/strict/site-aborted.schema.json`](../schemas/strict/site-aborted.schema.json). Backoffice-vy: `LLM-flöde telemetri → Stream-aborter`.

**Polling-stop-kontrakt**: `useVersions`-hooken kollar `chatStatus.status === "aborted" && !chatStatus.hasVersion` och sätter `refreshInterval = 0`. Detta förhindrar evig polling på döda versionless chats. Om en version senare skapas (omöjligt idag, men kontraktet är defensivt), återupptas pollningen automatiskt eftersom `chatStatus.hasVersion` då blir `true`.

---

## Finalize-pipeline (efter LLM-stream)

Definierad i `finalize-pipeline-contract.ts`:

| # | Steg | Vad | Typ |
|---|---|---|---|
| 1 | `url_expand` | `expandUrls()` — `{{MEDIA_N}}` → riktiga URL:er. Körs först så autofix ser riktiga import-paths | Deterministisk |
| 2 | `autofix` | `runAutoFix()` — ~24 mekaniska fixar (imports, JSX, fonts, metadata, ...) | Deterministisk |
| 3 | `validate_syntax` | esbuild + warm tsc + LLM-fixer-loop | Hybrid |
| 4 | `materialize_images` | Byt placeholder-bilder mot Unsplash (6–8 st). Endast full path, non-fatal | Nätverk |
| 5 | `verifier` | Read-only LLM-granskning. Endast full path + verifier-policy. Blocking-fynd matas in i `runLlmFixer` direkt efter | LLM |
| 6 | `parse_merge_preflight` | Parse → merge med befintliga filer → preflight → integration-manifest | Deterministisk |
| 7 | Partial-file repair | Om preflight hittar avhuggna filer: max `partialFileRepairMaxAttempts` LLM-fixer-rundor (manifest-default 2, max 3, 60 s timeout). Lyckas → kör parse+merge+preflight om. Misslyckas → `PartialFileOutputError` stoppar persist | LLM |
| 8 | Persist | `addAssistantMessageAndCreateDraftVersion` (init) eller `addAssistantMessageAndUpdateExistingVersion` (follow-up) | Deterministisk |
| 9 | Best-effort | Telemetry, preflight-loggar, ev. `failVersionVerification` | Deterministisk |

### Steg 3 — `validate_syntax` i detalj

Sedan 2026-04-20 äger detta steg även warm-tsc passet (`runWarmTscPass`). Esbuild kör först; när esbuild når `passed` körs `tsc --noEmit` mot scaffold-cachen och TS-fel matas in i samma `runLlmFixer`-loop med samma `fixBudgetMs`. F3 (`previewPolicy === "fidelity3"`) sätter `forceTsc: true`.

SSE-progress emitterar phases: `validating` / `fixing` / `tsc-validating` / `tsc-fixing` / `tsc-passed` / `tsc-skipped` / `passed` / `gave-up`.

**Bug-fix 2026-04-20:** `runLlmFixer` triggas på alla pass inom budget. Loop-ordning: validate → fixer → reValidate → (om sista pass och fortfarande fel) gave-up.

### Steg 5 — `verifier` i detalj

Blocking-fynd matas in via `runLlmRepairGate()` direkt efter verifier-passet via `formatVerifierFindingsAsFixerErrors()` (samma `phaseRouting.fixer`-modell + 60 s abort). Fixerns output körs genom `runAutoFix` igen. Re-validation av verifier hoppas medvetet över (skulle förlänga `done` med 5–15 s); server-verify (Fas 3) fångar resten. Lyckad fixer → `verifierBlockingFindings = []` så versionen INTE markeras verifier-blocked.

### Repair ledger

`runFinalizeFastPath()` skapar en per-finalize `RepairLedger` och trådar den till syntax/warm-tsc/warm-eslint, verifier, preflight, home-route recovery och partial-file repair. Ledgerns dedupe-nyckel är `scopeId + chatId + contentHash + diagnosticFingerprint + requiredFiles`; `phase` ingår **inte** i nyckeln, men loggas för observability. Därmed kan samma innehåll + samma diagnostik inte trigga flera LLM-repairförsök bara för att felet vandrar från syntax till verifier/preflight i samma finalize-run.

`scopeId` sätts av finalize-runnern från `targetVersionId` eller `lineageHash` plus `repairPassIndex` (`root`/`repair-N`). Dedupe är fortfarande opt-in för callers som explicit skickar ledger; post-finalize `server-verify`/manual repair-loop kan fortfarande ha egen repairlogik utanför denna ledger.

När en repair dedupe:as skrivs devLog-eventet `llm_repair_gate.deduped` med `phase`, `scopeId`, `requiredFiles`, `diagnosticFingerprint`, `contentHash`, `attempts` och `lastOutcome`.

### Steg 6 — `parse_merge_preflight` cross-checks

Utöver klassiska sanity- och SEO-checkar kör preflight två deterministiska route-kontroller som speglar / kompletterar verifier-LLM:n:

- **Saknade routes** (`findMissingPlannedRoutes`): planerade routes som inte fick någon page-fil → `non_blocking_quality_warning`.
- **href ↔ route cross-check** (`crossCheckHrefsAgainstRoutes` i `src/lib/gen/verify/href-route-cross-check.ts`): skannar genererade `.tsx`/`.jsx` efter `<Link href>`, `href=""`, `router.push()`, `redirect()` och flaggar interna hrefs som inte matchar någon faktisk route. Template literals (`` `/blogg/${slug}` ``) accepteras när motsvarande dynamisk route finns. Suggestions baseras på Levenshtein ≤ 2. Idag emitteras dessa som warnings; gate-flip till `error` planeras i [`docs/plans/avklarat/repair-loop-hardening.md`](../plans/avklarat/repair-loop-hardening.md).
- **Plan 11 home-route-gate + count-parity**: `finalize-preflight.ts` blockerar promotion om scaffold-required `app/page.tsx` (eller `src/app/page.tsx`) saknas eller har trivialt innehåll, och kontrollerar att `completeProjectFiles.length === nextFilesJson.length` (paritet mellan parsed code-project och materialiserad fil-bag). Båda gates landade i Wave 5.

Preventivt: `buildRoutePlan()` dedupar locale-alternates (`/blog ↔ /blogg`, `/contact ↔ /kontakt`, `/about ↔ /om`, `/services ↔ /tjanster`) innan route-planen serialiseras till LLM:n, och system-prompten får en *Canonical route paths*-sektion med exakta tillåtna paths. Detta är två lager skydd: planlagret minskar förvirring innan generering, finalize-checken fångar resten.

### Light vs Full path

| `runDeepPath` | Etikett | Materialisering | Verifier |
|---|---|---|---|
| `true` | `full` | Kör | Kör enligt verifier-policy |
| `false` | `light` | Hoppas över | Hoppas över |

Light path: follow-up + `verificationPolicy: "fast"` + `contextPolicy: "light"` + scope `copy`/`local-layout` (om inga repair-villkor tvingar full).

### Blocking vs kvalitet vs observability

| Typ | Exempel | Blockerar persist? |
|---|---|---|
| Blocking | `EmptyGenerationError`, `PartialFileOutputError` (efter repair-försök) | Ja |
| Kvalitetssignal | Verifier-fynd | Nej. Blocking-fynd repareras oftast innan persist |
| Non-fatal | Bildmaterialisering/verifier kastar | Nej, pipeline fortsätter |
| Observability | Telemetry, devlog, preflight-loggar | Nej |

### Server-verify

Separat asynk lane efter finalize/handoff:

- Blockerar inte `done`
- Kan trigga repair-pass i bakgrunden
- Kör via delad `runRepairLoop()` (samma logik som manuell `/repair`)
- Targeted/warm repair när quality-gate pekar ut mindre felset
- Egen policy: `resolvePostFinalizeServerVerifyDecision`

---

## Pre-generation Contracts

`inferPreGenerationContracts()` (`src/lib/gen/contract/pre-generation-contracts.ts`):

- `dataMode`: `none` / `mocked` / `persisted` / `mixed`
- `providers`: `databaseProvider`, `authProvider`, `paymentProvider`
- `integrations[]`, `envVars[]`
- `unresolvedDecisions`, `confirmedAnswers`

Defaults: NextAuth Credentials om `needsAuth`; Stripe test-placeholders om betalning; SQLite om persistence. Blockerar aldrig preview.

---

## Init vs Follow-up

| | Init | Follow-up |
|---|---|---|
| Scaffold-serialisering | `inspirational` | `structural` |
| Variant structural files | Ja | Bara om `isFirstCodeGeneration` |
| Template guidance | Ja (om refs finns) | Bara om `isFirstCodeGeneration` |
| Route plan | Fri planering + ev. shell deferral | Shell preservation + frys |
| Finalize path | Full (typiskt) | Light möjlig för small copy/layout |
| Merge | Ren version | `mergeGeneratedProjectFiles` med `previousFiles` |
| Rå-signalpaket in till `OrchestrationInput` | `routePlanPrompt`, `buildSpecPrompt`, `contractsPrompt`, `scaffoldMatchPrompt`, `capabilitiesPrompt` = rå `message` (paritet med follow-up sedan 2026-04-22) | Samma 5 fält. Plan-mode-grenen skickar samma paket (init + follow-up) sedan 2026-04-22 audit |
| Brief | `meta.brief` (Deep Brief / Server Auto-Brief) | Ingen ny LLM-brief. `buildFollowUpBriefFromSnapshot()` hydrerar en minimal brief från `briefSummary` (requestedCapabilities, domainProfile-slug, visualDirection.styleKeywords, toneAndVoice, qualityBar, motionLevel, colorPalette, typography, projectTitle, brandName) när `metaBrief` saknas |
| Simple website path | Konservativ snabb-lane kan hoppa Server Auto-Brief, externa/UI Recipes och dossier selection för korta website/template-init prompts utan heavy signals | Aldrig aktiv på follow-up |
| `effectiveInitRouteCount` (driver `qualityTarget` + `contextPolicy`) | `init` | `followUp` räknas som "effective init" via `isEffectiveInit({ generationMode, isFirstCodeGeneration })` — första kodgen efter contract gate får samma route-count som riktig init |

---

## Synk-checklista när Fas 2-runtime ändras

- [fas2-orchestration-and-build.md](./fas2-orchestration-and-build.md) (denna fil)
- [fas1-startprompt-flow.md](./fas1-startprompt-flow.md) (om fasgräns/ingång ändras)
- [fas3-preview-and-deploy.md](./fas3-preview-and-deploy.md) (om handoff/preview påverkas)
- [README.md](./README.md) (index)
- [`.cursor/rules/pipeline-rules.mdc`](../../.cursor/rules/pipeline-rules.mdc)
- `config/dashboard/domain-map.json`
- `docs/schemas/llm-role-matrix.md`
- `docs/schemas/orchestration-signal-contract.md`
- `docs/schemas/quality-gate.md`
