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
| Briefing + Källpaket | Pågår. Landat: B8 #1032, B3 #1035, B9 #1037, docs/etiketter #1036/#1041. Öppna PR:er: B1 #1040, B10 #1038, B11 #1042. Orörda: B2, B4–B7. Beslut kvar: N1-resten, N2–N5. | [`2026-08-18-briefing-och-kallpaket/00-master-plan.md`](2026-08-18-briefing-och-kallpaket/00-master-plan.md) |

Ärlig-status-vågorna 1–2 och Block/Marknadsblock är levererade — se
[`../avklarat/README.md`](../avklarat/README.md). Kvarvarande T3, T9b och T11
samt shadcnblocks-livebevis ligger i
[`BUG-SWARM-BACKLOG.md`](../../../BUG-SWARM-BACKLOG.md).

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
