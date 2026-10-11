# C1 — servern driver efterkontroller, klienten visar dem

Utförare: 1. Avgränsad arkitektur-/diffgranskning: 3 på beställning.
Beroende: A1 + A2. Status: se [körbordet](../00-master-plan.md).

## Första beslutet — högst en kort designavstämning

Utgå från `src/lib/hooks/chat/post-checks.ts`, `useResumePendingVerification.ts`,
`src/lib/gen/verify/server-verify/`, quality-gate/product-postcheck-routes och
provider-streamens post-finalize. Inventera bara vilka befintliga owners som
kan bära körningen, inte nya kö-/workflowprodukter.

Beskriv på högst en sida hur arbetet fortsätter eller återupptas utan en
återöppnad builderflik. Ett fire-and-forget-anrop i en serverprocess är inte i
sig durabelt. Föreslå befintlig persistens/trigger om den räcker. Om ny
infrastruktur eller DB-migrering krävs: precisera blockerad del för ägarbeslut
innan den byggs. Kalla inte en tillfällig flytt för färdig serverägd livscykel.

## Implementera därefter i små ersättningspaket

1. En samordnande ägare för bildmutation → revisionskvitto → preview-resync →
   produktkontroll/resultat → relevant kvalitetsgrind. F2/F3 har olika policy.
2. Återanvänd befintliga leases, claims, files_revision, statusytor och RepairGate.
   Bevis gäller rätt version/revision/previewidentitet; nytt innehåll kräver
   nya berörda bevis. Inga två aktiva samordnare för samma körning.
3. Buildern observerar, visar och lämnar användarbeslut; den ska inte vara
   enda motor för att en färdig generering ska kunna bli verifierad.
4. Ta bort ersatt klient-/resume-orkestrering, timers och dubbla loggskrivningar
   i samma leverans som motsvarande serverväg är bevisad. Spara inte en
   permanent extra fallback. Nödvändig rolloutövergång måste ha slutvillkor.
5. Behåll importens skrivskydd, snabbredigeringens avvikelse, F2/F3-policy,
   credits och avsiktliga godkännandefrågor. Ändra inte produktpolicy som städning.

## Klart och verifiering

Riktade tester för normal F2, F3, dubletttrigger och ändrad revision. Återanvänd
relevanta import-/quick-edit-tester. Typecheck + berörda tester, inte fullsvit
per delpaket. En representativ runtimekontroll ska visa att stängd/omladdad
klient inte lämnar körningen beroende av nästa besök, samt att ny revision inte
ärver gammalt godkännande. Kör mot godkänd testmiljö, inte en riktig kund.
Utan runtimebevis: markera kodklar/runtime ej verifierad, inte DONE.

## Resultat

Ej startad. Samordnaren sparar valt återupptagningssätt, borttagen klientlogik och acceptansbevis.
