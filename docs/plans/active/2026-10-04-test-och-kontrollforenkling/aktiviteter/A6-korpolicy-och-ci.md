# A6 — körpolicy och CI

Styrdokument: [masterplan](../00-master-plan.md) och
[genomförande](../01-genomforande.md).
Status: Pågår. Två delar: A6a efter A1; A6b efter A3, A4 och A5.

A6a är levererad via #1553 på preview `c4f4b188`; ursprungliga lokala
provbaser nedan är återanvänt sakbevis. [A7](A7-slutverifiering-och-overlamning.md)
binder dem till aktuell previewleverans. Ett avgränsat A6b-deduppaket
är levererat via #1574 på preview `eba1c590` 2026-10-06; slutlig
urvalsoptimering är fortfarande öppen.

| Del                         | Status     | Ansvarig / exakta paths                                                                   | Bas/head, arbetsdiff vid behov och verifieringsbevis                                                                                                                                           |
| --------------------------- | ---------- | ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A6a — tidigt säkerhetsskydd | Verifierad lokalt | Codex `e1e8`; 11 workflow-/discoverypaths | Bas `ff2ac650`; planintegration `9d71cd34`; arbetsdiff. Senaste samlade `verify:pr` exit 0 2026-10-05 efter delete/rename-fix och A2/A3/A5: 21 kontroller, 1 001 testfiler, 12 954 godkända tester, 26 skippar och 700 godkända Pythonprov. Discovery 1 079/1 079; oberoende del- och integrationsreview CLEAN. |
| A6b — sen optimering | Avgränsad dedup levererad via #1574; slutlig körpolicy öppen | Codex `sajtmaskin-tester-restarbete`; `.github/workflows/ci.yml`, `scripts/workflow/check-contract.mjs`, `scripts/workflow/ci-quality.test.ts` | Granskad head `f3af5be3`, bas `30291b80`, merge `eba1c590`. Heavy/fallback behåller alla fyra shards och preflight; light behåller riktade kontroller. Ingen ändring av required/native gates. |

## Uppdrag

Samla beslut om körning i den befintliga verifieringsmotorn och kör varje
skydd där det behövs. Inför smalare urval bara när det är bevisat att berörda
beroenden fångas. Relevanta obligatoriska GitHub-checks måste fortfarande
publiceras och kunna stoppa leverans på aktuell kod.

Primära owners: `config/agent-workflow.json`,
`scripts/workflow/path-impact.mjs`, `scripts/workflow/ci-scope.mjs`,
`scripts/workflow/check-contract.mjs`, package-scripts, configs och workflows.
Ändra verklig owner, validator och dess tester tillsammans.

## Tidig säkerhetsdel A6a

Verifiera eller komplettera befintligt skydd före A2 och den breda rensningen.
Behåll dagens blockerande körning; inför inte smalare urval i denna del.
Återanvänd befintlig discovery och owners. En återskapbar maskinell rapport
ska jämföra upptäckta testfiler med avsiktliga kommandon/lane-undantag, även
för separata språk. Motiverade undantag hör till befintlig körkonfiguration,
inte ett nytt handunderhållet register över alla tester.

- [ ] Jämför A0:s faktiska discovery med avsiktlig körning. Bekräfta hur en ny
      eller övergiven testfil signaleras utan att fallas bort tyst.
- [ ] Komplettera saknat automatiskt bortfallsskydd i befintlig motor och
      visa en kontrollerad miss: en upptäckt fil utan körplats får inte ge grönt.
- [ ] Visa att okända/gemensamma paths väljer bred kontroll. Behåll dagens
      obligatoriska checks; osäker klassning får inte bli ett tyst lightval.
- [ ] Granska tidiga ändringar oberoende och kör motorns avtalade verifiering.
      Dokumentera aktuell kod/diff och bevis i delstatusen ovan.
- [ ] Lämna ett körbart säkerhetsskydd till A2–A5 så att förändrad discovery
      kan kontrolleras vid varje berört paket.

