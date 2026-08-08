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
rad i [`../avklarat/README.md`](../avklarat/README.md). **2026-07-31 stängdes
builder-UI-familjen från prod-observationen på samma sätt:** alla fyra
uppgiftsfiler är levererade, så plankatalogen är raderad och initiativet är en
rad i indexet. **2026-08-08 parkerades två spår till [`../archived/`](../archived/):**
generationslatens (steg 1–2 levererade via #792/#795-diagnosen; steg 3–4 är
ägarbeslut som nu bor i backloggens beslutssektion) och
hydration-reparationskedjan (steg 1–3 levererade via #777/#778; steg 4–5 är
datablockerade och bor i backloggens repro-sektion). **2026-08-08 stängdes även
saneringsinitiativet (10 steg):** de mekaniska stegen är levererade — docs
våg 3 i #853, och megafil-omtaget slutfördes samma kväll i #855–#862 (ingen
produktionsfil över ~1 200-radstaket kvar; tester/datafiler var aldrig i
planens scope) — plankatalogen är raderad och
initiativet är en rad i [`../avklarat/README.md`](../avklarat/README.md);
resterna (binärer/embeddings, filter-repo, dependency-katalog, benchmark) bor
som rader i [`BUG-SWARM-BACKLOG.md`](../../../BUG-SWARM-BACKLOG.md). Planlivscykeln ägs av
[`plan-lifecycle.mdc`](../../../.cursor/rules/plan-lifecycle.mdc). Defekter och
repro-status ägs av [`BUG-SWARM-BACKLOG.md`](../../../BUG-SWARM-BACKLOG.md);
kopiera inte dess kö hit.

## Pågående spår

| Spår | Plan | Läge | Nästa steg |
| --- | --- | --- | --- |
| Restlista: builder-UI, F3-scope, env | [`2026-07-27-restlista-builder-f3-env.md`](2026-07-27-restlista-builder-f3-env.md) | Fyra rader kvar 2026-08-05: R14 släpptes i alla Vercel-miljöer (ägarbeslut 2026-08-04) och R15 levererades i samma PR (batchad revisionsläsning i `/versions`) — båda indexerade i [`../avklarat/README.md`](../avklarat/README.md) | **R8:s aktiverings-E2E** kan tas efter minibeslutet stub vs riktig nyckel. R5 och R12 är blockerade på annat än tid; R13 är en prod-observation (läs pool-raden vid nästa 503-händelse) |
| Prod-körningens fynd — fokus dossiers | [`2026-08-05-prodkorning-dossiers/00-master-plan.md`](2026-08-05-prodkorning-dossiers/00-master-plan.md) | Diagnos 2026-08-05 + dossier-förenkling indexerad i [`../avklarat/README.md`](../avklarat/README.md). **Dossier-spårets defekter är stängda:** A1 (MapLibre) i #828, A3/SM-023 (stale verifier-dom) i #839 och A4/SM-024 (diagnosticOnly-repair) i #842 — arkivrader i [`../avklarat/bug-swarm/backlog-arkiv-2026-07-25.md`](../avklarat/bug-swarm/backlog-arkiv-2026-07-25.md) | **Kvar:** A5 (typecheck-advisory, ägarbeslut), `02`:s postcheck-race (`SM-025`, väntar prod-bevis efter #843 — `SM-026` OpenClaw auto-send stängdes i #846) och `03` (ägarens UX-punkter, kräver go per punkt under MVP-frysen) |
## Ägarbeslut

Ratificerade ägarbeslut bor i registret
[`docs/decisions/README.md`](../../decisions/README.md) — beslutshistorik hör
inte hemma i `active/`. Öppna beslutsfrågor ägs av
[`BUG-SWARM-BACKLOG.md`](../../../BUG-SWARM-BACKLOG.md); vänd ett fattat beslut
där motiveringen står, inte här.

## Andra aktiva sanningar

- Buggar och öppna beslutsfrågor: [`BUG-SWARM-BACKLOG.md`](../../../BUG-SWARM-BACKLOG.md)
- Fattade ägarbeslut: [`../../decisions/README.md`](../../decisions/README.md)
- Stoppunkter för städning och telemetrikravet före route-radering:
  [`../../documentation-lifecycle.md`](../../documentation-lifecycle.md)
- Stabil arkitektur och kontrakt: [`../../README.md`](../../README.md)

## När en plan är klar

Väv in den som en rad i [`../avklarat/README.md`](../avklarat/README.md) och
radera detaljfilen — git är fullständigt arkiv. Behåll den som egen fil bara om
källkod, contract-doc eller ett stabilitetstest citerar den. Flytta till
`../archived/` om den är parkerad eller ersatt. Lämna aldrig kvar en plan i
`active/` för en handfull svansar: lyft svansarna till restlistan och radera
planen. Uppdatera denna router i samma PR.
