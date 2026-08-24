# Varumärkta användar-URL:er

## Kontrakt

- `previewUrl`: `https://preview.sajtmaskin.se/<chatId>` när Fly-hostnamnet är aktiverat.
- `liveUrl`: verifierad `customDomain`, annars verifierad `<slug>.sites.sajtmaskin.se`, annars provider-URL som rollback.
- Provider-URL (`*.vercel.app`) sparas separat och får aldrig användas som SEO-canonical när en verifierad projektadress finns.

## Verifierat DNS-läge (2026-08-24)

Zonen driftas av **one.com** (`ns01.one.com`, `ns02.one.com`) — nya poster läggs
där, inte i Vercels DNS-panel. Det finns **ingen** wildcard för
`*.sajtmaskin.se`, så varje värdnamn måste skapas explicit.

| Värdnamn | Läge | Följd |
|---|---|---|
| `sajtmaskin.se` | A → `76.76.21.21` (Vercel) | Appens rot. Rör inte. |
| `www.sajtmaskin.se` | CNAME → Vercel | Appen. Rör inte. |
| `preview.sajtmaskin.se` | CNAME → **Vercel** | Redan taget av Vercel. Måste släppas där innan Fly kan äga värdnamnet och utfärda certifikat. |
| `sites.sajtmaskin.se` | NXDOMAIN | Inte påbörjad. |

`preview.sajtmaskin.se` är den enda hårda krocken: appens proxy (`src/proxy.ts`)
sätter bara CSP och auth-headers och proxar ingen preview-trafik. Värdnamnet
levererar alltså inget användbart i dag, samtidigt som det blockerar Fly-vägen.

## Cookie-isolation kräver en PSL-post

`sites.sajtmaskin.se` blir en parent-domän som delas av kundsajter som inte
litar på varandra. Utan en post i Public Suffix List (PSL, webbläsarens lista
över var en domängräns går) kan kundsajt A sätta en cookie på
`.sites.sajtmaskin.se` som webbläsaren sedan skickar till kundsajt B — en
supercookie mellan tenants. Det är exakt därför `vercel.app` ligger i PSL:ens
private-sektion.

Skicka därför en PR till [`publicsuffix/list`](https://github.com/publicsuffix/list)
för `sites.sajtmaskin.se` **innan** kundsajter börjar dela domänen. Kraven är
ägarverifiering via `_psl`-TXT-post, domänregistrering med ≥2 år kvar,
icke-personlig avsändaradress och en nåbar abuse-kontakt. Handläggningen tar
tid, så starta den parallellt med DNS-arbetet — inte efter.

Egen verifierad `customDomain` berörs inte: den ligger utanför den delade
parent-domänen.

## Aktiveringsordning

1. Äg `sajtmaskin.se` och konfigurera DNS. **Klart.**
2. Släpp `preview.sajtmaskin.se` från Vercel, peka den till Fly-appen, lägg ett Fly-certifikat och verifiera `/health`.
3. Konfigurera exakt Vercel/DNS-routing för `sites.sajtmaskin.se` och starta PSL-ansökan.
4. Sätt `SAJTMASKIN_LIVE_SITE_DOMAIN=sites.sajtmaskin.se`.
5. Armera bara migreringsprocessen lokalt och kör torrt:
   `$env:SAJTMASKIN_BRANDED_LIVE_URLS="true"; npx tsx scripts/db/migrate-branded-live-urls.ts --limit=10`.
   Detta aktiverar inte Vercel-runtimen.
6. Kör en staging-migrering i samma armerade shell med `--apply`, verifiera
   DNS/TLS och publicera om en sajt.
7. Sätt `SAJTMASKIN_BRANDED_LIVE_URLS=true` först i Development/Preview, därefter Production.
8. Byt appens `SAJTMASKIN_PREVIEW_HOST_BASE_URL` och Fly `PREVIEW_BASE_URL` till `https://preview.sajtmaskin.se`; sätt preview-host-allowlisten till exakt `preview.sajtmaskin.se`.

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

Ta bort eller sätt `SAJTMASKIN_BRANDED_LIVE_URLS=false`. UI/API faller då tillbaka till sparad provider-URL utan att radera Vercel-projekt, alias eller kunddomäner. Ändra inte `SAJTMASKIN_LIVE_SITE_DOMAIN` på befintliga projekt utan en ny verifierad migrering.

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
