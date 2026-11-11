# LLM-kedja och legacy — återstående acceptans

Status: active
Ägare: Jakob för produkt-/driftbeslut; tilldelad agent för avgränsat arbete.
Start: 2026-10-11. Konsoliderad 2026-11-05, med ett avgränsat F2-liveprov nedan.

## Levererad implementation

Grundpaketet är mergat i #1593, `e756410522a186d4656ee6a379a62cfd0ffb70d5`
(2026-10-18). Committen finns i denna checkouts Git-historik. Påståendet att
paketet bara finns lokalt eller aldrig har pushats gäller inte längre.
Merge bevisar inte aktuell deployment, effektiv miljö eller runtimeacceptans.

Levererat: typat beslutat byggunderlag, gemensam projektberedning för finalize
och eval, borttagen oanvänd MCP-/generate-site-wrapper och oparsad env-editor,
en serverkedja för efterkontroller samt borttagen klientkö/materialisering.
GET läser sparad snapshot och Spara startar inte extra bildarbete. Gamla
paketcheckpointer, agentregistreringar och startprompter finns i Git.

| Aktuell owner | Ansvar |
|---|---|
| [generation-input-package.ts](../../../../src/lib/gen/generation-input-package.ts) och [generation-package.ts](../../../../src/lib/gen/orchestrate/generation-package.ts) | Beslutat underlag och smal finalizeprojektion; explicit `[]`, borttagningar, provider-/importkontrakt och F2/F3 består. |
| [finalize-merge.ts](../../../../src/lib/gen/stream/finalize-merge.ts) och [eval/runner.ts](../../../../src/lib/gen/eval/runner.ts) | Samma kompletta projektberedning; ändrad kandidat/revision kräver nya berörda bevis. Eval är inte en andra finalize. |
| [runVersionPostchecks](../../../../src/lib/gen/verify/server-verify/verify-run.ts) | Bildpolicy → omläst revision → preview/readiness → serverproduktresultat → relevant gate under samma holder och absolut deadline. |
| [server-repair-budget.ts](../../../../src/lib/db/services/server-repair-budget.ts) och [versions.ts](../../../../src/lib/db/chat-repository/versions.ts) | Durabla kvitton/försök, latest-urval, ägare, proveniens, ålder, backoff och leasevalidering. |
| [generation-billing.ts](../../../../src/lib/db/services/generation-billing.ts) | Exakt kvittobindning, avräkning och befintlig admin-recovery. |

Stabil modell och kontrakt: [LLM-pipeline](../../../architecture/llm-pipeline.md),
[quality-gate-flöde](../../../architecture/quality-gate-flow.md) och
[env-flöde](../../../contracts/env-flow.md). Planen är ingen parallell
runtime-owner och ger inget mandat att ändra produktpolicy.

## Återstående leverans och beslut

| ID | Kvar | Godtagbart slutbevis |
|---|---|---|
| R1 — återstart utan builder | Välj och godkänn faktisk schemaläggning, auth, target och plattformstid. Routen finns men har ingen cron-post i `vercel.json`. | En avgränsad berättigad testversion når bestående slutstatus med alla builderflikar stängda; faktisk trigger, köridentitet, leases, budget och retry/takeover verifieras. Merge eller `maxDuration`-deklaration räcker inte. |
| R2 — runtimekontrakt | Representativ init/follow-up, F2/F3, import och snabbredigering genom riktiga entrypoints med sin avsedda policy. | Rätt projektkandidat och revision sparas; mutation ogiltigförklarar gammalt godkännande. Produkt/gate, explicit tomt/borttaget, importskydd, preview-resync, bildpolicy och manuella beslut består. Ingen avstängd grind redovisas som körd. |
| R3 — kostnadsavstämning | Acceptera den mergade brief-/billingfixen i faktisk testmiljö. Historiska DEV-rader rättas inte av kodändringen. | Verifierat briefkvitto följer till första billingmarkören; full versionsbunden usage inklusive brief stämmer med settlement/recovery, även vid attribueringsfel. Retry ger varken dubbeldebitering eller ny betalauktoritet. |
| R4 — ägar-/callerbevis | Parkerade kompatibilitetsraderingar: `/api/preview-render`, host-aliaser och äldre readiness-kontrakt. | KEEP tills trafik-/ägarunderlag enligt [livscykelpolicyn](../../../documentation-lifecycle.md) tillåter en separat borttagning. Intern namnlikhet eller textsökning räcker inte. |

