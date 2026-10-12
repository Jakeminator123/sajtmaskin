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

C1.3a tilldelat 1 på `a9f209e95f3f8f68bf4a1c08c6cc88d20c579270`.
Skrivytor: chat-repository/versions.ts, reservationsservice, llm-repair-gate,
finalize-runner, server-verify verify-run/build-error-trigger och provider
generation-stream-post-finalize, plus riktade tester och nytt transaktionstest.
Åttonde filen post-finalize-policies.ts får enbart smalare inputtyper till
de faktiskt använda fälten (version.id/preflight); policylogiken ska vara
oförändrad. Detta låter samma resolver användas med verkligt DB-ID i
transaktionen utan fabricerat FinalizeResult, cast eller duplicerad policy.
Ta bort eftercommit-markering, seed-export, prepare-init och seedtrådning när
de ersätts; ingen parallell bootstrapägare. Typad startavsikt från befintligt
beslutat byggunderlag följer kvittot, inte gissning ur lös metadata eller nya
policytabeller. Ingen full koordinator/cron/klientflytt i detta paket.
C1.3a:s första delpatch och transaktionstest är införda: 16 isolerade tester
PASS, diff-check PASS. Typecheck har 22 diagnostiker i detta mellantillstånd:
gamla caller-/test-API:n återstår och bootstrap-preflight saknar ett
previewBlockingReason-fält. Detta är inte leveransklar kod.
Caller-patchen nekades av säkerhetskontrollen med motiveringen att byte från
legacy-init till krav på durabelt kvitto kan störa äldre körvägar utan
uttryckligt ägargodkännande/verifiering. Jakob godkände därefter uttryckligen
lokal ersättning och borttagning: "Ja, ersätt och ta bort gamla startvägen".
Godkänd konsekvens: äldre/okänd historik får inga nya automatiska betalda försök;
uttrycklig manuell reparation ska finnas kvar. 1 fortsätter inom samma åtta
produktfiler och riktade tester; ingen push, aktivering eller live-DB-ändring.

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

C1.3a slutresultat: 74 finalize-tester, typecheck och diff-check PASS; tidigare
oförändrade riktade resultat återanvänds utan överlappande totalsummering.
19 äldre A1/A2-fixturfel rättades genom att ersätta oanvänd testparser och gamla
lookup-/shim-förväntningar med nuvarande kandidatkontrakt. Åtta produktfiler
är granskade utan fynd och oförändrade sedan review; 3 granskar testdeltat.
Produkthashprefix: versions 71695B737ACCDC85; budget AEEE7878382333A4;
gate D24C9AF4A3E856B4; runner 5D773A6C9CF54EFB; policies E1F1E495B6378685;
verify-run 5E8804FBA71CCA6C; build-error FE620857998DF3A5;
post-finalize 35D1D15201D46E0C. Rollbackbeviset använder mockad transaktion,
inte verklig PostgreSQL. Ingen runtimeacceptans eller ny commit ännu.

C1.3b tilldelas 2: endast validate-images/route.ts, preview-session/route.ts,
nya gen/verify/version-image-validation.ts och gen/preview/ensure-version-preview.ts,
samt db/chat-repository/preview-url.ts och riktade tester. Flytta befintlig
orkestrering till gemensamma smala funktioner; HTTP behåller auth/tenant,
inputvalidering, rate-limit och responsmappning. Inga hjälpare acquire/release.
Image använder befintlig snapshot/CAS/holder och ny auktoritativ revision;
importer får inte muteras. Preview tar explicit typad policy och bevarar
dossier-env/lifecycle/session. HTTP kan schemalägga befintlig bokföring med
after; serverkoordinatorn ska kunna invänta samma persist-funktion.
Preview-URL-writern behöver atomisk expectedFilesRevision/holder-fence med
befintlig versionslåsägare, inte kontroll följd av ofencad skrivning.
Behåll bounded contention-retry och gamla callers där kontraktet är oförändrat.
Ingen ny DB-struktur, faktisk DB-skrivning, koordinator eller cron i delpaketet.

Runtimeinventering 2: ingen färdig lokal fullkedjeharness med browser och
DB/provider-dubblar. Befintlig Vitest kan testa verkliga entrypoints med dubblar
för klient borta, dublett/takeover och N→N+1. Den bevisar kontrollflöde/fences,
inte verklig SQL-atomicitet, tenant/auth eller plattformens processlivstid.
Verklig leasekonkurrens har scripts/db/version-lease-ownership.postgres.test.ts;
befintlig browserharness scripts/e2e/run-project-persistence.mjs är CI-only och
kräver disponibel Postgres. Godkänd testmiljö återstår före runtimeacceptans.

C1.3a slutlig testreview utan fynd: åtta stabila testhashar och tidigare åtta
produktblobs oförändrade. Testhashprefix: bootstrap 4B8E56E33B392A43;
budget 13D0F59AE1130F50; gate E9F24D6D825BD6A9; finalize 5BC919239F2DFDBE;
verify 8CD9FCC7CC7767D6; F3 EA1D36215F974A5F; build-error AB7A679390AD423B;
post-finalize 27781C642E3636AD. 1:s slutrapport bekräftar typecheck/diff PASS.

C1.3b lokalt klar/fryst: 71 riktade tester, typecheck utan incremental-cache,
diff-check och verifieringsplan --no-fetch PASS. Första plan-fetch nekades före
FETCH_HEAD-skrivning; planbeviset är därför bundet till lokal origin/preview.
Fem produktfiler netto −1 rad; routes 481→205. Tester +426, totalt +425.
19 andra WIP-filer hashoförändrade. 3 granskar produkterna och testerna.
Produktens kombinerade SHA-256: E93B2F5F31A3B4F13B26B82EF357011E8B2B2E91C273E330F1772714C1DDDECE.
Testernas: 6FF2CAF9EF1BA40B4D9BDCE309E2A433B00E2306861D3C144DB948657EE2C2DB.
Inget verkligt DB-/runtimebevis hävdas.

