---
status: active
owner: Codex, på Jakobs uttryckliga uppdrag
created: 2026-10-04
---

# Dossier-förenkling — hela leveransen

## Mål och avgränsning

Hårda dossiers ska vara återanvändbar kod och kontext som hjälper befintliga
LLM-flöden med återkommande integrationer, inte paket som påtvingar ett
kundprojekt fel router, sessioner, datalager eller implementationsmetod.
Förenkla tolkning och montering utan att förlora säkerhetskontrakt och nyttig kod.

Detta är ett samlat dossieruppdrag, inte bara första delsteget. Scaffolds väntar
enligt ägarens svar. Ingen ZIP-bulkimport, ny agent/LLM-fas, ny extern tjänst,
beroendeuppgradering, provideroperation, DB-/env-ändring eller masterpromotion.
Jakob har 2026-10-04 gett uttryckligt förhandsvillkorat mandat att skapa/pusha
PR:er och merga hela dossierleveransen till preview när oberoende granskning,
required checks och deployment är gröna. Ingen masterpromotion eller DB-åtgärd.

## Startläge och arbetsordning

- Live `preview`: `ff2ac650cc2d3ef37ccd1dcb3e286a0f39c6775c` efter PR #1550.
  Granskad head `e0f90f9287387794ce2eb4fd22a0c9bb23a3b023` och squash har
  exakt samma träd. PR-CI: 12 928 standardtester + 126 DB + 54 stabilitet på
  4:37; dossier 21/21 på 11:06 inklusive 5:04 kö (aktivt 6:02). Postmerge
  kod-CI grön på 3:54; Vercel READY på rätt preview-SHA/alias på 1:52.
  De 13 kända DB-paritetsraderna kvarstår. En sen automatisk review publicerade
  fem verifierade regressioner efter merge samt ett auto-delete-förslag som
  avvisats enligt migrationspolicyn. Efterrättningen hör till PR #1551 och
  räknas inte som levererad innan den når preview.
- PR #1551 inväntar aktuell rättningsreview, full CI och previewleverans.
  Den publicerade föräldrakandidaten `04729010c74c4337192a444fb11b81b693988ac6`
  hade grön CI: 13 039 standardtester + 126 DB + 54 stabilitet på 10:14
  (5:46 kö till fulla jobb, 4:27 aktivt); dossier 21/21 på 6:53 och exakt
  Vercel READY på 1:57. Sju tidigare native fynd är resolved med publicerat
  bevis. Tre senare fynd bekräftades trots grönt CI: restore mot senare
  chatintent, missvisande repair-hold och ignorerade removal-tombstones.
  En samlad rättningsrunda i befintliga owners har RED 18/199 → GREEN 203/203.
  Breddmatriserna är 180/180, 101/101 och 149/149; överlapp summeras inte.
  Typecheck, scoped lint, docs/canvas och PR-plan är gröna. Totalen är 42
  paths, efter uttryckligt avgränsat tillägg av befintlig accept-repair-route
  och dess test; ingen ny route eller persistensmodell. Förälderns CI/reviews
  är historiska delkvitton, inte slutheadens GO. Tidigare iterationsdetaljer
  finns i Git/PR-historiken, inte som en parallell aktiv statusmodell.
- D2/D3 i PR #1549 levererades på `db86c053abdad696718eafad839137b8d37831d5`.
  PR-verifieringen var 12 703/12 703 standardtester + 126 DB + 54 stabilitet
  på 4:45; dossier 21/21 på 6:16. Postmerge kod-CI var grön på 4:05 och Vercel
  READY på 1:56. De 13 kända DB-paritetsraderna är oförändrade; ingen master-
  eller DB-write ingick. Första verkliga Dependabot-auto-mergen är fortsatt
  oprövad eftersom inga Dependabot-PR:er är öppna.
