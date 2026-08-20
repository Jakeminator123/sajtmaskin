# Aktiva planer

Router till arbete som fortfarande kan styra nya ändringar. Levererat →
[`../avklarat/`](../avklarat/); parkerat → [`../archived/`](../archived/);
full historik → git. Livscykel:
[`plan-lifecycle.mdc`](../../../.cursor/rules/plan-lifecycle.mdc).
Buggar/beslut → [`BUG-SWARM-BACKLOG.md`](../../../BUG-SWARM-BACKLOG.md) —
kopiera inte kön hit.

**Nästa agent startar här:**
[`2026-08-20-vagschema/00-master-plan.md`](2026-08-20-vagschema/00-master-plan.md).
Den äger körordningen, samtidigheten och agentkontraktet för allt annat i den
här mappen.

## Pågående spår

| Spår | Vad | Styrdokument |
|---|---|---|
| Vågschema 20 aug | **Start här.** Tre vågor av verifierade masterdefekter och sanningsytor, plus vem som får köra samtidigt. | [`2026-08-20-vagschema/00-master-plan.md`](2026-08-20-vagschema/00-master-plan.md) |
| Live-review `SM-070` | `#1052` **mergad** 2026-08-20 som advisory bakom avstängd flagga. Kvar: aktiveringsgrinden (retention, idempotens, ärlig befogenhet). | [`2026-08-20-live-review/00-master-plan.md`](2026-08-20-live-review/00-master-plan.md) |
| Dossier-förenkling | Steg 1 landat (#1045). D2 → D3 → D4 strikt sekventiellt, D5 väntar ägarbeslut. Löper parallellt med vågorna. | [`2026-08-19-dossier-forenkling/00-master-plan.md`](2026-08-19-dossier-forenkling/00-master-plan.md) |
| Briefing + Källpaket | Landat: B1 #1040, B3 #1035, B8 #1032, B9 #1037, B10 #1038, B11 #1042, docs/etiketter #1036/#1041. Orörda: B2, B4–B7. **Blockerat av ägarbeslut** N1-resten och N2–N5. | [`2026-08-18-briefing-och-kallpaket/00-master-plan.md`](2026-08-18-briefing-och-kallpaket/00-master-plan.md) |

Nattens kodvågor 19–20 augusti (#1053–#1068) är levererade och deras plantext är
raderad — se [`../avklarat/README.md`](../avklarat/README.md). Skicka ingen agent
på de PR:erna igen.

Ärlig-status-vågorna 1–2 och Block/Marknadsblock är levererade — se samma index.
Kvarvarande T3, T9b och T11 samt shadcnblocks-livebevis ligger i
[`BUG-SWARM-BACKLOG.md`](../../../BUG-SWARM-BACKLOG.md).

Två poster ur #1045:s «utanför scope»-lista är **avgjorda mot** och ska inte
byggas: knappen «Bygg integrationer» stannar, och 480-teckenkapningen är ett
skydd mot att «Avoid» svälts — inte en defekt. Se
[`docs/decisions/README.md`](../../decisions/README.md).

Välj nästa konkreta defekt, repro, ägarbeslut eller skuld ur
[`BUG-SWARM-BACKLOG.md`](../../../BUG-SWARM-BACKLOG.md) och skapa först då en
smal aktiv plan om arbetet behöver mer än backloggraden.

## Ägarbeslut

Fattade: [`docs/decisions/README.md`](../../decisions/README.md).
Öppna: [`BUG-SWARM-BACKLOG.md`](../../../BUG-SWARM-BACKLOG.md) samt tabellen
«Ägarbeslut — fråga, implementera inte» i vågschemat.

## När en plan är klar

Väv in en rad i [`../avklarat/README.md`](../avklarat/README.md) och radera
detaljfilen (git = arkiv). Behåll egen fil bara om kod, contract eller
`*.stability.test.ts` citerar den. Svansar → restlistan eller backlog — aldrig
kvar som “pågående” huvudspår.
