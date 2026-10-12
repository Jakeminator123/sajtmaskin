# LLM-kedjan: färre omtolkningar, mindre legacy

Status: active
Owner: Jakob (produktbeslut), samordnande Codex-chatt (disposition)
Start: 2026-10-11

## Uppdrag och avgränsning

Jakob har beställt genomförande av kedje-/legacy-granskningen, med tre nya
Codex-chattar: **1**, **2**, **3**. Prioritera faktisk borttagning och enklare
ansvar framför nya kontrollager. Detta är arbetsplanen, inte en ny runtime-owner.

Granskningens kodbas var `e12b1cbbb506d79f73112debf54c6c5407fef74b`.
Vid planstart är checkoutens HEAD `b98f722b536d1c83dcc72ee911b057209cc6cb89`;
de granskade kärnytorna i gen/chat/own-engine/control-plane är oförändrade
mellan dessa. Varje skrivpaket binds ändå till aktuell HEAD och berörda blobs.
Vid samordningsövertagandet 2026-10-11 var aktuell HEAD
`b5b7474e517b978d5a331aa3ff93c7ece1da73ad`; första paket binds till denna.

- Arbetskatalog: `C:/Users/jakem/.codex/worktrees/llm-legacy-cleanup/sajtmaskin`.
- Återställd 2026-10-12 efter Jakobs mandat från snapshot
  `1c12697dca15d15e58cdd3d431d829b7b1832627`, vars förälder är `b5b7474e…`.
  Snapshoten innehåller A1, B1, planerna och ofärdig A2.1. Den gamla katalogen
  `1634` arkiverades under arbetet; den används inte längre.
- Planmapp: `docs/plans/active/2026-10-11-llm-kedja-och-legacy/`.
- Produktkod, städning och nödvändiga följdytor ingår efter tilldelning.
- Inga nya worktrees eller parallella skrivare. Jakob godkände 2026-10-12
  en lokal ersättande underagent för slutreview när appkontakten med 1/2/3 bröts.
- Ingen push, PR, merge, DB-apply, providerändring eller aktivering av flaggor
  ingår i en aktivitet. Samordnaren begär separat publiceringsmandat.
- Jakob godkände 2026-10-12 lokala Git-commits efter verifiering och granskning.
  Detta ändrar inte gränserna för push, PR, drift, Master eller DB-apply.
- Befintliga CI-/Buggpassregler gäller; bygg inte en andra verifieringsmotor.
- Andra aktiva spår och deras öppna acceptanskrav stängs inte av denna plan.

## Målbild

`önskemål + basversion → beslutat byggunderlag → generering → gemensam
projektberedning → revisionsbunden kandidat → kontroller/avgränsad reparation
→ serverägd versionslivscykel → publicering`

Behåll skillnaden mellan scaffold/variant/dossier, design F2/integrations F3,
importerade projekt och snabbredigering. F2/F3 är inte Git-grenar.
Konsolidera delat arbete, inte olika produktsemantik. Bygg inget generiskt
workflow-ramverk och lägg inte en ny pipeline bredvid den gamla.

## Roller och läsbudget

| Chatt | Rekommenderad modell | Ansvar | Startläsning |
|---|---|---|---|
| 1 | Sol 6.1 / XHigh | Byggunderlag, kandidat/eval, därefter serverägd livscykel | denna fil + [01](01-kontrakt-och-kandidat.md) |
| 2 | Sol 6.1 / High | Legacy, borttagning och dokumentations-/ägarsynk | denna fil + [02](02-legacy-och-agare.md) |
| 3 | Astra / High | Oberoende, readonly arkitektur-/integrationsgranskare | denna fil + [03](03-livscykel-och-granskning.md) |

Samordnaren fördelar små paket, fattar gränsbeslut och läser sammanfattningar.
Astra High rekommenderas för löpande samordning; Ultra behövs inte för
statusläsning. Modellinställningar ändras aldrig tyst. Chatt 3 skriver inte
produktkod och är inte en fjärde implementationsagent.

## Registrering och kommunikation

Jakob startar själv chattarna med [startprompterna](STARTPROMPTER.md).
De ska vara nya självständiga chattar, inte fullhistorik-forkar. Exakt titel
plus repo och registreringsmarkör avgör identiteten; aldrig bara siffran.

| Roll | Thread ID | Host | Registrering |
|---|---|---|---|
| 1 | `01a12cf5-3a61-7e90-a366-1c3eb86b96c1` | local | READY + ACK på `b5b7474e…` |
| 2 | `01a12cf6-1203-7193-a9d6-6ab122908d3f` | local | READY + ACK på `b5b7474e…` |
| 3 | `01a12cf6-8cad-7480-af40-9663cb1bf9b4` | local | READY + ACK, readonly, på `b5b7474e…` |

