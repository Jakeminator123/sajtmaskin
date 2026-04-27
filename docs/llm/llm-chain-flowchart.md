# LLM-kedjan — flödesschema (post 2026-04-21 A1+A2-fix)

**Källtruth:** koden. **Uppdaterad:** 2026-04-21 efter att brief-genomstoppning på follow-up fixats (commit `813da8068`).

Den här filen visar **vad som faktiskt händer** när en user-prompt går genom Sajtmaskins own-engine-pipeline, från första tangenttryck till sparad version. Tre vägar parallellt: `init`, `follow-up (vanlig)`, `follow-up (clear-redesign)`.

## Översiktsschema

```
                          ┌──────────────────┐
                          │  USER PROMPT     │
                          └─────────┬────────┘
                                    │
                    ┌───────────────┼─────────────────┐
                    │               │                 │
                  INIT           FOLLOW-UP        FOLLOW-UP
                                  (vanlig)       (clear-redesign)
                    │               │                 │
                    ▼               ▼                 ▼
           ┌────────────────┐  ┌──────────┐  ┌────────────────┐
           │ Deep Brief LLM │  │ (skip)   │  │ Delta-brief LLM│
           │ + nominations  │  │          │  │ (re-extract)   │
           │ + capabilities │  │          │  │ + capabilities │
           └────────┬───────┘  └────┬─────┘  └────────┬───────┘
                    │               │                 │
                    │               ▼                 │
                    │   ┌──────────────────────┐      │
                    │   │ buildFollowUpBrief   │      │
                    │   │ FromSnapshot()       │      │
                    │   │ ↑ NYTT 2026-04-21    │      │
                    │   │ Återskapar minimal   │      │
                    │   │ brief från           │      │
                    │   │ orchestration_       │      │
                    │   │ snapshot.briefSummary│      │
                    │   └──────────┬───────────┘      │
                    │              │                  │
                    └──────┬───────┴──────────────────┘
                           ▼
                ┌──────────────────────────┐
                │ ORCHESTRATE              │
                │ - resolveOrchestrationBase│
                │ - matchScaffoldAuto       │
                │ - pickScaffoldVariant     │
                │ - selectDossiersForRequest│ ← brief.requestedCapabilities
                │ - buildSpec, routePlan    │
                └────────┬─────────────────┘
                         │
                         ▼
                ┌─────────────────────────────────────┐
                │ system-prompt/ (paket: compose.ts)  │
                │ ┌──── STATIC CORE (prefix-cache)──┐ │
                │ │  config/prompt-core/*.md         │ │
                │ └──────────────────────────────────┘ │
                │ ┌──── DYNAMIC (per request)───────┐ │
                │ │ Build Intent + Custom Instr     │ │
                │ │ Generation Mode (init/followup) │ │
                │ │ Scaffold + Variant signals      │ │
                │ │ Project Context (brief)         │ │
                │ │ ## Available Dossiers           │ │ ← capability-driven
                │ │ ## Selected Dossier Instructions│ │
                │ │ ## Dossier Files To Emit Verbatim│ │
                │ │ Route Plan + Pre-gen Contracts  │ │
                │ │ Your Toolkit (shadcn)           │ │
                │ └──────────────────────────────────┘ │
                └────────┬─────────────────────────────┘
                         ▼
                ┌─────────────────────────┐
                │ CODEGEN (engine.ts)     │
                │ streamText → CodeProject│
                └────────┬────────────────┘
                         │
                         ▼
        ┌────────────────────────────────────────┐
        │ FINALIZE PIPELINE                      │
        │ 1. url_expand                          │
        │ 2. autofix (mekanisk, ~24 fixers)      │
        │ 3. validate_syntax + warm tsc          │
        │    → llm-fixer (loop, max 1-4 pass)    │
        │ 4. materialize_images                  │
        │ 5. verifier (read-only LLM)            │
        │    → blocking → llm-fixer              │
        │ 6. parse_merge_preflight               │
        │ 7. partial-file repair (om behövs)     │
        │ 8. PERSIST → engine_versions           │
        └────────┬───────────────────────────────┘
                 ▼
        ┌────────────────────────┐
        │ done SSE → PreviewVM   │
        │ (Fly.io preview-host)  │
        │ env-local.ts mergar:   │
        │  harmless → tier3-stub │
        │  → project-preview     │
        │  → user → generated    │
        └────────┬───────────────┘
                 ▼
        ┌────────────────────────────────────┐
        │ Background server-verify (om policy)│
        │ + auto-repair på build-error        │
        │ → version-repair-available SSE      │
        └─────────────────────────────────────┘
```

