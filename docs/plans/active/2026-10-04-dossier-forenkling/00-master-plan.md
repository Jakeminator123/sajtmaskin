---
status: active
owner: Codex, på Jakobs uttryckliga uppdrag
created: 2026-10-04
---

# Dossier-förenkling — hela leveransen

## Mål och mandat

Hårda dossiers ska ge återanvändbar kod och kontext för återkommande
integrationer, utan att påtvinga ett befintligt projekt fel router, session,
datalager eller implementationsmetod. Bevara nyttig och säker kärna;
ta bort bevisat döda lager och motsägelsefull vägledning.

Jakob har gett förhandsvillkorat mandat att skapa/pusha PR:er och merga
dossierleveransen till preview efter aktuell oberoende review, required checks
och exakt deployment. Jakob har därefter tillåtit parallell scaffoldimplementation
i redan separat checkout för icke-överlappande owners; gemensam route-/finalize-
integration väntar på frigiven faktisk dossierbas. Ingen masterpromotion, ZIP-bulkimport,
installationsledger, ny agent-/LLM-fas, extern tjänst, beroendeuppgradering,
live-provideroperation eller DB-/env-/credentialändring ingår.

En skrivande session per checkout. TESTER har en separat worktree och äger
sin test-/workflowreform; dess kod blandas inte in i dossier-PR:erna.
Nya produktbeslut, osäker radering eller oväntade owners kräver ny triage.

## Faktiskt levererat och aktuell kandidat

| Etapp | Previewleverans | Bevisgräns |
|---|---|---|
| Gemensam dossierkärna, #1548 | `65e28f6097c756c9c78a54a22ae5533b81040848` | Granskad head `b765e2f38185bca51f96b861abb7217d1321cd1d`; kod-CI och deployment verifierade. |
| Gemensam integrationsvy, #1549 | `db86c053abdad696718eafad839137b8d37831d5` | Prompt-/monteringskonsumenter levererade, full CI och deployment verifierade. |
| Projektkompatibilitet, #1550 | `ff2ac650cc2d3ef37ccd1dcb3e286a0f39c6775c` | Full CI/deployment verifierade; fem sena rättningar återstår att leverera via #1551. Same-capability auto-delete avvisas enligt migrationspolicyn. |

Aktuell preview är sista raden. PR #1551 är **draft/HOLD**, inte levererad.
Publicerad head är `04729010c74c4337192a444fb11b81b693988ac6`.
Dess historiska CI var 13 039 standardtester + 126 isolerade DB-tester +
54 stabilitetstester på 10:14 (5:46 kö till fulla jobb, 4:27 aktivt);
21/21 dossierbyggen på 6:53 och exact-head Vercel READY på 1:57.
Grön CI upphäver inte tre senare native fynd: restore mot senare chatintent,
missvisande repair-hold och missad explicit removal.

Den aktuella lokala rättningsbatchen utgår från
`4a785c86659268208701ec58bc4c21e4af021e2c`. Beslutskontext-CAS, terminal
repair-stop, atomisk fresh status, begränsad retry, preserve-settlement och
status-/autoaccept-/deploykonsumenter är samlat implementerade i befintliga
owners. Konsumentreview är CLEAN. CAS-/retryreviewens readback-P1 är nu rättat:
en bevisat tillämpad, opted-in pending-reset gör inte fail/clear när dess
optional readback fallerar. Write-/schemafel och legacy defaultkontrakt
behåller sina tidigare felvägar. Worker har återlämnat skrivleasen;
nästa exakt freeze får aktuell delta-/integrationsreview. Oförändrade
verifierade bevis återanvänds endast bytebundet.
Ownertriage begränsar core-PR:n till 64 befintliga paths, inklusive nödvändiga
status-, watchdog-, klient- och after-repair-följdägare; ingen ny endpoint,
tabell eller lifecycle-fas. Misstanken om rå restore-snapshot i F3 avfärdades:
den enda aktuella restoreproducenten skapar designversioner. Ingen hypotetisk
F3-ändring läggs till; den befintliga restore-/promotionsemantiken bevaras.

