# Branded runtime-aktivering

Status: **kod på preview; flaggor av tills respektive runtime-bevis är grönt.**
Avläst mot `origin/preview` `dced4056aa39b6f63def5bd662d9c7254ad26fbd`
(2026-09-17 rematch av #1435). Portalbygget är avklarat —
[avklarat-indexet](../../avklarat/README.md). Parkerade abonnemangs- och
PSL-krav ägs av [portalplanen](../2026-10-22-kundportal-och-domaner/00-master-plan.md);
de aktiveras inte av denna adressplan.
C2 runtime-bevis 2026-09-17 på preview; writes-flaggan är tillbaka till false
efter retest. Production writes av tills separat rolloutbeslut.

Nästa fas är kod finns → runtime bevisad → kontrollerat aktiverad. Ingen ny
portalbacklog. Stoppa och fråga vid extern testdomän eller prod-/provider-write.

## Recon 2026-09-16

| Del | Nuläge |
|---|---|
| A1 DNS | **KLAR.** Live: `pilot-a.sites.sajtmaskin.se` och `pilot-b…` har skilda CNAME, HTTPS 200, titel A1 PILOT A / A1 PILOT B. `pilot-a1-test…` är fortfarande NXDOMAIN. PSL avvaktas. Inte `sajtmaskin.se` som testdomän. |
| C2-skrivgrind | Kod på preview via #1427. `SAJTMASKIN_CUSTOMER_DOMAIN_WRITES` default av. |
| C1-kort | Kod på preview via #1429. Det är inte browserbevis. |
| C2 runtime | **DONE** (2026-09-17, preview). Testdomän `c2-test.lansera.nu` (apex `lansera.nu` orörd). Full kedja bevisad. Writes-flaggan tillbaka till false efter retest. |

## Kvarvarande bevis

| Steg | Vad | Blocker |
|---|---|---|
| A2 | Sista riktiga browser/cookie-provet mot parent-domain shadowing + gästsession-återställning. Testhosts finns. | Vercel SSO på `preview.sajtmaskin.se`. Ägarbeslut (session eller `vercel login`), inte ny backlogpunkt. |
| C1 / B1 / C3e1 | Kort browser-smoke. C1-kort är kod, inte bevis. | Samma SSO-block. |
| C2 | **DONE** (2026-09-17, preview). Testdomän: `c2-test.lansera.nu` (apex `lansera.nu` orörd). Blocker-fix: #1463 — `checkCustomerHttps` använde 2 KiB body-cap → `unknown` / «Kontrollerar HTTPS»; fix med `headersOnly` på `fetchWithPinnedDns` (SSRF-pinning kvar). Full kedja: link → DNS/TLS → HTTPS valid → Activate (Primär/Live) → rätt publicerad Blue Notes-sajt på custom domain → Unlink. `SAJTMASKIN_CUSTOMER_DOMAIN_WRITES` tillbaka till false på preview efter retest; Production writes av tills separat rolloutbeslut. Valfri städ: ta bort one.com-CNAME för `c2-test` (inte krav för PASS). | — |
| A3 | branded → egen domän → branded, rollback/no-loop. Offline-kod finns (#1408). | Samma testdomän/mandat som C2. |
| A4 | Exakt en kontrollerad pilot: dry-run → apply → verifiera → rollback. Ingen `--apply` utan mandat. | Ägarmandat. Flaggor förblir av tills beviset är grönt. |

## Bevarade acceptanskrav

Den tidigare portalhistoriken är konsoliderad. Följande krav kvarstår tills
deras faktiska bevis är dokumenterade; merge och enhetsprov är separata bevis.
Driftprotokoll och daterade DNS-observationer ägs av
[adressrunbooken](../../../runbooks/branded-user-urls.md).

- **A2:** versionsbunden pilotgranskning gäller både publicering,
  URL-visning och migration. Okänd kod-/capabilitystatus eller en nekad ny
  version får inte flytta alias från den fungerande versionen. `__Host-`
  över HTTPS, säker lokal cookiepolicy och exakt Origin bevisas för auth,
  OAuth och gästsession/claim. Kör verklig parent-domain-shadowing samt
  gammalt+nytt och dubbla liknamnade cookies. Legitima äldre gästprojekt
  behöver verifierad övergång; återinför inte en obetrodd legacyfallback.
  Dokumentera eventuell nyinloggning. PSL ersätter inte portalens skydd.
- **A3:** branded → verifierad egen domän → branded bevisas för både ny och
  äldre genererad konfiguration. Samma verifierade production-identitet
  styr env, metadata, sitemap och tillfällig 307 med path/query, även med
  SEO-copy av. Skyddad preview, annan tenant och plattformshost får aldrig
  bli felmål. Täck okänd/ogiltig providerstatus, form/OAuth/webhook-URL:er
  och rollback av byggd redirect/noindex; en appflagga ensam återställer
  inte kunddeploymenten. Bevara senaste fungerande host medan den ersätts.
- **A4:** säker aktivering är ännu en leverans. Nuvarande
  [apply-grind](../../../../scripts/db/migrate-branded-live-urls-policy.ts)
  nekar `--apply` tills slutligt transformerad artefakt och in-/utdata
  fingeravtryckts, exakt READY production-deployment verifierats och
  aliaskopplingen serialiserats till den. Granskad `filesRevision` ensam
  räcker inte. Därefter krävs ett avgränsat projekt-/deploymentmandat och
  dry-run → apply → DNS/TLS/HTTP → rollback. Välj samma publicerade version,
  inte senaste utkast/READY; debitera inte plattformsmigreringen. Bevara
  fungerande custom som primär och host som en befintlig redirect använder.
  Äldre sajter migreras i explicit valda små satser med runtimebevis eller
  motiverat undantag. Bedöm kontovillkor före extern kundpilot; interna
  testprojekt och betalningsaktivering är separata steg.

## Flaggor (default av)

| Flagga | Öppnas först när |
|---|---|
| `SAJTMASKIN_BRANDED_LIVE_URLS` | A4 apply + verify + rollback är grön |
| `SAJTMASKIN_CANONICAL_ADDRESS_CONTRACT` | A3 rollback/no-loop är grön |
| `SAJTMASKIN_CUSTOMER_DOMAIN_WRITES` | C2-kedjan är grön (2026-09-17, preview). Flaggan tillbaka till false efter retest. Production writes av tills separat rolloutbeslut. |
| `SAJTMASKIN_DOMAIN_PURCHASE` / `FEATURES.useDomainPurchase` | Aldrig i detta spår |
| `SITE_SUBSCRIPTION_CHECKOUT_ACTIVATED` | #1385, inte här |
| `activation_not_ready` | branded-pilot tills A2/A4 sagt annat |
