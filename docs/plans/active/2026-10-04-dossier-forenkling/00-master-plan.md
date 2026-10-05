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
| Projektkompatibilitet, #1550 | `ff2ac650cc2d3ef37ccd1dcb3e286a0f39c6775c` | Full CI/deployment verifierade; fem sena rättningar levererades via #1551. Same-capability auto-delete avvisas enligt migrationspolicyn. |
| Befintlig providerkärna och följdgrindar, #1551 | `84e0061a91af91cfafd02bf914af14b8fc9af6a9` | Exakt samma träd som två gånger oberoende granskad `3cc098f2`. Sex required checks, fyra fulla testshards, 21 keyless dossierbyggen och exakt Vercel-deployment gröna. Push-CI:s kodkontroller passerade; endast samma kända DB-paritet är röd. |
| Katalogkärna och instruktioner, #1555 | `9cd0c3afaf38218cf7fce632dd99cf71f226fc15` | Granskad head `c733ae0f4dac460c5f7002450769f9b46f130677`. Sex required checks, fyra gröna testshards på 4:05, 21/21 dossierbyggen på 6:03 och exakt Vercel-deployment READY. |

Aktuell dossierbas är sista raden. #1551 och #1555 är mergade, inte draft/HOLD.
De tre sena native fynden är rättade och lösta med publicerat bevis.
Beslutskontext-CAS, terminal repair-stop, atomisk fresh status, begränsad retry
och preserve-settlement använder befintliga owners. En tillämpad guarded reset
förblir auktoritativ även om optional readback fallerar; write-/schemafel och
legacy defaultkontrakt behåller felvägarna. Normal autoaccept fabricerar inte
pending. Restore bedöms enligt faktisk designversion-lineage utan att spola
tillbaka senare chatintent. Ingen ny endpoint, tabell eller lifecycle-fas.

Core-headens aktuella CI var 5:08 totalt (fyra gröna shards); alla 21 dossierbyggen
6:46 med högst sex parallella. Vercel READY är bundet till exakt `3cc098f2`,
utan aliasfel. Tidigare lokal readback RED 1 fel/82 pass → GREEN 83/83,
fresh nonincremental typecheck och riktade följdkontroller var gröna.
Oförändrad tidigare 334/334-matris återanvändes bytebundet; överlapp summeras inte.

Katalogens granskade 25-pathdelta från `ccff1074` levererades via #1555 på
faktisk providerkärnebas, inte genom gammal mergehistorik. Samtliga 23
befintliga basblobbar var identiska och två tillägg saknades; ingen
runtimekonflikt. Färsk fokus: fem filer, 128/128; 23 dossiervalidatorer,
capability-map, generated docs, scoped ESLint, docs/länkar/canvas och fresh
typecheck var gröna. Current-head review, sex required checks, fyra testshards,
21/21 dossierbyggen och exakt deployment är nu verifierade på `c733ae0f` /
`9cd0c3af`. Canvasens churnetiketter är mekaniska historikprojektioner, inte
bevis att hela uppdraget är färdigt.

Postmerge push-CI på `9cd0c3af` är inte helt grön: tre testshards passerade,
men F3-triggerns parent-version-test missade sitt finalize-anrop. TESTER har
bevisat en kontraktslucka vid commitgränsen: enabled DOM kan möta föregående
passiva eventlisteners blockerade state. Det historiska CI-förloppets exakta
orsak är inte spårad. En minimal tvåfilsrättning med RED/GREEN integreras i
Stage4; inga timeouts, sleeps eller assertions försvagas. DB-pariteten visar
samtidigt samma 13 kända rader. Stage4 väntar fortsatt på aktuell review, CI
och deployment innan leverans.

## Checklista och klarkriterier

- [x] Frys leveransbas, inventera checkout/PR och verifiera Node enligt package/Volta.
- [x] Inventera hard-katalogens metod, konfiguration, filer och faktiska acceptansbevis.
- [x] Bevara befintliga informationsägare: manifest/provider, env, F2/F3,
  presence och konfigurationsstatus har olika semantik.
- [x] Implementera och leverera den gemensamma interna integrationsvyn via #1549,
  inklusive träffade prompt-/monteringskonsumenter och båda motorvägar.
- [x] Leverera projektgränser och bevarande av tidigare faktisk providerkärna.
  #1551 ska rätta de sena #1550-fynden och passera samlad integration:
  kompatibelt projekt, annan provider, ostödd metod, fil-/middlewarekonflikt,
  okända förutsättningar, explicit removal/readd, restore och repair.
- [x] Skilj skyddad kärna från projektanpassning med befintlig
  `verbatim`/`rewritable`; bevara signering, behörighet, secretskydd,
  konfigurationsfallback, exports och neutrala uppföljningar.
- [x] Leverera katalog-/instruktionsändringen från
  `ccff1074c6deca06e1fd541bb4add803e49c194a` (25 paths mot dess andra parent).
  Det granskade deltat är synkat till faktiskt levererad preview efter #1551.
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
Det befintliga paketet är publicerat som separat ready-PR #1553 på
`cdf5c5751d152742c4db7d3fe04beb1d48487327`, synkat mot providerkärnebasen.
Dess kodblobbar är oförändrade och current-head CI/deployment verifierade.
Slutlig synk mot faktisk Stage4-preview återstår; inga testreformfiler ingår
i dossierpaketet. Det är inte enbart en plan och inte ännu previewlevererat.
Hela testreformen är inte avslutad. Ingen stash eller förlust.

ZIP:ens baseline, paketförslag och livepreview är olika underlag.
`import-klart/` är ett historiskt overlay, inte en full checkout.
Slutlistan beräknas från faktisk kumulativ leverans/ownerclosure, inte från
en enskild PR:s filantal. Scaffold-/viewer-/TESTER-förslag importeras inte
automatiskt som dossierpayload.

Återstående tid kan inte anges som ett verifieringslöfte: flödesrensning,
aktuell F3-rättning och terminal handoff återstår. Tidigare 3–6 timmar
aktivt arbete var en preliminär uppskattning, inte completionbevis.
SCHAFFOLDS arbetar efter Jakobs nya instruktion parallellt i sin befintliga
5996-checkout. Auth-former och en ärlig lokal ecommerce-demokorg är publicerade
som separata granskade draft-PR:er #1554 och #1557. Inga dossierägare,
package-/CI-/workflowpolicy eller liveproviders ändras. Scaffoldkontraktets
obligatoriska embedding-refresh är en separat ännu ej utförd liveoperation;
dessa PR:er är därför inte mergeklara. Gemensam route-delivery/finalize och
andra överlappande owners väntar på överlämning av faktisk dossierbas.
Root samordnar också den separat granskade PR #1552 efter dossierleveransen;
den använder befintlig industrykolumn och saknar migration/backfill.

Vid avslut uppdateras avklarat-indexet och denna genomförandeplan tas bort
enligt dokumentationslivscykeln. Stabil semantik hör i dossierkontraktet.
