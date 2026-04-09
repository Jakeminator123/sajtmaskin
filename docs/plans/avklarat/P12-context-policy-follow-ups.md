# P12: contextPolicy "light" för vanliga follow-ups

## Status

**Klar.** `inferContextPolicy` i `build-spec.ts` är nu ändrad så att
`normal` är standard för vanliga follow-ups, medan `light` bara används för
tydligt små lokala följdändringar. Riktade repair-prompter ligger kvar på minst `normal`.

`light` betyder inte sämre modell eller sämre lane. Det betyder att `BuildSpec`
får en mindre kontextbudget (`tokenBudgetsForContextPolicy`) för scaffold,
referenser och systemkontext när ändringen bedöms som liten och lokal.
Syftet är att undvika att små follow-ups drar in onödigt mycket strukturmaterial
och därmed blir dyrare eller mer benägna att "övertänka" små ändringar.

Om någon fallback/default måste väljas innan mer data finns, använd hellre
**medium-tänk** i praktiken, dvs. behåll nuvarande `light`-heuristik för
uppenbart små lokala följdändringar men var snabb att höja till `normal`
när scope eller osäkerhet ökar.

## Resultat

- `normal` används nu som säkrare standard för vanliga follow-ups.
- `light` behålls som optimering när prompten tydligt signalerar en liten, lokal ändring.
- Tester i `build-spec.test.ts` är uppdaterade och gröna.

## Filer

- `src/lib/gen/build-spec.ts` (~rad 299-303)
  - Ändra: `return "normal"` istället för `return "light"` för copy/local-layout.

## Prioritet

Låg — kräver empirisk jämförelse innan beslut.
