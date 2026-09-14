# Varumärkta användar-URL:er

## Kontrakt

- `previewUrl`: `https://preview.sajtmaskin.se/<chatId>` när Fly-hostnamnet är aktiverat.
- `liveUrl`: verifierad `customDomain`, annars verifierad `<slug>.sites.sajtmaskin.se`, annars provider-URL som rollback.
- Provider-URL (`*.vercel.app`) sparas separat och får aldrig användas som SEO-canonical när en verifierad projektadress finns.

## Verifierat DNS-läge (2026-08-24)

**Historisk mätning.** Kontrollera aktuell zon, projektkoppling och HTTPS före
nya driftsteg. Tabellen nedan är inte verifierad på nytt 2026-09-14.

Zonen driftas av **one.com** (`ns01.one.com`, `ns02.one.com`) — nya poster läggs
där, inte i Vercels DNS-panel. Det finns **ingen** wildcard för
`*.sajtmaskin.se`, så varje värdnamn måste skapas explicit.

| Värdnamn | Läge | Följd |
|---|---|---|
| `sajtmaskin.se` | A → `76.76.21.21` (Vercel) | Appens rot. Rör inte. |
| `www.sajtmaskin.se` | CNAME → Vercel | Appen. Rör inte. |
| `preview.sajtmaskin.se` | CNAME → **Vercel** | Redan taget av Vercel. Måste släppas där innan Fly kan äga värdnamnet och utfärda certifikat. |
| `sites.sajtmaskin.se` | NXDOMAIN | Inte påbörjad. |

`preview.sajtmaskin.se` är också produktens stagingadress enligt dagens
Git-workflow. Historikens Fly-plan ger inte mandat att koppla bort den från
Vercel. Branded kundadresser under `sites` är ett separat spår.

## Cookiegräns och begränsad pilot

`sites.sajtmaskin.se` blir en parent-domän som delas av kundsajter som inte
litar på varandra. Utan en post i Public Suffix List (PSL, webbläsarens lista
över var en domängräns går) kan kundsajt A sätta en cookie på
`.sites.sajtmaskin.se` som webbläsaren sedan skickar till kundsajt B — en
supercookie mellan tenants. Det är exakt därför `vercel.app` ligger i PSL:ens
private-sektion.

