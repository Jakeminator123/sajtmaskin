# A4 — kritiska användarflöden

Styrdokument: [masterplan](../00-master-plan.md) och
[genomförande](../01-genomforande.md).
Status: Draft #1580; produktfixarna #1581/#1583 levererade, nytt grönt persistensprov återstår.
Beroende: A1; separat paket efter levererad #1576.

## Verifierat hinder och nästa owner

Read-only genomgång av `a1_highrisk` 2026-10-05: befintlig deploy-smoke-discovery och
frivilliga skips bevisade inte skapa/spara/reload. Checkouten saknade isolerad
Postgres-harness och deterministisk providergräns för hela generationsflödet;
delad DB eller live provider får inte användas som genväg. En seedad version
skulle endast bevisa CRUD, inte generation eller senare uppföljning.

Dossier-/shared-runtime-reservationen frigavs efter #1558 på faktisk preview
`59a12080`, som ingår i integrationsbasen `e37e4d83`. Read-only deltarevalidering
visade att ingen isolerad Postgres, deterministisk providergräns eller lokal
Playwright-appsetup hade tillkommit. Reservationhindret är borta; den smala
persistensharnessen nedan är nu kodad men inte körbevisad. Inga hela scenarier
nedan är markerade som körda. Det blockerar A6b:s
slutliga urvalsminskning, men inte fristående A3-/A5-paket.

Det aktuella paketet är en isolerad `project-persistence`-harness med riktig
Next/browser/Postgres och faktiska edit/save/reload-routes. Saknad eller otillåten
testdatabas ska ge hårdfel, aldrig skip. Seedad chat/version bevisar bara
persistens; generation, follow-up och remove/replace kräver dessutom en
deterministisk extern providergräns och relevant preview-runtime. Detta är
avgränsat arbete; lokal kod/discovery är inte en faktiskt körd harness.

Samordnaren godkände 2026-10-06 en smal CI-implementation: tillfällig
GitHub Actions-runner med egen Postgres-container, verifierat exakt container-ID,
`network none` utan fallback och app/browser i samma nät-namespace med
privilegier borttagna. Positiv env-allowlist, inga dotenv-filer/hemligheter,
ingen delad DB eller lokal systeminstallation. Verklig fil-PATCH, Spara projekt,
reload och negativt cross-session-prov ska köras utan authändring.
Fyra fulla shards, befintliga säkerhetskontroller och GitHub-permissions består.
Oberoende granskning av isoleringsgränsen och faktisk grön runtime krävs;
discovery, mocks och denna förberedelse räknas inte som flödesbevis.

Aktuell implementation finns i `scripts/e2e/`,
`playwright.project-persistence.config.ts` och `e2e/project-persistence.spec.ts`.
`test:e2e:project-persistence:list` gör bara discovery; verklig körning via
`test:e2e:project-persistence` vägrar utanför GitHub-hosted Linux-CI.
Ett separat heavy/fallback-jobb använder låsta npm-/Playwrightberoenden och
digestpinnad Postgres 16. Bara paket-/browser-/imagehämtning sker före
isoleringen. App, db:init, seed, browser och cleanup körs i samma verifierade
loopback-namespace. Ingen ny GitHub-behörighet, delad DB eller authseam.
Webpack-dev använder Nexts lokala fontfallback; produktionsbygget är oförändrat.
Launcher läser även Playwrights JSON-rapport i sin egen nya tempkatalog: minst
ett faktiskt passerat prov och inga skip/fixme, flaky, unexpected eller
förväntade fel krävs. Exit 0 eller en listad/skippad testfil räcker inte.

