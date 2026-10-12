# C1 — servern driver efterkontroller, klienten visar dem

Utförare: 1. Avgränsad arkitektur-/diffgranskning: 3 på beställning.
Beroende: A1 + A2. Status: se [körbordet](../00-master-plan.md).

## Aktuellt integrationsresultat 2026-10-12

C1.4-server och C1.4-client är frysta; båda skrivfönstren är släppta.
Servern använder en gemensam runVersionPostchecks för generation och förberedd
resume-route. Produktresultat föregår en held-gate; deadline, betalhistorik,
revision och lås bevaras. Gamla post-finalize-dispatcher är borttagna.
Klientens automatmaterialisering, kö/tail, efterkontroll och reopen-resume
är raderade; files GET är ren läsning. Observation, manual repair/accept,
generationspolicy och PUT/PATCH/DELETE är kvar.

Server: 467 offlinetester i 14 sviter, produktnetto +56. Klient: 329 tester i
24 sviter, produktnetto −4 805 och 14 borttagna filer. Cachefri tsc/lint,
diff/plan passerade för båda; klientens testupptäckt passerade. Oförändrade
serverbevis återanvänds, inte ännu en fullkörning. Samordnaren verifierade
alla 58 frysta klient-/server-/planposter före docsändringarna. En ny readonly-
underagent med Jakobs mandat slutgranskade integrationen utan konkreta fynd;
41 kod-/testhashar och 14 raderingar kontrollerades oberoende.

Schemaläggningsposten nekades separat av verktygsprövningen; vercel.json är
orörd. Routen är autentiserad men oschemalagd. Automatisk periodisk återstart
och importverifiering är inte aktiverad och måste lösas före publicering.
F3-resume-auktoritet utökas inte. Inga live-DB/model/Blob-körningar utförda.
Docs-synk och slutreview är klara: 49 dokumentationstester samt docs-/plan-/
terminologi-/canvas-/timeout-/knip-/diffkontroller PASS. Samlad lokal checkpoint
sparas av samordnaren. Historiska paket-/designanteckningar nedan är underlag,
inte öppna skrivuppdrag. Verklig runtimeacceptans är fortfarande separat.

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

## Resultat och återstart

### Mandat och bevisgräns

Jakob har uttryckligen godkänt lokal C1 med befintlig Vercel-cron var femte
minut, liten batch och oförändrade kostnadstak; lokal ersättning av gamla
auto-repair-startvägen; LiveReview-skydd; hela c1- och q-paketen; samt lokala
commits efter verifiering/granskning. Verktygens tidigare mandatstopp är lösta
med de specifika godkännandena, inte genom bypass.
Jakob godkände även 2026-10-12 direkt och separat C1.3r lokalt (två filer) och
C1.3d-fix lokalt (fyra filer), efter respektive verktygsstopp. Deadlinefyndet
och resume-paketet är nu rättade/testade/granskade; betalda kvitton och tak
återställs aldrig. Exakta direkta godkännanden är registrerade i master.

