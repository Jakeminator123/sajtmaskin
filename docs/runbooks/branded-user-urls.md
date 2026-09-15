# Varumärkta användar-URL:er

## Kontrakt

- `previewUrl`: preview-hostens konfigurerade interna URL; `preview.sajtmaskin.se`
  är appens staging-alias och ska ligga kvar på Vercel.
- `liveUrl` i A2: verifierad `customDomain`, annars provider-URL. En granskad
  `<slug>.sites.sajtmaskin.se` är bara en kandidat; runtime-aktivering är
  stängd tills A4 kan binda slutartefakten till en exakt READY-deployment.
- Provider-URL (`*.vercel.app`) sparas separat och får aldrig användas som SEO-canonical när en verifierad projektadress finns.

## Verifierat DNS-läge (2026-09-15)

Zonen driftas av **one.com** (`ns01.one.com`, `ns02.one.com`) — nya poster läggs
där, inte i Vercels DNS-panel. Det finns **ingen** wildcard för
`*.sajtmaskin.se` eller `*.sites.sajtmaskin.se`, så varje värdnamn måste skapas
explicit.

Rader utan tidsstämpel är från read-only mätningen 2026-09-15 03:49 CEST;
pilotraderna mättes om 21:55 CEST. Resolver `80.58.61.254`
(`254.red-80-58-61.staticip.rima-tde.net`). Auktoritativ `ns01` =
`195.206.121.10`. Verktyg: `Resolve-DnsName`, `nslookup`. Inga hårdkodade
universella Vercel-värden som facit. **A1:s DNS-del är uppfylld** — två
testhosts under `sites.sajtmaskin.se` når skilda mål över giltig HTTPS.
Aktivering av kundsajter är fortfarande A4 och avstängd.

| Värdnamn | Läge | Följd |
| --- | --- | --- |
| `sajtmaskin.se` | A TTL 3600 → `76.76.21.21`. HTTPS HEAD `200`, `Server: Vercel` | Appens rot. Rör inte. |
| `www.sajtmaskin.se` | CNAME TTL 3600 → `98a450bd71e44b00.vercel-dns-016.com` | Appen. Rör inte. |
| `preview.sajtmaskin.se` | CNAME TTL 3600 → samma mål. HTTPS HEAD `302` → följd `200` | Appens staging. Ska ligga kvar på Vercel. |
| `sites.sajtmaskin.se` | Ingen egen A-post | Väntat. MVP använder exakt CNAME per slug, inte wildcard. |
| `pilot-a.sites.sajtmaskin.se` | 21:55: CNAME → `dd208d0d1d5d62f6.vercel-dns-016.com`. HTTPS `200`, `A1 PILOT A`, `noindex` | A1-bevis, host 1. |
| `pilot-b.sites.sajtmaskin.se` | 21:55: CNAME → `5cad42c9d9941af8.vercel-dns-016.com`. HTTPS `200`, `A1 PILOT B`, `noindex` | A1-bevis, host 2. Skilt mål från host 1. |
| `pilot-a1-test.sites.sajtmaskin.se` | NXDOMAIN. Aldrig upplagd | Inget bevis åt något håll — piloterna heter `pilot-a`/`pilot-b`. |

Rekursiv A på CNAME-målet: `216.150.16.193` / `216.150.1.193`
(`Resolve-DnsName`); `nslookup` visade `216.150.16.1` / `216.150.1.1`.
Mätningen 2026-08-24 (samma NS, `sites.*` NXDOMAIN, utan testhost-rad) är
historik. Mät om före skarp DNS-skrivning. Staging-aliaset är inte en ledig
preview-host-adress.

PSL: avvakta. Ingen ansökan. Litet/beta, ingen `sites.*`-volym; portalens
cookie-skydd ägs av A2.

## PSL är ett senare isoleringslager

`sites.sajtmaskin.se` blir en parent-domän som delas av kundsajter som inte
litar på varandra. Utan en post i Public Suffix List (PSL, webbläsarens lista
över var en domängräns går) kan kundsajt A sätta en cookie på
`.sites.sajtmaskin.se` som webbläsaren sedan skickar till kundsajt B — en
supercookie mellan tenants. Det är exakt därför `vercel.app` ligger i PSL:ens
private-sektion.

En PSL-post för `sites.sajtmaskin.se` kan begränsa cookies mellan kundvärdar,
men den hindrar inte en kundvärd från att försöka skugga plattformscookies på
föräldern `.sajtmaskin.se`. Den är därför varken ensam aktiveringsgrind eller
ett generellt skydd för portalen. Första steget är en liten versionsbunden pilot;
PSL-arbetet kan fortsätta parallellt inför en bredare utrullning.

Egen verifierad `customDomain` berörs inte: den ligger utanför den delade
parent-domänen.

## Aktiveringsordning

1. Äg `sajtmaskin.se` och konfigurera DNS. **Klart.**
2. Låt `preview.sajtmaskin.se` ligga kvar som staging-alias på Vercel.
3. Konfigurera och verifiera exakt Vercel/DNS-routing för `sites.sajtmaskin.se`.
4. Granska pilotversionens lagrade källfiler och registrera exakt
   `projectId` + `versionId` + `filesRevision` i
   `SAJTMASKIN_BRANDED_PILOT_ALLOWLIST`, till exempel
   `[{"projectId":"…","versionId":"…","filesRevision":"…"}]`. En ändring
   av samma versionsrad kräver ny granskning och nytt revisionsvärde. Detta är
   granskningsinventering, inte bevis för bytes som skickas till providern:
   autofix, SEO/LLM och bildmaterialisering sker efter denna revision.
