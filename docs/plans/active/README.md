# Aktiva planer

Router till arbete som fortfarande kan styra nya ändringar. Levererat →
[`../avklarat/`](../avklarat/); parkerat → [`../archived/`](../archived/);
full historik → git. Livscykel:
[`plan-lifecycle.mdc`](../../../.cursor/rules/plan-lifecycle.mdc).
Buggar/beslut → [`BUG-SWARM-BACKLOG.md`](../../../BUG-SWARM-BACKLOG.md) —
kopiera inte kön hit.

## Pågående spår

| Spår | Vad | Styrdokument |
|---|---|---|
| Ärlig status | Ta bort tidsgissningar och statusflaggor som påstår mer än de mätt. Bevis: två prod-utredningar 2026-08-14 (mobilgeneration som dog tyst; preview som visade gammal kod) plus `/tmp`-svält som fällde produktkontrollen 0,9 s före runtime-ready. | [`2026-08-15-arlig-status/00-master-plan.md`](2026-08-15-arlig-status/00-master-plan.md) |

Frågeflöde- och ruttsanningsspåret levererades 2026-08-14 och ligger som en rad i
[`../avklarat/README.md`](../avklarat/README.md).

Välj nästa konkreta defekt, repro, ägarbeslut eller skuld ur
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