Ingen push, aktivering, faktisk modellkörning, live-DB/schema/providerändring
eller ny extern tjänst ingår. Native Vercel-cron körs på Production, inte Preview.
[Plattformsowner](https://vercel.com/docs/cron-jobs/quickstart) och
[leverans/dupplikat/auth](https://vercel.com/docs/cron-jobs/manage-cron-jobs).
Koden nedan är lokalt verifierad med doubles; verklig DB-konkurrens och
stängd-klient/schemakörning är inte verifierade. Ingen runtime-DONE.

### Sparade lokala checkpoints

| SHA | Paket och faktiskt resultat | Återanvändbart testunderlag |
|---|---|---|
| `a9f209e95f3f8f68bf4a1c08c6cc88d20c579270` | C1.1 behåller LR-förbrukning; C1.2 privat durabel repairbudget, reservation före modell, unknown/partial stoppar ny kapacitet. Ingår med övriga tidiga paket. | C1.1: 49; C1.2: 286-bas samt 29 ändrade looptester. Ingen överlappande totalsumma. |
| `99bd32ad033a641807de04b3686a8a7a8f619090` | C1.3a atomiskt versions-/assistant-/startkvitto; C1.3b delad bildvalidering/preview och väntad revisionsbunden persistens. Gamla startvägen bort. | a: 74 finalize-tester och rättade A1/A2-fixturer; b: 71. |
| `dc7f14cc6a474708e29b8ab9694d4cbd91dd7b39` | C1.3cf formatterare hos befintlig serverneutral verdict-owner, inga nya ownerfiler. | 126; nio flyttade tester textidentiska. |
| `0ebc9b1ad62b2a4b45a6e06b05911b37600892da` | C1.3c0 LR-reservation under samma holder/revision; ren tuple-lookup; version→job→claim-låsordning, tak/norefund bevarade. | 111 i fem filer. |
| `2bcca4f5fcca4f26fab4f463c24b6acf56b10932` | C1.3im held bildförberedelse i befintlig image-owner: rå snapshot→heal/Blob→en CAS→bekräftad revision. Import/followup/okänd lineage muteras inte. | 78; avbrott stoppar nästa upload/persist, påbörjad upload kan slutföras. |
| `46034ed3f85d7840ef0cb6e894557c3a76ed0000` | C1.3q gemensam snapshot/export/gate/advisory, held-verify/held-build-repair, typade resultat. Två rekursiva svansar borta; alla tre renew-fel stoppar. HTTP startar ingen LLM-repair. | 176 i sju filer, typecheck/lint/diff/plan PASS. 3 utan fynd, 12 hashvärden stabila. Produkt −92/test +172. |
| `c681e6fe778a158c88ff6633ed62f0c1f15d330a` | C1.3c1 inklusive rättning: serverägt produktresultat, atomisk resultat/claim-TX och borttagen klient-whitelist. | Deltareview stänger fyndet; 16 fixfiler + 10 oförändrade verifierade. 26 filer, produkt −408/test +350. |
| `177f0d500492819a5cea1a327d59c6fd3391a2e6` | C1.3m explicit typat bildval utan ny meta-/prompt-/hashsanning. Import/okänd lineage off, ingen ny repair-auktoritet. | 215 i tio sviter, typecheck/lint/diff/plan PASS. 3 utan fynd, tjugo hashvärden stabila. Produkt +21/test +196. |
| `4047f4ce020f776a2c00b1afc7f86ee5c5b7ca01` | C1.3p samma deadline genom befintlig preview-start/resume/status/patch/update/fallback; egna dedupe-väntgränser. | 130 mocktester, typecheck/lint/diff/plan PASS. 3 utan blockerande fynd, sju hashvärden stabila. Produkt +103/test +205. |
| `72e0162c015401ef48984ef0dee1deda71800c04` | C1-save tar bort Sparas extra materialiseringsjobb och oanvänt media-argument/beroende. | 12 mocktester, cachefri typecheck/lint/diff/plan PASS. 3 utan fynd, tre stabila hashvärden. Produkt −5/test +76. |
| `a906b951fdc4987326b23dc3740013ac1fb77502` | C1.3d + d-fix: absolut deadline genom held-verify/QG/repair och modellreservation; typed STOP utan falsk observation eller återställda kvitton. | d: 189 tester; fix: 60 riktade, inte adderade som unik summa. Cachefri tsc/lint/diff/plan PASS, 3 stänger fyndet. Åtta stabila hashvärden. Produkt +86/test +227. |
| `6a378746f4d783fbfda4c6092b5c99f231ec3bd2` | C1.3r: ett durabelt privat resume-control-kvitto, max tre försök, bevarad historik/ålder och separerad importauthority. | 102 tester, lint/diff/plan PASS, cachefri tsc återanvänd. 3:s preliminär- och deltareview utan kvarstående fynd. Produkt +179/test +244. |

Samtliga paket är oberoende paketgranskade utan kvarstående fynd; detta är
inte det slutliga färskkontext-Buggpass-kvittot inför eventuell publicering.
Typecheck/diff och riktade kontroller återanvänds endast för oförändrad kod/
miljö. Max fyra workers och ingen upprepad fullbyggnad.

### C1.3c1 — committat och slutgranskat

Grundpaketet flyttar product-route till wrapper/held-core, serverlagrar formatterade
resultat och claim-completion atomiskt, kopplar in LR-skyddet och tar bort gamla
unheld/split-completion-vägar. Grundpaketets 256 unika offlinetester, typecheck/
lint/diff/plan passerade. Deadline reserverar persistensutrymme; inget critic-golv
efter sluttid. SM-077 boot-pending, wait-normalisering och lifecycle-supersession
bevaras. PG-fixturer är uppdaterade, inte körda mot DB; Redis/PG är skilda stores.

Review fann att oattesterad klient-summary med feature_disabled fortfarande
kunde bli F3-bevis när serverflaggan var ON, även med påhittad revision.
1:s rättning tar bort klientens och generiska writers produktauktoritet samt
den gamla whitelistfunktionen. Verklig OFF skapar serverägt revisionsbundet
lagringskvitto efter auth, utan capture/critic/LR. Centralt SQL-/batchfilter
ignorerar gamla OFF-kvitton när flaggan är ON. Normalflöde/resume konsumerar
serverkvittot; ordinary diagnostics från blandade batcher sparas separat.

Rättningen: åtta befintliga produktägare + åtta tester, produktnetto −9 mot
grundpaketet. 127 tester i senaste fyrfilspaketet, 60 resume, 11 generell
error-log samt berörda route/verdict PASS; ingen överlappande totalsumma.
Cachefri typecheck/lint/diff/plan PASS. 1 har släppt skrivrätten.
Manifestet C1.3c1-fix.sha256 finns länkat i chatt 1:s slutrapport; 16 fixhashar
är stabila efter q-commiten. 3:s deltareview stängde fyndet och båda callerföljderna
utan nya fynd; 16 fixhashar och tio oförändrade tidigare hashvärden verifierade.
Alla 48 dåvarande WIP-filinnehåll var oförändrade efter c1-commiten; tomt index.

### Nästa avgränsade paket

**C1.3m, 2:** explicit materializeImages från de två requestbyggarna genom
chat-schemas, init-route, followup-handler/codegen-turn, GenerationInputPackage/
GenerationFinalizeInput och paketfabriken till finalize/bootstrap/startpolicy.
Tio befintliga produktägare och direkta tester; inget nytt metadata-/kontrollager.
Valet kommer från enableImageMaterialization (UI: isMediaEnabled && enableBlobMedia),
INTE imageGenerations. Saknat fält/äldre kvitto betyder false; feltyp avvisas.
Import-lineage off, quickedit inget nytt startkvitto. Detta är efterbearbetningspolicy,
inte BuildSpec/promptunderlag: ändra inte lineagehashen eller promptsemantiken.
Lokalt kodklart: exakt tio produktägare + tio tester, inga nya filer, produkt +21.
215 tester, cachefri typecheck, lint/diff/plan PASS. 28 tidigare WIP-filer och
QG12 bevarade. 3:s slutreview utan fynd, tjugo hashvärden stabila före/efter
review och commit. Ingen faktisk serverinkoppling eller live Blob/DB-acceptans ännu.

**Durabel resume, befintlig server-repair-budget-owner:** initialkörning skiljs
från högst tre resume-försök. Runtimeprober/pure replay först; reservera under
holder före verkligt kontroll-/mutationsarbete. Okänt kraschutfall förbrukar
försöket. Bekräftad runtimehold/claimbusy/supersession får återföra en logisk
resume-plats enligt befintlig policy, men aldrig radera historik eller återbetala
LLM/LR-kvitton. Starting väntar utan waittak inom sju dygn; övriga begränsade
runtimeholds har 20. Import får endast ett separat strikt validerat kontrollkvitto,
aldrig paid init; parsern skiljer detta från befintlig betald historik.
Okänd äldre genererad historik får inget nytt automatiskt betalmandat.
1:s tvåfiliga C1.3r är committat: ett privat resume_control-
kvitto, monoton försöksidentitet, bevarad historik, avgränsade hold-räknare och
nextEligibleAt/terminal-disposition. Separat import/control-läsning är aldrig
paid-budget-ready. Rena prober ska inte skapa en ny loggrad per tick. Queryn får
inte låta terminala/ej förfallna/okända kandidater fylla varje batch och svälta andra.
Direkt användargodkännande nådde 1 och ordinarie verktygsprövning accepterade
paketet. 102 tester PASS. Samtidiga reservationer behåller samma attemptId;
testmocken ligger på query-ägaren efter ett fångat fasadmockfel. Canonical
historisk importproveniens läses före TX för att undvika en andra poolanslutning;
current version/lease/revision/kvittoauthority verifieras under lås. 3 har granskat
denna delta. Superseded ökar inte 20-räknaren, enligt tidigare klientowner
useResumePendingVerification.ts; runtime/claim-busy gör det. Ingen paid refund.
API i befintlig budget-owner: readServerResumeControl, reserveServerResumeAttempt,
settleServerResumeAttempt och recordServerResumeHold. Samtliga tar typed target
och returnerar ServerResumeControlResult med snapshot/disposition; settle tar
monotont attemptId. Initialgenereringen förbrukar inte resume-försök.

**En serverkedja:** samma holder, trusted startpolicy och rå snapshot.
Bildförberedelse→kvitterad revision→preview/väntad persistens→serverproduktresultat.
Runtime-wait/superseded fortsätter inte till gate. Välj EN gate-owner:
serverVerify.run använder verifyVersionUnderLease med exakt diagnosticOnly;
annars kan separat QG-intent använda runVersionQualityGateUnderLease.
F2 serververify-skip är inte skip av postchecks. Konsumera typade
continue/stop/superseded, inte HTTP-body. stop (även repair_settled) fortsätter
inte releasekedjan; omstart är begränsad och skapar inte ny paid capacity.
F2-produktblock bevarar dagens gate-/holdsemantik. Inget nytt resultatlager behövs.

C1.3d är nu fryst i befintliga verify-run/repair-execution
och deras två testfiler: valfri absolut kedjedeadline till held-verify/delad QG,
befintligt verifyDeadlineEpochMs och repairDeadlineEpochMs vidare till helpers.
Ingen fas/omstart får nollställa totalbudgeten; mindre befintliga fasgränser består.
Efter awaitad renew kontrolleras tiden före nästa LLM/gate/save. Omitted manual-
defaults och kostnadstak består. Fake-clock: första gate förbrukar nästan all tid,
repair får ursprunglig deadline; renew över deadline ger typed retrybar STOP.
189 unika mocktester i sju filer, cachefri typecheck/lint/diff/plan --no-fetch PASS.
Fyra scopehashar är frysta, tre rootplaner bevarades; 2 har släppt skrivrätten.
3:s review fann en konkret lucka: repair-loop fryser timeout-gettern före
modellportens awaitade betalreservation, sedan används ett 1-sekundsgolv.
Försenad reservation kan därmed följas av LLM-start efter originaldeadline.
1 har readonly-bekräftat minsta d-fix: valfri absolut deadline genom befintliga
llm-repair-gate.ts och repair-loop.ts, kontroll före/efter reservation och inget
förlängande golv för deadlinecaller. Typat retrybart STOP, ingen påhittad
modellobservation/llmPasses-ökning, retry eller merge; befintlig reservation
behålls utan completion/refund/reset. Direkta tester är llm-repair-gate.test.ts
och repair-loop.outcome.test.ts. Efter uttryckligt direkt paketgodkännande i 1
accepterades normal verktygsprövning. Inga alternativa skrivvägar användes.
Fixen passerar 60 riktade tester och cachefri tsc/lint/diff/plan. 3 stängde
deadlinefyndet och verifierade åtta slutblobbar. D8 är committat i a906b951f;
detta bevisar inte faktisk provider- eller plattformskörning.

Preview-start behöver separat trådning vid serverinkopplingen: ensure-version-preview,
preview-session, preview-host-client och tier2-resume är befintliga owners.
Start/update/patch har idag 300 sekunder per anrop; disk-full-cleanup/omförsök
kan starta en ny period. För vidare en absolut deadline och klampa befintliga
timeouts till återstående tid; kontrollera före fallback/nytt försök. In-flight-
dedupe får inte låta en kortare väntande caller avbryta en annan körning.
Ingen ny timeoutmotor; omitted callers behåller befintligt beteende. Detta är
3:s bekräftade framtida inkopplingskrav, inte ett regressionsfynd i C1.3d.
C1.3p är committat i 4047f4ce0: fyra produktägare och tre befintliga tester, inga nya filer.
130 mocktester i fyra filer, cachefri typecheck/lint/diff/plan --no-fetch PASS.
Alla d4/rootplan3-hashar bevarade, sju p-hashar verifierade av samordnaren.
Omitted defaults och befintlig retrybar start_failed/503 bevaras; ingen ny
HTTP-felkod. 3:s review utan blockerande fynd, sju hashvärden stabila före/efter.
Redan initierad bounded cleanup och revisions-/holderbunden URL-bokföring får
slutföras efter deadline; ingen ny hoststart eller runtimeReady-stämpling följer.
Samtliga 14 dåvarande WIP-filinnehåll bevarades efter commit, index tomt.
D8 och r2 har därefter committats; endast tre rootplaner är WIP före nästa paket.

**Ursprunglig request-deadline (C1.3t klart):** create-chat-stream-post
har requestStartedAt, followup-handler har promptStartedAt. Härled absolut
deadline från detta startvärde och canonical manifest routeTimeouts-
engineRouteMaxDurationSeconds.default, begränsad av eventuellt kortare
befintligt enginebudget. Env-overridable ENGINE_ROUTE_MAX_DURATION_SECONDS
ensamt är inte en säker statisk gräns. Tråda typat genom codegen-turn,
own-engine-pipeline-generation, generation-stream och post-finalize; inget
nytt meta-/BuildSpec-/promptfält, SDK-beroende eller duplicerad 950-konstant.
engineStartedAt skapas för sent. after(pending) bevaras men ger inte ny tidsbudget.
Runtimeplattformens faktiska tidsstöd är inte verifierat av lokal deklaration.
Sparat i 24b9bc8ae17733765f5735fa6a9a8de28993d977, nio filer: produkt +20/
test +111. 112 mocktester, cachefri tsc/lint/diff/plan PASS; 3 utan fynd, nio
hashstabila blobbar. Typfältet är obligatoriskt; normal/abort/fallback bevarar
samma deadline. Ingen faktisk servercore-konsumtion i detta paket.

**C1.4 disposition:** runVersionPostchecks i befintliga server-verify/verify-run.ts,
exporterad via server-verify.ts. Typed chatId/versionId/entry initial|resume/
deadlineEpochMs och smala valfria notifieringar utan auktoritet. Samma core från
post-finalize och tunn cron-route. Högst en superseded-omstart per invocation.
Kandidatquery hör i chat-repository/versions.ts, inte en ny budget-query-owner.
1 har implementerat core/server-entry/oschemalagd route och raderat gamla
postfinalize-dispatcher; 2 har raderat klientköer/resume/GET-mutation. Ingen
mellancommit med dubbla automatiska owners; gemensam slutreview före commit.

**Cron/inkoppling:** versions.ts bredvid getLatestVersion är befintlig query-owner.
Välj verklig senaste version_number per chat FÖRST, aldrig preferred-head; filtrera
sedan draft/återtagbart tillstånd, minålder 5 min/import 90 s, ålder <7 dygn,
provenance, aktuell migrationshold och färsk lease. Join via engine_chats till
app_projects ger verklig user/session. SQL är kandidater; återvalidera latest,
ålder, ägare, provenance och migrationshold under lease. Import-lineage ägs av
chatHasImportedRepoVersion, inte bara edit_kind. LR-expiry räknas från LR-kvitto,
inte version; utgånget/raderat kvitto är inte ny paid authority.
CRON_SECRET måste finnas även lokalt; återanvänd inte någon lokal fail-open.
Inga fake Requests/owners, interna HTTP-kedjor, nya köer/tabeller/tjänster.

Usage/billing: befintlig runWithLlmUsageContext får egen claimKey för en verklig
bakgrundskörning med lagrad user/session, chat/version och runId. Originalnyckeln
finns redan i credits-handler/generation-billing-marker; attribution/recovery
av ursprungsgenereringen behåller den. Vid behov används befintlig
appendGenerationBillingClaimKey och settleExistingGenerationBillingIfPresent.
Settlement räknar versionsbunden usage. Saknad marker/okänd betalhistorik skapar
inte nytt betalmandat. Inget nytt claimKey-fält i finalize-bootstrap behövs.

2:s riktade identitetskontroll: befintliga getChat (chat-repository/chats.ts)
→ project_id → getProjectById (services/projects.ts) ger lagrad user_id/session_id.
Produktvägens befintliga sträng-ID är verkligt konto-ID eller guest:<sessionId>
(tenant.ts och product-postcheck-route), usage behåller separata user/session-
fält. Saknas båda finns ingen lagrad identitet att återuppta med. Inför inte
en ny gästspärr: nuvarande LiveReview-access/claim förbjuder inte gäster.
anonymous_unbilled i generation-billing betyder ingen användardebitering, inte
att provideranrop saknar kostnad. Befintliga paid grants/kvitton/caps avgör
auktoritet; saknad billingmarker får inte ensam misstolkas som gästförbud.

Post-finalize ska ersätta befintliga parallella preview/verify/repair-dispatcher
med samma core och bevara billing→done, preview-ready/build-error/repair-SSE
och versions/status-polling. Preview läser lagrad snapshot efter bildmutation,
inte rå SSE-output. Ta samtidigt bort motsvarande klienttrigger/kö/retry.
Befintliga wrappers/manual repair/ordinary diagnostics och UI/status behålls.

**Sista legacy-raderingen:** /files GET blir ren snapshotläsning; dess heal/
materialize-persist och klientens gamla materialiseringsväg raderas när servern
är inkopplad. Jakob delegerade Spara-beslutet: snapshot-only; genereringen äger
bilder. Befintliga bilder raderas inte, gamla projekt får ingen extra bildkopiering
via Spara. Export/deploy har egna aktiva bildowners och lämnas orörda.
C1-save är nu separat klart: materialize=1 är borttaget från Spara, liksom
hookens oanvända media-parameter/beroende och callerns argument. Befintligt
och nytt projekt testas med oförändrade bildreferenser/filer. Tolv mocktester
PASS, två nya regressioner först RED; cachefri typecheck/lint/diff/plan PASS.
3:s review utan fynd, tre scopehashar stabila. Alla tio dåvarande WIP-filinnehåll
bevarades vid commit. GET:s generella mutation och generationens klientbildjobb
lämnades då orörda; de är nu raderade i C1.4-client tillsammans med serverinkopplingen.

### Återstående acceptans

Riktade offline-integrationstester ska gå genom verkliga entrypoints med
DB/provider-doubles: F2/F3, dubletttrigger, revision/leasebyte, runtimewait,
stängd SSE, cron/owner/auth, budget vid krasch/takeover samt import/quickedit.
Verklig SQL/processdurabilitet och automatiskt schema kräver senare godkänd
testmiljö/aktivering. Inget sådant bevis eller fullbygge påstås här.
