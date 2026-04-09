# P12: contextPolicy "light" för vanliga follow-ups

## Status

`inferContextPolicy` i `build-spec.ts` (~rad 289-322) sätter "light" för
copy/local-layout-follow-ups, utom om prompten matchar `TARGETED_REPAIR_PATTERNS`
(auto-fix, targeted repair, quality gate) → då "normal".

## Fråga

Räcker "light" för vanliga follow-ups, eller borde "normal" vara default?

## Datapunkter att samla

1. Kör 5-10 follow-up-prompter med "light" och "normal".
2. Jämför: scaffold-kontext, genereringskvalitet, token-förbrukning.
3. Om "normal" ger klart bättre resultat utan orimlig tokenkostnad → byt default.

## Filer

- `src/lib/gen/build-spec.ts` (~rad 299-303)
  - Ändra: `return "normal"` istället för `return "light"` för copy/local-layout.

## Prioritet

Låg — kräver empirisk jämförelse innan beslut.
