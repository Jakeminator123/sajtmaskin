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

Ej startad. Inget commit-/push-/merge-/DB-mandat är registrerat för detta initiativ.
