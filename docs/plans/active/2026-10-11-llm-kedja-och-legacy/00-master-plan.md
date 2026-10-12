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
- Inga nya worktrees, underagenter eller parallella skrivare utan nytt mandat.
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

**Aktuell skrivrätt: 1, C1.3c1:s åtta produktägare och riktade tester efter lokal C0-checkpoint.**
A2.2, B2.2 och C1.1 är lokalt klara och slutgranskade utan kvarvarande fynd.
C1.2b är slutgranskat på `1c12697d…` + delta, utan kvarvarande fynd.
286-resultatbasen återanvänds där oförändrad; senaste looprättningen har
29 berörda tester samt typecheck/diff PASS. Ingen summering av överlappande tester.
Lokal checkpoint före C1.3cf är `99bd32ad033a641807de04b3686a8a7a8f619090`;
arbetsytan var ren efter commit. Origin/preview har därefter kontrollerats med
readonly `git ls-remote` och är fortfarande `b5b7474e…`. Inget pushat.
C1.3a är lokalt implementerat och produktgranskat utan fynd, med åtta stabila
produkthashar. 74 finalize-tester, typecheck och diff-check PASS; tidigare
oförändrade riktade resultat återanvänds utan överlappande totalsummering.
19 äldre A1/A2-testfixturfel är rättade; 3:s slutliga testreview är utan fynd.
Jakob godkände uttryckligen 2026-10-12: "Ja, ersätt och ta bort gamla
startvägen". Okänd/äldre historik får inte nya automatiska betalda försök;
manuell reparation finns kvar. C1.3a–b är nu lokalt committade.
C1.3b är lokalt klar: 71 riktade tester, typecheck utan cache, diff och
verifieringsplan med --no-fetch PASS. 2 har släppt skrivfönstret; 3:s review av
fem produktfiler och fem tester är utan fynd, tio hashvärden stabila.
Produktnetto −2 rader efter borttagen extra slutrad, routes 481→205 rader.
C1.3c0:s tidigare patch nekades i väntan på direkt mandat; inget applicerades då.
Jakob har nu uttryckligen godkänt lokal implementation av LiveReview-skyddet
med bibehållna kostnadstak och fortsatt städning med 1, 2 och 3. Ingen push,
aktivering eller live-DB-ändring. C1.3c0 är nu lokalt klar: 111 unika tester i
fem filer, typecheck, riktad lint, diff och verifieringsplan PASS. 3:s slutreview
har inga fynd, sex scopehashar stabila. Produktnetto +106, tester +328.
Skyddet kopplas in via nästa produktkontrollspaket; inte runtimeacceptans.
C1.3cf är lokalt klar och slutgranskad utan fynd: beteendeidentisk formatterflytt
till befintlig serverneutral owner, direkta importer och nio textidentiska tester.
126 riktade tester, typecheck utan cache, diff-check och verifieringsplan PASS.
Fem scopehashar är oförändrade efter avbrottet och 3:s återupptagna slutreview.
2 har släppt skrivfönstret. Netto +1 produktrad och +6 testrader; ingen ny ownerfil.
Formatterflytten och planerna är sparade i lokal commit
`dc7f14cc6a474708e29b8ab9694d4cbd91dd7b39`; ren checkout verifierad vid återstart.
Docs-länkar och uppdaterad plan/diff PASS.
Git-åtkomstfelet efter avbrottet var sandboxrelaterat; readonly eskalering visade
korrekt checkout/HEAD, exakt sju väntade WIP-filer och tomt index. Inget förlorat.
Prioritera nu rak serverkedja och radering av ersatta klientvägar. Behåll
befintliga skydd där de hör hemma, inga nya generiska kontrollager.
C1.3im är lokalt klar: held-only heal/Blob-förberedelse i befintlig image-owner,
en snapshot-CAS och ny revisionskvittens, valfri signal/deadline i bildmotorn.
78 mockade tester, typecheck utan cache, lint/diff/plan PASS. 2 har släppt
skrivrätten; fyra scopefiler fryses för 3:s review. /files GET och klientvägar
raderas först vid inkoppling. Inget verkligt provider-/DB-bevis.
Manuellt Spara materialiserar också idag; den följdytan får inte tappas tyst.
C1.3c1 kopplar nu in LiveReview-skyddet: tunn produkt-route + gemensam serverkärna,
en atomisk serverägd logg-/claim-completion, klientens attested POST blir replay.
Ta bort ersatta unheld-reservationen, separata completion och deadlinegolvet.
Ingen cron, aktivering, live-DB-ändring eller runtimeacceptans ännu.
Lokal gren är `codex/llm-legacy-cleanup`.
Samordnaren sparar granskade och verifierade uppgiftsfiler i lokal checkpoint
enligt Jakobs commitmandat. Inga orelaterade filer får stageas. Den tidigare
snapshoten kommer från appens arkivering; ingen push eller driftändring ingår.
Rätt till en aktivitet är inte rätt att själv ta nästa.

| ID | Aktivitet | Utförare | Beroende | Status |
|---|---|---|---|---|
| A1 | [Typat byggunderlag](aktiviteter/A1-typat-byggunderlag.md) | 1 | registrering | lokalt klar, review utan fynd; runtime ej verifierad |
| A2 | [Gemensam kandidat och eval](aktiviteter/A2-projektkandidat-och-eval.md) | 1 | A1 | lokalt klar, 339 tester; slutlig review utan kvarvarande fynd |
| B1 | [Legacy-rensning](aktiviteter/B1-legacy-rensning.md) | 2 | registrering | lokalt klar för säkra delen, review utan fynd |
| B2 | [Ägare och dokumentation](aktiviteter/B2-agare-och-dokumentation.md) | 2 | berörda kodpaket | lokalt klar, netto −408 rader i B2.2; review utan fynd |
| C1 | [Serverägd efterkontroll](aktiviteter/C1-serveragd-efterkontroll.md) | 1 + 2, granskning 3 | A1 + A2 | C0 slutgranskad; im lokalt klar till review; c1 produktinkoppling till 1 |
| D1 | [Integration och leverans](aktiviteter/D1-integration-och-leverans.md) | samordnare + 3 | föregående paket | lokal checkpoint för klara paket; slutlig integration/leverans återstår |

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
