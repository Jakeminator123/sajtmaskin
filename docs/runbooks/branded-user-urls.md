# Varumärkta användar-URL:er

## Kontrakt

- `previewUrl`: preview-hostens konfigurerade interna URL; `preview.sajtmaskin.se`
  är appens staging-alias och ska ligga kvar på Vercel.
- `liveUrl`: verifierad `customDomain`, annars en verifierad och pilotgodkänd
  `<slug>.sites.sajtmaskin.se`, annars provider-URL som rollback.
- Provider-URL (`*.vercel.app`) sparas separat och får aldrig användas som SEO-canonical när en verifierad projektadress finns.

## Verifierat DNS-läge (2026-08-24)

Zonen driftas av **one.com** (`ns01.one.com`, `ns02.one.com`) — nya poster läggs
där, inte i Vercels DNS-panel. Det finns **ingen** wildcard för
`*.sajtmaskin.se`, så varje värdnamn måste skapas explicit.

| Värdnamn | Läge | Följd |
|---|---|---|
| `sajtmaskin.se` | A → `76.76.21.21` (Vercel) | Appens rot. Rör inte. |
| `www.sajtmaskin.se` | CNAME → Vercel | Appen. Rör inte. |
| `preview.sajtmaskin.se` | CNAME → **Vercel** | Appens staging. Ska ligga kvar på Vercel. |
| `sites.sajtmaskin.se` | NXDOMAIN | Inte påbörjad. |

DNS-raden är en historisk mätning. A1 ska verifiera aktuellt DNS/TLS-läge innan
aktivering; staging-aliaset är inte en ledig preview-host-adress.

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
4. Granska pilotversionens faktiska filer och registrera exakt
   `projectId` + `versionId` + `filesRevision` i
   `SAJTMASKIN_BRANDED_PILOT_ALLOWLIST`, till exempel
   `[{"projectId":"…","versionId":"…","filesRevision":"…"}]`. En ändring
   av samma versionsrad kräver ny granskning och nytt revisionsvärde.
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
8. Efter A4:s bevis: verifiera DNS/TLS och publicera om en pilotsajt innan
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

Ta bort eller sätt `SAJTMASKIN_BRANDED_LIVE_URLS=false`. UI/API faller då
tillbaka till sparad provider-URL utan att radera Vercel-projekt, alias eller
kunddomäner. Ett projekt som redan har ett branded alias får inte publiceras om
med en icke godkänd version, eftersom aliaset annars skulle börja servera den
nya versionen trots rollbackflaggan. Ändra inte `SAJTMASKIN_LIVE_SITE_DOMAIN`
på befintliga projekt utan en ny verifierad migrering.

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

Domänen blir kanonisk först när Vercels verify-endpoint returnerar `verified: true` och projektfältet har sparats. SEO använder den vid nästa publicering. Om domänen inte längre är verifierad ska projektets varumärkta standardadress återställas innan SEO publiceras om.

## Preview

Preview-hosten behåller path-routing på `chatId`; ingen wildcard-/host-routing krävs. Alla publika preview-svar skickar `X-Robots-Tag: noindex, nofollow, noarchive` och `Cache-Control: private, no-store`.
