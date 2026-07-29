# Aktiva planer

Router till arbete som fortfarande kan styra nya ändringar. Levererad status,
avslutade checklistor och beslutshistorik hör till [`../avklarat/`](../avklarat/),
[`../archived/`](../archived/) eller git.

Hela ytan kodverifierades mot master `3b419115` den **2026-07-27**. Sex planer
vars kärna var levererad togs bort och indexerades i
[`../avklarat/README.md`](../avklarat/README.md); deras svansar samlades i
restlistan nedan. **2026-07-28 (#639)** gick samma väg för restlistans
R1–R4 + R6 och för dossier/UI-ownership-planen, vars enda kvarvarande halva är
ett ägarbeslut (restlistans R11). Planlivscykeln ägs av
[`plan-lifecycle.mdc`](../../../.cursor/rules/plan-lifecycle.mdc). Defekter och
repro-status ägs av [`BUG-SWARM-BACKLOG.md`](../../../BUG-SWARM-BACKLOG.md);
kopiera inte dess kö hit.

## Pågående spår

| Spår | Plan | Läge | Nästa steg |
| --- | --- | --- | --- |
| Builder-runtimeens robusthet | [`2026-07-13-builder-runtime-robusthet.md`](2026-07-13-builder-runtime-robusthet.md) | C1, C2, D1/#578, **A1 + A2**, **A3:s mätning**, **B** och **D2**/#639 levererade — bara A4 är kod som återstår | Läs pool-siffrorna vid nästa pool-händelse i prod och vrid först då `POSTGRES_POOL_MAX`; sedan A4 (redeploy-paus), som stänger planen |
| Innehållsrevision för verdikt och kvitton | [`2026-07-25-innehallsrevision-verifieringskvitton.md`](2026-07-25-innehallsrevision-verifieringskvitton.md) | Oimplementerad; absorberade stabiliseringsplanens PR 5. De tre besluten är tagna 2026-07-28 → **inte längre blockerad** | Steg 1–2: `files_revision` som DB-genererad `md5(files_json)` (ingen skrivare rörs; `files_updated_at` struken), stämpla verdikten. Steg 3 väntar på mätdata |
| Restlista: builder-UI, F3-scope, env | [`2026-07-27-restlista-builder-f3-env.md`](2026-07-27-restlista-builder-f3-env.md) | R1–R4 + R6 levererade (#639), R11 avgjord och R10 körd som prod-canary 2026-07-29 (R1/R2/R4 verifierade skarpt); fyra rader kvar | Plocka fritt bland R7–R9. R5 är blockerad tills verbatim-exportvägen trådar env-scope |
| Backoffice (Byggstenar + stringens-städ) | [`2026-07-24-backoffice-byggstenar/00-master-plan.md`](2026-07-24-backoffice-byggstenar/00-master-plan.md) | Fas A klar (#615), baseline-backupen klar 2026-07-28 — dataförlustrisken är stängd; etapp 3–7 öppna | Fas B (trygg create/edit för scaffold + variant) |

## Ägarbeslut — avgjorda 2026-07-28

Kön "väntar på ägarbeslut" är tom. Utom den sista raden togs besluten av agent på
ägarens uttryckliga delegation och står i sin respektive plan med motivering — de är
arbetsbara, inte detaljratificerade. Vänd ett beslut fritt, men gör det där det står,
inte här.

| Fråga | Beslut | Var motiveringen står |
| --- | --- | --- |
| Fail-closed vid revisions-mismatch? | Mismatchat verdikt **kastas i båda riktningar**; bara **känd** mismatch blockerar promote, saknad revision är fail-open | [innehållsrevision § Beslutspunkter](2026-07-25-innehallsrevision-verifieringskvitton.md) |
| `files_revision`: hash eller räknare? | **Hash, genererad av Postgres** (`md5(files_json)`) — ingen skrivare kan glömma den | samma |
| Steg 1–2 separat från steg 3? | **Ja** — additivt först, beteende sen | samma |
| ReleaseGate-bannern: noll spår eller diskret länk? | **Diskret diagnostik-länk** (noll spår gör UI:t osant) — implementerad 2026-07-28 (#639) | [`../avklarat/README.md`](../avklarat/README.md) § Restlistan |
| Fas D: egna workload-poster i manifestet? | **Godkänt** — tre separata poster, ingen sammanslagning | [Byggstenar Fas D](2026-07-24-backoffice-byggstenar/aktiviteter/04-fas-d-ai-modellval.md) |
| Vad ska tokenmätningen användas till? | Internt kostnadsunderlag, **inte** debitering: diamonds förblir fast pris per åtgärd; sekundära ytor mäts när de börjar debitera; OpenClaw/D-ID redovisas separat | [`scripts/observability/README.md`](../../../scripts/observability/README.md) § Vad mätningen är till för |
| Ska en LLM-byggd konkurrerande yta raderas automatiskt när en dossier tar över samma capability? (R11) | **Nej** — prompt-prevention + Advisory är slutläget. Beslut av **ägaren själv** 2026-07-28: ett `REPLACES:`-utdataprotokoll skulle radera användarfiler vid felaktig deklaration, alltså dataförlust mot mindre brus | [restlistan § R11](2026-07-27-restlista-builder-f3-env.md) + [`BUG-SWARM-BACKLOG.md`](../../../BUG-SWARM-BACKLOG.md) § Beslut & policy |

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
