# Fas 2 — orkestrering och byggnation

**Senast uppdaterad:** 2026-04-15

Syfte: ge en enda kanonisk karta for allt mellan "prompten ar tolkad" och
"versionen ar sparad". Denna fas inkluderar:

- orkestrering (`resolveOrchestrationBase`)
- LLM-input (system + user-turn + historik + budget/pruning)
- codegen-streamens poststeg (autofix, syntax/fixer, verifier, preflight, persist)

Detta dokument ersatter tidigare separata dokument for LLM-input respektive
post-stream finalize.

---

## Fasgranser

| Fas | Start | Slut |
|---|---|---|
| **Fas 1** | Prompt in / assist / brief / intent | Fore `resolveOrchestrationBase()` |
| **Fas 2** (denna fil) | `resolveOrchestrationBase()` | Version sparad i `engine_versions` |
| **Fas 3** | Efter `done` (preview/deploy-lager) | Preview-host lifecycle + deploy/verify-lanes |

Relaterade dokument:

- Fas 1: `docs/architecture/fas1-startprompt-flow.md`
- Fas 3: `docs/architecture/fas3-preview-and-deploy.md`

---

## Kanoniska kallfiler

| Omrade | Fil |
|---|---|
| Orkestrering | `src/lib/gen/orchestrate.ts` |
| BuildSpec | `src/lib/gen/build-spec.ts` |
| LLM-input / systemprompt | `src/lib/gen/system-prompt.ts` |
| Tokenbudget / pruning | `src/lib/gen/tokens.ts` |
| Core Rules + static core loader | `src/lib/gen/static-core-loader.ts` |
| Finalize pipeline | `src/lib/gen/stream/finalize-version.ts` |
| Pipelineordning | `src/lib/gen/stream/finalize-pipeline-contract.ts` |
| Deterministisk autofix | `src/lib/gen/autofix/pipeline.ts` |
| Syntax + LLM-fixer | `src/lib/gen/autofix/validate-and-fix.ts` |
| Verifier-pass (read-only LLM) | `src/lib/gen/verify/verifier-pass.ts` |
| Parse/merge/preflight | `src/lib/gen/stream/finalize-merge.ts`, `src/lib/gen/stream/finalize-preflight.ts` |
| Efter finalize (`done`, preview-start) | `src/lib/providers/own-engine/generation-stream-post-finalize.ts` |

---

## Del A — vad som faktiskt nar modellen

### Inputblock

| Del | Innehall | Var det byggs |
|---|---|---|
| System (Core Rules) | `config/codegen-core-manifest.json` + `config/prompt-core/*.md` (inkl. `03-visual-design.md` + `04-coding-direction.md` som tidigare låg i den borttagna directive-cascaden) | `getStaticCoreFromWorkspace()` |
| System (dynamisk kontext) | Scaffold, route plan, contracts, brief, capabilities, refs, BuildSpec-signaler, guidance-resolvers (motion/domain/quality) | `buildDynamicContext()` |
| Separator | `SYSTEM_PROMPT_SEPARATOR` | `system-prompt.ts` |
| User-turn | Senaste prompten (ev. URL-komprimerad) | API-lager -> pipeline |
| Chatthistorik | Tidigare user/assistant-meddelanden | Chat-repo -> pipeline |

Viktigt:

- Samma prompt ska inte dubbleras i systemprompten som "Original request".
- Follow-up wrappers laggs pa user-turnen (inte i systemprompten), t.ex.
  `## Continuity`, `## Existing Project Files`, `## Follow-up Editing Mode`.

### Budgetering och pruning

1. Dynamisk kontext delas i block (`splitContextIntoBudgetBlocks`).
2. Block prioriteras via `CONTEXT_BLOCK_PRIORITY_RULES`.
3. `buildBudgetedSystemPrompt()` fyller block inom
   `BuildSpec.tokenBudgets.systemContextTokens`.
4. Required-block trunkeras hellre an att tappas helt.
5. Utfallet exponeras i `DynamicContextPruning` och prompt-dumps.

### Capability-, toolkit- och referenslager

