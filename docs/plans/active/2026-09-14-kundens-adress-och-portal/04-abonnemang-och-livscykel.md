# 04 — Abonnemang och livscykel

Riktning: beslut 2026-09-11 i [beslutsloggen](../../../decisions/README.md).
Per-sajt-modellen och att publicering ingår är redan beslutade. Nya detaljer om
respit, paus, bevarande och kvotens rollover är förslag tills Jakob svarat på
[frågorna](00-master-plan.md); tidigare beslut behöver inte fattas på nytt.

## Genomförandestatus 2026-09-15

D1:s schema och retention guards är kod på `preview` (#1361 / #1364). Båda
D1-migrationerna finns i den delade preview/prod-ledgern enligt tidigare
read-only kontroll. Det är inte betalaktivering.

D2/D3 är inte levererade till preview. På preview finns bara stängsel: #1379
skiljer subscription-events från credit-/domänköp, och #1381 håller checkout
hårdstängd (`SITE_SUBSCRIPTION_CHECKOUT_ACTIVATED = false`). Full webhook-
livscykel, Billing Portal, C3 etapp 2 och D3-drift ligger i öppen draft #1385.
Den PR:en bär `add-stripe-billing-events.sql`, som **inte** finns i preview-
ordningen och **inte** är applicerad. Preview/prod delar Postgres — dokumentera
inte den filen som körd.

D1 ratificerar inte pris, credits, rollover eller 7/90 dagar.

## Modell

Ett abonnemang per `app_projects.id`, inte per deployment, alias eller konto.
Kontot är betalande kund och kan ha flera sajt-abonnemang. Projektens rätt att
vara publicerade härleds från respektive abonnemang; `users.tier` räcker inte.

| Nivå | Innehåll |
|---|---|
| Gratis | Bygga inom tillgängliga credits och intern förhandsvisning |
| Sajt-abonnemang | En publicerad sajt, branded/egen domän, drift, ompublicering och inkluderade AI-credits |
| Påfyllnad | Befintliga paket 49/99/179, oförändrade |

Publicering kostar inte ytterligare 20 credits för det projekt som omfattas av
ett giltigt abonnemang. AI-redigering följer befintlig credit-debitering.
Föreslagen enkel MVP-kvot: ett inkluderat tillskott per betald månad som finns
kvar i saldot. Nollställ aldrig köpta credits; lova ingen utgångstid som ledgern
inte implementerar. Senare separat kvot med förfall kräver eget beslut.

## Kostnad och pris

Avgiften täcker en kombination av fast kapacitet, trafik, serverkörning,
builds, lagring, betaltjänstkostnad, support och marginal. Fly-kostnaden per
betalande sajt är en del av kalkylen, inte hela prissättningen. Anta inte att
hosting är gratis bara för att låg trafik ryms inom en inkluderad nivå.

Bestäm ett introduktionspris och inkluderad kreditmängd efter en enkel kalkyl
på faktiska leverantörskostnader och rimliga användningsfall. Följ därefter upp
utfallet. En bestämd 30-dagarsmätning är inget krav för att bygga funktionerna.
Sälj inte obegränsad trafik eller obegränsat AI-arbete i MVP.

## Ursprungligt verifierat på granskad preview

Vid planens första granskning använde credit-checkout `mode: "payment"`;
abonnemangstabell, Stripe-kundkoppling och Billing Portal saknades då.
D1-statusen ovan ersätter den historiska observationen för schema och
kundkoppling; subscription-checkout och Billing Portal återstår.
`transactions` hade redan en idempotensnyckel.
Nycklar och webhook-secrets är uppdelade per target och produktion har skydd
mot testnyckel. **Befintliga credit-köp är däremot inte lägesisolerade i
ledgern**: webhooken kan fylla gemensamma `users.diamonds`. Använd inte riktiga
produktionsanvändare för Stripe-test. D1:s separation ska finnas före nya
abonnemangstester som muterar förmåner i den gemensamma preview/prod-databasen.

## Livscykel

[D3](aktiviteter/D3-avpubliceringspolicy.md) föreslår 7 dagars respit vid
förnyelsefel, betald period ut vid uppsägning, neutral paus och minst 90 dagars
bevarande från faktisk paus. Export och kontohantering förblir tillgängliga.

Driftstatus hålls skild från Stripe-status. En begärd paus är inte en genomförd
paus; misslyckade provider-anrop måste återförsökas. Inga befintliga kundsajter
pausas automatiskt för att en ny abonnemangstabell saknar rader för dem.

## Aktiviteter

| Ref | Leverans | Beroende |
|---|---|---|
| [D3](aktiviteter/D3-avpubliceringspolicy.md) | Fastställ policy; senare verklig paus/återställning | Policy före kundaktivering; driftimplementation efter D1 och D2 |
| [D1](aktiviteter/D1-abonnemangsschema.md) | Miljödelad datamodell och idempotens | Levererad policyneutralt; D3:s förslag är inte ratificerade |
| [D2](aktiviteter/D2-abonnemangsflode.md) | Checkout, webhook, servergrind, Billing Portal | D1; D3:s driftsteg färdigt före betald lansering |

Innan betalning aktiveras ska start, förnyelse, uppsägning, paus och
återaktivering vara prövade i Stripe testläge. Additiva migrationer följer
[db-env-parity](../../../../.cursor/rules/db-env-parity.mdc). Den här PR:n
innehåller inga migrationer eller driftåtgärder.
