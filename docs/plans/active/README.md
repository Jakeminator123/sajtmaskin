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
| Sanering och uppdelning (10 steg) | [`2026-08-01-sanering-och-uppdelning/00-master-plan.md`](2026-08-01-sanering-och-uppdelning/00-master-plan.md) | Steg 0–3 klara (inkl. Redis bucket-städ #825). Megafil-våg i #817–#838: `audit` #822, `deployments` #821, `template-generator` #818, `scaffold_lifecycle` #826, `shared.py` #837 (+ tidigare #722/#724/#727). **Planen är inte klar** — tretton filer kvar över ~1 200-taket; steg 7–9 orörda | **Kvar: docs våg 3, resten av megafilerna (se [`04-megafiler.md`](2026-08-01-sanering-och-uppdelning/04-megafiler.md)), binärer/embeddings (steg 7 — fortfarande `git ls-files`-spårade), historik-omskrivning (steg 8, ägar-OK) och dependency-katalog-JSON (steg 9).** Steg 10 (produktbenchmark) ej påbörjad |
| Hydration-fel och reparationskedjan | [`2026-08-05-hydration-reparationskedja/00-master-plan.md`](2026-08-05-hydration-reparationskedja/00-master-plan.md) | Plan skriven 2026-08-05 efter förundersökning i två agentpass (kod friad, detektor-/scaffold-/promptluckor filverifierade). Steg 1–2 levererade via PR #777 (mergad); steg 3 (browser-fel → error-log) levererat via PR #778 (mergad) | Steg 4 (RepairGate-koppling) väntar på steg 3-data; steg 5 (patch-lane settle) väntar på live-repro på Fly |
| Generationslatens | [`2026-08-05-generationslatens/00-master-plan.md`](2026-08-05-generationslatens/00-master-plan.md) | Plan skriven 2026-08-05 på prod-mätning av fyra versioner: strömmen är 79–99 % av **strömfönstret** (inte av hela väntan — brief och orkestrering ligger före mätankaret), bildhämtning kostar noll, och verifierns 69 s var trippel-gatead av BuildSpec-klassningen. **Steg 1 levererat** (#792): `meta` i telemetri-kinden, `meta.streamMs` direktmätt, `materialize_images`-fasen registreras — låst av runner-test. **Steg 2 klart** (#795): klassningen är **befogad** (multipage→premium, score≥3→heavy, ingen tröskeländring), och brief + orkestrering ligger **före** mätankaret så totalerna underskattar användarens väntan | **Kvar är två ägarbeslut.** Steg 3: ska en F2-preview köra ett 69 s LLM-pass alls när RenderGate ägs av klienten? Steg 4 (parallell codegen) är en beslutspunkt som kräver ägar-OK. Vill ägaren pröva en lägre `heavy`-andel finns spaken redan som env — ingen kodändring |
| Loggindex: sökvägsägare före omdöpning | [`2026-08-02-loggindex-sokvagsagare/00-master-plan.md`](2026-08-02-loggindex-sokvagsagare/00-master-plan.md) | Plan skriven 2026-08-02, alla sju konstruktionsställen grep-verifierade. Inget steg påbörjat | **[`01-konsolidera-sokvagsagare.md`](2026-08-02-loggindex-sokvagsagare/01-konsolidera-sokvagsagare.md) kan tas när som helst** — ren refaktorering, inga filer flyttas. [`02-omdopning.md`](2026-08-02-loggindex-sokvagsagare/02-omdopning.md) är blockerad på MVP-leverans + ägarens namnbeslut (lever mappen vidare alls?) |
| Prod-körningens fynd — fokus dossiers | [`2026-08-05-prodkorning-dossiers/00-master-plan.md`](2026-08-05-prodkorning-dossiers/00-master-plan.md) | Diagnos 2026-08-05 + dossier-förenkling indexerad i [`../avklarat/README.md`](../avklarat/README.md). **Dossier-spårets defekter är stängda:** A1 (MapLibre) i #828, A3/SM-023 (stale verifier-dom) i #839 och A4/SM-024 (diagnosticOnly-repair) i #842 — arkivrader i [`../avklarat/bug-swarm/backlog-arkiv-2026-07-25.md`](../avklarat/bug-swarm/backlog-arkiv-2026-07-25.md) | **Kvar:** A5 (typecheck-advisory, ägarbeslut), `02` (OpenClaw auto-send = `SM-026`, postcheck-racet = `SM-025` — bor i backloggen) och `03` (ägarens UX-punkter, kräver go per punkt under MVP-frysen) |
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