A6a:s negativa bevis: tillfälliga `scripts/dev/orphan.test.mjs` och
`new-zone/orphan_test.py` gav CLI exit 1 med exakt path. Okänd path valde alla
icke-dokumentprofiler, inklusive Python, Playwright och preview-host. Ett
temporärt Git-repo bevisar staged/unstaged delete och rename; utan den nya
deleted-subtraktionen blir kontrollen röd. Nya och omdöpta filer utan runner
är fortfarande röda. Efter återställning är discovery-ownerblobben
`4e95417d46ec2d8f5b781c4ff53c49465225061d`, testblobben
`f24702ae6ca2c8543f17a07192cd57b839e4e62b` och riktat/discovery/lint grönt.
Vid A6a:s handoff var övriga nio ownerblobbar identiska med fullkörningen;
senare A3 ändrar endast den separat granskade preflight-invocationen i package.
Den första
oberoende granskningen och sista tvåfilsdeltat är CLEAN; oberoende omkörning
av discoverytesten gav 20/20 godkända med oförändrade blobbar.
Samlad fullverifiering av detta delpaket är därefter grön med oförändrad
kodfingerprint; aktuellt kvitto och bevisgränser finns i
[A7](A7-slutverifiering-och-overlamning.md). Det avslutar inte A6b eller hela planen.

A6a är verifierad först när bortfall och okända paths ger avsett fail-safe-
utfall. Om dagens motor redan visar detta behövs ingen kodändring; aktuellt
negativt bevis krävs ändå. Mottagare: [A2](A2-pilot-och-kanda-lasningar.md).

## Sen optimeringsdel A6b

Återstående avslut är ändligt: avgör scaffoldtesternas verkliga dubbelkörning,
warn-only-stabilityns överlapp och observerad same-head/ready-eventdedup; behåll
dem där likvärdigt skydd eller säker besparing inte kan visas. Koppla A4:s
verkliga runtime till befintligt quality-aggregate och bevisa att failure,
cancelled, missing och otillåten skip blir rött. Bekräfta sedan aktuell
GitHub-policy och en begriplig lokal/PR/leveranskörning. Oförändrade fyra fulla
shards är ett giltigt slutbeslut; smalare urval är inte ett självändamål.
Discovery/orphan/fallback och tidigare säkerhets-/DB-gates förblir obligatoriska.

### Aktuellt delpaket — dubblerade quality-kontroller

- `route-timeouts:check` behålls i oförändrad `preflight:common` för heavy och
  fail-closed fallback. Den separata contracts-körningen sker endast efter
  ett lyckat, uttryckligt lightbeslut. Vercels prebuild behåller samma preflight.
- De tre workflow-/scope-testfilerna körs i hela heavy/fallback-sviten via
  fyra shards, och riktat i contracts endast för explicit light.
  `workflow:contract` körs fortfarande alltid; den är inte en dublett av testerna.

Faktiska YAML-villkor prövades för heavy, light, failed/skipped/saknat scope
och tomt/ogiltigt resultat. Varje profil behåller en quality-owner för varje
skydd. Före ändringen var sex dubbleringsfall röda; därefter gröna. Validatorn
avvisar borttagen, skippad, icke-blockerande eller dubblerad lightkontroll samt
förlorad heavy-preflight eller prebuild/route-kedja. Kontrollerad manifestdrift
gav verklig CLI exit 1 både direkt (light) och via preflight (heavy/fallback);
manifestet återställdes och ingår inte i diffen. Riktat: 224 PASS, 23 befintliga
Windows-/Linux-undantag; faktisk shell-aggregate körs fortfarande i Linux-CI.
Full lokal verifiering gav exit 0 (19 kontroller, 13 312 PASS/26 skip och
702 Python PASS). Oberoende kodreview gav CLEAN på `aaca25e6`; normal
docs-only basmerge till `c6c5e1ce` ändrade inga kodblobbar. Efter integration
av #1571 gav aktuell head `f3af5be3` CLEAN och native CI SUCCESS; #1574
är mergad på `eba1c590`. Leveransgrindar och bevisgränser finns i A7/PR.
Build-jobbets egen prebuild är nödvändig parity i dess isolerade runner och
tas inte bort. Ingen hel-CI-tidsvinst påstås före ett aktuellt CI-kvitto.

### Aktuellt deduppaket — fulltestat, native leverans återstår

Förberedelsen på `codex/ci-duplicate-execution` är nu normalt integrerad med
faktisk #1580-preview `6432e5eb` via `e18f1f549`. Squashkonflikter löstes med
levererade A4-spec/statusblobbar; inga gamla A4-orakel följde med. Hela
A4-harness/config/package/lock är exakt preview. Endast följande A6-delta och
befintlig statusdokumentation avviker; inget test tas ur fulla sviten.

