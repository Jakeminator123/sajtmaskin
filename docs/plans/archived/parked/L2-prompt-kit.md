---
id: L2
title: PromptKit — standardiserat prompt-skick + signal-cascade per LLM-anrop
status: paused
created: 2026-04-21
linear: null
paused: 2026-04-23
paused_by: OMTAG-2026-04-23 (se ../../avklarat/omtag-2026-04-23/meta/PARKED.md)
priority: medium
parent_plan: .cursor/plans/llm-chain-cleanup-2026-04-21.md
parallel_safe_with: [L1-unified-repair-call]
blocked_by: []
owner_files:
  - src/lib/gen/prompt-kit/  (ny mapp)
  - src/lib/gen/system-prompt/ (post-OMTAG-03 paket; tidigare monolit)
  - src/lib/gen/autofix/llm-fixer.ts (consumer-byte)
  - src/lib/gen/verify/verifier-pass.ts (consumer-byte)
  - src/lib/builder/site-brief-generation.ts (consumer-byte)
read_only_files:
  - docs/architecture/llm-flow-end-to-end.md
  - docs/architecture/llm-signal-flow.md
---

> **Paused 2026-04-23:** Parkerad per OMTAG-waven. `system-prompt.ts` är nu splittad (OMTAG fas 1·03) — låt det settla innan PromptKit ovanpå. Se [`../../avklarat/omtag-2026-04-23/meta/PARKED.md`](../../avklarat/omtag-2026-04-23/meta/PARKED.md).

# L2 — PromptKit

## Problem

Varje LLM-anropsplats bygger sin systemprompt lokalt med ad-hoc string concat:

| Plats | Prompt-bygge |
|-------|--------------|
| Codegen (`engine.ts`) | `composeEngineSystemPrompt(...)` |
| Brief (`site-brief-generation.ts`) | Lokala `BRIEF_SYSTEM_PROMPT` + ad-hoc fields |
| Verifier (`verifier-pass.ts`) | Lokal `VERIFIER_SYSTEM_PROMPT` |
| LLM-fixer (`llm-fixer.ts`) | `FIXER_SYSTEM_PROMPT` + lokal user-prompt-bygge |

Konsekvenser:

- `recurringPatterns` läggs in i `llm-fixer.ts` men når inte automatiskt verifier eller brief.
- Signal-cascade (EXPLICIT > INDICATED > INFERRED > DEFAULT > FALLBACK) är dokumenterad i `llm-flow-end-to-end.md` men implementerad bara delvis i `system-prompt.ts`.
- Prompt-assert finns bara på codegen — brief, verifier, fixer kan ha korrupt prompt utan att någon märker.

## Lösning

`src/lib/gen/prompt-kit/` med:

```ts
composePrompt({
  phase: "codegen" | "brief" | "verifier" | "fixer" | "repair",
  signals: SignalCascade,
  recurringPatterns?: RecurringFailurePattern[],
  qualityHistory?: RecurringQualityPattern[],
  requiredArtifacts?: string[],
  customSections?: PromptSection[],
}): { system: string; user?: string; assertResult: AssertResult }
```

- All assertion (literal newline, fences, separator) körs här, oavsett fas.
- Signal-cascade bör reverse-engineeras från `system-prompt.ts` och göras till en återanvändbar modul.
- Recurring-patterns injekteras automatiskt om de finns i context.

## Förutsättning för

- L1 (unified repair-call) — behöver veta att alla fixer-anrop går genom samma kompositor.
- E3 (recurringQualityPatterns) — behöver en plats där alla LLM-anrop läser från.
- Strict assert i prod — säker när det går genom kompositor.

## Acceptansgränser

- Alla fyra LLM-anropssites använder `composePrompt`.
- Prompt-dump-formatet (`SAJTMASKIN_PROMPT_DUMP=1`) är konsistent över faser.
- `assertSystemPromptShape` körs implicit på varje fas.
- Eval-svit unchanged eller bättre.

## Risker

- Stor refaktor — bryt i 4 pass (en per fas) så tester håller.
- Brief-prompten är ovanlig (det är `generateObject`, inte `streamText`) — mappa schemat till `requiredArtifacts`.

## Effort

4 dagar inkl. eval-validering. Lämpar sig för iterativ session eller cloud-agent.
