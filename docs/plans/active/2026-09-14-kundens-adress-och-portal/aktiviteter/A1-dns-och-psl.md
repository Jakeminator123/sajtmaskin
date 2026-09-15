# A1 — DNS för riktiga kundvärdnamn och PSL-underlag

Område: [01](../01-varumarkta-adresser.md). Driftpaket, inte utfört i plan-PR:n.
DNS-delen behövs före [A4](A4-aktivering-och-migrering.md); PSL-spåret är separat.

## Leverans

Två provvärdnamn under `sites.sajtmaskin.se` pekar på två olika kundprojekt och
svarar med giltig HTTPS och rätt innehåll. Enbart `sites.sajtmaskin.se` som A-
eller CNAME-post ger inte DNS för underliggande sluggar.

## Gör

1. Läs aktuell zon och projektens rekommenderade DNS-värden. Runbookens
   one.com/NXDOMAIN-uppgifter är från 2026-08-24 och måste mätas på nytt.
2. MVP-standard: lägg exakta CNAME-poster för pilotens sluggar hos aktuell
   DNS-operatör och exakta alias på respektive Vercel-projekt. Domäner får inte
   alla bindas till Sajtmaskins eget app-projekt.
3. För större utrullning: undersök en wildcard-DNS-post för `*.sites` eller
   delegering av bara `sites`-zonen. Godta wildcard-DNS först när den fungerar
   för två olika projekt enligt Vercels aktuella anvisningar. Varje kundhost
   behöver fortfarande rätt projektkoppling och fungerande certifikat.
4. Skilj wildcard-DNS från ett wildcard-alias/certifikat hos Vercel. Det senare
   har nameserverkrav. Flytta inte hela `sajtmaskin.se`-zonen av bekvämlighet.
5. Verifiera DNS och HTTPS per testhost, inklusive rätt innehåll. Dokumentera
   aktuella värden och observationstid i
   [runbooken](../../../../runbooks/branded-user-urls.md).

Vercel anger projektspecifika värden; hårdkoda inte `76.76.21.21` eller
`cname.vercel-dns.com` som universellt facit.
[Källa: konfigurera domäner](https://vercel.com/docs/domains/working-with-domains/add-a-domain).

## PSL är ett separat långsiktigt spår

Läs [PSL:s aktuella riktlinjer](https://github.com/publicsuffix/list/wiki/Guidelines)
innan en ansökan förbereds. Små/beta-projekt kan avslås; en godkänd ändring tar
också tid att nå konsumenterna. Dokumentera skäl, verksamhet, ägarverifiering,
registreringstid och kontaktvägar sanningsenligt. Skicka inte en ansökan som
förutsätter framtida användarvolym. Inlämning till annat repo ingår inte i denna PR.

Ingen env-flagga är bevis på att alla webbläsare använder liständringen.
[A2](A2-branded-eligibility.md) avgränsar pilotens risk även om PSL dröjer eller
avslås. DNS-kod, portal och Stripe-testflöden kan byggas under tiden.

## Klart när

- Två exakta testvärdnamn når två rätta projekt över HTTPS.
- Vald skalningsväg och faktiska DNS-värden är dokumenterade.
- PSL-spåret har ett ärligt underlag eller en dokumenterad anledning att avvakta.

Rotdomänen, `www`, e-postposter och Fly-preview ändras inte av detta paket.
