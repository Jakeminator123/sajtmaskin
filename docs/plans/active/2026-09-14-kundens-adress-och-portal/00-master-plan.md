# Kundens adress och portal — reviderat MVP-förslag (2026-09-14)

> **Status: plan för granskning, inte aktiverad funktion.** Jakob har bett om
> granskning och planändringar. Denna dokumentations-PR får granskas och mergas
> utan att de föreslagna produktvalen därmed räknas som ratificerade. Ingen
> kundsajt, DNS, betalning eller databas ändras av PR:n. Förslagen nedan flyttas
> till [beslutsloggen](../../../decisions/README.md) först efter Jakobs svar.

Underlag: bifogade planfiler, kod på `preview`
`5cbdc34f0166e989ad9d7a7231dbf9dac6e1b1dc` och leverantörskällor kontrollerade
2026-09-14. Vid kontrollen fanns ingen öppen plan-PR; de fem öppna PR:arna var
beroendeuppdateringar. DNS- och env-status i äldre runbooks är historiska
observationer, inte nya driftmätningar.

## Idén

- Sajtmaskin säljer en webbplatstjänst: skapande, redigering, publicering,
  domänkoppling och löpande drift i samma portal.
- Kunden äger sin domän hos en registrar och får exportera genererad kod och
  eget innehåll. Sajtmaskin administrerar hostingprojekten.
- Publicerade sajter får normalt `<slug>.sites.sajtmaskin.se` eller en
  verifierad egen domän. Provider-adresser blir interna tekniska adresser.
- Ett abonnemang gäller en sajt, oberoende av antal ompubliceringar eller
  domänalias. Credits för AI-arbete och befintliga påfyllnadspaket finns kvar.
- Först en liten pilot med enkla företagshemsidor och en användbar portal.
  Domänköp, generell DNS-editor, teamroller och trafikfakturering väntar.

## Svarsförslag på de fyra frågorna

Ordningen följer skärmbilderna. Fråga 3 bekräftar det redan fattade beslutet
2026-09-11 om per-sajt-abonnemang och blockerar inte planeringen på nytt.
Övriga preciseringar är rekommendationer, inte redan fattade ägarbeslut.

| Fråga | Föreslaget svar | Precisering för implementation |
|---|---|---|
| 1. Branded före PSL? | **A, med skärpt pilotavgränsning.** | Börja med uttryckligen godkända enkla sajter/versioner och grundskydd för portalen. Kända auth-/cookiesajter och okända fall använder egen domän eller väntar. Dossierlistan är en risksignal, inget isolationsbevis. Se [A2](aktiviteter/A2-branded-eligibility.md). |
| 2. När betalningen upphör? | **A: neutral paus, 90 dagars bevarande, export öppen.** | Förnyelsefel ger 7 dagars respit. Uppsägning gäller efter betald period. Domänkoppling och slug behålls under pausen. Ingen automatisk dataradering i MVP. Se [D3](aktiviteter/D3-avpubliceringspolicy.md). |
| 3. Per sajt eller konto? | **A: bekräfta befintligt beslut om per publicerad sajt.** | En sajt = ett `app_projects.id`; flera alias eller deployer ger ingen extra avgift. Ett konto kan ha flera separata sajt-abonnemang. |
| 4. Skriftligt Vercelmedgivande nu? | **Other: ingen separat kontakt som villkor för planering och MVP-utveckling.** | Närmast B om endast A–C kan väljas. Juridisk tillåtlighet är inte verifierad genom dokumentationen. Kontakta inte Vercel automatiskt. Se avsnittet nedan. |

## Vercel: skilj tekniskt stöd från avtalsbesked