---

## Per fas — vad händer, vilka filer äger

### Fas 0 — Prompt-skick (request in)

| Yta | Init | Follow-up |
|-----|------|-----------|
| API-route | `POST /api/engine/chats/stream` | `POST /api/engine/chats/[chatId]/stream` |
| Payload | `prompt`, ev. `meta.brief` (från Deep Brief om wizard-flödet) | `message`, `meta` (utan brief inline) |
| Owner-fil | `src/lib/api/engine/chats/create-chat-stream-post.ts` | `src/lib/api/engine/chats/chat-message-stream-post.ts` |

Klassificering:

- `generationKind`: `"init"` om ingen `chatId`-historik, annars `"followup"`.
- `followUpIntent`: classifier i `follow-up-clarification.ts` (regex + LLM-fallback om `>= 80 ord`). Möjliga värden enligt `follow-up-intent-types.ts`: `neutral`, `clear-refine`, `clear-redesign`, `capability-add`, `capability-modify`, `ambiguous-redesign`, `ambiguous-followup`. Plan 12 lade till capability-modify-existing-spåret som kompletterar capability-add med "ändra/förenkla befintlig komponent"-semantik.
- `previousFiles.length`: räknas från senast sparade version. Driver `generationMode` i orchestrate.

### Fas 1 — Brief

| Väg | Vad körs | LLM-anrop |
|-----|----------|-----------|
| Init | `tryGenerateServerAutoBrief` → `generateSiteBrief` | 1 (gpt-5.4 default, fallback gpt-4.1) |
| Follow-up vanlig | `buildFollowUpBriefFromSnapshot()` — **deterministic, ingen LLM** | 0 |
| Follow-up `clear-redesign` | `tryGenerateServerAutoBrief` (delta-brief) | 1 |

Brief-objektet innehåller (efter A1-fix 2026-04-21 även på follow-up):

- `projectTitle`, `brandName`, `oneSentencePitch`
- `pages[]`, `visualDirection`, `imagery`, `uiNotes`, `seo`, `domainProfile`
- `motionLevel`, `qualityBar`, `mustHave`, `avoid`
- `scaffoldNomination`, `variantNomination`
- **`requestedCapabilities: string[]`** ← driver dossier-pick

### Fas 2 — Orchestrate

`src/lib/gen/orchestrate.ts`:

```
prepareGenerationContext()
├── resolveOrchestrationBase()
│   ├── inferCapabilities(prompt)          // regex-fallback om brief saknar
│   ├── matchScaffoldAuto() / persistedScaffold
│   ├── lockedVariantForFollowUp() / pickScaffoldVariantAsync()
│   ├── deriveBuildSpec()
│   └── inferPreGenerationContracts()
├── selectDossiersForRequest({ brief })   // ← capability-driven, deterministic
└── finalizeOrchestrationPrompts()
    └── buildDynamicContext()             // 50-100 KB markdown-block
```

Output: `GenerationInputPackage` (debug-dump i `data/prompt-dumps/orchestration-dynamic/generation-input-package.json` när `SAJTMASKIN_PROMPT_DUMP=1`).

### Fas 2 — System-prompt-komposition

`src/lib/gen/system-prompt/compose.ts` (entry: `src/lib/gen/system-prompt/index.ts`):

