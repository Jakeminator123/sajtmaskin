# Aktiva planer

Router till arbete som fortfarande kan styra nya ändringar. Levererat →
[`../avklarat/`](../avklarat/); parkerat → [`../archived/`](../archived/);
full historik → git. Livscykel:
[`plan-lifecycle.mdc`](../../../.cursor/rules/plan-lifecycle.mdc).
Buggar/beslut → [`BUG-SWARM-BACKLOG.md`](../../../BUG-SWARM-BACKLOG.md) —
kopiera inte kön hit.

**Nästa agent startar här:**
[`BUG-SWARM-BACKLOG.md`](../../../BUG-SWARM-BACKLOG.md).
Vågschemat 20 aug är avklarat. Ta en rad ur `## Aktiv kö`, inte en planmapp.

## Pågående spår

| Spår | Vad | Styrdokument |
|---|---|---|
| Bug-kö | **Start här.** 23 öppna rader efter stängningen 21 aug. | [`BUG-SWARM-BACKLOG.md`](../../../BUG-SWARM-BACKLOG.md) |
| Live-review `SM-070` | `#1052` **mergad** som advisory bakom avstängd flagga. Kvar: aktiveringsgrinden (retention, idempotens, ärlig befogenhet). | [`2026-08-20-live-review/00-master-plan.md`](2026-08-20-live-review/00-master-plan.md) |
| Dossier-förenkling | Steg 1 landat (#1045). D2 → D3 → D4 strikt sekventiellt, D5 väntar ägarbeslut. | [`2026-08-19-dossier-forenkling/00-master-plan.md`](2026-08-19-dossier-forenkling/00-master-plan.md) |
| Briefing + Källpaket | Landat: B1–B3, B8–B11, docs/etiketter, B2 #1079. N2 avgjort. N1-backlograden stängs i #1082. Orörda: B4–B7. **Blockerat av ägarbeslut** N3–N5. | [`2026-08-18-briefing-och-kallpaket/00-master-plan.md`](2026-08-18-briefing-och-kallpaket/00-master-plan.md) |

Vågschemat 20 aug (#1070–#1081) är levererat — se
[`../avklarat/README.md`](../avklarat/README.md). Skicka ingen agent på de
PR:erna igen.

Nattens kodvågor 19–20 augusti (#1053–#1068) är likaså levererade.

Två poster ur #1045:s «utanför scope»-lista är **avgjorda mot** och ska inte
byggas: knappen «Bygg integrationer» stannar, och 480-teckenkapningen är ett
skydd mot att «Avoid» svälts — inte en defekt. Se
[`docs/decisions/README.md`](../../decisions/README.md).

Välj nästa konkreta defekt, repro, ägarbeslut eller skuld ur
[`BUG-SWARM-BACKLOG.md`](../../../BUG-SWARM-BACKLOG.md) och skapa först då en
smal aktiv plan om arbetet behöver mer än backloggraden.

## Ägarbeslut

Fattade: [`docs/decisions/README.md`](../../decisions/README.md).
Öppna: [`BUG-SWARM-BACKLOG.md`](../../../BUG-SWARM-BACKLOG.md) § Väntar på
ägarbeslut, plus briefing N3–N5.

## När en plan är klar

Väv in en rad i [`../avklarat/README.md`](../avklarat/README.md) och radera
detaljfilen (git = arkiv). Behåll egen fil bara om kod, contract eller
`*.stability.test.ts` citerar den. Svansar → restlistan eller backlog — aldrig
kvar som “pågående” huvudspår.
