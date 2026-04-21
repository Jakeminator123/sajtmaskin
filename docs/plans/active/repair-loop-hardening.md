---
id: repair-loop-hardening
title: Repair-loop hardening — versionId-konsistens, verifier-rerun, fix-pattern-RAG
status: planerad
created: 2026-04-21
priority: medium
parent_plan: .cursor/plans/href-route-safety-net_4b096470.plan.md
parallel_safe_with: [L1-unified-repair-call, L2-prompt-kit]
blocked_by: []
owner_files:
  - src/lib/gen/stream/finalize-version.ts
  - src/lib/providers/own-engine/generation-stream.ts
  - src/lib/gen/system-prompt.ts
  - src/lib/gen/autofix/fixer-prompt.ts
  - src/lib/logging/generation-log-writer.ts
read_only_files:
  - src/lib/gen/verify/verifier-pass.ts
  - src/lib/gen/stream/finalize-preflight.ts
  - src/lib/gen/verify/href-route-cross-check.ts
---

# Repair-loop hardening

## Bakgrund

Levererad i förra spåret (`href-route-safety-net`):

- Locale-alternate route-dedup (`/blog ↔ /blogg`) wirad in i `buildRoutePlan()`.
- Deterministisk href↔route-cross-check som warning i finalize-preflight (`crossCheckHrefsAgainstRoutes`).
- Canonical route paths-sektion i system-prompten.

Det löser huvudfallet men adresserar inte fyra kvarvarande svagheter i repair-loopen som syns i timeline från sessionen 2026-04-21 (chat `e34f6b41`):

- Samma `versionId` får två `version.created`-events med olika `contentLen` (80 102 → 18 693).
- Verifier-LLM rensar findings utan att köra om verifier.
- `runFinalizePreflight` kan starta en *andra* full `validateAndFix`-kedja på merged content.
- `readRecurringPatternsForChat()` matas bara till **fixern**, inte till huvudgeneratorn.

## Mål

Eliminera "Fel-glitch på fungerande sida"-symptomet och låta huvudgeneratorn lära sig från historiska fel — utan att behöva implementera full vektor-RAG.

## Steg (4 oberoende delspår)

### A. `repairPassIndex`-konsistens

**Symptom:** `buildFinalizeParams` i `src/lib/providers/own-engine/generation-stream.ts` (~rad 312-341) skickar inte `repairPassIndex` till `finalizeAndSaveVersion`. Default blir `0`. När `targetVersionId` är satt (follow-up/repair) borde det vara `1+`.

`logPassId` blir därför `${versionId}:repair-0:${ts}` även för follow-ups, vilket gör att error-log ackumuleras under "repair-0"-bucket över flera passes på samma versionId. UI:t läser dem som "aktuella" → röd "Fel"-badge på fungerande version.

**Åtgärd:**

1. Skicka `repairPassIndex: targetVersionId ? 1 : 0` (eller bättre: räkna existing error-log-rader för versionId) till `finalizeAndSaveVersion`.
2. Vid persist-tid: rensa error-log-rader med `repairPassIndex < currentRepairPassIndex` om verifier nu är clean. Lägg detta som best-effort i `createEngineVersionErrorLogs` eller i en ny helper `pruneStaleVersionErrorLogs`.
3. Validera mot golden test som loggar två passes på samma versionId och förväntar att UI bara ser senaste passets findings.

### B. Verifier re-run efter LLM-fixer

**Symptom:** I `finalize-version.ts` (~rad 769-775) rensas `verifierBlockingFindings = []` direkt efter att `runLlmFixer` returnerar utan att verifier körs igen. LLM:n kanske inte fixade allt — vi vet inte.

**Åtgärd:**

1. Efter `runLlmFixer` lyckas: kör `runVerifierPass` igen med samma policy. Om fortfarande blocking → behåll findings, markera `verifierBlocked: true`.
2. Cap antal verifier-rerun till 1 (annars eskalerar tiden).
3. Telemetri: ny rad `verifier_rerun_after_fix { before, after, durationMs }`.
4. Mätbar förväntad effekt: minska "verifier-blocked + boring HTML-page"-symptomet eftersom vi vet om fixern faktiskt löste något.