Aktuella delbevis: readback-RED gav 1 fel/82 pass i två filer; exakt samma
acceptances är GREEN 83/83. Föregående 14-filers matris 334/334 och fokus
162/162 återanvänds för oförändrade blobbar, inte som ny helomkörning efter
readback-rättningen. Överlapp summeras inte. Workers fresh nonincremental
typecheck, scoped lint, diffcheck och PR-plan avslutades med uttrycklig exitkod 0.
Root har återbundit de tre runtime-/testhasharna och avslutat egen fresh
nonincremental typecheck, derived/docs/länkar/terminologi/historik/canvas/plan
med exit 0. Tom output är inte verifiering.
Ny head kräver fortfarande aktuell review, full CI och deployment.

## Checklista och klarkriterier

- [x] Frys leveransbas, inventera checkout/PR och verifiera Node enligt package/Volta.
- [x] Inventera hard-katalogens metod, konfiguration, filer och faktiska acceptansbevis.
- [x] Bevara befintliga informationsägare: manifest/provider, env, F2/F3,
  presence och konfigurationsstatus har olika semantik.
- [x] Implementera och leverera den gemensamma interna integrationsvyn via #1549,
  inklusive träffade prompt-/monteringskonsumenter och båda motorvägar.
- [ ] Leverera projektgränser och bevarande av tidigare faktisk providerkärna.
  #1551 ska rätta de sena #1550-fynden och passera samlad integration:
  kompatibelt projekt, annan provider, ostödd metod, fil-/middlewarekonflikt,
  okända förutsättningar, explicit removal/readd, restore och repair.
- [ ] Skilj skyddad kärna från projektanpassning med befintlig
  `verbatim`/`rewritable`; bevara signering, behörighet, secretskydd,
  konfigurationsfallback, exports och neutrala uppföljningar.
- [ ] Leverera katalog-/instruktionsändringen från
  `ccff1074c6deca06e1fd541bb4add803e49c194a` (25 paths mot dess andra parent).
  Synka endast granskade deltat till faktiskt levererad preview efter #1551.
  Användningsgräns, integration och Avoid ska nå modellen; behåll
  480-teckenskyddet och Bygg integrationer. Ändra inte Clerk-policyn i smyg.
- [ ] Leverera flödesrensningen från
  `f94528713e3ecafd5e99fea9d32b247f53157ab5` (31 paths mot katalogparent).
  Ta bort bevisat döda mekanismer och oägda ekon; behåll aktiva aliases,
  snapshotkompatibilitet och oberoende statusaxlar.
- [ ] Synka träffade typer/schema/validator/registry, Backoffice, curator,
  kartor och dokumentprojektioner. Inga dokumenterade men oanvända fält.
- [ ] Håll aktuell prosa och ordlista koherenta med runtimeägarna.
  Git/PR är iterationshistoriken; inga parallella backupdocs.
- [ ] Verifiera RED/GREEN och full integration för F2/F3, follow-up/repair,
  exakt presence, konfiguration och migrationshold före publicering.
- [ ] Lokalt: plan och riktat, max fyra workers. CI: hela standardsviten i
  fyra parallella jobb, isolerade DB-/stabilitetstester och 21 keyless
  dossierbyggen med högst sex parallella; ingen tung lokal dubbelbuild.
- [ ] Samla fynd före rättning; granska därefter exakt rättningsdelta och
  integration. Återanvänd oförändrade bevis bara med blob-/trädidentitet.
- [ ] Verifiera required checks, reviews, olösta trådar, exakt deployment,
  previewmerge och postmergefjärrläge för varje sluthead. Inga admin-/force-/
  direktpreview-/ordinary-auto-merge-genvägar eller fasta väntetider.
- [ ] Leverera slutlig ZIP-TXT från faktisk slutpreview: add/replace/remove,
  raw hashes och ownerklassificering. Original-ZIP förblir orörd.
- [ ] Städa endast eget terminalt arbete efter `tidy`/FRI; skydda främmande
  worktrees/branches/stashes. Lämna huvudcheckouten på preview.
- [ ] Stäng planen först när alla punkter har bevis eller uttryckligt
  ändringsbeslut. Överlämna faktisk slutbas och frigivna gemensamma owners till
  det nu parallellt påbörjade, separata scaffolduppdraget.

## Stabil semantik och bevisgränser

