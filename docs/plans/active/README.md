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
| Builder-runtimeens robusthet | [`2026-07-13-builder-runtime-robusthet.md`](2026-07-13-builder-runtime-robusthet.md) | Brus + mallfix (C1, C2, D1/#578) samt **A1 + A2** levererade — 500-stormens självförstärkning är stängd | A3: mät `pg_stat_activity` innan poolstorleken ändras; sedan B (error-log-retry) + A4 (redeploy-paus) |
| Innehållsrevision för verdikt och kvitton | [`2026-07-25-innehallsrevision-verifieringskvitton.md`](2026-07-25-innehallsrevision-verifieringskvitton.md) | Oimplementerad; absorberade stabiliseringsplanens PR 5. De tre besluten är tagna 2026-07-28 → **inte längre blockerad** | Steg 1–2: `files_revision` (innehållshash) + `files_updated_at` som additiv migration, stämpla verdikten. Steg 3 väntar på mätdata |
| Dossier/UI-ownership (chatt-yta) | [`2026-07-13-dossier-ui-ownership-kontrakt.md`](2026-07-13-dossier-ui-ownership-kontrakt.md) | Helt öppen — inget adapt-eller-ersätt-kontrakt finns i kod | Kontrakt i dossier-injektionen + regressionstestet som låser incidentsekvensen |
| Restlista: builder-UI, F3-scope, env | [`2026-07-27-restlista-builder-f3-env.md`](2026-07-27-restlista-builder-f3-env.md) | 10 små oberoende rader, inga öppna frågor kvar | Plocka fritt; R1 har nu ett beslut (diskret diagnostik-länk) |
| Backoffice (Byggstenar + stringens-städ) | [`2026-07-24-backoffice-byggstenar/00-master-plan.md`](2026-07-24-backoffice-byggstenar/00-master-plan.md) | Fas A klar (#615); etapp 2–7 öppna | Baseline-backupen först — den är dataförlust på ospårade filer |

## Ägarbeslut — avgjorda 2026-07-28

Kön "väntar på ägarbeslut" är tom. Besluten togs av agent på ägarens uttryckliga
delegation och står i sin respektive plan med motivering — de är arbetsbara, inte
detaljratificerade. Vänd ett beslut fritt, men gör det där det står, inte här.

| Fråga | Beslut | Var motiveringen står |
| --- | --- | --- |
| Fail-closed vid revisions-mismatch? | Mismatchat verdikt **kastas i båda riktningar**; bara **känd** mismatch blockerar promote, saknad revision är fail-open | [innehållsrevision § Beslutspunkter](2026-07-25-innehallsrevision-verifieringskvitton.md) |
| `files_revision`: hash eller räknare? | **Hash, genererad av Postgres** (`md5(files_json)`) — ingen skrivare kan glömma den | samma |
| Steg 1–2 separat från steg 3? | **Ja** — additivt först, beteende sen | samma |
| ReleaseGate-bannern: noll spår eller diskret länk? | **Diskret diagnostik-länk** (noll spår gör UI:t osant) | [restlistan R1](2026-07-27-restlista-builder-f3-env.md) |
| Fas D: egna workload-poster i manifestet? | **Godkänt** — tre separata poster, ingen sammanslagning | [Byggstenar Fas D](2026-07-24-backoffice-byggstenar/aktiviteter/04-fas-d-ai-modellval.md) |
| Vad ska tokenmätningen användas till? | Internt kostnadsunderlag, **inte** debitering: diamonds förblir fast pris per åtgärd; sekundära ytor mäts när de börjar debitera; OpenClaw/D-ID redovisas separat | [`scripts/observability/README.md`](../../../scripts/observability/README.md) § Vad mätningen är till för |

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
