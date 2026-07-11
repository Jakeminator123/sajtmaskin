# Varumärkta användar-URL:er

## Kontrakt

- `previewUrl`: `https://preview.sajtmaskin.se/<chatId>` när Fly-hostnamnet är aktiverat.
- `liveUrl`: verifierad `customDomain`, annars verifierad `<slug>.sites.sajtmaskin.se`, annars provider-URL som rollback.
- Provider-URL (`*.vercel.app`) sparas separat och får aldrig användas som SEO-canonical när en verifierad projektadress finns.

## Aktiveringsordning

1. Äg `sajtmaskin.se` och konfigurera DNS.
2. Peka `preview.sajtmaskin.se` till Fly-appen, lägg ett Fly-certifikat och verifiera `/health`.
3. Konfigurera exakt Vercel/DNS-routing för `sites.sajtmaskin.se`.
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

## Egen domän

Domänen blir kanonisk först när Vercels verify-endpoint returnerar `verified: true` och projektfältet har sparats. SEO använder den vid nästa publicering. Om domänen inte längre är verifierad ska projektets varumärkta standardadress återställas innan SEO publiceras om.

## Preview

Preview-hosten behåller path-routing på `chatId`; ingen wildcard-/host-routing krävs. Alla publika preview-svar skickar `X-Robots-Tag: noindex, nofollow, noarchive` och `Cache-Control: private, no-store`.