- Heavy/fallback behåller riktig `scaffolds:client-list:check`; materialisering
  ligger kvar i varje relevant test-runner, och samma fem scaffoldtestfiler
  ingår i alla fyra fulla shardars samlade urval. Explicit light behåller hela
  `scaffolds:validate`. Paketkommandot är oförändrat.
- Det gamla rådgivande stability-jobbet upprepar sex blockerande tester och
  schema-drift. Det tas bort; den unika rådgivande `check:terms`-prosaskanningen
  flyttas till contracts med `continue-on-error: true`. Blockerande stability,
  schema-jobb och lokalt `test:stability` består.
- Befintlig discovery jämför faktisk stability-discovery med den redan
  granskade blockerande listan. Scaffoldfiler härleds ur befintligt
  paketkommando och måste finnas i riktig standard-discovery. Ingen ny
  manuell fillista eller extra listkörning.
- Sju dubbleringsfall gav RED före ändringen. Tre verkliga discovery-
  mutationer gav CLI exit 1: exkluderad stability-fil, exkluderad scaffoldfil
  och ny ogranskad stability-fil. Alla återställdes.
- Oberoende review fann en P2 i single-owner-vakten. Same-job/other-job
  dubletter reproducerades; validatorn kräver nu exakt en global blockerande
  stability-owner i quality-core. Rättningen `99e70c5b` är oberoende CLEAN.
  Riktat 201 PASS/28 explicita Windows-Bashundantag; discovery 1 096/1 096.

Full `verify:pr -- --full --no-fetch --keep-going` på ren `99e70c5b` gav
exit 0 och **22/22 kontroller PASS**, Volta Node 22.23.1 och stödd
`VITEST_MAX_WORKERS=4`, utan urvals-/skipändring. Standard: 1 017 filer,
13 887 PASS/31 befintliga skip, 616,58 sekunder. Backoffice: 702 PASS,
55,922 sekunder med oförändrad Git-yta; docs 49 PASS och scaffolds 57 PASS.
Befintlig knip-konfigurationshint är rådgivande. E2E-listning är inte runtime.

Alla åtta A6-kod/config-blobbar är identiska efter normal integration;
skillnaden mot fullkörningen är levererad A4-spec och tre statusdokument.
Färsk E2E/config-typkontroll och berörda kontraktsprov är PASS (222 PASS/28
Windows-Bashundantag); discovery 1 096/1 096 PASS. Färsk plan och oberoende
integrationsreview krävs före push. Aktuell native CI och exakt
deployment krävs därefter före merge; fullkvittot ersätter inte dessa.

Den sjunde filen `finalize-followup-files-stability.test.ts` har bindestreck,
inte lane-suffixet `.stability.test.ts`, och ligger oförändrad i standardsviten.
Required checks, Postgres-/browsergates, fail-closed fallback och fyra fulla
shards ändras inte.

Samordnarens jämförbara native underlag: tidigare stability-jobb 48–56 sekunder,
varav dubblerade tester 5–6; contracts scaffoldvalidering 4–6 sekunder.
Quality-core 222–223 sekunder dominerade contracts 62–88, med varierande kötid.
Deltat tar bort verifierat dubbelarbete/runnerkostnad, men motsvarande
besparing på hela PR:ns kritiska walltid är ännu inte visad.

### Körpolicy och avsiktligt behållen ready-trigger

Same-head/ready-kandidaten är bedömd och **behålls**. Historiska dubbelkörningar
i #1552/#1562 är dokumenterade i Git/PR, inte en levererad eventdedup.
`ci-scope.mjs` uppgraderar möjliga draft-low-risk-ändringar till full heavy när
PR:n blir ready. Att ta bort ready-eventet kan lämna ett gammalt lätt grönt
kvitto. Befintlig concurrency avbryter bara pågående körningar; den återanvänder
inte avslutade resultat. Samma head bevisar inte samma bas/merge-ref/profil.
Dossier-owner kräver också ready. Ingen befintlig säker återanvändningsgräns
är visad, så ready-event och fyra fulla shards bevaras. Fullbordad dubblering
är kvarvarande optimeringsskuld, inte skäl att försvaga grinden.

- Under utveckling: relevanta ägartester och `verify:pr -- --plan`; discovery
  och negativa bevis vid runner-/urvalsändring.
- Inför kod-PR: centrala impactprofilen; delade/okända eller CI-motorändringar
  kräver full verifiering. Lokal workerbegränsning ändrar inte täckningen.
