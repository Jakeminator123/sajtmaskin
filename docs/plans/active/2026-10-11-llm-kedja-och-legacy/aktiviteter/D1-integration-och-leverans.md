# D1 — en samlad integration, inget kontrollberg

Utförare: samordnaren. Oberoende granskare: 3 för tidigare paket, ny readonly-
underagent för slutlig integration efter bruten appkontakt; inga författarändringar.
Beroende: föregående paket. Status: se [körbordet](../00-master-plan.md).

1. Stäng varje aktivitet med verkligt utfall. Separera parkerad extern radering,
   lokal kodklarhet och återstående runtimeacceptans. Återöppna inte levererade
   delar från andra planer eller förklara deras kvarvarande krav uppfyllda.
2. Sammanställ exakt diff och återanvänd riktade testkvitton för oförändrade
   filer/miljö. Kör endast nytillkommen integration och aktuell plan.
3. Commit kräver mandat. Därefter genereras exakta bas/head/prompt/schema med
   befintlig Buggpass-väg. Chatt 3 granskar självständigt och returnerar faktisk
   rapport enligt den vägen; samordnaren importerar, triagerar och disponerar fix.
4. Ingen korsreview ersätter nödvändigt oberoende kvitto. Ingen ny betald
   API-bot som extra krav. Om chatt 3 inte uppfyller oberoende-/formatkravet:
   redovisa det och välj tillåten färsk reviewväg före publicering.
5. Samla riktiga fynd i en rättningsrunda; granska delta/integration därefter.
   Följ befintlig gräns om tre rundor och ägarbeslut för ytterligare pass.
6. Läs aktuell leveranspolicy. Fråga Jakob före preview-push med exakt SHA;
   verifiera CI och deployment separat efter godkänd push. Ingen Master-merge.

Mät enkelhet med borttagna vägar/fallbacks, färre ägare för samma beslut och
färre duplicerade bearbetningssteg. Netto-rader är stöd, inte mål. Gör inte
latency-/kostnadspåståenden utan mätning; en betald benchmark är inte obligatorisk.

Vid avslut: tunn stabil dokumentation på rätt plats, kvarvarande delbeslut
tydligt ägda och planlivscykeln följd. Ingen ny kontrolltjänst eller permanent
rapportmapp ska vara restprodukten av städningen.

## Resultat

Jakob godkände 2026-10-12 lokala Git-commits efter verifiering och granskning.
Inget push-/PR-/merge-/drift-/DB-apply-mandat finns. Lokal implementation,
riktad verifiering och integrationsreview är klara; inget publiceringsbundet
Buggpass-/leveranskvitto är ännu utfärdat.
A1/A2, den säkra B1/B2-delen och C1.1–3a/b/cf/c0/im/q/c1 är lokalt
paketgranskade och riktat verifierade. Atomicbootstrap, delade bild-/preview-/
QG-ägare och serverägt produktresultat är införda. Produktkontrollen finns i
`c681e6fe778a158c88ff6633ed62f0c1f15d330a`; q finns i `46034ed3f…`.
q: 176 tester och review utan fynd, produkt −92/test +172. c1: 26 filer,
produkt −408/test +350; konkret reviewfynd om klientdom är stängt efter
16-fils deltareview och återanvänd granskning av tio oförändrade filer.
Alla 48 dåvarande WIP-filinnehåll bevarades vid c1-commit, index tomt.

C1.3m är committat i 177f0d500: 215 riktade tester, typecheck/lint/diff/plan
och 3:s slutreview PASS. C1.3p i 4047f4ce0: 130 mocktester, samma kontroller
och sju granskade stabila blobbar. C1-save i 72e0162c0: tre filer, produkt −5/
test +76; tolv mocktester och review PASS. Spara startar inte extra bildarbete.