### R1: två väckningsvägar, en serverägare

[Versionspollens väckning](../../../../src/lib/hooks/postcheck-recovery.ts)
är en senare avsiktlig reservväg. Den skickar bara versions-ID till
[ägarkontrollerad POST](../../../../src/app/api/engine/chats/[chatId]/postchecks/route.ts);
servern återvaliderar latest, lease, lagrad policy, ursprunglig budget och ålder.
Det är inte klientens borttagna efterkontrollmotor och ska inte raderas som
legacy. Ett accepterat anrop är inte ett verifieringsresultat.
Med alla builderflikar stängda väntar reservvägen på återbesök eller en
separat schematrigger.

[GET /api/engine/postchecks](../../../../src/app/api/engine/postchecks/route.ts)
återanvänder samma core med en liten kandidatbatch. `CRON_SECRET` krävs även
när opt-in är av; bara exakt `SAJTMASKIN_POSTCHECKS_SCHEDULE_ENABLED=1`
tillåter recovery-arbete. Flaggan skapar inget schema och påverkar inte
vanlig genererings direkta efterkontroller. Aktuella regler ägs av
[ENV](../../../ENV.md#automatisk-återkoll-av-ofärdiga-efterkontroller) och
[env-policy](../../../../config/env-policy.json), inte gamla snapshots.

Före schematrigger/aktivering: explicit miljö/target enligt
[db-targets](../../../../config/db-targets.json), verifierad hemlighetsfri
auth-/tidskonfiguration och avgränsat testuppdrag. Vercel Cron mot produktion
är inte ett Preview-prov. Routen saknar eget månadstak i pengar; återupptagen
LiveReview/reparation och drift kan kosta inom befintliga försöks-/kostnadstak.

Bevisa verklig SQL-/processdurabilitet och dubbla triggers, krasch/takeover,
terminala/ej förfallna batchkandidater, ändrad revision/lease/latest och
sen runtime-ready. Import har separat kontrollauktoritet; snabbredigering
och okänd äldre betalhistorik får inget nytt automatiskt betalmandat.
F3-resume-auktoritet utökas inte. Behåll samma anropsdeadline genom hela
respektive initial-/resume-kedja: renew, preview, gate, reservation och fixer.
Okänt utfall får inte återställa
försök, ålder, historik, LLM-/LiveReview-budget eller skapa falskt `passed`.

### R3: brief, usage och debitering

Den mergade fixen bekräftar sparad ägarbunden brief-usage före
`X-Brief-Usage-Claim-Key` och cache. Klienten stoppar synligt vid saknat
kvitto; ingen extra betald fallback. Både generationens och briefens nyckel
sparas atomiskt i första billingmarkören före attribuering. Normal avräkning
och befintlig admin-recovery använder exakt nyckel och billingägare för en
chatlös brief; cacheträff får inget nytt betalt kvitto och redan versionsbundna
rader flyttas inte.

Acceptans omfattar normalvägen och recovery efter marker-/attribueringsfel,
upprepad settlement, cacheträff och felaktig ägare/nyckel. Misslyckad bindning
förblir pending; ingen gissning efter tid/session, dubbeldebitering eller
retroaktiv ändring av äldre kvitton. Gratisgenerering innebär inte noll
providerkostnad. Skilj tokenkostnad, credits/påslag och hostingkostnad.

Historiskt DEV-prov 2026-10-12: version
`7d13aea9-f0c9-49b4-a1a9-2539dbabda62` visade desktop/mobil,
produktkontroll och Spara/återöppning utan nya usage-rader. Fyra usage-rader
summerade $0.221461; versionsbilling omfattade $0.188289 eftersom briefen
$0.033172 saknade bindning. Det utlöste kodfixen, inte accepterad
liveavstämning efter fix. Befintlig kvalitetsgrind och LiveReview var av,
F2-verifiern skippades enligt policy och bilder var av: provet accepterar
inte dessa vägar, F3, schemalagd återstart eller full kostnadsavräkning.

## Avgränsat F2-liveprov 2026-11-05

Ett nytt, ägargodkänt browserbygge i Preview från `9738ea3e` (DEV) skapade
en fiktiv kafésajt. Ingen publicering eller DB-apply gjordes.
Dokumentationsrelease #1716 ändrade senare preview-tip utan runtimeändring.

| Kvitto | Observation |
|---|---|
| Identitet | Chat `f7a43c1e-e275-4858-8556-03f690b39fad`, version `7f37d044-63ed-4c22-aad8-f4aaf8b5e7c9`, attesterad filrevision `326d65896cf763cd2bf234fa27cb23e3`. |
| Produktkontroll | Sparad `product_postcheck.summary`: `passed`, noll varningar, run `cb663300-2cce-4e57-87c7-60864f182b88`. |
| Kvalitetsgrind / LiveReview | Sparad kvalitetsgrind `passed=true`, jobb avslutat 02:30:35 UTC. LiveReview-logg: `status=completed`, resultat `passed` för samma attesterade revision. Dessa vägar var alltså inte avstängda som i oktoberprovet. |
| Persistens och återöppning | Senare ägarkontrollerad versionsläsning gav `verificationState=passed`, `releaseState=promoted` och `busStatus.done=true`. Byggkortet slutade visa pågående arbete. `promoted` här är intern versionsstatus, inte publicering eller Git-promote. |
| Browser | Desktop- och mobilbilder sparade; alla fem bilder laddade, menyankaret scrollade till `#meny`, mobilens scrollbredd var 390 vid viewport 390. Inga observerade page-errors. |
| Tid | Byggstart 02:20:44 UTC; sidan syntes före avslutad kvalitetsgrind. En synlig preview medan status fortfarande är pending är inte ett slutkvitto. En körning ger inget jämförbart p50/p95- eller förbättringsmått. |

Detta kompletterar **R2 för en vanlig F2-init**. Det bevisar inte R1:s
schemalagda återstart med alla flikar stängda, R3:s fulla billingavstämning,
follow-up/F3/import/snabbredigering, felinjektion, leasekonkurrens eller
modellgenererade bilder. Dessa kvarstår enligt tabellen ovan.

## Avgränsning och avslut

Extern route-/featureradering, ny infrastruktur, DB-migration, env-write,
betalda modell-/Blobprov, schemaläggning och produktion är separata konkreta
uppdrag. Starta ingen sådan åtgärd enbart för att stänga planen. Behåll
legacy-URL-shim, aktiva preview-hostfunktioner, runtime-env-resolverns
fullkatalogläge och aktiva deployroutes; olika semantik konsolideras inte.

Verifiera ett tilldelat delta med befintlig verifieringsplan och riktade
kontroller; full regression ägs av CI. Offline-doubles bevisar inte verklig
DB-konkurrens, processdurabilitet eller plattformstid. Återanvänd oförändrade
kvitton och kör inte en betald evalmatris utan avgränsat behov.

Varje acceptanskvitto anger kod-SHA, verifierad miljö, chat/version/revision,
berörda run-/attempt-/usage-identiteter, faktisk policy och budget före/efter.
Hemligheter och testlösenord hör inte i planen. Rapportera kostnads-/latensvinst
bara med jämförbar mätning.

När R1–R3 är bevisade eller uttryckligen parkerade hos namngiven mottagare
och R4:s disposition bevarats: avsluta enligt planlivscykeln med en indexrad
och ta bort detta koncentrat. Mergad kod, aktuell deployment, aktivering och
runtimeacceptans ska fortfarande redovisas som olika fakta.
