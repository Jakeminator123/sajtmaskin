# A4 — Pilot och migrering av publicerade sajter

## Genomförandestatus 2026-09-15

**Inte levererad.** Ingen aliasbindning, ingen `--apply`, ingen branded
live-URL. A3:s kodflagga öppnar inte A4. A1:s DNS-del är levererad; A4 väntar
nu på A3:s runtimebevis och ett konkret driftmandat.

Område: [01](../01-varumarkta-adresser.md). Drift efter A1:s DNS-del, A2 och A3.
Behörig operatör eller agent utför med konkret mandat. Denna plan-PR ändrar inget
på Vercel, i DNS eller i databasen.

## Före pilot

- Valet i [masterplanen](../00-master-plan.md) om begränsad utrullning är fastställt.
- Två exakta testalias når rätt separata projekt med giltig HTTPS. Uppfyllt av
  A1:s `pilot-a`/`pilot-b` 2026-09-15.
- Eligibility gäller både publicering och migreringsskriptet; portalens
  grundskydd är kontrollerat.
- Primäradress, redirects och rollback har verifierats på kundtestdeployment.
- Pilotprojekt och bevarade deployment-/adressreferenser finns i körunderlaget.

PSL-godkännande är inte ett krav för den begränsade piloten. Interna/egna
testprojekt kan förberedas medan avtalsfrågan utreds. Tillämpliga konto-/order-
villkor bedöms före en extern kundpilot enligt masterplanen, även om den är
gratis. Inget leverantörsmedgivande antas och inget partnerbrev krävs för själva
planerings-/utvecklingsarbetet.

## Körning

Följ [adressrunbooken](../../../../runbooks/branded-user-urls.md). Bekräfta
DB-målet med `db:check-target` innan skrivning. Preview använder delad
prod-databas och är därför inte ett isolerat migreringstest.

1. Torrkör migreringsskriptet med explicit projekt-ID. Kontrollera eligibility,
   målprojekt, befintlig egen domän, alias och senaste READY-deployment.
2. Applicera på ett godkänt testprojekt, verifiera DNS och TLS.
3. Ompublicera rätt version för att få A3:s env/metadata/redirect i runtime.
   Återanvänd inte automatiskt senaste utkastet. Plattformsmigrering ska inte
   debitera kundens credits.
4. Kontrollera adressen i produkt och via HTTPS, sedan rollback för samma projekt.
5. Aktivera begränsad nypublicering och migrera äldre sajter i små satser med
   explicit urval/progress. En ensam `--limit` garanterar inte nya projekt
   vid nästa körning; kontrollera skriptets urval och idempotens.

## Migreringsresultat

| Status | Bevis |
|---|---|
| Alias kopplat | Rätt projekt, DNS/TLS fungerar |
| Runtime migrerad | Rätt metadata och primärhost; provider-vägen är prövad |
| Uppskjuten | Skäl, t.ex. eligibility, beroende på gammal adress eller byggfel |

Ett DB-värde eller alias ensamt är inte en fullständig migrering. Befintlig egen
domän har företräde; byt inte kundens primäradress under en branded-migrering.

## Rollback och klart

En ändrad appflagga återställer endast appens URL-val. Byggda redirects/metadata
hanteras separat enligt [A3](A3-kanonisk-host-guard.md). Radera inte den host
som en redan publicerad redirect pekar mot innan den ersatts.

Klart för pilot när samma testprojekt har verifierad publicering och rollback.
Klart för bredare migrering när varje urvalt projekt har runtimebevis eller
ett uttryckligt kvarstående undantag. Aktuella driftfakta förs in i runbooken.