Canonical protected bytes är bevarandebevis, inte installerad eller fungerande
liveprovider. Positiv SDK-evidens kräver direkt paketberoende och faktisk
produktions-AST-import; package-only, type-only och test-only räcker inte.
REST-provider får inget påhittat SDK-bevis. En divergent upptagen tidigare
kärna bevaras och får en migrationshold, inte gissad ersättning/auto-delete.

Restore återställer versionskod och env-nyckelreferenser, inte chattens senare
providerplan. Omedelbar verify/publish bedömer återställd kod. Nytt F3/follow-up
behåller samtalets uttryckliga val; providerbyte kräver migrationsbeslut.
Normal promotion/repair binds till full snapshot, filer och edit kind.
En deterministisk hold måste vara auktoriserad, revision-bunden, bevara pending
repair och projiceras som blocked även vid kall/gammal bus. Vanliga lease-/CAS-/
läsproblem är separata retrybara no-ops; riktiga writefel får inte maskeras.

Jakob har valt **befintlig OpenAI-nyckel**. API-/SDK-kod och beroenden är
oförändrade; endast befintlig manifestregel känner igen levererad SDK.
Inga hemligheter har visats, använts eller ändrats. Typecheck och keyless builds
är inte liveacceptans; acceptance/freshness-datum förnyas inte utan nytt bevis.

DEV↔PROD:s 13 kända schemaavvikelser kvarstår; preview delar PROD-DB.
Ingen DB-apply ingår. Första verkliga Dependabot-auto-mergen är fortsatt
oprövad, eftersom ingen lämplig bot-PR har funnits att observera.

## TESTER, ZIP och nästa etapp

TESTER:s originalplan är säkrad i `251fac2047a9f542b929a01be7a06199f824192c`.
Rent dokumentdelta är pushat på `codex/test-control-plan-only`:
`729aa67a098031c0afc8be3b89437285b62259cc`, elva originalidentiska blobbar.
Backup `codex/test-control-plan-delivery@04a3ec33f` innehåller även omergad
dossierhistorik och får inte helmergas till färsk preview. Nya TESTER har
integrerat det rena deltat på `9d71cd34f` i egen e1e8-worktree och äger
planstatus. Ett faktiskt implementerat test-/workflowpaket har oberoende CLEAN
review och full lokal verifiering: 21 gröna kontroller, 12 954 standardtester
med 26 skips, 700 Backoffice-tester och 1 079/1 079 upptäckta testfiler.
Jakobs senare samlade fortsättnings-/leveransmandat är verifierat i TESTER.
Det befintliga paketet är publicerat som separat draft-PR #1553 på
`e49988eb3d9b6e5401316c0f19184489546db778`; local/remote matchar och e1e8 är
ren. Det är inte enbart en plan och inte ännu previewlevererat.
Hela testreformen är inte avslutad. Ingen stash eller förlust.

ZIP:ens baseline, paketförslag och livepreview är olika underlag.
`import-klart/` är ett historiskt overlay, inte en full checkout.
Slutlistan beräknas från faktisk kumulativ leverans/ownerclosure, inte från
en enskild PR:s filantal. Scaffold-/viewer-/TESTER-förslag importeras inte
automatiskt som dossierpayload.

Återstående tid kan inte anges som ett verifieringslöfte: core-review/CI,
katalog, flödesrensning och terminal handoff återstår. Tidigare 3–6 timmar
aktivt arbete var en preliminär uppskattning, inte completionbevis.
SCHAFFOLDS har efter Jakobs nya instruktion påbörjat ett separat auth-formpaket
i sin befintliga 5996-checkout på `codex/scaffold-auth-forms`. Det ändrar
auth-pages-mallarnas formulär och ärliga oanslutna adapter, inte dossierägare,
package-/CI-/workflowpolicy eller liveauth. Gemensam route-delivery/finalize
och andra överlappande owners väntar på uttrycklig överlämning av faktisk bas.
Root samordnar också den separat granskade PR #1552 efter dossierleveransen;
den använder befintlig industrykolumn och saknar migration/backfill.

Vid avslut uppdateras avklarat-indexet och denna genomförandeplan tas bort
enligt dokumentationslivscykeln. Stabil semantik hör i dossierkontraktet.