C1.3d + d-fix är sparade i a906b951fdc4987326b23dc3740013ac1fb77502:
åtta filer, produkt +86/test +227. Bas 189 tester, fix 60 riktade (ingen
överlappande totalsumma), cachefri tsc/lint/diff/plan PASS. 3 har stängt fyndet
om modellstart efter en försenad reservation och granskat alla åtta blobbar.
Alla 13 dåvarande WIP-innehåll bevarades vid commit.

C1.3r är sparat i 6a378746f4d783fbfda4c6092b5c99f231ec3bd2:
två filer, produkt +179/test +244; 102 tester, lint/diff/plan PASS och cachefri
tsc återanvänd. 3:s slutreview utan konkreta fynd. Canonical importförläsning
undviker extra poolanslutning under lås; current version/lease/kvittoauthority
verifieras i TX. Ett fångat Vitest-fasadmockfel rättades vid query-ägaren utan
försvagade samtidighetsassertions. Samtliga fem dåvarande WIP-innehåll bevarades.
Tidigare mandatstopp är lösta via direkta specifika användarmeddelanden i 1,
inte bypass. Endast tre rootplaner är WIP före nästa skrivfönster.

C1.3t är sparat i 24b9bc8ae17733765f5735fa6a9a8de28993d977: nio filer,
produkt +20/test +111. 112 mocktester, cachefri tsc/lint/diff/plan PASS och
3:s review utan fynd med nio stabila blobbar. Alla tolv dåvarande WIP-innehåll
bevarades. Ursprungsdeadline trådad och därefter konsumerad av C1.4-servercore.

C1.4-server/client är frysta och skrivrätten överlämnad till samordnaren.
Servermanifestet: 19 filer, 467 offlinetester/14 sviter, produkt +56/test +655.
Klientmanifestet: 36 paths, 329 tester/24 sviter, produkt −4 805 och 14 filer
raderade. Båda har cachefri tsc/lint/diff/plan PASS; klienten även testupptäckt.
Root verifierade 58/58 poster (inklusive borttagningar och tre skyddade planer).
Klientens manifest-SHA256 är
`DB15CBF379CA410031E23BFCF9BC78F190D2777C2FE8AE1E75AD5320EEEAD74E`.
Ingen kod behöver flyttas från chattarna; allt finns redan i arbetskopian.

Samordnaren har synkat llm-pipeline, quality-gate-flow och templates till
faktisk serverägare och tagit bort den brutna länken. Ny oberoende readonly-
underagent slutgranskade kombinationen mot 24b9bc8ae17733765f5735fa6a9a8de28993d977:
CLEAN, inga konkreta integrationsfynd; 41 kod-/testhashar och 14 raderingar
matchade. Rapporten återanvänder oförändrade offlinebevis, inte liveacceptans.

Root: 49 dokumentationstester i fyra sviter PASS. docs:check/docs:links,
plans:history:check, check:terms:contract, canvas:check, route-timeouts:check,
knip:files, staged diffcheck och plan --no-fetch PASS. Knips enda output var
en icke-blockerande konfigurationshint om logs/**. Ingen ny kodfix krävdes.
Gemensam lokal checkpoint sparas med meddelandet
`refactor: make postchecks server-owned and remove client orchestration`.
Sista paketets produktnetto är −4 749 rader inklusive timeoutmappningens +4;
test-/docs-rader räknas separat. Inga latency-/kostnadsbesparingar har mätts.

Cron-posten nekades av verktygsprövningen och är inte införd; vercel.json är
oförändrad. Den förberedda routen är oschemalagd. Automatisk periodisk
återstart/importverifiering kräver separat godkännande och runtimeprov före
publicering. Detta får inte döljas av att klientens gamla återstart är raderad.

Lokal checkpoint är inte leveransgodkännande eller runtimeacceptans. Inget
fullbygge, live-DB-/provider-/modelltest eller schemaprov har körts. Node/Volta
22.23.1 och engines >=22.14.0 <23 kontrollerades igen före dokumentkontroller.
Slutligt färskkontext-Buggpass och publiceringsgrindar återstår före eventuell
push; befintlig paketreview får inte presenteras som ett sådant kvitto.
