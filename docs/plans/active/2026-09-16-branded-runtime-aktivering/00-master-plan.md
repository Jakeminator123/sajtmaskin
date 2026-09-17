# Branded runtime-aktivering

Status: **kod på preview; flaggor av tills respektive runtime-bevis är grönt.**
Avläst mot `origin/preview` `dced4056aa39b6f63def5bd662d9c7254ad26fbd`
(2026-09-17 rematch av #1435). Portalbygget är avklarat —
[`2026-09-14-kundens-adress-och-portal`](../../avklarat/2026-09-14-kundens-adress-och-portal/00-master-plan.md).
#1385 är separat Mergar-spår, inte denna plan. PSL-ansökan hör inte hit.

Nästa fas är kod finns → runtime bevisad → kontrollerat aktiverad. Ingen ny
portalbacklog. Stoppa och fråga vid extern testdomän eller prod-/provider-write.

## Recon 2026-09-16

| Del | Nuläge |
|---|---|
| A1 DNS | **KLAR.** Live: `pilot-a.sites.sajtmaskin.se` och `pilot-b…` har skilda CNAME, HTTPS 200, titel A1 PILOT A / A1 PILOT B. `pilot-a1-test…` är fortfarande NXDOMAIN. PSL avvaktas. Inte `sajtmaskin.se` som testdomän. |
| C2-skrivgrind | Kod på preview via #1427. `SAJTMASKIN_CUSTOMER_DOMAIN_WRITES` default av. |
| C1-kort | Kod på preview via #1429. Det är inte browserbevis. |

## Kvarvarande bevis

| Steg | Vad | Blocker |
|---|---|---|
| A2 | Sista riktiga browser/cookie-provet mot parent-domain shadowing + gästsession-återställning. Testhosts finns. | Vercel SSO på `preview.sajtmaskin.se`. Ägarbeslut (session eller `vercel login`), inte ny backlogpunkt. |
| C1 / B1 / C3e1 | Kort browser-smoke. C1-kort är kod, inte bevis. | Samma SSO-block. |
| C2 | Extern testdomän: link → DNS → verify → HTTPS → activate → unlink. Kräver flaggan från #1427 + ägd testdomän. Inte `sajtmaskin.se` / `.com`. | Stoppa utan testdomän + mandat att slå på skrivflaggan. |
| A3 | branded → egen domän → branded, rollback/no-loop. Offline-kod finns (#1408). | Samma testdomän/mandat som C2. |
| A4 | Exakt en kontrollerad pilot: dry-run → apply → verifiera → rollback. Ingen `--apply` utan mandat. | Ägarmandat. Flaggor förblir av tills beviset är grönt. |

## Flaggor (default av)

| Flagga | Öppnas först när |
|---|---|
| `SAJTMASKIN_BRANDED_LIVE_URLS` | A4 apply + verify + rollback är grön |
| `SAJTMASKIN_CANONICAL_ADDRESS_CONTRACT` | A3 rollback/no-loop är grön |
| `SAJTMASKIN_CUSTOMER_DOMAIN_WRITES` | C2-kedjan är grön. Finns på preview via #1427, av. |
| `SAJTMASKIN_DOMAIN_PURCHASE` / `FEATURES.useDomainPurchase` | Aldrig i detta spår |
| `SITE_SUBSCRIPTION_CHECKOUT_ACTIVATED` | #1385, inte här |
| `activation_not_ready` | branded-pilot tills A2/A4 sagt annat |