- Återanvänd dossierkärnan i [PR #1548](https://github.com/Jakeminator123/sajtmaskin/pull/1548),
  reviewed head `b765e2f38185bca51f96b861abb7217d1321cd1d`; mergad till preview
  på `65e28f6097c756c9c78a54a22ae5533b81040848`. Postmerge kod-CI grön
  (4:01), Vercel READY (1:47); samma accepterade DB-paritetsdrift kvarstår.
- Aktiv leveransbranch: `codex/dossier-existing-core`, normalt synkad mot
  aktuell preview. Separat granskad katalogbranch inväntar bevarandeskyddet.
- En skrivande session i huvudcheckouten. Innehåll, runtimeägare, legacy och
  testbevis kartläggs parallellt; implementationer integreras sekventiellt.
- Dela leveransen i avgränsade PR:er efter ownerberoenden. Ny integrationsbas
  fryses och ändringsdelta granskas; oförändrade blobkvitton återanvänds.
- Nya arkitektur-/produktbeslut, osäker radering eller oväntad diff över cirka
  40 filer är stoppunkt. Core-rättningen är efter triage avgränsad till 42;
  ytterligare ägarytor är inte implicit godkända.

## Checklista och konkreta klarkriterier

- [x] Frys startbas, kontrollera ren checkout, öppen kärn-PR och Node/Volta.
- [x] Inventera aktuell hard-katalog: implementerad metod, användningsgräns,
  konfiguration, instruktioner, sourcefiler och faktiskt acceptansbevis.
- [x] Besluta minsta gemensamma informationsmodell. Manifest/providerägande,
  `envVars`, F2/F3 och presence behåller varsin befintlig semantik; inga nya
  dubbla readinessägare. Metadata får bara tillkomma med wired konsument.
- [x] Implementera en intern samlad integrationsvy i befintlig pipeline och
  använd den i träffade prompt-/monteringskonsumenter, inklusive båda motorvägar.
  D2/D3 är levererat genom PR #1549 med aktuell full CI och previewdeployment.
- [ ] Koppla projektets faktiska provider-/paket-/filbevis till användningsgräns
  före kodinjektion. Stödd implementation, anpassningsbehov och okänt/ostött
  fall ska få ärliga, testbara utfall; ingen gissad full kompatibilitet.
  Lokalt implementerat i compatibility-etappen 2026-10-04; inväntar fryst
  review, CI och previewleverans innan punkten får bockas av. Samma kontrakt
  bär även entydiga äldre provider-val som `legacy-preserved` genom neutrala
  plan-/codegen-uppföljningar; tvetydiga äldre labels lämnas till ett nytt val.
  PR #1550 är mergad på `ff2ac650cc2d3ef37ccd1dcb3e286a0f39c6775c`.
  Två oberoende delta-/integrationsreviews är CLEAN; samtliga åtta publicerade
  native fynd har RED/GREEN och sakliga lösningssvar. Slutmatris 538/538
  riktade tester, typ/lint/derived/docs/plan/canvas gröna. Full aktuell CI och
  deployment är verifierade. Fem sena fynd har fått lokal rättning: Swish-status, riktat
  `instead of`-byte, purpose-negation, Supabase-godkännande per capability och
  test-/fixture-importer som falskt runtimebevis. Samlad RED 14/251, därefter
  terminaldelta RED 7/188; fokus GREEN 258/258 och bred matris 581/581.
  En stale Swish-chosen dubblettrad ersattes av starkare unresolved-/fullflödestest;
  inga övriga täckningsfall togs bort. Type/lint/derived/docs/canvas/plan är gröna,
  Detta tidigare checkpoint hade 32 ownerklassificerade PR-paths. Punkten hålls öppen tills de
  levererats; same-capability auto-delete ska inte införas, migrationsspärr
  enligt ownerpolicy är lösningen.
- [ ] Skilj skyddad återanvändbar kärna från projektanpassning med befintlig
  `verbatim`/`rewritable`-mekanism. Bevara signering, behörighet, hemlighetsskydd,
  konfigurationsfallback, exports och fungerande uppföljningar.
  Bevarandeskyddet är lokalt fryst: samlad RED 6/104 → GREEN 104/104,
  tomma versionsfiler RED 1/38 → GREEN 38/38, full riktad matris 363/363 och
  docs 49/49. Runtime-commit `9a7f968bc9939c995b875e5569f7b869dbd6ff01`;
  normal preview-synk ändrade inga bytes. Den första fulla PR-verifieringen
  hittade följdfynden ovan; aktuell slutverifiering och previewleverans återstår.
  Katalog-/instruktionsetappen är säkrad separat på
  `39bf80b9b0f3f7f1c467b79246d51a1caa6e5818` med lokal bounded review CLEAN.
  Den ska synkas med faktiskt levererad preview efter #1551, inte blandas in
  i bevarandets review-/CI-kvitto.
- [ ] Rensa motsägelsefull och föråldrad hard-vägledning. Användningsgräns,
  integration och `Avoid` ska faktiskt nå modellen i enhetlig, begränsad form;
  behåll 480-teckenskyddet och knappen Bygg integrationer.
- [ ] Ta bort bevisat döda interna owners/wrappers/fallbacks. Skydda aktiv
  snapshotkompatibilitet; ingen route-/feature-/migrationsradering utan rätt
  användningsbevis och ägarbeslut. Git, inte backupdocs, bevarar borttagen kod.
- [ ] Synka typer/schema/validator/registry, Backoffice och curator där de
  konsumerar ändrat kontrakt. Inga fält som bara dokumenteras men inte fungerar.
- [ ] Regenerera kartor och dokumentprojektioner från aktuella owners; ersätt
  stale aktiv prosa och planer. Dokumentera ansvar och begränsningar, inte en
  parallell kopia av implementationen.
- [ ] Visa RED/GREEN och integration: kompatibelt projekt, befintlig annan
  provider, metod som inte stöds, fil-/middlewarekonflikt, okända förutsättningar,
  F2/F3, follow-up/repair, exakt presence och konfigurations-/verifieringsstatus.
- [ ] Kör plan och riktade kontroller lokalt med Node enligt package/Volta och
  max fyra workers. Full CI, isolerade DB-/stabilitetstester och samtliga
  keyless dossierbyggen verifieras på aktuell PR-head, utan tung lokal dubbelbuild.
- [ ] Samla oberoende reviewfynd före rättning; granska rättningsdelta och
  integration. Alla native required checks, reviews, trådar och deployment
  ska vara aktuella. Redovisa verklig CI-tid och kvarvarande hinder.
- [ ] Verifiera terminalt PR-/fjärrläge innan slutstädning. En grön öppen PR
  räknas inte som mergad eller produktionslevererad.

## Vad offlinebevis inte får påstå

Typecheck, keyless build och HTTP200 är inte live provideracceptans. Förnya
inte `lastVerified` eller accepted-status för att få grön freshness. Ändrade
providerbytes behöver nya relevanta bevis; liveprov med kostnad, credentials
eller externa writes kräver eget mandat. En sådan lucka ska redovisas öppet,
inte gömmas bakom en avbockad checklista.

## Etapper och uppskattning

1. Återanvänd och merga den redan verifierade kärn-PR:n efter färsk native
   attestering. Terminologi/ZIP-handoff utanför checkouten.
2. Gemensam dossierinformation och konsumenter: konfigurationsvägledning och
   providersteg utan nya readiness-/acceptansägare; samlad promptprojektion.
3. Projektgränser och kompatibilitetsutfall före injektion; bevara exakta val,
   snapshotkompatibilitet och båda motorvägar. Lokalt delta omfattar typad
   provider/capability-bindning, positiv AST-evidens, Prisma/Drizzle-metodgräns,
   server/verbatim-migrationsgrind och samma guard i pending/finalize/readiness.
4. Bevarande av befintlig kärna levereras först i en egen owner-PR. Återhärled
   request-local bevarande från exakta tidigare filer, providerbevis och
   befintliga kontrakt; ingen installationsledger eller automatisk migration.
   Därefter synkas den redan granskade katalog-/instruktionsändringen till
   aktuell preview och levereras separat. Ändra inte Clerk-policyn i smyg.
5. Bevisat död kod, ärliga statusord, aktuella docs och verifieringsmatris.
6. Review, aktuell full CI/deployment, previewmerge och terminal slutstädning.

Preliminär uppskattning: 3–6 timmars aktivt arbete, cirka 30–90 minuter
ytterligare CI-/reviewväntan beroende på rättningsrundor. Det är en uppskattning,
inte ett löfte eller ett verifieringskvitto. Scaffolds är nästa separata uppdrag
och ska påminnas om i sluthandoff när checklistan faktiskt är avslutad.

## Aktuell leveransstatus

Jakob har 2026-10-05 valt att behålla befintlig OpenAI-nyckel. Ingen hemlighet
har visats, använts eller ändrats och inga liveanrop ingår. OpenAI-dossierns
API-/SDK-kod och beroenden är oförändrade; rättningen utökar endast den befintliga
manifestregeln så att dess faktiskt levererade SDK ger positivt providerbevis.
Direkt paketberoende och produktions-AST-import krävs fortfarande; package-only,
type-only och test-only förblir nekade. En divergent äldre kärna bevaras även
vid en orelaterad uppföljning. OpenAI-deltat har två oberoende CLEAN-reviews och
grön full CI/deployment på 7297. Dess native SDK-fynd är löst med publicerat
bevis. Cal.com-/explicit-urvalsrättningen är också publicerad och granskad.
Checklistan hålls öppen tills den senaste restore/repair/removal-rättningen
har aktuell oberoende review, full CI och faktisk previewleverans.

Restore återställer versionskod och env-nyckelreferenser, inte automatiskt
chattens senare explicita providerplan. Omedelbar verify/publish bedömer den
återställda versionens faktiska kod och binds atomiskt till filer/edit_kind.
Nytt F3/follow-up behåller samtalets uttryckliga val; providerbyte kräver ett
medvetet migrationsbeslut. Ingen global snapshot-rewind eller gissad lineage.
Normal promotion/repair binder hela snapshoten inklusive removal-metadata.
Repair-hold är ett ärligt integration_migration_required-utfall: manuellt 409
med pending payload kvar, automatiskt no-op; lease-503 och riktiga writefel
behåller sina separata kontrakt.

TESTER:s elva dokument är säkrade i `251fac2047a9f542b929a01be7a06199f824192c`.
De är normalt integrerade och pushade på `codex/test-control-plan-delivery`
(`04a3ec33f0eb67425a159c47b3b43921ead04c0d`), exakt elva dokument mot 7297.
Originalcommitten är orörd. Backupgrenen innehåller ännu omergad dossierhistorik
och får därför inte normalmergas till färsk preview. Rent dokumentdelta är
separat pushat på `codex/test-control-plan-only`:
`729aa67a098031c0afc8be3b89437285b62259cc`, exakt elva blobbar identiska med
originalet från preview ff2. Nya chatten TESTER har normalt integrerat detta
på `9d71cd34f` i egen e1e8-worktree/codex/test-control-relevance och övertagit
planstatus. A0/A1/A6a-inventering och discovery/omissions-/fallbackskydd är
under faktisk implementation på separat avtalade workflowpaths, inte ännu
previewlevererad reform. Ingen stash, förlust eller dubbelimport.

## Avslut

Planen får stängas först när varje punkt har verifierat utfall eller ett
uttryckligt ägarbeslut om ändrad avgränsning. Vid leverans vävs en rad in i
avklarat-indexet och detaljplanen tas bort enligt dokumentationslivscykeln.