- `capability-inference.ts` skapar `## Detected Capabilities`.
- `## Your Toolkit` byggs fran lokal/saker shadcn-yta.
- `## Component References` adderar capability-matchade exempel.
- ~~`## Structural References (this variant)` via `SAJTMASKIN_VARIANT_STRUCTURAL_FILES`~~
  — **avvecklad 2026-04-17**. Strukturella exempel hanteras nu via
  dossier-pipen (`data/dossiers/_index/`).

---

## Del B — post-stream finalize och persist

Efter codegen-streamen kor `finalizeAndSaveVersion()` med denna ordning:

1. **`url_expand`** -> `expandUrls()` (kor forst sa autofix ser riktiga URL:er
   i import-paths, inte `{{MEDIA_N}}`-aliaser).
2. **`autofix`** -> `runAutoFix()` (mekaniska fixar).
3. **`validate_syntax`** -> `validateAndFix()` (mekanisk + LLM-fixer vid behov).
   Anropas med `alreadyMechanicallyFixed: true` nar steg 2 just kort, sa det
   initiala mekaniska passet inom validateAndFix hoppas over (idempotent).
4. **`materialize_images`** -> endast full path; non-fatal vid fel.
5. **`verifier`** -> endast full path + verifier-policy; non-fatal vid fel.
6. **`parse_merge_preflight`** -> parse, merge, preflight, integration-manifest.
7. **Partial-file repair** -> om preflight hittar avhuggna filer, forsoks
   `partialFileRepairMaxAttempts` LLM-fixer-rundor (manifeststyrt, default 1,
   max 3, 60 s timeout per forsok). Om reparationen lyckas kors
   parse+merge+preflight om. Om den misslyckas -> `PartialFileOutputError`
   stoppar persist helt. Utfallet loggas som `partial-file-repair.outcome`.
8. **Persist** -> `addAssistantMessageAndCreateDraftVersion` (assistant + version).
9. **Efter persist (best-effort)** -> telemetry, preflight-loggar, ev.
   `failVersionVerification`.

### Light path vs full path

| `finalizePath.runDeepPath` | Etikett | Materialisering | Verifier |
|---|---|---|---|
| `true` | `full` | Kor | Kor enligt verifier-policy |
| `false` | `light` | Hoppas over | Hoppas over |

Full path kan hoppas over for lata follow-ups med `verificationPolicy: "fast"`
och `contextPolicy: "light"` (om inga repair-villkor tvingar full path).

### Blocking vs kvalitet vs observability

| Typ | Exempel | Blockerar sparad version? |
|---|---|---|
| Blocking | `EmptyGenerationError`, `PartialFileOutputError` (efter konfigurerade repair-forsok) | Ja |
| Kvalitetssignal | Verifier-fynd (`blocking`/`quality`) | Nej. `blocking` i verifiern ar advisory-severity och stoppar inte persist. |
| Non-fatal | Bildmaterialisering/verifier kastar | Nej, pipeline fortsatter |
| Observability | Telemetry, devlog, preflight-loggar | Nej |

### Server-verify i relation till finalize

`server-verify` ar en separat asynk lane efter finalize/handoff. Den:

- blockerar inte `done`
- kan trigga repair-pass i bakgrunden
- kor via delad `runRepairLoop()` (samma grunnlogik som manuell `/repair`)
- anvander targeted/warm repair nar quality-gate pekar ut ett mindre felset
- har egen policy (`resolvePostFinalizeServerVerifyDecision`)

---

## SSE i Fas 2 (forenkling)

- `progress` med `OwnEnginePostStreamPhaseId` speglar finalize-stegen.
- `done` betyder att versionen ar finaliserad och sparad.
- `done.previewPending` betyder att Fas 3 (preview-start) kan fortsatta efter `done`.

---

## Synkchecklista nar Fas 2-runtime andras

- `docs/architecture/fas2-orchestration-and-build.md` (denna fil)
- `docs/architecture/fas1-startprompt-flow.md` (om fasgrans/ingang andras)
- `docs/architecture/fas3-preview-and-deploy.md` (om handoff/preview paverkas)
- `docs/architecture/builder-generation.md` (nav och ingress)
- `docs/architecture/README.md` (index)
- `.cursor/rules/llm-pipeline-docs-sync.mdc`
- `config/dashboard/domain-map.json`

Se aven:

- `docs/schemas/llm-role-matrix.md`
- `docs/schemas/orchestration-signal-contract.md`
- `docs/schemas/quality-gate.md`
