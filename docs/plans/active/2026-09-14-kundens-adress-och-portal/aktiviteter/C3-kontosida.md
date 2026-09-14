# C3 — Kontosida `/konto`

Område: [03](../03-kundportal.md). Efter C1 för gemensam auth-routefil.

## Etapp 1 — fungerar utan abonnemang

Visa namn/e-post, aktuellt creditsaldo, befintlig köphistorik, påfyllnad och
länk till kundens sajter. Lägg länken i användarmenyn. Återanvänd auth och
verkliga transaktioner; visa inga hårdkodade planer eller falska fakturor.

## Etapp 2 — efter D2

Visa varje sajts abonnemang, nästa period, eventuell uppsägning/respit och länk
till Stripe Billing Portal. Ett konto kan ha flera sajter; sidan får inte
modellera ett enda globalt abonnemang. Kort-/fakturahantering kan vara gemensam
för kunden men pris och publiceringsrätt hör till respektive sajt.

En pausad kund kan fortfarande logga in, hantera betalning och exportera.
Servern hämtar rätt test/live-kund och kontrollerar ägaren; klienten skickar
inte ett fritt Stripe customer-ID för portallänken.

## Klart när

Etapp 1 visar verkligt saldo/historik med kontoisolation. Etapp 2 visar rätt
sajtstatus och öppnar den egna Billing Portal-sessionen i rätt Stripe-läge.
Abonnemangssektionen levereras först när D2 fungerar. Radering av konto,
teamroller och generell GDPR-export är separata arbetspaket.