C1.3c designreview kräver två skydd före produktkontrollsflytten: ren
busy/settled-lookup innan nytt arbete; versionslease → omläsning → productclaim,
så lease-nekande inte lämnar claim upptagen. Betald LiveReview-reservation måste
atomiskt kontrollera holder/revision samtidigt som försöksräknaren ökas.
En senare resultatfence räcker inte. Förbered därför ett litet grundpaket i
live-review-runs.ts, live-review-session.ts och product-postcheck-runs.ts, med
riktade tester. Befintliga direktcallers behålls tills routepaketet ansluts;
en uttryckligen medskickad men felaktig held-kontext får aldrig degradera till
ofencad reservation. Inga reserverade försök återbetalas.
Efter grundpaketet: produkt-route/core + atomisk canonical-resultat/claim-owner,
sedan QG-core och held-serververify. Klientens error-log-POST ska bara replaya
serverlagrat releasebevis. Renew-fel stoppar; deadline reserverar persist/release-
tid och får inte starta betalt arbete genom ett åttasekundersgolv efter timeout.

C1.3b slutreview utan konkreta fynd: 10/10 scopehashar stabila. Granskaren
bekräftar import/followup/okänd-provenance-skydd, CAS/readback, previewidentitet,
await/after-paritet och atomisk writer. Slutrapporten från 2 bekräftar 71 tester,
typecheck utan cache, diff och plan PASS. Kod/testbevis, inte live konkurrens.

C1.3a–b lokal checkpoint: 99bd32ad033a641807de04b3686a8a7a8f619090.
29 exakta filer, +1379/−584 inklusive tester/planer. Indexets diff-check hittade
en extra slutrad i nya version-image-validation.ts som inte syntes i unstaged
diff-check när filen var untracked. Endast denna tomrad togs bort; jämförelse
med --ignore-blank-lines var identisk. B:s produktnetto blir därför −2 rader.
Samtliga 16 A-filer matchade reviewhasharna före commit; B:s slutreview 10/10
stabila. Arbetsytan ren efter commit. Ingen push, runtime eller live-DB.

C1.3c0 tilldelat 1 på denna checkpoint: endast db/services/live-review-runs.ts,
gen/verify/live-review-session.ts och db/services/product-postcheck-runs.ts
samt deras riktade tester. Befintlig betalreservation får explicit holder/
revision-kontext med atomisk kontroll vid counter-ökning; sessionsadaptern
stoppar före modell vid nekande. Lägg ren busy/settled-lookup utan att claim
skrivs; återanvänd befintlig klassificering. Äldre direktcallers ska bete sig
oförändrat tills nästa paket kopplar in held-core. Ingen route, ny typfil,
koordinator, timeoutändring eller cron i grundpaketet; utökat ownerbehov frågas.

C1.3c0 säkerhetsstopp: patchen nekades därför att granskaren inte ansåg att
verifierat användarmandat tydligt täckte just ändringen av de tre produkt-/DB-
ägarna och atomisk reservation för betalda modellförsök. Ingenting applicerades,
inga tester kördes, skrivfönstret släppt. Ingen alternativ verktygsväg/retry.
Direkt godkännandefråga finns nu i samordnarens chatt; äldre direktcallers och
kostnadstak ska vara oförändrade. Ingen live-DB/push/aktivering/modellkörning.

C1.3cf lokalt klar medan detta inväntas: fem befintliga filer, beteendeidentisk
flytt av buildProductPostcheckLogItems och dess privata formatterberoende till
gen/verify/product-postcheck-verdict.ts. Payloadtyp härleds type-only från
DB-ägarens input, ingen ny typfil/kopia eller klientruntimeimport. Uppdatera
hooks/chat/post-checks.ts och useResumePendingVerification.ts med direktimport,
inga återexportalias. Flytta nio befintliga tester från post-checks.test.ts till
product-postcheck-verdict.test.ts, oförändrade fixtures/assertions. Inga DB-/route-
eller produktpolicyändringar. Runtime och koordinator kvarstår.

C1.3cf slutresultat: 126 riktade tester, typecheck --incremental false,
diff-check och verifieringsplan --no-fetch PASS. Resume-testet är oförändrat.
Netto +1 produktrad och +6 testrader. 2 har släppt skrivfönstret. 3:s återupptagna
slutreview efter Jakobs avbrott har inga fynd: funktionskroppar är identiska
förutom typ-/exportanpassning, samtliga nio tester textidentiska, endast
type-only-import från DB-owner, direkta konsumentimporter utan kopia/alias.
Fem SHA-256 är oförändrade före/efter review och kontroll i samordnarchatten:
verdict AE5EE2F9EE5452F4400710A17966C1CA4D7F11DE201082D87479F361CEDA0A2A;
verdict-test 5666458FCE7FA82B17F3D98964B291DDD68B69CCA0710218A50F9E8387B7E58E;
post-checks 2EACA28E61C3E2B3A686D8340B52FD7D8DECABAF69DD498B21AFD9B6C92F419F;
post-checks-test 9A2B73C2BAEE9CA0B2F26D259AE9A30EA5FEF452A756CB017750F198053586AA;
resume 232CD99D4FAFAA62D430D498AA6F4B16E4DC4459BBA6F38EC97672CB35CED425.
Ingen ny runtimeacceptans. C1.3c0 är fortsatt oapplicerad i väntan på direkt
godkännande; avbrottets "fortsätt" ändrar inte säkerhetsstoppets mandatgräns.