- Inför leverans: färsk previewbas, oberoende review, aktuella native required
  checks, verkligt persistenceprov i heavy/fallback samt exakt deployment.
  Discovery, advisory, skip och faktiskt genomförda prov redovisas separat.
  Ingen återanvändning enbart på gammal grön head.

GitHub lästes read-only 2026-10-06: active rulesets `22102710` (preview) och
`17926309` (master) kräver `quality`, `backoffice-tests`, `schema-drift`,
`build`, `dossier-acceptance` och GitGuardian (integration 46505).
Strict current-base checks och lösta reviewtrådar krävs; approving-count är 0.
Admin-role 5 har bypass, men den används inte. Klassiska protection-API:ts
404 betyder här rulesetbaserad policy, inte oskyddad branch. Ingen policy
ändras. Oförändrade 13 DB-paritetsavvikelser är separat skuld, inte grön CI.

Bredare A4-generation/follow-up/remove-replace är fortfarande öppna.
Det här deduppaketet får inte användas som ersättningsbevis för dessa flöden
eller för att stänga hela A7.

Starta efter A3, A4 och A5. Följande checklista gäller slutlig policy och
optimering; säkerhetsdelen måste fortsätta fungera.

- [ ] Bekräfta vilka checks som är deklarerade och vilka som faktiskt krävs i
      GitHub. Läs detta; ändra inte branch protection som del av teststädningen.
- [ ] Ge schema-drift, deterministisk stabilitet och andra separata skydd en
      avsiktlig körplats. Ta bort bekräftad repetition efter likvärdighetsbevis.
- [ ] Bedöm varningsjobbet för stabilitet: om det bara upprepar blockerande
      tester tillför det ingen ny täckning. Koppla inte dit ogranskade tester.
- [ ] Undvik att workflow-/scaffoldtester körs både riktat och i fullsviten
      utan skäl. Behåll riktad täckning när fullsviten inte körs.
- [ ] Återanvänd central impactklassning för relevanta lane-beslut. Avveckla
      parallella sökvägslistor först när deras gamla träffar är verifierat täckta.
- [ ] Definiera önskad körning under utveckling, på kod-PR och inför leverans.
      Full kontroll gäller för gemensamma/okända förändringar och avtalade
      leveranspunkter. Ogranskade blockerande grupper försvinner inte ur urvalet.
- [ ] Visa att ändringar i delade hjälpare, package/config, dynamiska consumers,
      rename/delete och testkonfiguration träffar alla relevanta grupper.
      Importgraf eller sökvägsfilter ensam räcker inte när beroenden är okända.
- [ ] Visa bred fallback för okända paths och att nya/orphan-testfiler upptäcks.
      Återverifiera A6a efter ändrat urval; rapporten ska inkludera även
      separata språk och testkommandon.
- [ ] Visa att ett misslyckat, avbrutet eller saknat obligatoriskt jobb gör
      den samlade grinden röd. Testa faktisk kör-/aggregatekod, inte en kopia.
- [ ] Skilj discovery (`--list`), skip, rådgivande resultat och genomförd
      kontroll i kvittot. Lägg in A4:s körda flöden på avtalad leveransnivå.
- [ ] Kör `npm run verify:pr -- --plan` och den fulla verifieringen enligt
      arbetsregeln för ändrad CI-/verifieringsmotor; använd isolerad test-DB.
- [ ] Kontrollera att current-head-, schema-, högrisk- och deploymentbevis
      fortfarande är obligatoriska där de var det. Ändra inte migrations-
      eller prodjobb för att maskera ett befintligt rött DB-paritetsresultat.
- [ ] Uppdatera riktiga hook-/agent-/dokumentationskonsumenter. Ingen ny manuell
      urvalslista eller global regel om att gamla tester aldrig får ändras.
- [ ] Låt oberoende granskare kontrollera urval, false-green-risk och aktuell
      integrationsbas innan ett smalare urval används för leverans.

## Klart när och handoff

Körpolicyn är begriplig, central och verifierad med både positiva och negativa
fall. Både A6a och A6b är verifierade. Inget test eller högriskskydd har tappats tyst, och obligatoriska checks
har ärliga kvitton. Uppnådd tidsvinst redovisas över hela avtalade leveransen.

Mottagare: [A7](A7-slutverifiering-och-overlamning.md).