### C. Eliminera dubbel `validateAndFix`-kedja i preflight

**Symptom:** `runFinalizePreflight` kan starta en *andra* full `validateAndFix`-kedja på merged content (per agent-explore på `finalize-preflight.ts:519-524`). Det fördubblar potentiellt LLM-fixer-kostnad om merged-syntax fallerar trots att stream-syntax passerade.

**Åtgärd:**

1. Lägg `mergedSyntaxRetried: boolean`-flagga i preflight-context.
2. Om stream-syntax (steg 3) passerade men merged fallerar: kör endast `runAutoFix` (mekanisk) på merged + en sista esbuild-validering. Hoppa över LLM-fixer för merged.
3. Anledning: merged-only-fel beror nästan alltid på import-stiger eller kommentar-strippning som `runAutoFix` kan laga deterministiskt.

### D. Fix-patterns till huvudgeneratorn

**Symptom:** `readRecurringPatternsForChat()` (`src/lib/logging/generation-log-writer.ts` ~rad 1549-1583) matas bara in i `buildFixerUserPrompt` (`src/lib/gen/autofix/fixer-prompt.ts`). Huvudgeneratorn ser aldrig att den just gjorde samma fel som förra gången.

**Åtgärd:**

1. I `system-prompt.ts` `buildDynamicContext()` (eller `orchestrate.ts`): läs `readRecurringPatternsForChat(chatId)` när `generationMode === "followUp"`.
2. Om det finns ≥ 2 mönster med ≥ 3 occurrences: rendera ett `### Recurring failures on this site` block med max 5 mönster (id + occurrences + senaste fix-action). Plats: efter `## Route Plan`, före `## Pre-generation Contracts`.
3. Token-budget: cappa blocket till 600 tecken; falla tyst om budget är slut.
4. Test: två rader i `fix-patterns.json` → block renderas och innehåller fil + fix-action.

### E. (Stretch) Riktig RAG mot global `error-log.csv`

Inte i denna plan — separat plan när A-D är levererade. Kort skiss:

- Indexera `logs/llm-segmentts-and-index/error-log.csv` per `scaffoldId + lineageHash`-prefix → embedding per fault-fix-rad.
- Vid ny generering: hämta topp-K (3-5) likartade fel + deras `fixed_by`-rader.
- Render som `### Lessons from similar past builds` i system-prompten.
- Indexerings-job: `scripts/observability/index-error-log-embeddings.ts` (cron).

## Acceptans

| # | Kommando / Kontroll | Förväntat |
|---|---|---|
| A1 | Två finalize-passes på samma versionId, andra clean | UI hämtar bara findings från senaste passet |
| A2 | `git grep -n "repair-0:"` i logs/site-observability efter follow-up-test | Ingen `repair-0` när `targetVersionId` satt |
| B1 | Verifier-rerun-test: blocking → fix → fortfarande blocking | `verifierBlocked: true` bibehålls |
| B2 | Verifier-rerun-test: blocking → fix → clean | `verifierBlocked: false`, telemetri visar `before > 0, after === 0` |
| C1 | Stream syntax pass + merged syntax fail | `validateAndFix` körs INTE igen för merged; mekanisk autofix räcker |
| D1 | `fix-patterns.json` med 3 mönster + follow-up-generering | system-prompt innehåller `### Recurring failures` med 3 rader |
| D2 | Tom `fix-patterns.json` | Inget block renderas |

## Icke-scope

- Inga ändringar i `route-plan.ts`, `href-route-cross-check.ts` eller `system-prompt.ts` route-sektionen — det är levererat.
- Ingen UI-ändring i builder-panelen (vi adresserar UI-symptom genom att inte producera stale findings i första läget).
- Ingen vektor-RAG nu — den är skissad i steg E som nästa plan.

## Riskbedömning

A: medel — touch finalize-version.ts hot path. Skydda med feature-flag `FEATURES.consistentRepairPassIndex` defaulting `false` initialt.
B: låg — additivt, kan rullbas via tidsbudget-flag.
C: låg — strikt minskar kostnad, rollback genom att alltid köra full kedja.
D: mycket låg — text-injection med token-cap.

Total risk: 4/10 (delspår körs separat per PR/commit).