```
composeEngineSystemPrompt() returnerar:
[Static Core (config/prompt-core/*.md, alltid)]
+ SYSTEM_PROMPT_SEPARATOR
+ [Dynamic context, byggd av buildDynamicContext()]
```

Dynamic context renderas i strikt prioritetsordning. När token-budget överskrids prunas låg-prio-block via `splitContextIntoBudgetBlocks` + `CONTEXT_BLOCK_PRIORITY_RULES`.

### Fas 2 — Codegen

`src/lib/gen/engine.ts → generateCode()`:

- AI SDK `streamText` mot `phaseRouting.codegen`-modell.
- `assertSystemPromptShape()` körs **före** anropet (soft warning, hard fail om `SAJTMASKIN_STRICT_SYSTEM_PROMPT_ASSERT=1`).
- SSE-events: `meta` → `progress` → `thinking` → `content` → `tool-call` → `done`.

### Fas 2/3 — Finalize-pipeline

`src/lib/gen/stream/finalize-pipeline-contract.ts` definierar 6 huvudfaser i `OWN_ENGINE_POST_STREAM_PIPELINE` (`url_expand` → `autofix` → `validate_syntax` → `materialize_images` → `verifier_pass` → `parse_merge_preflight`). Mellan faserna kan SSE-progress emittera mellan-events; `runner.ts` orchestrerar finare delsteg ovanpå dessa.

### Fas 3 — Preview-handoff

`src/lib/providers/own-engine/generation-stream-post-finalize.ts`:

1. `done`-SSE skickas så fort version sparats.
2. `triggerServerVerification` — bakgrunds-quality-gate (F2 = typecheck only; build är reserverat för F3 `integrationsBuild`).
3. `triggerBuildErrorRepair` — auto-repair på preview-VM `build-error` (default ON i dev/preview, OFF i prod).
4. `version-repair-available` SSE → UI visar accept-knapp om repair lyckades.

---

## LLM-anropsräkning per generering

| Fas | Anrop (typiskt) | Anrop (värsta) |
|-----|----------------|----------------|
| Brief (init) eller delta-brief | 1 | 1 |
| Brief (vanlig follow-up) | 0 | 0 |
| Codegen | 1 | 1 |
| Verifier | 1 | 1 |
| Verifier-blocking → fixer | 0 | 1 |
| Syntax-fixer-loop | 0 | upp till `syntaxFixPasses` (3–4) |
| Partial-file repair | 0 | upp till `partialFileRepairMaxAttempts` (1) |
| Server-repair (efter `done`) | 0 | upp till 4 (`serverRepairPasses` × `manualRepairRouteLlmPasses`) |
| **Summa** | **2–3** | **9–13** |

Plan för att kapa värsta fallet ligger i [`L1-unified-repair-call.md`](../plans/active/parked/L1-unified-repair-call.md).

---

## Viktigaste handoffs (var saker kan gå sönder)

| Handoff | Kontrakt | Risk |
|---------|----------|------|
| Brief → Orchestrate | `brief.requestedCapabilities` driver dossier-pick | **Tidigare bug A1+A2:** brief var `null` på follow-up → noll dossiers. Fixat 2026-04-21. |
| Orchestrate → System-prompt | Dynamic context staplas under prio-budget | Pruning kan tappa lågprio-block tyst — kolla `DynamicContextPruning`-debug. |
| Codegen-stream → Finalize | `parseCodeProject` läser SSE-output | Trasig codefence eller dubbel JSON → preview-blocked. Strict assert på system fångar detta tidigare. |
| Finalize → Preview-VM | `done` + `previewPending` → VM startar | VM kan krascha på `import postgres` om env saknas → `41-tier3-stub-placeholders.env.txt`-merge. |
| Preview-VM → Server-verify | `build-error` eller `verifier-pass` | Auto-repair triggar bara i dev/preview by default. Prod kräver explicit env. |
