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
| Briefing + Källpaket | Ett namn för lagret före kodgeneratorn, bort med det förbikopplade prompt-addendumet, kvitto på vilka källor som faktiskt nådde prompten, kuration av 69 ogranskade variant-addenda och mätning av den betalda shadcnblocks-nyckeln. Väntar på ägarbeslut N1 (namnet) och N4 (mäta, därefter ev. bevarande Ändringsbrief för `clear-refine` bakom flagga — inte grindbredd av redesign-vägen). | [`2026-08-18-briefing-och-kallpaket/00-master-plan.md`](2026-08-18-briefing-och-kallpaket/00-master-plan.md) |

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