Samordnaren hittar dem med `list_threads`, bekräftar READY via `read_thread`,
registrerar deras faktiska ID:n och använder `send_message_to_thread` för
uppdrag. Svaret ACK på första meddelandet verifierar kanalen. Därefter används
`wait_threads` med cursor och kort `read_thread` vid slutresultat. Rapportering
sker i arbetarchatten, inte genom returmeddelanden till denna sidokonversation.

Samordnarens chatt är `01a12cf8-055c-7640-a5bc-f971dd1fc41b`.
Planen + arbetarchattarnas resultat är återstartspunkten. Kontakten är
verifierad med READY och ACK för alla tre roller. Den befintliga chatten
`3 - DATABASER` är inte roll 3 och ska inte styras av denna plan.

## Körbord — samordnaren är enda redaktör

**Lokalt implementerat och slutgranskat 2026-10-12. Inga arbetare har kvar
skrivfönster. Integrationen är sparad i lokal commit `b8df64b29`;
publicering, schemaläggning och liveacceptans ingår inte.**

Jakobs separat godkända env-uppföljning 2026-10-12:
`SAJTMASKIN_POSTCHECKS_SCHEDULE_ENABLED=0` är sparad i huvudcheckoutens och
arbetscheckoutens ignorerade `.env.local` samt verifierat i Vercels Development,
Preview och Production för `sajtmaskin`. Endast exakt `1` tillåter återstartsarbete;
flaggan är inte ett datum eller ett schema och påverkar inte vanlig generering.
Ingen cron-post, push, deploy eller aktivering har gjorts. Kontrakt och driftgräns
finns i [ENV](../../../ENV.md#automatisk-återkoll-av-ofärdiga-efterkontroller).
Uppföljningen har 50 riktade offlinetester samt cachefri typkontroll/lint gröna.

Arbetsgren: `codex/llm-legacy-cleanup`. C1.4-integrationens föregående checkpoint:
`24b9bc8ae17733765f5735fa6a9a8de28993d977` (C1.3t, nio filer).
Slutcheckpoint identifieras i grenens Git-historik som
`refactor: make postchecks server-owned and remove client orchestration`.
Arbetskopian ovan är verifierad; primärcheckouten och den arkiverade 1634 används inte.
Ingen push har gjorts. Origin/preview var vid senaste readonly-kontroll `b5b7474e…`.

A1/A2, säkra B1/B2 samt C1.1–3a/b/cf/c0/im/q/c1/m/p/save är lokalt verifierade
och paketgranskade. Exakta C1-checkpoints och bevisgränser finns i
[C1](aktiviteter/C1-serveragd-efterkontroll.md), övriga i respektive aktivitet.
Paketreview är inte det slutliga färskkontext-Buggpass-kvittot inför publicering.

C1.3d är fryst: fyra filer, 189 riktade mocktester och cachefri
typecheck/lint/diff/plan PASS. Review fann modellstart efter originaldeadline
vid en sen betalreservation. C1.3d-fix är nu fryst i ytterligare fyra filer:
60 riktade tester och cachefri typecheck/lint/diff/plan PASS. Deadline kontrolleras
före/efter reservation och före fixerstart; ingen förlängande floor för
deadlinecaller, falsk observation, retry/merge eller extra llmPasses.
Sparad reservation och omittedmanualdefaults består. D4/p7/plan3/r2 hashbevarade.
3 har stängt fyndet och slutgranskat d8 utan nya fynd. Sparat lokalt i
`a906b951fdc4987326b23dc3740013ac1fb77502`, produkt +86/test +227.
Alla 13 dåvarande WIP-innehåll bevarades; index tomt efter commit.

Tidigare verktygsnekningar är lösta genom uttryckligt direkt godkännande i 1:
d-fix userMessage `01a12f2b-6a91-7f40-8194-f8279f55032c`;
r userMessage `01a12f30-d969-7bc2-8af9-6e1a4a44545a`.
1 har ACK:at båda. Inga alternativa skrivvägar användes.
R är nu klart i `6a378746f…`: 102 tester, lint/diff/plan PASS och återanvänd
cachefri tsc. 3:s slutreview utan fynd; båda slutblobbarna hashstabila.
Ett Vitest-fasadmockfel vid parallell import rättades vid canonical query-owner;
idempotensassertions är kvar. Produkt +179/test +244. Alla fem dåvarande
WIP-innehåll bevarades vid commit. Endast tre rootplaner återstår som WIP.

C1-save i `72e0162c0`: tolv mocktester och cachefri typecheck/lint/diff/plan PASS;
3 utan fynd, tre scopehashar stabila. Alla tio dåvarande WIP-innehåll bevarades
vid commit. Produkt −5/test +76. Sparas extra materialiseringsflagga och
oanvända media-argument är borta; generering/GET/export/deploy är ännu orörda.

C1.3t är klar: obligatorisk ursprunglig request-deadline genom init/followup,
brygga och stream till post-finalize. 112 mocktester, cachefri tsc/lint/diff/plan
PASS. 3 utan fynd, nio stabila blobbar. Produkt +20/test +111. Alla tolv WIP-
innehåll bevarades vid commit. Konsumtion/dispatch kopplades därefter in i C1.4.

C1.4-server är fryst: 19 filer, produkt +56/test +655. 467 unika offlinetester
i 14 sviter och cachefri tsc/lint/diff/plan PASS, med oförändrade resultat
återanvända. Alla 38 äldre wrapperfall behållna. Samma servercore driver
generation och den oschemalagda återstarts-routen; gamla parallella
post-finalize-dispatcher är borttagna (filnetto −346). 3:s preliminära review
stängde urvalets policyblockerade batchsvält och verifierade faktisk core/wait
för sen runtimebekräftelse. Slutlig integrationsreview är CLEAN, utan fynd.

C1.4-client är fryst: 36 paths, 14 filer raderade (sju produkt/sju tester),
produkt netto −4 805 rader. Automatisk materialisering, klientefterkontroll,
kö/tail och reopen-resume är borta; GET läser bara sparad snapshot. Manuella
reparationsbeslut, typed bildpolicy, observation och övriga skrivverb består.
329 tester i 24 sviter, cachefri tsc/lint/testupptäckt/diff/plan PASS. Root har
kontrollerat 58/58 manifestposter före docsändringarna. Arkitektursidornas gamla
klientägarskap och trasiga länk rättas i samma integrationspaket.

Cron-posten i vercel.json nekades av verktygsprövningen eftersom en framtida
deploy kan aktivera betalt arbete. Den är inte införd eller återförsökt via
annan väg; vercel.json är oförändrad. Oschemalagd autentiserad route och lokala
tester accepterades separat. Automatisk periodisk återstart/importverifiering
är därför ett explicit kvarstående publiceringsbeslut, inte färdig runtime.
Ingen live-DB/provider/model/Blob, push eller aktivering har skett.

Oberoende färskkontext-underagent verifierade samtliga 41 kod-/testhashar och
14 raderingar samt server/klient-integrationen utan konkreta fynd. Root körde
ytterligare 49 dokumentationstester i fyra sviter; docs:check/docs:links,
plans:history:check, check:terms:contract, canvas:check, route-timeouts:check,
knip:files och staged diff/plan --no-fetch PASS. Knip gav en icke-blockerande
konfigurationshint om logs/**, inga oanvända filer. Oförändrad produktkod
behövde inga nya tester eller fixar efter de frysta paketen.

Det lokala arbetet är klart. Nästa eventuella uppdrag är separat beslut om
schemaläggning och publicering med befintliga Buggpass-/CI-/runtimegrindar.
Planen ligger kvar i active eftersom ingenting är mergat eller publicerat.

Ett separat godkänt DEV-modellprov 2026-10-12 gav fungerande desktop/mobil-preview,
produktkontroll och Spara/återöppning utan nya anrop: $0.221461, cirka 2,33 SEK,
0 debiterade credits. Kvalitetsgrind och LiveReview var av via befintlig env/grant;
de är inte runtimeaccepterade. Brief-kostnaden saknar versionens billingbindning;
avstämningsavvikelsen och exakta kvitton finns i [D1](aktiviteter/D1-integration-och-leverans.md).
Testcredentials är sparade som separata operatörs-env lokalt och krypterat i Vercels
tre miljöer. Schemaläggningen förblir `0`; ingen push eller aktivering.

| ID | Aktivitet | Utförare | Beroende | Status |
|---|---|---|---|---|
| A1 | [Typat byggunderlag](aktiviteter/A1-typat-byggunderlag.md) | 1 | registrering | lokalt klar, review utan fynd; runtime ej verifierad |
| A2 | [Gemensam kandidat och eval](aktiviteter/A2-projektkandidat-och-eval.md) | 1 | A1 | lokalt klar, 339 tester; slutlig review utan kvarvarande fynd |
| B1 | [Legacy-rensning](aktiviteter/B1-legacy-rensning.md) | 2 | registrering | lokalt klar för säkra delen, review utan fynd |
| B2 | [Ägare och dokumentation](aktiviteter/B2-agare-och-dokumentation.md) | 2 | berörda kodpaket | lokalt klar, netto −408 rader i B2.2; review utan fynd |
| C1 | [Serverägd efterkontroll](aktiviteter/C1-serveragd-efterkontroll.md) | 1 + 2, oberoende review | A1 + A2 | lokalt klar och slutgranskad; schemaläggning/runtime separat |
| D1 | [Integration och leverans](aktiviteter/D1-integration-och-leverans.md) | samordnare + readonly-underagent | föregående paket | lokal integration/docs/verifiering klar; ingen publicering |

Tilldelning: `PAKET <ID/del> | HEAD <sha> | skrivytor <paths> | mål <en mening>`.
Skrivrätt gäller angivet paket tills agenten rapporterar klart/blockerat.
Samordnaren skickar inte konkurrerande skrivuppdrag och ändrar inte delade
planfiler medan en arbetare skriver. Readonly-recon får löpa parallellt;
observationer under pågående ändring märks preliminära tills paketet är fryst.
Ingen branchväxling, stage, commit eller återställning av andras arbete.

Rekommenderad ordning: kort B1-recon parallellt med A1; släpp en tydlig liten
B1-rensning först om den är självständig. Sedan A1 → A2 → C1, B1:s kvarvarande
delar och B2 i lediga skrivfönster. 3 inväntar avgränsade granskningsuppdrag.

## Städa offensivt, verifiera proportionerligt

- Bevisad intern dödkod, onödiga wrappers och ersatta fallbacks: ta bort i
  samma paket som referenser/tester/docs. Skapa inte nya deprecated-kopior.
- Extern route, gammal klient eller sparat format: befintlig
  [livscykelpolicy](../../../documentation-lifecycle.md) gäller. Saknat
  trafikunderlag parkerar just borttagningen, inte hela städprogrammet.
- Återanvänd tester. Lägg bara till regressionstest för beteende som ändras
  eller skydd som annars saknas. Smak/nits är inte blockers.
- Per runtimepaket: typecheck + berörda tester. Docs: relevant docs-kontroll.
  Full regression via befintlig CI; inga fullbyggen per agent eller per fil.
- Högst fyra testworkers där verktyget stöder det. Verifiera Node-pin före
  körning. Läs `verify:pr -- --plan`; en plan är inte ett testresultat.
- Före publicering används befintligt oberoende Buggpass, inte extra betalda
  parallellpass. Samla fynd och rätta i en omgång; granska sedan delta.
- Ingen återkörning utan ändrade berörda filer, miljö eller konkret fel.
- Ingen säkerhetsförsvagning, tenant-/revisionsbypass eller DB-radering som
  "cleanup". Fråga vid ny infrastruktur, datamigration eller ändrad produktpolicy.

## Kort rapport och återstart

En paketrapport: max cirka 200 ord, plus kommandon/bevispekare:
`ID; bas/current HEAD; ändrade paths; borttaget/förenklat; tester + utfall;
kvarvarande risk/beslut; nästa steg; skrivrätt släppt`.
Chatt 3 rapporterar endast konkreta fynd: säkerhet %, impact 1–5, plats,
konsekvens och kort motivering; inga långa omskrivningar av diffen.

Aktivitetsfilens Resultat ersätts med aktuellt koncentrat av samordnaren efter
paketet. Behåll inte dagbok eller kopior av chattloggar. Vid kontextbyte läs
denna körtabell, aktuellt aktivitetsresultat och senaste rapport i rätt chatt.
Ingen polling-loop eller bakgrundsautomation behövs under registreringsväntan.

## Klart betyder

Alla aktiviteter har verifierat utfall eller uttryckligt uppskjutet delbeslut;
uppskjutet är inte utfört. Kod- och runtimeacceptans särredovisas.
Visa vilka körvägar, fallback-val, återtolkningar och dokumentdubbletter som
faktiskt försvunnit. Ange netto-diff och mät bara förbättrad latency/LLM-kostnad
om jämförbart underlag finns. Tester och nödvändiga skydd räknas inte som skräp.

Implementerat lokalt, granskat, publicerat på preview och runtimeverifierat är
olika tillstånd. Fråga Jakob före preview-push med exakt SHA. Master och DB
kräver separat mandat. Vid färdig leverans följs befintlig planlivscykel;
denna mapp ska inte bli en permanent extra manual.