[Vercel for Platforms](https://vercel.com/docs/platforms) beskriver uttryckligen
AI-byggare och ett projekt per kund. Det ger tekniskt stöd för arkitekturen.
[Vercels standardvillkor](https://vercel.com/legal/terms), uppdaterade 1 juni
2026, innehåller samtidigt breda begränsningar för återförsäljning och
service-bureau-användning i § 11. De granskade sidorna avgör inte hur just
Sajtmaskins tjänst bedöms eller vilka särskilda kontovillkor som gäller.

**Rekommendation:** behåll arkitekturen och fortsätt planering/utveckling utan
krav på ett separat partnerbrev. Lova inte att dokumentationen ersätter ett
avtal eller att MVP/Pro eller en gratis kundpilot automatiskt ger undantag. Att kalla avgiften
plattformstjänst förändrar inte i sig villkorens tillämpning. Ren vidareförsäljning
av Vercelåtkomst ligger utanför planen. Tillämpliga konto-/ordervillkor behöver
bedömas före första externa kundpilot, även om den är gratis; denna PR avgör
eller aktiverar inte den. Intern utveckling och egna testprojekt kan fortsätta
under tiden. Kontovillkorskontroll innebär inte automatiskt krav på ett nytt
partnerbrev. Ingen separat leverantörskontakt tas inom detta uppdrag.

## Tidigare beslut som ligger fast

[Beslutsloggen](../../../decisions/README.md) är ägare:

| Datum | Beslut | Följd |
|---|---|---|
| 2026-09-11 | Månadsavgift per publicerad sajt; publicering ingår, credits = inkluderat + påfyllnad | Område [04](04-abonnemang-och-livscykel.md) genomför riktningen. |
| 2026-09-13 | Credits 1 kr = 1 credit; paketen 49/99/179 | Behåll paket och actionpriser. |
| 2026-09-11 | Domänpåslag ×2 via `pricing_settings` | Vilar medan köpvägen är av. |
| 2026-08-12 | Verifierad projektadress vinner över provider i SEO | Område [01](01-varumarkta-adresser.md) kopplar ihop adress och runtime. |

## Föreslagna nya ställningstaganden

**N1 — Branded adress som standard.** Målet är branded eller egen verifierad
domän för alla offentligt publicerade sajter. Före full utrullning finns ett
uttryckligt pilotundantag: äldre provider-länkar kan bestå tillfälligt; nya
sajter utan behörig, fungerande kundadress visas som förhandsvisning/väntande.
Ingen tyst provider-fallback får säljas som färdig branded publicering.

**N2 — Kunden äger domän och eget innehåll och får en användbar kodexport.**
Tredjepartslicenser gäller fortfarande. Sajtmaskin driver hostingprojektet;
export av kod är inte automatiskt export av externa databaser eller hemligheter.
Detaljer: [02](02-agandeskap-och-exit.md).

**N3 — En sajt har ett hem i portalen.** `/projects/[id]` samlar adress, status,
domänkoppling, redigering och export. `/konto` samlar konto och fakturering.
Builderns befintliga flöden återanvänds. Detaljer: [03](03-kundportal.md).

## Granskningens viktigaste rättelser

- PSL kan neka små/beta-projekt och sprids inte omedelbart till webbläsare.
  Det är ett långsiktigt isolationsspår, ingen given MVP-leveransdag.
- En DNS-post för `sites.sajtmaskin.se` skapar inte `<slug>.sites.sajtmaskin.se`.
  Exakta värdnamn och deras HTTPS måste fungera på respektive hostingprojekt.
- Portalens auth- och gästsessioner behöver skydd även om kundsajterna saknar auth-dossier.
- En flagga i Sajtmaskin återställer inte redirects som byggts in i kundsajter.
- Återkommande Stripe-priser kan skapas med `price_data.recurring`. Ett nytt
  katalogprojekt är inget krav för abonnemang.
- Delad preview/prod-databas kräver test/live-separata kund- och abonnemangs-ID:n.
- Paus kräver en verklig driftåtgärd och återförsök; ett statusfält stoppar inte
  kundsajtens trafik. Lång paus kan påverka söksynlighet.

## Områden och leverans

| Område | Styrdokument |
|---|---|
| Adress, DNS, begränsad utrullning | [01](01-varumarkta-adresser.md) |
| Äganderätt och export | [02](02-agandeskap-och-exit.md) |
| Kundportal | [03](03-kundportal.md) |
| Abonnemang och livscykel | [04](04-abonnemang-och-livscykel.md) |
| Beroenden och arbetsordning | [05](05-korschema.md) |

Pris och inkluderade credits fastställs före betald lansering med en enkel
kostnadskalkyl; 30 dagars mätning behöver inte blockera portal eller testflöden.
`SM-007`, flytt av Fly-preview och omskrivning till delad hostingruntime ingår inte.
