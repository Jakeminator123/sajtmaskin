# A4 — kritiska användarflöden

Styrdokument: [masterplan](../00-master-plan.md) och
[genomförande](../01-genomforande.md).
Status: Dellevererad; #1580:s persistensflöde körbevisat och mergat, generation/follow-up/remove-replace återstår.
Beroende: A1; separat paket efter levererad #1576.

## Levererad persistens och kvarvarande gräns

[#1580](https://github.com/Jakeminator123/sajtmaskin/pull/1580) mergades till
preview `6432e5eb2be2f97e1e6fcb906fb67e94c7759c57` 2026-10-06 17:02:40 UTC.
Granskad source `ce399a8a`, bas `e9354344`; source- och merge-träd är identiska.
Oberoende source-/runtimegranskning CLEAN. PR-CI
[37499402654](https://github.com/Jakeminator123/sajtmaskin/actions/runs/37499402654)
PASS 4:31 och dossier
[37499403060](https://github.com/Jakeminator123/sajtmaskin/actions/runs/37499403060)
21/21 PASS 7:14. Exakt deployment READY, inga aliasfel, enligt samordnaren.

Det verkliga browser-/Postgresprovet gav **1/1 executed PASS utan skip eller
retry**: ändra fil, riktig PATCH, exakt request/response, ny filrevision och
invaliderad verification; Spara projekt med riktig GET/POST och SQL; reload
med ny navigation, rätt projektdata och ändrat editorinnehåll. Den andra
sessionens projekt-/fil-GET, fil-PATCH och projekt-POST gav exakta 404-svar;
version, project_data och project_files var oförändrade efter angreppen.
Egen fixture/cascade/session och exakt egen container städades verifierat.

Post-CI
[37500465209](https://github.com/Jakeminator123/sajtmaskin/actions/runs/37500465209)
gav alla kodjobb PASS, inklusive ett nytt genomfört persistensprov. Endast
DB-schema-parity var RED: samma 13 rader, delta 0 mot föregående bas.
Hela post-CI är alltså inte grön. Merge-deployment
`dpl_Dw6MLXrZ8v3HJTqNfGVoGiFSAXvg` är READY på exakt merge-SHA, utan aliasfel.
Ingen masterpromotion, delad DB eller live provider ingår.

## Bevarat harnesskontrakt

Owners: `scripts/e2e/`, `playwright.project-persistence.config.ts`,
`e2e/project-persistence.spec.ts` och befintlig heavy/fallback-quality-owner.
`test:e2e:project-persistence:list` är endast discovery. Verklig körning
vägrar utanför GitHub-hosted Linux-CI och saknad isolering ger hårdfel, inte skip.

- Egen digestpinnad Postgres 16-container, verifierat exakt container-ID och
  ägarlabel, `network none`, inga publicerade portar eller fallback.
  App/db-init/seed/browser/cleanup delar loopback-namespace utan capabilities,
  extra grupper eller Dockeråtkomst, med no_new_privs.
- Positiv env-allowlist, inga dotenv-/livehemligheter. Låsta beroenden, browser
  och image hämtas före isolering. Disposable postgres-kompatibilitetsrollen
  är NOLOGIN utan superuser/createdb/createrole/replication/bypassrls.
- Rapportvakten kräver faktiskt PASS utan skip/fixme/flaky/unexpected/expected
  failure. Exit 0 eller listad testfil räcker inte. Cleanup rör bara egna data,
  processgrupper, temporär katalog och container och maskerar inte grundfelet.
- Metadata och första naturliga files-GET delar en absolut initial
  120-sekundersdeadline. Alla UI-actions, varm PATCH/GET och reload-readiness
  har 15 sekunder; första kalla save-POST får separat 120-sekundersbudget
  efter klick och varm GET. Navigation 120 och totalt 240 sekunder.
  Detta är funktionellt bevis, inte ett kallstart-SLA.
- Observatörer armeras före trigger och behåller första utfall även vid fel.
  Navigation och request-ID-golv avvisar gamla svar. Exakt request-/response-
  version, filset/innehåll, råeditor, POST-body och SQL krävs.
- Negativa cookie-mutationer skickar vanlig ägd `Origin: BASE_URL` för att
  nå tenantkontrollen. CSRF, session B och exakta routeägda 404-bodies består;
  403 godtas inte som ersättning. Saknad/främmande Origin nekas fortsatt.

Tidigare fel, rättningar och avgränsade offline-/mutationsbevis är arkiverade
i Git och PR-kommentarerna. Harnessen hittade också två separat levererade
produktfel, #1581 och #1583; inga produktowners ändrades i testpaketet.
Webpack-dev använder lokal fontfallback; produktionsbygget ändrades inte.

Seedad chat/version bevisar persistens och gästisolering, inte skapa/generation,
projektkortets återupptagningsväg, uppföljning, remove/replace eller capture/
promotion. Dessa öppna kontrakt får inte markeras klara av #1580. SCHAFFOLDS
produktowners är levererade via #1575; detta testpaket ändrar dem inte.

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
Samordnarens separata capture-audit fann ingen befintlig full-Next-transportseam:
gate och browserlaunch skapas internt. Purehelpers och Vitestmockar är inte
app-harness-seams. Avgränsa capture/promotion endast om normala flödet medger
ärlig verifiering utan fabricerat passed/promoted. Annars behövs ett separat
owner-/arkitekturbeslut; ingen allow-private-env eller publik IP-alias i det
loopback-isolerade nätet införs.

## Uppdrag

Komplettera med ett litet antal verkligt användbara flödestester. Gå genom
appens normala gränssnitt och lokala tjänstegränser för att upptäcka fel som
isolerade funktionstester missar. Återanvänd `e2e/` och befintliga verktyg.

Kontrollerade svar från externa AI-/betalningstjänster gör körningen
reproducerbar. Mocka vid externa gränser, inte bort sparning, uppföljning eller
den appkod vars samspel testet påstår sig verifiera. Använd isolerade testdata;
anslut aldrig till delad utvecklings-/produktionsdatabas som testgenväg.

## Scenarier

- [x] Avgränsat seedat persistensflöde: edit/save/reload och negativ gästisolering enligt #1580 ovan.
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
