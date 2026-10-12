# D1 — en samlad integration, inget kontrollberg

Utförare: samordnaren. Oberoende granskare: 3, inga författarändringar.
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
Inget push-/PR-/merge-/drift-/DB-apply-mandat finns. Implementation och riktad
verifiering pågår; inget slutligt Buggpass-/leveranskvitto är ännu utfärdat.
A1/A2, den säkra B1/B2-delen och C1.1–2b är paketgranskade och riktat
verifierade för en lokal checkpoint. C1:s atomicbootstrap, gemensamma serverägare,
cron och klientavveckling återstår. Lokal checkpoint är inte leveransgodkännande
eller runtimeacceptans; inget fullbygge eller betalt modelltest har körts.
Checkpoint `a9f209e95f3f8f68bf4a1c08c6cc88d20c579270` skapad lokalt;
ren arbetsyta verifierad direkt efter commit. Nuvarande checkpoint ovanpå
arkivsnapshoten ändrar 66 filer; hela initiativet mot `b5b7474e…` är 89 filer,
+3372/−2333 inklusive planer och tester. Det är inte ett mått på produktkodens
netto eller latency/kostnad. Färsk verifieringsplan, docs:check och docs:links
PASS; Node/Volta 22.23.1. Fullprofilen planeras men är inte exekverad lokalt.
