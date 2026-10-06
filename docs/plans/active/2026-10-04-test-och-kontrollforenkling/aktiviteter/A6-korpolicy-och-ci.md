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

### Lokalt WIP — ytterligare likvärdighetsbevis, inte levererat

Samordnaren tillät 2026-10-06 förberedelse på separat lokal branch
`codex/ci-duplicate-execution` från A4-head `4cbb4c00`. Publicering kräver först
faktisk A4-merge och ny integrationskontroll. A4:s senaste körning föll före
fill/PATCH; därför sparas detta som WIP utan fullverifiering eller slutreview.

- Heavy/fallback behåller riktig `scaffolds:client-list:check`; materialisering
  ligger kvar i varje relevant test-runner, och samma fem scaffoldtestfiler
  ingår i alla fyra fulla shardars samlade urval. Explicit light behåller hela
  `scaffolds:validate`. Paketkommandot är oförändrat.
- Det gamla rådgivande stability-jobbet upprepar sex redan blockerande tester
  och schema-drift. Det tas bort i arbetsdeltat; den separata `check:terms`-
  prosaskanningen flyttas till contracts med `continue-on-error: true`.
  Blockerande stability, schema-jobb och lokalt `test:stability` består.
- Befintlig discovery jämför faktisk stability-config-discovery med den
  befintliga granskade blockerande listan. Scaffoldfiler härleds ur befintligt
  paketkommando och måste finnas i faktisk standard-discovery. Ingen ny
  manuell testlista eller extra listkörning tillkommer.
- Sju nya fall var RED före ändringen; riktat därefter 199 PASS/28 explicita
  Windows-undantag för Bash. Tre verkliga discovery-mutationer gav CLI exit 1:
  exkluderad stability-fil, exkluderad scaffoldfil, ny ogranskad stability-fil.
  Alla mutationer återställda; discovery 1 096/1 096, workflow och scoped lint
  PASS. Detta är inte full lokal/native CI-acceptans eller uppmätt tidsvinst.

Den sjunde filen med namnet `finalize-followup-files-stability.test.ts` har
bindestreck, inte lane-suffixet `.stability.test.ts`, och behålls oförändrad
i standardsviten. Required checks, Postgres/browsergates och fyra fulla shards
ändras inte. Full `verify:pr`, oberoende review och faktisk leverans återstår.

Separat ready-event-kandidat: #1552 körde heavy CI
[37265086119](https://github.com/Jakeminator123/sajtmaskin/actions/runs/37265086119)
från 2026-10-05 04:48:17 UTC, alla fyra shards startade 04:48:49. Ready-eventet
04:51:40 startade en ny heavy CI
[37265307749](https://github.com/Jakeminator123/sajtmaskin/actions/runs/37265307749)
04:51:41 på exakt samma head `2863d78204791a0720f718139ccf37db36a12bcc`.
Den första körningens shards avbröts 04:51:50–57; run-status uppdaterades
04:51:58. Ny körning startade alltså efter 3:24 redan förbrukad walltid,
inte efter en kodändring. Run-API och PR-timeline lästes read-only.

Detta är event-/körningsdedup, inte minskat testurval eller A4:s providerhinder.
En eventuell rättning måste behålla full profil, securitychecks, aktuell
integrationsbas och native leveransgrindar. Inga workflows ändras för denna
observation och ingen manuell cancel/omkörning gjordes.

Ytterligare same-head-observation från #1562: draft-CI
[37267686013](https://github.com/Jakeminator123/sajtmaskin/actions/runs/37267686013)
körde 05:24:58–05:28:41 UTC den 2026-10-05 och blev SUCCESS. Ready-eventets CI
[37268024330](https://github.com/Jakeminator123/sajtmaskin/actions/runs/37268024330)
körde 05:29:34–05:33:25 på exakt samma head
`1110d65f579b6f3d19b2c7e6b9348769d7167fea`, också SUCCESS. Här avbröts inte
första körningen; båda fulla test-/byggprofilerna kördes. Ready-körningens
aktuella checks användes för leverans, inte det äldre gröna draftkvittot.
Detta är mätunderlag, ingen ny väntetids-/readyregel eller genomförd optimering.
Framtida dedup måste bevara full täckning, securitychecks, aktuell bas och
native gates; den får inte göra A4:s obevisade flöden gröna.

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
