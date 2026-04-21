# P34 — Blocking lint in the pre-save validation loop

**Status:** Fas A+B implementerade 2026-04-21 — `warm-eslint.ts` + integration i `validateAndFix` finns bakom flaggan `SAJTMASKIN_BLOCKING_ESLINT`. F3 (integrationer) forcerar passet på. Default av i prod tills latens mätts i dev/preview.
**Skapad:** 2026-04-21.

---

## Problem

Idag (efter glapp 1) körs `eslint . --max-warnings=20` i bakgrunden efter att versionen sparats via `triggerServerVerification` → `preview-host verify-lane`. Om lint-fel hittas startar en repair-loop asynkront som kan promota en *ny* version, men den **första** versionen har redan persisterats, visats för användaren i chatten och ev. öppnats i preview.

Det betyder att klasser av fel som ESLint känner till — framför allt React-hook-fel (`react-hooks/set-state-in-effect`, `react-hooks/exhaustive-deps`) och import/export-fel — läcker hela vägen till nedladdad projekt-zip när användaren hinner ladda ner innan bakgrundsreparationen hunnit köra klart.

Warm-tsc + esbuild-syntax kör redan **blockerande** i `validateAndFix` (se `src/lib/gen/autofix/validate-and-fix.ts`). Lint har samma natur som typecheck — statisk, snabb, deterministisk — men ligger fel i pipelinen.

---

## Lösning

Lyft lint till den blockerande `validateAndFix`-banan, som en tredje pass **efter** warm-tsc (så lintern kör på kod som redan är TS-giltig; annars spammar eslint om partial-file / typ-problem som redan ska ha fångats).

### Flödesschema

```
esbuild-syntax loop   (blocking)   ← finns idag
      ↓
warm-tsc pass         (blocking)   ← finns idag
      ↓
[NYTT] eslint pass    (blocking)   ← P34
      ↓
parse/merge/preflight (blocking)   ← finns idag
      ↓
finalize.save()       ← version landar i DB
      ↓
background build      (fire-and-forget, kvar från glapp 1)
```

### Varför lint EFTER warm-tsc och inte FÖRE

Esbuild + tsc fångar syntax/typfel. Om de finns kvar returnerar eslint en kaskad av ovidkommande fel ("undefined is not a module", "unresolved import") som förvirrar LLM-fixern. När tsc är grönt är eslint-diagnostiken meningsfull.

---

## Arkitektur-skiss

### Nya filer / moduler

- `src/lib/gen/autofix/eslint-pass.ts` — `runEslintPass()` analog med `runWarmTscPass`. Kör eslint mot samma warm-workspace som warm-tsc använder (`src/lib/gen/preview/warm-typecheck.ts` har redan scaffold-baserad cache).
- `src/lib/gen/preview/warm-eslint.ts` (valfritt) — om vi vill dela workspace-bootstrap kan det abstraheras ut.

### Ändrade filer

- `src/lib/gen/autofix/validate-and-fix.ts` — lägg till eslint-pass efter warm-tsc, samma `ValidateFixProgressCallback`-kontrakt, samma budget/deadline.
- `src/lib/gen/autofix/llm-fixer.ts` — lägg till `lintErrors` som valfri repair-kontext (parser finns redan i `src/lib/gen/verify/lint-output.ts` — `buildLintRepairContextLines`).
- `src/lib/gen/stream/finalize-pipeline-contract.ts` — utöka beskrivningen av validate-fas med lint-steget.
- `src/lib/logging/devLog.ts` — lägg till `validate.eslint.start`, `validate.eslint.result`, `validate.eslint.gave-up` i `CONSOLE_SUMMARY_ENABLED_TYPES`.

### Nya tester

- `eslint-pass.test.ts` — verifierar att pass returnerar lint-errors, att LLM-fixern anropas när fel finns, att pass ger upp efter budgetöverskridning.
- Utöka `validate-and-fix.test.ts` — nytt case "eslint finds error → LLM-fixer resolves → re-run eslint passes".

---

## Fas-plan

| Fas | Vad | Risk | Effekt | Status |
|---|---|---|---|---|
| **A** | Lägg `runPreVmEslint` i `warm-eslint.ts` + `runWarmEslintPass` i `validate-and-fix.ts`. Tester isolerade. | Låg | Ingen runtime-påverkan | **Klar** 2026-04-21 |
| **B** | Koppla in efter warm-tsc när tsc är clean. Default AV via `SAJTMASKIN_BLOCKING_ESLINT`. F3 forcerar på. | Låg-medel | Ingen ändring tills flagga på | **Klar** 2026-04-21 |
| **C** | Aktivera flaggan i dev + preview. Mäta latens-delta. | Medel | +5-15s per generering (måste mätas) | Väntar på go |
| **D** | Aktivera i prod om latens-budget håller. Flytta flaggan till manifestet. | Medel | Lint-errors fångas före version sparas | Väntar på C |
| **E** | Ta bort lint från bakgrundsgate (från SAJ-28 glapp 1) när blocking-pass är default på. | Låg | Sparar bakgrund-compute | Väntar på D |

---

## Riskbild

- **Latens.** Eslint på ett typiskt exporterat Next-projekt tar 5-15s. Det är verkligt. Mitigering: använd warm-eslint-cache (lint-config + node_modules förinstallerat per scaffold); kör bara på ändrade filer när möjligt.
- **Warning-flod.** Default `--max-warnings=20` är tolerant men kan ändå frysa edge-cases. Blocking-flaggan ska starta med `--max-warnings=50` eller högre; strama åt sedan.
- **LLM-fixer-regressioner.** När eslint klagar på en regel som kräver arkitekturbeslut (t.ex. `react-hooks/exhaustive-deps` som ofta vill att man wrappar callbacks i `useCallback`) kan LLM-fixern göra större ändringar än önskat. Mitigering: börja med regel-allowlist (bara errors, inte warnings) och expandera försiktigt.
- **Feedback-loop-kostnad.** Varje eslint-fix-LLM-anrop är en till generator-call. För komplexa projekt kan detta bli dyrt. Bugdet-deadline måste respekteras.

---

## Open questions

1. Ska lint köras **före eller efter** warm-tsc? Nuvarande förslag: efter. Alternativ: parallellt — eslint+tsc på samma innehåll — och merge diagnostik innan LLM-fixer kallas.
2. Ska vi behålla lint i bakgrundsgate som säkerhetsnät även efter fas D? Förslag: nej, men kör båda parallellt i fas C för att verifiera att inga fall missas.
3. Ska regel-allowlist finnas? Förslag: i fas A+B tillåt alla regler från `eslint-config-next/core-web-vitals` + `eslint-config-next/typescript` (samma som exporterade projektet). Ingen custom allowlist.

---

## Avgränsning (ut ur scope)

- Full `next build` som blockerande steg — det är 20-60s och värt en egen plan (P35 om relevant).
- Custom eslint-regler utöver `eslint-config-next`. Kör vanilla next-config så exporterade projektet matchar.
- Visual-QA som blockerande gate. Den är utforskningsfas.

---

## Nästa steg

Fas A går att göra riskfritt på ~1h. Fas B+C kräver mätning av verklig latens mot produktion. Vänta på explicit go för fas B.