Läs [PSL:s riktlinjer](https://github.com/publicsuffix/list/wiki/Guidelines)
innan ansökan. Små/beta-projekt kan avslås och en godkänd ändring tar tid att
nå webbläsare. Planera inte lanseringen mot ett antaget godkännandedatum.
PSL-spåret ersätter inte portalens cookie-/Origin-skydd, särskilt mot cookies
på föräldern `sajtmaskin.se`.

En auth-dossier är en risksignal, inget komplett bevis på cookieanvändning.
Även vanlig JavaScript kan sätta cookies. Före eventuell öppen utrullning
behövs därför en verifierad domän-/sessionsmodell. Ett föreslaget avgränsat
pilotupplägg finns i
[`A2`](../plans/active/2026-09-14-kundens-adress-och-portal/aktiviteter/A2-branded-eligibility.md);
det är ett granskningsunderlag, inte ett fattat aktiveringsbeslut.

En kunds egen domän utanför plattformens domänträd delar inte denna parent.
Projektägarskap, DNS och HTTPS måste fortfarande verifieras.

## DNS för kundvärdnamn

En post för `sites.sajtmaskin.se` skapar inte poster för
`<slug>.sites.sajtmaskin.se`. Använd exakta kundvärdnamn med rätt CNAME-mål
och ett exakt alias per Vercel-projekt. För en större grupp kan wildcard-DNS
eller delegering av `sites` utvärderas, men verifiera routingen till två olika
projekt innan den används brett.

Wildcard-DNS är inte samma sak som Vercels wildcard-alias/certifikat, som har
nameserverkrav. Vercel kan ange projektspecifika DNS-värden; kopiera inte
standardvärden från ett annat projekt. Låt rot, staging och e-postposter vara.
[Vercels domänanvisningar](https://vercel.com/docs/domains/working-with-domains/add-a-domain).

## Aktiveringsordning

1. Bekräfta aktuellt DNS-läge, valda pilotprojekt och mandat för ändringen.
2. Verifiera exakt kundhost, rätt Vercel-projekt och faktisk HTTPS. Säkerställ
   att publiceringsväg och migreringsskript följer samma godkända pilotpolicy.
3. Kontrollera databasmålet innan eventuell skrivning. Preview delar
   prod-databas; en preview-körning är inte ett isolerat stagingtest.
4. Armera migreringsprocessen lokalt med
   `SAJTMASKIN_BRANDED_LIVE_URLS=true` och
   `SAJTMASKIN_LIVE_SITE_DOMAIN=sites.sajtmaskin.se`. Torrkör skriptet med
   explicit projekt-ID. Detta aktiverar inte appens Vercel-runtime.
5. Applicera på ett godkänt testprojekt. Verifiera alias och ompublicera rätt
   publicerad version för att uppdatera metadata/redirect, inte senaste utkast.
6. Prova HTTP-kedja och rollback. Aktivera därefter begränsad pilot i appen.
7. Migrera äldre sajter med explicit urval och redovisad progress. Enbart
   `--limit` bevisar inte att nästa körning behandlar nya projekt.

Detaljer och beroenden finns i
[`A4`](../plans/active/2026-09-14-kundens-adress-och-portal/aktiviteter/A4-aktivering-och-migrering.md).
Plan-PR:n varken aktiverar dessa steg eller flyttar Fly-preview/staging.

## Test före DNS-aktivering

Vercel äger hela `vercel.app`-zonen. `sajtmaskin.vercel.app` kan därför inte
fungera som parent-domän för adresser som `<slug>.sajtmaskin.vercel.app`.
En manuell Vercel deploy-preview av Sajtmaskin testar kod, publiceringsflöde,
provider-fallback och domänkontrakt — men den kan inte visa den slutliga branded
URL:en.

Ett riktigt end-to-end-test av branded alias kräver en parent-domän eller
test-subdomän som vi kontrollerar. Använd Development/Preview-env och en
begränsad `--project-id`/`--limit`-migrering; återanvänd inte en kunddomän.
Automatiska `*.vercel.app`-alias kan ha flera former och räknas alltid som
`providerUrl`, aldrig som Sajtmaskins branded standardadress.

## Rollback

`SAJTMASKIN_BRANDED_LIVE_URLS=false` återställer appens URL-val till provider
när ingen verifierad egen domän finns. Det återställer **inte** metadata eller
redirects som redan byggts in i kunddeploymenten. Behåll fungerande målalias
tills kundruntime återställts eller ompublicerats och HTTP-kedjan kontrollerats.
En cachead permanent redirect kan kvarstå hos klienter. Ändra inte
`SAJTMASKIN_LIVE_SITE_DOMAIN` på befintliga projekt utan verifierad migrering.

## Sluggen — användaren väljer den redan

`<slug>` kräver ingen ny UI-yta. Namnet i publiceringsdialogen
(`DeployNameDialog`) sparas som projektnamn och blir sluggen via
`slugCandidate` i `src/lib/live-site-url.ts`: gemener, diakriter borttagna,
icke-alfanumeriskt → bindestreck, max 50 tecken.

- Reserveras **en gång**, vid första branded publiceringen
  (`ensureProjectPublishedIdentity`), och är därefter stabil per
  `app_projects.id`. Krockar blir `-2`, `-3`, … med DB-unikindex som sista
  grind.
- Med gaten av reserveras ingen slug alls; befintlig läses bara.
- Reserverade ord (`admin`, `api`, `app`, `assets`, `preview`, `www`) och tomt
  resultat faller till `site`.

Ett namnbyte efter första publiceringen flyttar därför **inte** adressen. Vill
vi tillåta det krävs ett ägarbeslut om alias/redirect, inte en ny slug-generator.

## Varför inte `sajtmaskin.se/<företagsnamn>`

Path-routing på rotdomänen avvisas medvetet:

| Skäl | Innebörd |
|---|---|
| Appen äger roten | `sajtmaskin.se` kör builder, inloggning och `/admin`. En kundsajt på samma origin delar cookie-jar med appens session. |
| Delad proxy | Varje kundsajt är ett eget hosting-projekt. Path-routing tvingar all kundtrafik genom appens proxy — kostnad, latens och en ny felkälla. |
| Asset-krockar | Genererade Next-projekt förväntar sig att ligga i roten (`/_next/...`). Preview-hosten löser det för preview med aktiv path-omskrivning; att upprepa det i produktion är onödig komplexitet. |
| Kundens varumärke | En subdomän läser som kundens egen adress. En path under vår domän gör kunden till en undersida hos oss. |

Subdomänformen `<slug>.sites.sajtmaskin.se` ger samma "vi äger produkten"-känsla
utan någon av posterna ovan.

## Egen domän

Ägarkontroll, Vercels verifiering och DNS-konfiguration krävs före kanonisk
adress. Kontrollera också faktisk HTTPS innan bytet presenteras som klart.
Metadata och byggda redirects ändras först vid ompublicering eller annan
verifierad routingändring. Tillfälligt okänd provider-status är inte samma sak
som bekräftat fel; bevara senaste fungerande adress vid det första fallet.
Vid bortkoppling måste både UI och runtime återgå till rätt branded adress.

## Preview

Preview-hosten behåller path-routing på `chatId`; ingen wildcard-/host-routing krävs. Alla publika preview-svar skickar `X-Robots-Tag: noindex, nofollow, noarchive` och `Cache-Control: private, no-store`.
