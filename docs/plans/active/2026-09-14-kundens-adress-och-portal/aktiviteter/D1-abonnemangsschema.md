# D1 — Abonnemangsdata per sajt och Stripe-läge

Område: [04](../04-abonnemang-och-livscykel.md). Grundschemat levererades innan
D3:s policyförslag ratificerats: modellen håller policyvärden och aktivering
åtskilda. D3:s driftimplementation kommer senare.

## Genomförandestatus 2026-09-14

Grundschema och retention guards levererade i #1361.
`add-site-subscriptions.sql` och
`upgrade-site-subscriptions-composite-keys.sql` är verifierade i den delade
preview/prod-databasens ledger. Ingen checkout, entitlement eller pilot
aktiveras av schemaetappen. Pris, inkluderade credits och rollover är förslag.
Den körbara ägaren är `src/lib/db/schema.ts` och migrationsfilerna; kontrakten
nedan styr återstående writers och konsumenter.

## Centralt: preview och prod delar databas

Ett enda `users.stripe_customer_id` räcker inte när samma användare förekommer
i Stripe test och live. Modellera exempelvis `billing_customers` med unik
`(user_id, billing_mode)` och motsvarande Stripe customer-ID. `billing_mode`
ägs av betrodd serverkonfiguration och verifierade Stripe-händelser.

Varje checkout, webhook, portallänk och entitlement-uppslag måste vara avgränsat
per läge. Testabonnemang får aldrig hålla en produktionssajt publicerad eller
fylla det riktiga creditsaldot. Testa även samma användare/projekt i båda lägena.

## Grundmodellens kontrakt

- Kundkoppling per användare/läge med unik Stripe-kundidentitet inom läget.
- Abonnemang med ägare, `project_id`, läge, Stripe subscription-ID,
  prisversion, Stripe-status, betald period, uppsägningstid och tidsstämplar.
- Unik extern abonnemangsidentitet per läge och högst ett pågående abonnemang
  eller checkout-försök per projekt/läge. Bevara historiska avslutade abonnemang.
  Samtidiga checkout-anrop kräver ett beständigt anspråk, inte bara UI-disable.
- Separata hostingtillstånd för önskat/faktiskt aktivt eller pausat läge,
  `grace_until`, faktisk paustid, bevarandetid och senaste publicerade referens.
  Stripe-status som `past_due` betyder inte att Vercel redan är pausat.
- Beständigt jobb-/åtgärdsanspråk eller motsvarande befintlig återförsöksmodell
  för paus/återställning. Ett DB-fel efter provider-anrop får inte tappa jobbet.
- Kreditgrant per giltig betald abonnemangsperiod med unik logisk nyckel som
  innehåller läge, abonnemang och period. Idempotens för en webhook och för
  själva periodförmånen är två olika saker.

`users.tier` blir inte auktoritet för projektens abonnemang. Ett konto kan ha
en aktiv sajt och en pausad samtidigt. Begreppen och periodfält hämtas från
installerad Stripe-API-version, inte från gamla exempel.

## Föreslagen creditmodell

Förslag i MVP: månatligt tillskott till befintligt saldo med rollover, utan
nollställning av köpta credits. Befintlig `transactions.idempotency_key` kan
återanvändas för live-granten. Testgrants ska stanna i testavgränsad ledger/
förmånssimulering; de får inte mutera gemensamma `users.diamonds`.

## Migration och verifiering

Följ [db-env-parity](../../../../../.cursor/rules/db-env-parity.mdc): additiv
migration, registrering i `MIGRATION_ORDER`, target-kontroll och rätt applicering
före merge. Denna plan-PR applicerar ingenting. Samordna schemaändring med A2.

Verifiera samtidiga försök, historiskt avslutat abonnemang följt av nytt,
unik periodgrant och test/live-avgränsning. DB-unikheter behöver riktade
Postgres-test där minnestester inte bevisar constrainten. Aktivera inget
kundflöde i schemaetappen.
