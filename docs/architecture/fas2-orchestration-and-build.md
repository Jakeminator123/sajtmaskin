# Fas 2 — Orkestrering och Build

Vad som händer från att Fas 1 levererar prompt + brief till att en version är sparad i databasen.

**Senast uppdaterad:** 2026-04-20. **Kod är source of truth.** Ordlista: [glossary.md](./glossary.md).

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
| Orkestrering | `src/lib/gen/orchestrate.ts` |
| BuildSpec | `src/lib/gen/build-spec.ts` |
| System prompt | `src/lib/gen/system-prompt.ts` |
| Tokenbudget / pruning | `src/lib/gen/tokens.ts` |
| Core Rules loader | `src/lib/gen/static-core-loader.ts` |
| Core Rules manifest | `config/codegen-core-manifest.json` |
| Core Rules fragment | `config/prompt-core/*.md` (6 filer inkl. `_READ_ME_FIRST.md`) |
| LLM-anrop | `src/lib/gen/engine.ts` |
| SSE-formatering | `src/lib/gen/stream/stream-format.ts` |
| Scaffold-serialisering | `src/lib/gen/scaffolds/serialize.ts` |
| Finalize | `src/lib/gen/stream/finalize-version.ts` |
| Finalize-kontrakt (ordning) | `src/lib/gen/stream/finalize-pipeline-contract.ts` |
| Deterministisk autofix | `src/lib/gen/autofix/pipeline.ts` |
| Syntax + warm tsc + LLM-fixer | `src/lib/gen/autofix/validate-and-fix.ts` |
| Warm typecheck-runner | `src/lib/gen/preview/warm-typecheck.ts` |
| Verifier-pass | `src/lib/gen/verify/verifier-pass.ts` |
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
| Shadcn-exempel | `loadShadcnExamples()` + `fetchMissingRegistryExamples()` | Nätverk |
| Community blocks | `fetchCommunityBlocks()` | Nätverk |
| Capability hints | `buildCapabilityHints()` | Ja |
| Route plan | `buildRoutePlan()` | Ja |
| Pre-generation contracts | `inferPreGenerationContracts()` | Ja |
| BuildSpec | `deriveBuildSpec()` | Ja |
| Orchestration contract | `buildOrchestrationContract()` | Ja |
| Scaffold-serialisering | `serializeScaffoldForPrompt()` med budget | Ja |

---

## BuildSpec (`build-spec.ts`)

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

| Policy | scaffoldTokens | refsTokens | systemContextTokens |
|---|---|---|---|
| `light` | 11 250 | 3 750 | 15 000 |
| `normal` | 18 000 | 9 000 | 40 000 |
| `heavy` | 25 000 | 12 500 | 50 000 |

---

## System Prompt (`system-prompt.ts`)

```
┌──── STATISK KÄRNA (prefix-cache) ────────────┐
│  Core Rules (config/prompt-core/*.md)         │
│  Laddas via codegen-core-manifest.json        │
└──────────────────────────────────────────────┘
                 SYSTEM_PROMPT_SEPARATOR
┌──── DYNAMISK KONTEXT (per request) ──────────┐
│  20+ markdown-block med ## rubriker          │
│  Prioriterade och prunade efter token-budget │
└──────────────────────────────────────────────┘
```

### Vad som faktiskt når modellen

| Del | Innehåll | Var det byggs |
|---|---|---|
| System (Core Rules) | `codegen-core-manifest.json` + `prompt-core/*.md` (inkl. `03-visual-design.md` + `04-coding-direction.md`) | `getStaticCoreFromWorkspace()` |
| System (dynamisk kontext) | Scaffold, route plan, contracts, brief, capabilities, refs, BuildSpec-signaler, guidance-resolvers | `buildDynamicContext()` |
| Separator | `SYSTEM_PROMPT_SEPARATOR` | `system-prompt.ts` |
| User-turn | Senaste prompten (ev. URL-komprimerad) | API → pipeline |
| Chathistorik | Tidigare user/assistant-meddelanden | Chat-repo → pipeline |

### Dynamiska block (i ordning)

1. Generation Mode (vid follow-up)
2. Custom instructions + Build Intent
3. Generation Profile (style pack, quality, forbidden patterns)
4. Scaffold Variant (typografi, motif, theme tokens)
5. Design Priority (locked theme → brief → variant → scaffold CSS)
6. Scaffold (serialiserade filer)
7. Scaffold Research Priorities (checklist, upgrade targets)
8. Your Toolkit (shadcn + capability hints + palett)
9. Route Plan
10. Pre-generation Contracts (data mode, providers, env vars)
11. Project Context (brief-fält, pages, must-have/avoid)
12. Visual Identity + Design References
13. Imagery + Media Catalog
14. Component References (upp till 5 fenced shadcn-exempel)
15. SEO

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
| 7 | Partial-file repair | Om preflight hittar avhuggna filer: max `partialFileRepairMaxAttempts` LLM-fixer-rundor (default 1, max 3, 60 s timeout). Lyckas → kör parse+merge+preflight om. Misslyckas → `PartialFileOutputError` stoppar persist | LLM |
| 8 | Persist | `addAssistantMessageAndCreateDraftVersion` (init) eller `addAssistantMessageAndUpdateExistingVersion` (follow-up) | Deterministisk |
| 9 | Best-effort | Telemetry, preflight-loggar, ev. `failVersionVerification` | Deterministisk |

### Steg 3 — `validate_syntax` i detalj

Sedan 2026-04-20 äger detta steg även warm-tsc passet (`runWarmTscPass`). Esbuild kör först; när esbuild når `passed` körs `tsc --noEmit` mot scaffold-cachen och TS-fel matas in i samma `runLlmFixer`-loop med samma `fixBudgetMs`. F3 (`previewPolicy === "fidelity3"`) sätter `forceTsc: true`.

SSE-progress emitterar phases: `validating` / `fixing` / `tsc-validating` / `tsc-fixing` / `tsc-passed` / `tsc-skipped` / `passed` / `gave-up`.

**Bug-fix 2026-04-20:** `runLlmFixer` triggas på alla pass inom budget. Loop-ordning: validate → fixer → reValidate → (om sista pass och fortfarande fel) gave-up.

### Steg 5 — `verifier` i detalj

Blocking-fynd matas in i `runLlmFixer` direkt efter verifier-passet via `formatVerifierFindingsAsFixerErrors()` (samma `phaseRouting.fixer`-modell + 60 s abort). Fixerns output körs genom `runAutoFix` igen. Re-validation av verifier hoppas medvetet över (skulle förlänga `done` med 5–15 s); server-verify (Fas 3) fångar resten. Lyckad fixer → `verifierBlockingFindings = []` så versionen INTE markeras verifier-blocked.

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
