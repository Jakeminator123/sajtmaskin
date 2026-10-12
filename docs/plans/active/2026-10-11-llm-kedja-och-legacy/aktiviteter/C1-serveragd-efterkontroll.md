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

C1.0 readonly-design klar. Befintlig versionspersistens, leases och claims
räcker utan DB-migration; `after(promise)` och builder-resume saknar däremot
oberoende durabel väckning. Föreslagen lösning är en separat autentiserad
cron-route i befintlig Vercel med begränsad dispatch till en serverkoordinator.
Välj senaste version per chat först, sedan pending draft inom befintligt
historikfönster; exkludera quick-edit/restore och migrationshold. Härled tenant
från version/chat/projekt och kontrollera revision före resultat/promotion.
Deterministisk quality-gate kostar inget modellsteg, men befintliga LiveReview-
och repairgrenar kan debitera. Jakob godkände 2026-10-12 lokal implementation
av hela C1 med femminuterstick, liten batch och befintliga kostnadsgränser.
Push, aktivering och produktion är fortfarande separata mandat.

Readonly kostnadsgranskning identifierade en nödvändig säkerhetsförutsättning:
RepairLedger/passräknare är minnesbaserade, lease-takeover bevarar inte förbrukad
budget och fasloggar är best-effort. Betald cron-retry får inte kopplas in utan
durabel reservation före anrop/retry, bunden till version/revision/fingerprint
i befintlig persistens. Oklar äldre historik eller misslyckad reservation ska
stoppa betalning. LiveReview har redan durabel räknare men
`live-review-session.ts` kan radera den efter misslyckad resultatskrivning;
räknaren måste bevaras. Inget nytt DB-schema eller generiskt kontrollramverk.