5. Sätt `SAJTMASKIN_LIVE_SITE_DOMAIN=sites.sajtmaskin.se` i det kontrollerade
   testshellet. Armera bara migreringsprocessen lokalt och kör torrt:
   `$env:SAJTMASKIN_BRANDED_LIVE_URLS="true"; npx tsx scripts/db/migrate-branded-live-urls.ts --limit=10`.
   Detta aktiverar inte Vercel-runtimen.
6. Slutför portalens exakta Origin-skydd och cookieövergång och bevisa med ett
   riktigt HTTPS-test att både inloggad session och gäst/claim motstår
   parent-domain-cookie-skuggning. Dessa är kvarvarande A2-krav.
7. Kör inte migreringen med `--apply` i A2. En versionsrad kan ha ändrats efter
   den äldre provider-deployen, så den aktuella `filesRevision` bevisar inte
   vilka bytes den deployen kör. Skriptet stoppar därför `--apply` tills A4
   binder aliaset till ett verifierat, oföränderligt provider-deployment.
8. A4 måste fingeravtrycka den slutligt transformerade artefakten och dess
   indata/utdata, vänta på exakt READY provider-deployment och serialisera
   alias-kopplingen till just den deploymenten. Först därefter kan
   aktiveringsgrinden öppnas. Verifiera då DNS/TLS och publicera om en pilotsajt innan
   `SAJTMASKIN_BRANDED_LIVE_URLS=true` sätts i Development/Preview.
   Produktion kräver ett separat aktiveringsbeslut efter bevisen ovan.

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

I A2 visas alltid sparad provider-URL om ingen verifierad kunddomän finns.
Routen reserverar eller kopplar inte nya branded alias, oavsett flaggvärde. Ett
projekt som redan har ett branded alias får inte publiceras om alls i detta
steg, eftersom varje produktiondeploy på samma provider-projekt annars kan
flytta aliaset till ogranskade bytes. Blockeringen sker före debitering,
deploy-rad och provideranrop, så den befintliga publicerade versionen lämnas
kvar. Ändra inte `SAJTMASKIN_LIVE_SITE_DOMAIN` på befintliga projekt utan en ny
verifierad migrering.

## Sluggen — användaren väljer den redan

`<slug>` kräver ingen ny UI-yta. Namnet i publiceringsdialogen
(`DeployNameDialog`) sparas som projektnamn och blir sluggen via
`slugCandidate` i `src/lib/live-site-url.ts`: gemener, diakriter borttagna,
icke-alfanumeriskt → bindestreck, max 50 tecken.

- Ska i A4 reserveras **en gång**, vid första säkra branded aktiveringen
  (`ensureProjectPublishedIdentity`), och därefter vara stabil per
  `app_projects.id`. Krockar blir `-2`, `-3`, … med DB-unikindex som sista
  grind.
- A2 reserverar ingen slug alls, även om konfigurationsflaggan är satt;
  befintlig läses bara.
- Reserverade ord (`admin`, `api`, `app`, `assets`, `preview`, `www`) och tomt
  resultat faller till `site`.

Ett namnbyte efter första publiceringen flyttar därför **inte** adressen. Vill
vi tillåta det krävs ett ägarbeslut om alias/redirect, inte en ny slug-generator.

## Varför inte `sajtmaskin.se/<företagsnamn>`

Path-routing på rotdomänen avvisas medvetet:

| Skäl              | Innebörd                                                                                                                                                                                     |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Appen äger roten  | `sajtmaskin.se` kör builder, inloggning och `/admin`. En kundsajt på samma origin delar cookie-jar med appens session.                                                                       |
| Delad proxy       | Varje kundsajt är ett eget hosting-projekt. Path-routing tvingar all kundtrafik genom appens proxy — kostnad, latens och en ny felkälla.                                                     |
| Asset-krockar     | Genererade Next-projekt förväntar sig att ligga i roten (`/_next/...`). Preview-hosten löser det för preview med aktiv path-omskrivning; att upprepa det i produktion är onödig komplexitet. |
| Kundens varumärke | En subdomän läser som kundens egen adress. En path under vår domän gör kunden till en undersida hos oss.                                                                                     |

Subdomänformen `<slug>.sites.sajtmaskin.se` ger samma "vi äger produkten"-känsla
utan någon av posterna ovan.

## Egen domän

Domänen blir kanonisk först när Vercels verify-endpoint returnerar `verified: true` och projektfältet har sparats. SEO använder den vid nästa publicering. Om domänen inte längre är verifierad ska projektets varumärkta standardadress återställas innan SEO publiceras om.

## Preview

Preview-hosten behåller path-routing på `chatId`; ingen wildcard-/host-routing krävs. Alla publika preview-svar skickar `X-Robots-Tag: noindex, nofollow, noarchive` och `Cache-Control: private, no-store`.
