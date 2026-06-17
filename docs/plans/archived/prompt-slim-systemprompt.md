---
id: prompt-slim-systemprompt
status: active
created: 2026-04-30
linear: null
parent: 2026-04-28-llm-flode-startlinje
supersedes: null
---

# Systemprompt-Kapning Utan Ny Komplexitet

## Roll efter doc-konsolidering 2026-05-01

Den här filen är **child-planen för promptbudget** under [`2026-04-28-llm-flode-startlinje.md`](./2026-04-28-llm-flode-startlinje.md). Startlinjen äger prioritering och agentfördelning; den här planen äger bara konkret kapning av Core Rules, Dynamic Context, follow-up-kontext och dossier-rendering.

Avgränsning:

- Skapa inte ett nytt promptlager, ny promptmodul eller parallell policyfil.
- Ändra inte follow-up-output-kontraktet från hela filer till diffs/snippets i denna plan. "Target files only" är en möjlig senare kontraktsändring, inte en prompt-slim quickfix.
- Duplicera inte F2/F3 env/readiness eller UX-status här; länka till startlinjens P4e/P4f.

Backlog-koppling: U#47, G#13, G#25, G#26 och G#57.

## Status 2026-04-30

Planen ska inte stängas än. Det mesta av infrastrukturen är genomfört, men promptmålen är inte nådda.

Genomfört:

- Budget-telemetri finns i `GenerationInputPackage`, prompt-dumps och evalrapport: static/dynamic, budget, dropped blocks och största block.
- `Selected Dossier Instructions` renderas kompakt som default; verbatim-filer fortsätter ligga i separat exakt block.
- `visual-3d`/`physics-3d`-splitten finns redan; dekorativ `visual-3d` ska inte dra Rapier/Physics-text annat än vid explicit physics-intent.
- Normal follow-up som inte är `clear-redesign` och inte `contextPolicy: "heavy"` renderar nu kompakt `Scaffold Variant`, `Your Toolkit` och `Route Plan`; clear-redesign och heavy-context behåller full context.
- "Lessons from similar past builds" är kapad till topp-3 och 600 chars; relaterad recurring-failures-testmock pekar nu på rätt reader-modul.
- Fokuserade tester passerar: prompt-size metrics, eval report, dossier rendering, dynamic-context budgetering och follow-up-input.

Kvar:

- Core Rules är fortfarande cirka `40k+` chars i follow-up-evalen; målet är under `35k`.
- Follow-up-evalen passerar funktionellt men ligger runt `70k` total systemprompt och `29k` dynamic context; målet var normal follow-up under `45k`.
- Dynamic context ligger under hard warning `35k`, men inte under önskat `25k`.
- Senaste fulla `eval:smoke` i ursprungsplanen är äldre än den här kontrollen; kör om efter nästa kapning innan stängning.

## Nästa Smala Kapning

- Kapa/reformulera `config/prompt-core/*.md` först; sikta på minst `6k` färre chars utan ny promptmodul.
- Behåll `Brief-Locked Design Values`, `Generation Mode: Follow-Up`, file-context och capability-modify-hint som load-bearing.
- Dokumentera explicit om nästa kapning är **A: aggressiv trim inom nuvarande full-fil-kontrakt** eller **B: kontraktsändring för file-context/follow-up**. Default är A.
- Kör `npm run eval:followup`, fokuserade vitest-tester och sedan `npm run eval:smoke`.

## Originala Implementationssteg

1. Budget-telemetri som source of truth.
2. Dossier compact default.
3. Variant och layout-block caps.
4. Core Rules första kapning.
5. Follow-up delta-context.
6. 3D kontrollera, inte döpa om i onödan.

## Verifiering

```powershell
npm run typecheck
npm run lint
npx vitest run src/lib/gen/eval/runner.test.ts src/lib/gen/eval/report.test.ts
npm run eval:smoke
git diff --check
```

Acceptera inte en prompt-kapning om smoke går från PASS till FAIL eller om avg score faller utan tydlig orsak.

## Mål

- Init simple website: total prompt under `65k` chars.
- Smoke dynamic context: helst under `25k`, hård varning över `35k`.
- Selected dossier instructions: normal under `2k`, tung väg under `4k`.
- Core Rules: första fas under `35k`.
- Follow-up normal: under `45k`.
- Kvalitet: `eval:smoke` fortsatt 3/3 PASS, ingen ny blocking check.
