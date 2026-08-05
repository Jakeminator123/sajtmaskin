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
rad i indexet. Planlivscykeln ägs av
[`plan-lifecycle.mdc`](../../../.cursor/rules/plan-lifecycle.mdc). Defekter och
repro-status ägs av [`BUG-SWARM-BACKLOG.md`](../../../BUG-SWARM-BACKLOG.md);
kopiera inte dess kö hit.

## Pågående spår

| Spår | Plan | Läge | Nästa steg |
| --- | --- | --- | --- |
| Restlista: builder-UI, F3-scope, env | [`2026-07-27-restlista-builder-f3-env.md`](2026-07-27-restlista-builder-f3-env.md) | Fyra rader kvar 2026-08-05: R14 släpptes i alla Vercel-miljöer (ägarbeslut 2026-08-04) och R15 levererades i samma PR (batchad revisionsläsning i `/versions`) — båda indexerade i [`../avklarat/README.md`](../avklarat/README.md) | **R8:s aktiverings-E2E** kan tas efter minibeslutet stub vs riktig nyckel. R5 och R12 är blockerade på annat än tid; R13 är en prod-observation (läs pool-raden vid nästa 503-händelse) |
| Sanering och uppdelning (10 steg) | [`2026-08-01-sanering-och-uppdelning/00-master-plan.md`](2026-08-01-sanering-och-uppdelning/00-master-plan.md) | Steg 0–3 levererade (mergestyr, sex false-green-fixar #712–#725, Redis-dödkod #714, devDeps #717), dokumentstädning våg 1–2 (#713/#721) och tre megafiler (#722/#724/#727) klara — statusläge per steg i master-planen, verifierat 2026-08-04 | **Kvar: docs våg 3, testtaxonomi-/CI-sanningsfixarna, dependency-katalogen (steg 9, inventering klar), resten av megafilerna (flera växer tillbaka — se [`04-megafiler.md`](2026-08-01-sanering-och-uppdelning/04-megafiler.md)) och repo-storlek (steg 7–8).** Historik-omskrivningen (steg 8) och `_parkering/`-raderingen kräver ägar-OK |
| Hydration-fel och reparationskedjan | [`2026-08-05-hydration-reparationskedja/00-master-plan.md`](2026-08-05-hydration-reparationskedja/00-master-plan.md) | Plan skriven 2026-08-05 efter förundersökning i två agentpass (kod friad, detektor-/scaffold-/promptluckor filverifierade). Steg 1–2 levererade via PR #777 (mergad); steg 3 (browser-fel → error-log) levererat via PR #778 (mergad) | Steg 4 (RepairGate-koppling) väntar på steg 3-data; steg 5 (patch-lane settle) väntar på live-repro på Fly |
| Generationslatens | [`2026-08-05-generationslatens/00-master-plan.md`](2026-08-05-generationslatens/00-master-plan.md) | Plan skriven 2026-08-05 på prod-mätning av fyra versioner: strömmen är 79–99 % av **strömfönstret** (inte av hela väntan — brief och orkestrering ligger före mätankaret), bildhämtning kostar noll, och verifierns 69 s var trippel-gatead av BuildSpec-klassningen. **Steg 1 levererat** (#792): `meta` i telemetri-kinden, `meta.streamMs` direktmätt, `materialize_images`-fasen registreras — låst av runner-test. **Steg 2 klart** (#795): klassningen är **befogad** (multipage→premium, score≥3→heavy, ingen tröskeländring), och brief + orkestrering ligger **före** mätankaret så totalerna underskattar användarens väntan | **Kvar är två ägarbeslut.** Steg 3: ska en F2-preview köra ett 69 s LLM-pass alls när RenderGate ägs av klienten? Steg 4 (parallell codegen) är en beslutspunkt som kräver ägar-OK. Vill ägaren pröva en lägre `heavy`-andel finns spaken redan som env — ingen kodändring |
| Loggindex: sökvägsägare före omdöpning | [`2026-08-02-loggindex-sokvagsagare/00-master-plan.md`](2026-08-02-loggindex-sokvagsagare/00-master-plan.md) | Plan skriven 2026-08-02, alla sju konstruktionsställen grep-verifierade. Inget steg påbörjat | **[`01-konsolidera-sokvagsagare.md`](2026-08-02-loggindex-sokvagsagare/01-konsolidera-sokvagsagare.md) kan tas när som helst** — ren refaktorering, inga filer flyttas. [`02-omdopning.md`](2026-08-02-loggindex-sokvagsagare/02-omdopning.md) är blockerad på MVP-leverans + ägarens namnbeslut (lever mappen vidare alls?) |

## Ägarbeslut — ratificerade 2026-07-30

Kön "väntar på ägarbeslut" är tom. Besluten nedan togs av agent på ägarens
delegation och **ratificerades av ägaren 2026-07-30** ("jag godkänner alt") — de
är alltså inte längre bara arbetsbara. Vänd ett beslut fritt om verkligheten
säger något annat, men gör det där motiveringen står, inte här.

| Fråga | Beslut | Var motiveringen står |
| --- | --- | --- |
| Fail-closed vid revisions-mismatch? | Mismatchat verdikt **kastas i båda riktningar**; bara **känd** mismatch blockerar promote, saknad revision är fail-open | [`../avklarat/README.md`](../avklarat/README.md) § Innehållsrevision (plantexten i git) |
| `files_revision`: hash eller räknare? | **Hash, genererad av Postgres** (`md5(files_json)`) — ingen skrivare kan glömma den | samma |
| Steg 1–2 separat från steg 3? | **Ja** — additivt först, beteende sen | samma |
| ReleaseGate-bannern: noll spår eller diskret länk? | **Diskret diagnostik-länk** (noll spår gör UI:t osant) — implementerad 2026-07-28 (#639) | [`../avklarat/README.md`](../avklarat/README.md) § Restlistan |
| Fas D: egna workload-poster i manifestet? | **Godkänt** — tre separata poster, ingen sammanslagning. **Levererat 2026-07-29**; posternas `notes`-fält i `config/ai_models/manifest.json` bär numera motiveringen | [`../avklarat/README.md`](../avklarat/README.md) § Backoffice Byggstenar |
| Vad ska tokenmätningen användas till? | Internt kostnadsunderlag, **inte** debitering: diamonds förblir fast pris per åtgärd; sekundära ytor mäts när de börjar debitera; OpenClaw/D-ID redovisas separat | [`scripts/observability/README.md`](../../../scripts/observability/README.md) § Vad mätningen är till för |
| Ska en LLM-byggd konkurrerande yta raderas automatiskt när en dossier tar över samma capability? (R11) | **Nej** — prompt-prevention + Advisory är slutläget. Beslut av **ägaren själv** 2026-07-28: ett `REPLACES:`-utdataprotokoll skulle radera användarfiler vid felaktig deklaration, alltså dataförlust mot mindre brus | [`BUG-SWARM-BACKLOG.md`](../../../BUG-SWARM-BACKLOG.md) § Beslut & policy — där hela motiveringen bor sedan restlistans R11-avsnitt trimmades bort 2026-07-30 |
| Vad ska en generationsrad påstå när ett provider-fel passerade men körningen slutade som avsett? | **Utfallet, inte det värsta ögonblicket.** En återhämtad 429 får inte skriva `success=false`: flaggan scopas per försök och provider-fault-raden skrivs bara när körningen faktiskt föll på provider-felet. Blippen ska synas som retry/Advisory. Credit-beteendet är oförändrat — det är redan rätt | [`BUG-SWARM-BACKLOG.md`](../../../BUG-SWARM-BACKLOG.md) → `providerFault`-raden |

## Andra aktiva sanningar

- Buggar och policybeslut: [`BUG-SWARM-BACKLOG.md`](../../../BUG-SWARM-BACKLOG.md)
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
