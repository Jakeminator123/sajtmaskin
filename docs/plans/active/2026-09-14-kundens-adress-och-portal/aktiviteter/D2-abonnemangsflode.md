# D2 — Checkout, webhooks, portal och publiceringsrätt

## Genomförandestatus 2026-09-15

**Inte levererad till preview.** På preview finns bara stängsel:

- #1379 — subscription-events går inte in i credit-/domänköps-dispatch
- #1381 — checkout-endpointen finns men är hårdstängd
  (`SITE_SUBSCRIPTION_CHECKOUT_ACTIVATED = false`, ingen env-väg)

Full implementation (subscription-checkout, webhook-livscykel, Billing
Portal, publiceringsgrind, cron, C3e2) är öppen draft #1385. Den PR:en
registrerar `add-stripe-billing-events.sql`. Filen finns **inte** i preview
och är **inte** applicerad mot den delade databasen. Dokumentera den inte som
kör.

Område: [04](../04-abonnemang-och-livscykel.md). Efter D1 och A3 för gemensam
deployroute. D3:s driftimplementation måste vara klar före betald lansering.

## Prisvägen behöver ingen extra katalogarkitektur

Stripe Checkout kan använda `mode: "subscription"` och
`line_items[].price_data.recurring.interval = "month"`. Den ursprungliga
planens motsats var fel; även repots installerade Stripe-typer stöder detta.
[Stripe: inline-priser](https://docs.stripe.com/products-prices/manage-prices#create-inline-prices)
beskriver möjligheten. Befintliga `STRIPE_PRICE_*` för credits förblir osatta.

Första versionen har ett serverägt erbjudande och snapshots av pris/credits
vid checkout. Skilj det från credit-paketens konfiguration. Ett stabilt
produkt-ID per Stripe-läge kan återanvändas utan en generell katalogtjänst.
Billing Portal konfigureras för kort, fakturor och uppsägning; fritt byte mellan
flera produktplaner är utanför MVP och kan kräva ytterligare priskonfiguration.

## Gör

1. Separat abonnemangs-checkout för ett ägt projekt. Pris/läge hämtas på servern,
   aldrig från klientens belopp. Återanvänd D1:s kundkoppling och lås/anspråk så
   två samtidiga klick inte skapar två betalande abonnemang. Återanvänd en giltig
   pågående session; definiera hantering av utgången/avbruten session.
2. Behåll senaste guards från preview för nycklar och signaturer. Nya händelser
   avgränsas på betrott läge och `livemode`. En testwebhook får aldrig utföra
   live-kreditgrant, live-paus eller ändra live-publiceringsrätt.
3. Hantera subscription created/updated/deleted och invoice paid/payment_failed.
   Inledande checkout-success i webbläsaren ger inte publiceringsrätt i sig.
   Knyt händelser till rätt ägare, projekt, läge och period på servern.
4. Skilj engångsköp från subscription-checkout i befintlig webhookdispatch så
   samma händelse inte också behandlas som ett credit-köp/domänköp. Tillämpa
   idempotens både på event-ID och förmån per period. Proration eller flera
   fakturor under samma period ger inte automatiskt nya månadscredits.
   Dispatch och lägeskontroll ska finnas innan subscription-checkout aktiveras
   eller dess events kan nå webhooken, även i test. Gata aktiveringen tills
   dessa delar är levererade tillsammans. Dagens credit-webhook saknar full
   lägesisolering; testa inte den vägen med en riktig produktionsanvändare.
5. Stripe-händelser kan komma igen och i annan ordning. Kontrollera aktuellt
   Stripe-objekt/period där det behövs; en gammal failed-händelse får inte pausa
   ett betalt abonnemang. Retriable fel ska inte permanent kvitteras som klara.
6. Ge live-periodens inkluderade credits atomiskt med ledgerbokningen.
   Testmiljön simulerar separat. Befintliga köpta credits påverkas inte.
7. Skapa Billing Portal-session för inloggad kund och rätt läge. Visa den i C3.
   Konfigurera uppsägning till periodslut enligt D3.
8. Lägg projektbaserad publiceringsgrind på servern. Giltigt sajt-abonnemang
   innebär ingen separat `deploy.production`-avgift; AI-arbete följer ordinarie
   credits. Hantera respit enligt D3. Planen lämnar inga beslut om detta åt UI.
9. Inför tidsstyrd avstämning för respit och beständiga driftåtgärder. En webhook
   som kommer dag 0 kör inte av sig själv dag 7. Jobbet arbetar mot rätt läge,
   projekt och önskat/faktiskt tillstånd och kan säkert köras igen.

## Befintliga kunder

Inför en uttrycklig, begränsad övergångspolicy med information och startdatum
innan nya betalgrinden gäller äldre publicerade sajter. Frånvaro av en rad i
nya tabellen är inte tillstånd att pausa alla befintliga kunder. Inga gamla
Stripe-betalmetoder debiteras genom denna migrering utan korrekt nytt köpflöde.

## Klart när

I Stripe testläge prövas första köp, två samtidiga checkouts, förnyelse,
dubbletter, omkastade events, fel/återförsök, uppsägning och portallänk. Kontrollera
att en aktiv sajt inte låser upp en annan och att test inte påverkar live.
D3:s verkliga paus/återställning kopplas in före betalstart. Kör relevanta
typer/tester, inte en ny generell faktureringsplattform.
