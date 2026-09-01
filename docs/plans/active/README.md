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
| Bug-kö | **Start här.** 7 aktiva rader. `SM-014`, `SM-015`, `SM-018`, `SM-032`, `SM-038` och `SM-040` är arkiverade med mergebevis; `SM-007`/`SM-070` redovisas separat som flaggade releaseblockerare och `SM-071` väntar ny repro efter senare scaffoldändringar. | [`BUG-SWARM-BACKLOG.md`](../../../BUG-SWARM-BACKLOG.md) |
| Verifieringsflöde + inspector | Kod: #1232 (sessionsrotation), #1234 (core-dump + infra-retry + Degraderad-autofix), #1237 (sanningsraden bort, öppen). Host `SM-073` = Fly v59. Kvar: prod-burst (checklista B), `SM-070`-beslut, UX-svans (checklista F). | [`2026-09-01-verifieringsflode-och-inspector/00-master-plan.md`](2026-09-01-verifieringsflode-och-inspector/00-master-plan.md) |
| Live-review `SM-070` | Grant och atomisk claim/cache landade i #1089/#1098; flaggan är av. Kvar före Preview: beständig betald attempt-budget över persistfel/abandon, overwrite-säker Blob-retry, schemalagd 7d-purge, chat-delete-hook samt omprövning och eventuell portning av godkänd relevant #1116-överlapp. #1116 behöver inte mergas. Production kräver separat ägaråtgärd. | [`2026-08-20-live-review/00-master-plan.md`](2026-08-20-live-review/00-master-plan.md) + [`01-preview-smoke.md`](2026-08-20-live-review/01-preview-smoke.md) |
| Dossier-förenkling | Produktflödet manuellt accepterat 2026-08-22. D1 landat (#1045); D2 → D3 → D4 är kvarvarande kvalitets-/arkitektursteg och körs strikt sekventiellt. D5 väntar ägarbeslut. | [`2026-08-19-dossier-forenkling/00-master-plan.md`](2026-08-19-dossier-forenkling/00-master-plan.md) |
| Briefing + Källpaket | B4 första passet landat via K1 #1094. B5 är körbar. B6 steg 1 är körbart; steg 2 väntar N4. B7 väntar N5. N1 stängd 2026-08-20, N2 (Källpaket) stängd 2026-08-21. **Öppet ägarbeslut:** N3, N4, N5. | [`2026-08-18-briefing-och-kallpaket/00-master-plan.md`](2026-08-18-briefing-och-kallpaket/00-master-plan.md) |

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
