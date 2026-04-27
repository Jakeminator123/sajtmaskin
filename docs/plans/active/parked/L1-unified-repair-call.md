---
id: L1
title: Unified repair-call — slå ihop fyra LLM-fixer-anrop till ett
status: paused
created: 2026-04-21
paused: 2026-04-23
paused_by: OMTAG-2026-04-23 (se ../avklarat/omtag-2026-04-23/PARKED.md)
priority: medium
parent_plan: .cursor/plans/llm-chain-cleanup-2026-04-21.md
parallel_safe_with: [L2-prompt-kit]
blocked_by: []
prerequisite_telemetry:
  - sajtmaskin_fixer_call_total{phase}
  - sajtmaskin_partial_file_repair_total{outcome}
owner_files:
  - src/lib/gen/autofix/llm-fixer.ts
  - src/lib/gen/autofix/validate-and-fix.ts
  - src/lib/gen/verify/verifier-pass.ts
  - src/lib/gen/verify/repair-loop.ts
  - src/lib/gen/stream/finalize-version/ (paket efter OMTAG 03-split)
read_only_files:
  - src/lib/gen/autofix/fixer-prompt.ts
---

> **Paused 2026-04-23:** Parkerad per OMTAG-waven eftersom den kräver telemetri-data + stabilt repo. Note att `src/lib/gen/stream/finalize-version.ts` nu är splittad till paket `finalize-version/` (OMTAG fas 1·03) — owner_files uppdaterad. Se [`../avklarat/omtag-2026-04-23/PARKED.md`](../avklarat/omtag-2026-04-23/PARKED.md).

# L1 — Unified repair-call

## Problem

I dag finns fyra LLM-anrop som alla går till samma `phaseRouting.fixer`-modell men anropar `runLlmFixer` separat:

1. **Syntax-fixer-loop** (`validate-and-fix.ts`) — esbuild-fel + warm-tsc-fel matas in, upp till `syntaxFixPasses` (3–4) gånger.
2. **Verifier-blocking-fixer** (`verifier-phase.ts` → repair-gate direkt efter pass).
3. **Partial-file-repair** (`finalize-version/` — om preflight hittar avhuggna filer).
4. **Server-repair-loop** (`repair-loop.ts` — manuell + bakgrunds-server-verify, upp till 4 anrop).

Varje anrop bygger sin egen prompt, har sin egen reasoning-fas (5–15 sek), sin egen output-stream. **I värsta fall: 4–11 fixer-anrop per generering**, alla mot samma modell, ofta med överlappande input.

## Lösning

Skapa **ETT** anrop `runUnifiedRepair(content, problems, options)` där `problems` är ett structured object:

```ts
interface RepairProblems {
  syntaxErrors?: SyntaxError[];      // esbuild + tsc
  verifierBlocking?: VerifierFinding[];
  missingFiles?: string[];           // partial-file repair
  buildErrors?: string[];            // VM build-error
  recurringPatterns?: RecurringFailurePattern[];
  recurringQualityPatterns?: RecurringFailurePattern[]; // E3 från körlistan
}
```

LLM-prompten får alla kategorier samtidigt och kan adressera dem i en pass.

## Acceptansgränser

- Spar 2–4 LLM-anrop i värsta fallet (mätbart via `sajtmaskin_fixer_call_total`).
- Behåll early-stop-budgeten (60 s timeout per anrop).
- Behåll re-validation efter fixer-pass — verifier-fynd ska re-checkas (idag medvetet skippat per `fas2-orchestration-and-build.md` rad 214; nu kan vi re-checka eftersom vi sparar 2 anrop på vägen).

## Förberedelser

1. Vänta på 1 vecka data via `sajtmaskin_fixer_call_total` så vi vet faktiskt fördelning.
2. Bekräfta att alla fyra anropssites går genom samma modell (gör de redan via `phaseRouting.fixer`).
3. Identifiera om någon kategori har specialfall som inte tål att slås ihop.

## Risker

- **LLM kan adressera fel kategori först.** Mitigation: tydlig prioriteringsordning i prompten (syntax > missing files > verifier > quality).
- **Större prompt → längre reasoning.** Mitigation: limitera till topp-N fynd per kategori.
- **Re-validation kan upptäcka nya fel.** Mitigation: max 1 re-pass, sen done.

## Validator hooks

- `sajtmaskin_fixer_call_total{phase="unified"}` — ska ersätta `phase="syntax"|"verifier"|"partial"|"server"` över tid.
- Eval-svit baseline: ska inte regrera score.
- Test: `runUnifiedRepair`-enhetstest med alla fyra problem-kategorier samtidigt.

## Effort

3 dagar med 1 dag eval-validering. Lämpar sig för cloud-agent när telemetri finns.
