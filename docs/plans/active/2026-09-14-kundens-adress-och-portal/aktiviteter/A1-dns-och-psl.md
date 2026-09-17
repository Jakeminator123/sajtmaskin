# A1 — DNS för riktiga kundvärdnamn och PSL-underlag

## Genomförandestatus 2026-09-15

**DNS-delen är levererad. PSL kvarstår.** Read-only mätning 2026-09-15 21:55
CEST (resolver `80.58.61.254`):

| Värdnamn | CNAME-mål | HTTPS |
|---|---|---|
| `pilot-a.sites.sajtmaskin.se` | `dd208d0d1d5d62f6.vercel-dns-016.com` | 200, `<title>A1 PILOT A</title>`, `noindex` |
| `pilot-b.sites.sajtmaskin.se` | `5cad42c9d9941af8.vercel-dns-016.com` | 200, `<title>A1 PILOT B</title>`, `noindex` |

Skilda CNAME-mål och skilt innehåll per host; TLS utan certfel. Det uppfyller
leveranskravet nedan. `sites.sajtmaskin.se` saknar egen A-post — väntat, MVP
använder exakta CNAME per slug.

Den tidigare 03:49-mätningen kollade `pilot-a1-test.sites.sajtmaskin.se`, ett
värdnamn som aldrig lades upp, och drog NXDOMAIN av det. Den slutsatsen gällde
alltså inte piloterna.

PSL: avvakta. Ingen ansökan. Litet/beta, ingen `sites.*`-volym, portalens
cookie-skydd ägs av A2.

#1380 bar 03:49-mätningen plus en SHA-bunden `HANDOFF.md`. HANDOFF:en är stale
efter #1369–#1386; stäng #1380 utan merge i stället för att hålla en andra
masterplan.

Område: [01](../01-varumarkta-adresser.md). Driftpaket. DNS-delen behövs före
[A4](A4-aktivering-och-migrering.md); PSL-spåret är separat.

## Leverans

Två provvärdnamn under `sites.sajtmaskin.se` pekar på två olika kundprojekt och
svarar med giltig HTTPS och rätt innehåll. Enbart `sites.sajtmaskin.se` som A-
eller CNAME-post ger inte DNS för underliggande sluggar.

## Gör

1. Läs aktuell zon och projektens rekommenderade DNS-värden. Runbookens
   one.com-tabell bär senaste mätningen; mät om före skarp skrivning.
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