Vercels native cron körs bara på Production, inte Preview. Lokal/Preview-
endpointverifiering är därför skild från bevisad automatisk schemakörning.
[Plattformsowner](https://vercel.com/docs/cron-jobs/quickstart) och
[leverans/dupplikat/auth](https://vercel.com/docs/cron-jobs/manage-cron-jobs).
Befintliga tidsgränser, autentisering, versionslease och revisionskontroller
ska återanvändas; inga själv-anropskedjor som skenbar durabilitet.
C1.1 lokalt klar: endast `live-review-session.ts`, DB-servicen
`live-review-runs.ts`, sessiontestet och nytt `live-review-runs.attempts.test.ts`.
Reserverad räknare bevaras vid persistensfel/superseded-cleanup, abandon kräver
noll försök och complete använder atomisk greatest. Den oanvända icke-atomiska
`incrementLiveReviewModelAttempts` och dess mock är raderade efter caller-kontroll.
Befintlig atomisk reservation förblir ägare. Produktkod netto −20 rader;
49 tester i fem filer, typecheck, diff-check och verifieringsplan PASS.
DB/Blob/critic mockas; SQL kompileras med riktig Drizzle-dialekt. Review klar
utan konkreta fynd och med fyra stabila scopehashar; ingen riktig DB-konkurrens körd.
TTL (sju dygn), schema och drift oförändrade. TTL kontra crons sju-dygnsfönster
ska prövas innan någon retention utökas. Serverrepair-reservation, koordinator,
cron och klientborttagning återstår; ingen runtimeacceptans genomförd.

C1.2a lokalt klar i sju scopefiler: smal reservationsservice i befintliga versionsloggar,
med transaktion/versionslås, aktiv lease, revisionsbindning och stabil budget-ID
över takeover. Deterministiska server-ID:n måste skiljas från vanliga nanoid-
diagnostikrader; kategori/meta ensamt är inte autenticitet. Generiska loggskrivare
och alla publika payloadgrenar nekar budgetkategorin; exakt prune-undantag
behåller kvitton utan repairPassIndex. Ingen modellkoppling i detta delpaket.
Nästa del kopplar befintlig RepairGate/loop till kvittot och initialiserar från
verkligt finalize-ledger. Ledgerns attempts innehåller även dedupe-anrop och
får inte felaktigt användas som exakt betalräknare. Primär/retry är inte samma
räknare som loopens maxLlmPasses. Saknad/okänd init ger fail-closed stopp.
Reviewfynd om ofullständig ledger-identitet är rättat: normaliserade requiredFiles
och durabla outcomes ingår. Okänt kraschutfall förbrukar slot och stoppar nya
reservationer; outcome-skrivning kräver original lease/revision. 45 nykörda
och 47 återanvända tester, typecheck, diff-check och verifieringsplan PASS.
Slutlig deltareview stänger requiredFiles/outcome-fyndet men identifierar ett
anslutningshinder: finalize-observationer får inte ta primary/retry-platser i
serverloopens separata budget. Det är inte en inkopplad runtime-regression.
Service/test SHA-256-prefix 81CAF0A83A3B7204 / 36E706AB1055EA41 före C1.2b.
DB mockas; runtime ej verifierad.

C1.2b tilldelat 1: reservationsservice, llm-repair-gate, finalize-runner,
repair-loop, server-verify repair-execution/verify-run/build-error-trigger och
provider generation-stream-post-finalize, med deras riktade tester. Separera
finalize-observationer från loopplatser, exportera verkliga invokationer/utfall,
läs/hydrera betrodd historik och reservera före modellen. Okänd historik eller
misslyckad reservation/utfallsskrivning stoppar vidare betalt arbete. Manuell
force får inte skapa framtida cronauktoritet. Inga cron-/koordinatorändringar.
Gapet efter versionspersistens kräver ett väntat durabelt startkvitto i C1.3;
det får inte döljas av after(promise) eller tom rekonstruerad historik.

C1.2b fryst för granskning: totalt 286 riktade testresultat, typecheck,
diff-check och verifieringsplan PASS, med oförändrade resultat återanvända.
Två äldre policyfixturer (server-verify.f3-readiness.test.ts och
server-verify.still-missing-protected.test.ts) uppdaterades med giltig budget/
lease/revision; 23 tester gröna, alla åtta tidigare fel borta, policyassertions
oförändrade. Fixturehashar 3588206B6A23307D / 14D94E53D1468E83. Budget/gate/loop
SHA-256-prefix: 81A585436EE36B91 / 6F5463F5D6EBDE27 / 1E4180CCD5C466F6.
Förlorad partial-output som bara fanns i minnet behåller förbrukad plats och
stoppar återstart; ingen andra lagring av full modelloutput införs.
Full review av åtta produktfiler + två fixturer stängde finalize/slot-fyndet
och fann provenance/manual-force/reservation korrekt. Ett konkret kvarvarande
fynd (95 %, impact 3): restartspärren ser bara senaste primary/partial, inte
retry/partial eller primary/partial följt av retry/aborted. Vid ändrad diagnostik
kan nästa betalda pass starta från ursprungsfiler utan förlorade partial-bytes.
Rättat i loopens fail-closed spärr: hela consumed-historiken kontrolleras.
Båda kedjor reproducerades före fix med ändrad diagnostik och ett mockat nytt
modellanrop. Efter fix stopp före reservation/modell; samma-request partial-
retry bevisar att ändrade bytes följer med. 29 berörda tester, typecheck och
diff-check PASS; oförändrade tidigare resultat återanvänds. Slutlig deltareview
stänger fyndet utan kvarstående fynd; tre hashvärden stabila och de övriga sju
produktfilernas granskning återanvänd. Loop/aborttest/outcometest SHA-prefix:
89355E8DCA0E3A4C / FA2A295A70C67B6D / A7AB98256DCB5139.
Inget nytt checkpoint-/outputlager; saknad återställbar kandidat stoppar betalning.

C1.3-designbeslut efter readonly-review: startkvitto ska ingå i samma befintliga
transaktion som ny version/assistentmeddelande, inte bara await efter commit.
Kvittoskrivningsfel rullar tillbaka; verkligt DB-genererat files_revision används.
Endast betrodd ny finalize får bootstrap; replace/manual/quick-edit får aldrig
mint/resetta budget. Befintliga loggtabellen räcker, inget schema/callbackramverk.
Efter detta extraheras befintlig routeorkestrering till en gemensam serverägare
med exakt en versionslease. QG/serververify-kärnor tar internt holder-kontext,
inte dubbel acquire/release eller släpp före reverify. Bildpersist använder
befintlig holderRunId + expectedFilesJson och läser ny revision före preview/
productclaim/QG. Produktclaim behåller egen identitet. Renew-fel stoppar arbete.
Durabla kvitton måste även skydda mot senare dublett efter att leasen släppts.
Befintliga resumegränser (3 försök, 20 runtimeväntor, per buildersession idag)
ska hanteras uttryckligt vid serverflytten, inte bli obegränsad cron-retry.

Readonly plattformskontroll bekräftar projekt sajtmaskin med Node 22.x.
MCP-svaret visar inte abonnemang, cron- eller faktisk funktionsduration;
schemats stöd och verklig tidsgräns måste verifieras före aktivering. Manifestets
950 sekunder är inte i sig driftbevis. Ingen providerinställning har ändrats.