Första native körningen i [#1580](https://github.com/Jakeminator123/sajtmaskin/pull/1580)
valde faktiskt heavy även som draft. Jobb `112236218072` verifierade namespace,
loopback, borttagna capabilities/no_new_privs och otillgänglig Docker-socket,
men db-init föll före app/browser: rollen `postgres` saknades eftersom containerns
inituser är `persistence_test`. Egen container städades bort. Testbootstrapen
skapar nu endast den nödvändiga `postgres`-principalen med NOLOGIN och utan
superuser/createdb/createrole/replication/bypassrls, läser tillbaka och kräver
exakt dessa spärrar innan befintlig db-init körs. Ingen produkt-/RLS-/authkod
ändras. Ny native körning krävs; första försöket är inget persistensbevis.

Andra native körningen `37454396038` på `8e9fd8db` verifierade bootstrapen,
db-init/RLS och verklig app/browser-start. `/builder` svarade därefter 500:
klientens `prompt-builder`/`stream-handlers-done` importerar rena hjälpfunktioner
ur `plan/review`, som även importerar `template-inspiration` och `node:path`.
Installerad browserbundling utan tree-shaking reproducerade samma importfel
för båda klientingångarna; rena `plan/schema` gav PASS. Det bevisar inte fel
i standard-Turbopack eller produktion: den körda harnessen använder webpack-dev.
Samordnaren äger separat minimal produktfix. TESTER ändrar inte produktimporter,
lägger inte in polyfill/mock och byter inte bundler för att dölja felet.
Egen fixture/cascade/session och container-cleanup passerade även detta försök.
Testet kräver nu HTTP 200 vid första navigation och reload, begränsar enskilda
UI-actions till 15 sekunder och försöker all cleanup utan att maskera grundfelet.
Ny native körning samlas med faktisk produktfix; ingen persistensacceptans ännu.

Produktfixen är nu levererad separat via #1581 på preview `30b941c5` och normalt
integrerad i TESTER genom `f083b896`. Serverns enrichment ligger i egen modul;
båda verkliga klientingångarna browserbundlas utan tree-shaking. Produktkoden
är identisk med den levererade basen, harnesskoden med granskad `1af6fe76`.
Färsk integration: fyra filer/83 PASS, 28 explicita OS-skip, E2E/config-typkontroll,
workflowkontrakt och discovery 1 095/1 095 PASS. Detta rättar ett verkligt fel
som harnessen hittade; endast ny native körning kan bevisa edit/save/reload.

Den tredje native körningen `37462490014` på `bb3e4519` nådde `/builder` med
HTTP 200 men hittade inte Kod-knappen inom ordinarie 15 sekunder. Ingen
edit/save/reload-acceptans nåddes. Övriga CI-jobb passerade; egen fixture-/
session-/containercleanup verifierades. Skärmbild/trace skapades på runnern
men körningen hade noll uppladdade artefakter. Diagnostiken kompletteras därför
med begränsad failure-only sidtext, browserfel och faktiska hydreringssvar;
disponibla DB-/sessionshemligheter redigeras bort, inga kunddata används.
Observatörerna armeras före navigation; projekt-, chatt- och versions-GET måste
ge HTTP 200 och rätt fixture-ID innan redigering respektive efter reload.
Inga app-API-anrop ersätts eller utförs åt browsern och timeouten höjs inte.
Review fann två luckor i den lokala diagnostikrundan, båda rättade: page-skapande
stannar i cleanupens try/finally, och svar binds till den navigation där deras
request startade. Ett sent pre-reload-svar får inte bevisa reload. Offlineprov
av specens faktiska eventcallbacks avvisade gamla/främmande/icke-GET/oobserverade
requests, accepterade nya GET och behöll första svaret. Borttagen generationsvakt
återskapade felaktig acceptans. Detta är eventprov, inte browser-/DB-acceptans.

Oberoende ownergranskning bekräftade korrekt Kod/Kodvy-selector. Den yttre
`BuilderPreviewTools`-grinden döljer menyn vid tom preview trots att canonical
`surface.canShowCode` och filvyn stöder code-only. Samordnaren äger separat
minimal produktfix och komponentregression; TESTER seedar ingen falsk
preview-URL och manipulerar inget React-state. Eventuellt ytterligare
hydreringsfel är obevisat. Ny native körning samlas efter levererad fix och
granskad integration, inte som blind omkörning.

Produktägaren levererade code-only-rättningen separat via #1583 på faktisk
preview `e935434495e6ce888a10933097b869fb5c61071e`, efter katalogpaketet #1582
på `c33daca3`. Riktig Kod-/registry-meny och delad hook gav fyra RED före
rättningen och fem GREEN efter; samordnaren verifierade CLEAN och PR-CI 3:47.
TESTER normalsynkar båda leveranserna utan egna produktändringar. Diagnostikens
kodhead `f50448eb` är oförändrad; slutlig integrationsreview och ett samlat
native persistensprov planerades. PR:n lämnades draft tills review var klar;
ingen tidigare röd körning eller komponentregression räknas som E2E-acceptans.

Samlad CLEAN-granskad head `fb113f8c5` kördes därefter i native
`37491869699`, jobb `112366598012`. `/builder` gav 200 efter 22,8 sekunders
kall kompilering, men inga av de tre hydreringssvaren nådde browserobservatören
inom de följande 15 sekunderna. Ingen pageerror observerades; tomma chat-/
previewtexter kan redan vara serverrenderade och är inget hydreringsbevis.
API-kompilering fortsatte vid stoppet. Endast persistence/quality föll;
fixture-/session-/containercleanup passerade. PR:n är åter draft.

Källgranskning bekräftade giltig direkt-URL med project+chatId, omedelbara
projekt-/chatt-ID:n och ingen authgrind framför de tre GET-anropen. Den vanliga
projektkortslänken använder bara project och gör först en latest-chat-lookup;
detta ytterligare ingångsflöde ingår inte i det aktuella persistensprovet.
Ingen specifik produktdefekt eller kallstart-rotorsak är ännu körbevisad.

Samordnaren godkände därför en korrigerad testfasbudget, inte en produktfix:
initial klient-/API-readiness får använda konfigurationens befintliga
120-sekunders navigationsbudget; actions/save och hydrering efter reload behåller 15 sekunder och
testets totalgräns 240 sekunder. Samma tre faktiska GET, HTTP 200, fixture-ID:n
och requestens navigationsgeneration krävs. Ingen extra warmup, retry, sleep,
skip eller API-bypass. Det är funktionsbevis, inte ett 15-sekunders kallstart-SLA.
En begränsad path-only tidslinje redovisar requeststart/svar och initial readiness
även vid PASS; feldiagnostiken visar även påbörjade men obesvarade anrop.
Inga querysträngar, headers, kroppar eller hemligheter loggas. Om nästa prov
fortfarande inte hydreras ska det förbli rött; ny native acceptans återstår.
Offlineprov av specens faktiska callbacks verifierade fasbudgetarna, tidslinjens
navigationsbindning/begränsning och att första HTTP-fel/felaktigt fixture-ID
fortfarande fäller. Borttagen generationsvakt accepterade ett gammalt svar och
gav avsett mutationsfynd. Detta är harnessbevis, inte browser-/DB-acceptans.

Native `37493732112`, jobb `112373648829`, på `a37af8d0` passerade sedan
initial readiness efter 20,924 sekunder: alla tre verkliga GET gav HTTP 200
och rätt fixture-ID. Kod/Kodvy och den riktiga filens redigeringsläge öppnades.
Det observerade utfallet stöder separat kallstartsbudget, men inte snabbare
uppstart eller något nytt produktfixanspråk. Nästa stopp var ett testfel före
fill/PATCH: den breda textarea-väljaren matchade både Hero-ingress och råkod.
Övriga kodjobb passerade; egen fixture-/session-/containercleanup verifierades.

Den minimala rättningen begränsar väljaren till kodpanelsägarens direkta
editor-wrapper och dess textarea. Ingen produktmarkup, fixture, timeout,
`.first()`/nth eller innehållsbaserad filtrering ändras; exakt originalkod
kontrolleras fortfarande separat. Verkliga `PreviewPanelCode` och hela
`PreviewPanelCodeSectionEditors` renderades med Hero kvar: gammal väljare gav
två träffar, ny en. Samma selector i Chromium ändrade endast råkoden; Hero
förblev orörd. Saknat/dubblerat kodfält och fel kodinnehåll gav avsedda fel.
Detta är komponent-DOM-/selectorbevis, inte hydrerad app/API/DB-acceptans.
Oberoende locatoraudit fann fil-/projektknappar, panel och toast korrekt
förankrade i sina verkliga owners; råeditorn saknar befintlig semantisk label.
Reload skapar om samma locator-kedja. Save/reload/tenant måste fortfarande
bevisas i nästa native körning.

På selectorhead `4cbb4c00` föll native `37495373171`, jobb `112378834825`,
tidigare: metadata-readiness PASS efter 27,979 sekunder, Kod/Kodvy-klick utförda,
men filknappen saknades inom 15 sekunder. Färdigrenderad kodvy och den nya
editorselectorn nåddes inte bevisligen. Två files-requests hade startat; servern
loggade deras HTTP 200 först efter browserfelet, med 12,6 respektive 2,8 sekunder.
Loggarna korrelerar inte säkert enskilda request-ID:n och serverlatensrader.
Sidtexten visade ännu preview-empty; varken UI-reset eller pending RSC/transition
är bevisad orsak. Endast persistence/quality föll, cleanup PASS; övrig kod-CI
PASS 5:07, dossier 21/21 PASS 6:48 och exakt READY-deployment enligt samordnaren.

Samordnaren och oberoende ownerreview godkände därför en samlad fasrättning:

- Metadata och första naturliga files-GET delar **en** 120-sekundersdeadline
  efter DCL. Varje del använder återstående tid; uttömd budget fäller direkt,
  aldrig `timeout: 0`. Naturliga files-callers finns även före kodvy, så detta
  är appdatabevis, inte påstående om vilken hook som committat.
- Efter databeviset behåller Kod/Kodvy, filknapp, redigera och fill 15 sekunder.
  Riktig UI-konsumtion och strikt råeditor med separat exakt innehåll krävs.
- PATCH använder redan GET-kompilerade `/files` och behåller 15 sekunder.
  Projektsparningens varma files-GET behåller 15 sekunder; endast första POST
  på den separata kalla `/projects/:id/save` använder befintlig 120-budget.
- Reload-navigation behåller 120 sekunder, metadata/files/UI 15 sekunder och
  hela provet 240 sekunder. Ingen ny warmup, retry, skip eller API-bypass.

Observatörerna armeras före navigation och sparactions. Första matchande
path/method-utfall per navigation/fas bevaras, även HTTP-fel eller requestfel;
status/version/innehåll används aldrig för att välja bort ett rött svar.
Files kräver rätt request- och response-version samt exakt filnamn/innehåll.
Save-fasens request-ID-golv avvisar ett tidigare påbörjat post-PATCH-refetch;
en gammal navigation får inte bevisa reload. POST-body och faktisk DB kvarstår.
Offlinekörning av specens faktiska helpers/listeners visar delad budget,
uttömning, första felutfall, fel version/innehåll/saknad/extra fil och gammalt
navigation-/actionsvar RED. Borttagna generations- respektive actiongolv släpper
igenom gammalt svar, som avsett mutationsfynd. Detta är harness-/callbackbevis;
ny native edit/save/reload/tenant-acceptans återstår.

Deltareview på `4c224209` fann att responsbudgetarna startade parallellt med
klicket och därför förbrukades av föregående UI-/GET-fas. Korrigeringen armerar
fortfarande observatörens golv före klick, men väntar sekventiellt på klick,
varm PATCH/GET och därefter kall POST. Svar under klick bevaras redan i kartan.
Ett prov av den faktiska fasordningen visar separata starttider och att ett
felaktigt varmt GET stoppar före POST-väntan; tidigare parallell ordning ger
avsett rött budgetprov. Detta är avgränsad harnessverifiering, inte runtime.

Seedat gästprojekt och quick-edit-version testar verklig persistens, inte
skapande/generation. Fil-PATCH ska invalidera tidigare verification; explicit
Spara projekt måste spara faktiskt hämtade filer, och reload måste läsa samma
värden. En annan session nekas både läsning, fil-PATCH och projektsparning med
oförändrade DB-snapshots. Cleanup stänger app/browser, väntar ut appens DB-
anslutningar och raderar bara egna fixture-/sessionrader och exakt egen container.

Efter detta paket återstår explicit: riktig skapa/generation, uppföljning efter
reload, remove/replace med äldre brief/snapshot och representativt fel/avbrott.
Dessa kräver fortfarande en deterministisk extern providergräns och relevant
preview-runtime; persistensprovet får inte markera dem eller hela A4 klara.

SCHAFFOLDS levererade owners omfattar `src/lib/builder/build-intent.ts`,
`src/lib/api/engine/chats/create-chat-stream-post.ts`, `parse-chat-request-meta.ts`,
`chat-message-stream/{plan-mode-turn,codegen-turn}.ts`,
`follow-up-orchestration-input.ts` samt `src/lib/gen/orchestrate/{resolve-base,types}.ts`
och deras riktade tester/följdytor. De förkortade chat-pathsen hör till samma
`src/lib/api/engine/chats/`-katalog. Leveransen är terminal via #1575 och chatten
arkiverad enligt samordnaren; TESTER ändrar ändå inte dessa produktowners inom
persistenspaketet. Provider/restore/promotion/preservation-kontrakten består.

## Avgränsad förstudie för resterande flöden

Read-only källgenomgång 2026-10-06, inte implementerad eller runtime-verifierad:
återanvänd den disponibla nätisoleringen med riktig app, Postgres, browser och
`preview-host`, samt en lokal kontrollerad extern AI-endpoint. Ingen delad DB,
live provider, produktmock eller ny plan behövs för denna förstudie.

- Skapa endast ett verifierat, oprivilegierat disponibelt användarkonto med
  produktens lösenordshash och använd riktig `/api/auth/login`. `TEST_USER_*`
  duger inte som vanlig användare: authkoden behandlar kontot som admin.
  Projekt, chatt och version ska sedan skapas av det riktiga UI-flödet, inte seedas.
- Hämta låsta `preview-host`-beroenden och materialisera paketmanifest från
  verklig scaffold-owner före nätisoleringen. Förvärm jobbets egen npm-cache;
  preview-hostens vanliga installation och beroendekontroll måste fortfarande
  köras inne i isoleringen. `runtime/shared.js` tillåter HOME och placerar cache
  under egen datakatalog, men släpper inte igenom `NPM_CONFIG_OFFLINE`.
  En isolerad användares `.npmrc` med offline-läge är därför en kandidat;
  både lyckad installation och avsiktlig cachemiss som hårdfel måste körbevisas.
  Ingen falsk node_modules-/fingerprintmarkör eller alternativ bundler.
- Den kontrollerade providergränsen måste tala installerad Responses-protokoll
  via `OPENAI_BASE_URL`, validera samtliga faktiska brief-/generation-/follow-up-
  och eventuella verifierings-/repair-anrop samt neka okända anrop. Exakta
  SDK-svar/SSE-format och hela anropssekvensen är ännu inte körverifierade.
  Framtida fixture ska hålla beroenden och externa font-/bildanrop avgränsade,
  exempelvis med explicit genererad systemfontlayout som bevaras över turerna.
  Det bevisar inte godtyckliga sajter eller canonical Inter-layout offline.
- Beviskedjan ska omfatta synlig verklig preview, sparad version efter reload,
  rätt tidigare filer i nästa providerrequest, bevarad lokal ändring och orelaterat
  innehåll samt remove/replace utan återinförd A från äldre brief. Ett kontrollerat
  fel/avbrott ska bevara tidigare data och ge ärlig status. Detta bevisar appens
  samspel med kontrollerade providersvar, inte verklig AI-kvalitet.

Separat blocker finns för full promotion: `product-postcheck.ts` accepterar en
konfigurerad lokal preview-host på sin yttre URL-gräns, men capture-browserns
`buildCaptureHostGate` nekar privata/loopback-adresser. Preview-ready får därför
inte påstås bevisa godkänd capture/promotion. Om promotion krävs i samma flöde
behövs separat ownerbeslut om en säker isolerad testbarhetsgräns; SSRF-skyddet
får inte stängas av. Terminal failed/blocked låser inte ensamt composern enligt
`pipeline-interaction-lock.ts`, men kvarvarande pipeline-/F3-arbete kan göra det.
Faktisk UI-uppföljning efter postcheck-fel är därför fortfarande obevisad.

## Uppdrag

Komplettera med ett litet antal verkligt användbara flödestester. Gå genom
appens normala gränssnitt och lokala tjänstegränser för att upptäcka fel som
isolerade funktionstester missar. Återanvänd `e2e/` och befintliga verktyg.

Kontrollerade svar från externa AI-/betalningstjänster gör körningen
reproducerbar. Mocka vid externa gränser, inte bort sparning, uppföljning eller
den appkod vars samspel testet påstår sig verifiera. Använd isolerade testdata;
anslut aldrig till delad utvecklings-/produktionsdatabas som testgenväg.

## Scenarier

- [ ] Skapa projekt, spara och ladda om: relevant innehåll och version finns kvar.
- [ ] Gör en lokal ändring: ändringen kvarstår efter omladdning och senare
      uppföljning, samtidigt som orelaterat innehåll och accepterat utseende består.
- [ ] Ta bort funktion A: gränssnitt, kod och relevanta integrationsval speglar
      borttagningen. Spara, ladda om och fortsätt med äldre brief/snapshot;
      A återinförs inte oavsiktligt.
- [ ] Ersätt A med B: explicit ny instruktion styr, B består efter återupptagande
      och gamla val tar inte över. Fall med sparad data eller extern migration
      ska ge ett ärligt avgränsat utfall, inte tyst radering för att göra testet grönt.
- [ ] Kontrollera representativt misslyckande/avbrott: appen visar relevant
      status, behåller användardata och rapporterar inte ett fel som framgång.

## Checklista

- [ ] Välj representativa scenarier och kravägare med A1. Antal scenarier är
      ett medel, inte ett katalogkrav; kombinera när samma flöde ger bra felbevis.
- [ ] Reservera app-/testharness-/fixturepaths och granska isoleringen före körning.
- [ ] Kontrollera faktisk appstart, session, sparning och reload i testmiljön.
      Beskriv vilken verklig infrastruktur som används respektive ersätts.
- [ ] Undvik beroende av exakta AI-formuleringar, godtyckliga delays och
      screenshotidentitet. Kontrollera relevant tillstånd och synligt beteende.
- [ ] Visa att minst ett fel i borttagning/ersättning upptäcks av flödet.
- [ ] Gör skillnaden tydlig mellan Playwright `--list`, ett överhoppat scenario
      och en faktiskt körd grön kontroll. Obligatoriska flöden ska falla när
      nödvändig harness saknas; frivilliga liveprov redovisar sin skip.
- [ ] Kör flöden deterministiskt med kontrollerade externa svar och oberoende review.
- [ ] Lämna exakta körkrav, bevis och rimlig kostnad till A6.

## Klart när och handoff

De valda scenarierna är faktiskt körda och visar sparning, omladdning och
uppföljning. Mockade bevis är tydligt avgränsade och påstås inte vara live
provideracceptans. Inga hemligheter eller kunddata finns i fixtures/loggar.

Mottagare: [A6](A6-korpolicy-och-ci.md) och
[A7](A7-slutverifiering-och-overlamning.md).
