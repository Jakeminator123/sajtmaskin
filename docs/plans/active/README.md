# Aktiva planer

Router till arbete som fortfarande kan styra nya ändringar. Levererat →
[`../avklarat/`](../avklarat/); parkerat → [`../archived/`](../archived/);
full historik → git. Livscykel:
[`plan-lifecycle.mdc`](../../../.cursor/rules/plan-lifecycle.mdc).
Buggar/beslut → [`BUG-SWARM-BACKLOG.md`](../../../BUG-SWARM-BACKLOG.md) —
kopiera inte kön hit.

## Pågående spår

- [`nattbatch-2026-08-14-restlista.md`](nattbatch-2026-08-14-restlista.md)
  (2026-08-14) — vad nattens åtta PR:er levererade, vad som byggs just nu, vad
  som väntar på ägarbeslut och vad som är post-MVP. Översikt, inte defektkö.
- [`handoff-question-flow-and-scaffold-routes.md`](handoff-question-flow-and-scaffold-routes.md)
  (2026-08-13) — kontext för tre spår: var buildern ställer frågor, varför
  scaffoldernas navigering länkar till rutter planeraren inte garanterar, och att
  struktur och domän delar samma val i scaffold-matchningen. Spår B och C väntar
  på ägarbeslut. Backloggraderna äger defekterna; filen äger bakgrunden.

Välj annars nästa konkreta defekt, repro, ägarbeslut eller skuld ur
[`BUG-SWARM-BACKLOG.md`](../../../BUG-SWARM-BACKLOG.md) och skapa först då en
smal aktiv plan om arbetet behöver mer än backloggraden.

## Ägarbeslut

Fattade: [`docs/decisions/README.md`](../../decisions/README.md).
Öppna: [`BUG-SWARM-BACKLOG.md`](../../../BUG-SWARM-BACKLOG.md).

## När en plan är klar

Väv in en rad i [`../avklarat/README.md`](../avklarat/README.md) och radera
detaljfilen (git = arkiv). Behåll egen fil bara om kod, contract eller
`*.stability.test.ts` citerar den. Svansar → restlistan eller backlog — aldrig
kvar som “pågående” huvudspår.
