# P03: Deep brief som default för första freeform-generering

## Problem

När deep brief används (t.ex. FlowBoard-testet) blir scaffoldvalet rätt,
autofix-fixarna färre och preflight passerar rent. Men deep brief aktiveras
bara om användaren explicit väljer det. Första freeform-prompten går utan.

## Mål

Tvinga `forceDeepBrief: true` vid första freeform-generering, så att
scaffoldval och kontextuppbyggnad blir robustare out-of-the-box.

## Filer att ändra

- `src/app/builder/useBuilderPromptActions.ts` (~rad 242-244)
  - `applyDynamicInstructionsForNewChat` skickar `forceDeepBrief: promptAssistDeep`.
  - Ändra till: `forceDeepBrief: promptAssistDeep || isFirstPrompt` (eller liknande).
  - Villkoret "isFirstPrompt" kan baseras på att det är `newChat` + freeform-flöde.

- `src/lib/hooks/usePromptAssist.ts` (~rad 427-430)
  - `useDeepBrief = !options.forceShallow && (options.forceDeepBrief === true || resolvedGatewayDeep)`.
  - Behöver troligen inte ändras om `forceDeepBrief` sätts rätt uppströms.

## Risker

- Latens: deep brief gör ett extra LLM-anrop (`/api/ai/brief`). Acceptabelt
  för första prompten men inte för varje follow-up.
- Kontrollera att `forceShallow` fortfarande vinner om det sätts explicit.

## Verifiering

- Starta ny freeform-generering utan att aktivera deep brief manuellt.
- Verifiera i nätverkspanelen att `/api/ai/brief` anropas.
- Jämför scaffoldval och autofix-utfall med/utan deep brief.

## Status

**Klar.** `forceDeepBrief: true` sätts vid ny chat i `useBuilderPromptActions.ts`.
Typecheck rent.

## Prioritet

Hög — direkt påverkan på genereringskvalitet vid första prompten.
