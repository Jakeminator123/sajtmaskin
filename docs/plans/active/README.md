# Aktiva planer

Router till arbete som fortfarande kan styra nya ändringar. Levererad status,
avslutade checklistor och beslutshistorik hör till [`../avklarat/`](../avklarat/),
[`../archived/`](../archived/) eller git.

Hela ytan kodverifierades mot master `3b419115` den **2026-07-27**. Sex planer
vars kärna var levererad togs bort och indexerades i
[`../avklarat/README.md`](../avklarat/README.md); deras svansar samlades i
restlistan nedan. Planlivscykeln ägs av
[`plan-lifecycle.mdc`](../../../.cursor/rules/plan-lifecycle.mdc). Defekter och
repro-status ägs av [`BUG-SWARM-BACKLOG.md`](../../../BUG-SWARM-BACKLOG.md);
kopiera inte dess kö hit.

## Pågående spår

| Spår | Plan | Läge | Nästa steg |
| --- | --- | --- | --- |
| Builder-runtimeens robusthet | [`2026-07-13-builder-runtime-robusthet.md`](2026-07-13-builder-runtime-robusthet.md) | Brus + mallfix levererade (C1, C2, D1/#578); **kärnan öppen** | A1 + A2: mjuk degradering på läs-routerna och klient-backoff — det som dödar 500-stormen |
| Innehållsrevision för verdikt och kvitton | [`2026-07-25-innehallsrevision-verifieringskvitton.md`](2026-07-25-innehallsrevision-verifieringskvitton.md) | Oimplementerad; absorberade stabiliseringsplanens PR 5 | Väntar på tre ägarbeslut (se nedan) innan additiv migration |
| Dossier/UI-ownership (chatt-yta) | [`2026-07-13-dossier-ui-ownership-kontrakt.md`](2026-07-13-dossier-ui-ownership-kontrakt.md) | Helt öppen — inget adapt-eller-ersätt-kontrakt finns i kod | Kontrakt i dossier-injektionen + regressionstestet som låser incidentsekvensen |
| Restlista: builder-UI, F3-scope, env | [`2026-07-27-restlista-builder-f3-env.md`](2026-07-27-restlista-builder-f3-env.md) | 10 små oberoende rader | Plocka fritt; R1 (ReleaseGate-bannern) har en öppen fråga till ägaren |
| Backoffice (Byggstenar + stringens-städ) | [`2026-07-24-backoffice-byggstenar/00-master-plan.md`](2026-07-24-backoffice-byggstenar/00-master-plan.md) | Fas A klar (#615); etapp 2–7 öppna | Baseline-backupen först — den är dataförlust på ospårade filer |

## Väntar på ägarbeslut (kan inte kodas innan)

| Fråga | Var |
| --- | --- |
| Ska en revisions-mismatch bli fail-closed direkt, eller bara vid mismatch **plus** ett blockerande verdikt? | [innehållsrevision § Beslutspunkter](2026-07-25-innehallsrevision-verifieringskvitton.md) |
| Ska `files_revision` vara innehållshash eller monoton räknare? | samma |
| Levereras steg 1–2 separat från steg 3? (planens rekommendation: ja) | samma |
| Noll UI-spår av en underkänd ReleaseGate, eller en diskret "se diagnostik"-länk? | [restlistan R1](2026-07-27-restlista-builder-f3-env.md) |
| Fas D: egna workload-poster i `config/ai_models/manifest.json` — godkänns förslaget? | [Byggstenar Fas D](2026-07-24-backoffice-byggstenar/aktiviteter/04-fas-d-ai-modellval.md) |
| Vad ska tokenmätningen användas till? Per-token-kredit i stället för fast pris per åtgärd? Ska Sajtagentens (OpenClaw) förbrukning rapporteras tillbaka, och D-ID:s credits läsas före/efter i appen? Ska sekundära ytor (wizard, audit, analyze, transcribe, inspector) instrumenteras? | steg 1–2 levererade (#609/#613); mätningens gränser dokumenteras i [`scripts/observability/README.md`](../../../scripts/observability/README.md) |

## Andra aktiva sanningar

- Buggar och policybeslut: [`BUG-SWARM-BACKLOG.md`](../../../BUG-SWARM-BACKLOG.md)
- Dokumentationskonsolideringens status:
  [`documentation-audit-2026-07-13.md`](../../audits/documentation-audit-2026-07-13.md)
- Stabil arkitektur och kontrakt: [`../../README.md`](../../README.md)

## När en plan är klar

Väv in den som en rad i [`../avklarat/README.md`](../avklarat/README.md) och
radera detaljfilen — git är fullständigt arkiv. Behåll den som egen fil bara om
källkod, contract-doc eller ett stabilitetstest citerar den. Flytta till
`../archived/` om den är parkerad eller ersatt. Lämna aldrig kvar en plan i
`active/` för en handfull svansar: lyft svansarna till restlistan och radera
planen. Uppdatera denna router i samma PR.
