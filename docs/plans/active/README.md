# Aktiva planer

Router till arbete som fortfarande kan styra nya ändringar. Levererad status,
avslutade checklistor och beslutshistorik hör till [`../avklarat/`](../avklarat/),
[`../archived/`](../archived/) eller git.

Hela ytan kodverifierades mot master `3b419115` den **2026-07-27**. Sex planer
vars kärna var levererad togs bort och indexerades i
[`../avklarat/README.md`](../avklarat/README.md); deras svansar samlades i
restlistan nedan. **2026-07-28 (#639)** gick samma väg för restlistans
R1–R4 + R6 och för dossier/UI-ownership-planen, vars enda kvarvarande halva är
ett ägarbeslut (restlistans R11). **2026-07-29** gick builder-runtime-planen
samma väg: kärnan är levererad och indexerad, och dess två sista rader lever
som restlistans R12–R13. **Samma dag stängdes backoffice-spåret helt:** alla sju
etapper i Byggstenar-planen är levererade, Fas C:s manuella UI-varv är kört och
P2-6 avfärdad med skäl — plankatalogen är därför raderad och initiativet är en
rad i [`../avklarat/README.md`](../avklarat/README.md). Planlivscykeln ägs av
[`plan-lifecycle.mdc`](../../../.cursor/rules/plan-lifecycle.mdc). Defekter och
repro-status ägs av [`BUG-SWARM-BACKLOG.md`](../../../BUG-SWARM-BACKLOG.md);
kopiera inte dess kö hit.

## Pågående spår

| Spår | Plan | Läge | Nästa steg |
| --- | --- | --- | --- |
| Innehållsrevision för verdikt och kvitton | [`2026-07-25-innehallsrevision-verifieringskvitton.md`](2026-07-25-innehallsrevision-verifieringskvitton.md) | **Steg 1–2 levererade 2026-07-29** (DB-genererad `files_revision` + telemetri-stämpel), prod-verifierat 2026-07-29: 135/135 versioner har revision, telemetrin stämplas. Steg 3 väntar på mätdata | Repair-pass-stämplingen (som mätte fel) är åtgärdad i #646. Samla mismatch-frekvens med SQL:en i planen, sedan steg 3 (läsarna jämför) |
| Restlista: builder-UI, F3-scope, env | [`2026-07-27-restlista-builder-f3-env.md`](2026-07-27-restlista-builder-f3-env.md) | R1–R4 + R6 (#639), R7 + R9 + R10 + R11 klara 2026-07-29; fyra rader kvar (R5/R8 + R12/R13 från builder-runtime) | R8 och R12. R5 är blockerad tills verbatim-exportvägen trådar env-scope; R13 är en prod-observation |
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
| Fas D: egna workload-poster i manifestet? | **Godkänt** — tre separata poster, ingen sammanslagning. **Levererat 2026-07-29**; posternas `notes`-fält i `config/ai_models/manifest.json` bär numera motiveringen | [`../avklarat/README.md`](../avklarat/README.md) § Backoffice Byggstenar |
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
