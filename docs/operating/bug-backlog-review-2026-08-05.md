# Omtriage av Sajtmaskins bug-backlog — 2026-08-05

## Granskningsgrund

- Repo: Jakeminator123/sajtmaskin
- Granskad branch: master
- Granskad master-SHA: 59eb8064362f9361a93679426e74645b81b5ff7e
- Granskad fil: BUG-SWARM-BACKLOG.md, blob 3eccd66426761794e49e7df941c211c72baff167
- Full förmigreringskälla: [BUG-SWARM-BACKLOG.md på `59eb8064`](https://github.com/Jakeminator123/sajtmaskin/blob/59eb8064362f9361a93679426e74645b81b5ff7e/BUG-SWARM-BACKLOG.md)
- Datum: 2026-08-05
- Metod: sex områdesgranskningar mot aktuell kod, därefter samlad korsgranskning.
- Öppen PR vid slutkontrollen: #799. Den visar att boot-failure-loopen i tidigare rad 50 fortfarande är verklig på master och har därför korrigerat den preliminära arkiveringsdomen.

Detta dokument är granskningsjournalen bakom den kanoniska omstruktureringen. Den operativa kön ligger fortsatt i reporotens `BUG-SWARM-BACKLOG.md`; formatkontroll och canvas-parser uppdateras i samma PR.

## Slutsats

> **Korrigering efter livekontroll:** Den preliminära domen för rad 50 var fel och rad 53 var för hård. Rad 50 är aktiv med öppen fix i #799. Rad 53 är modellkonfigskuld eftersom `config/ai_models/manifest.json` fortfarande tillåter `gpt-5.4-mini`.

Den tidigare filen hade **114 rader totalt**: 55 i `Aktiv kö`, 13 i `Behöver repro` och 46 i `Beslut & policy`. Den första granskningsversionen räknade felaktigt bara den aktiva tabellen; den missen fångades av den manuella diffgrinden före publicering.

Efter livekontroll mot `59eb8064` står 19 ursprungsrader kvar som bekräftade aktiva kod- eller produktfel. En ursprungsrad är en P1-releasegrind bakom avstängd feature flag. Delning av fler-premissrader ger sammanlagt 133 stabila ID:n: 104 operativa rader i rotfilen och 29 arkivrader. Alla 114 källrader har en uttrycklig destination.

| Ny klass                           |     Antal ursprungsrader | Rekommendation                                                              |
| ---------------------------------- | -----------------------: | --------------------------------------------------------------------------- |
| Bekräftade aktiva fel              |                       19 | Behåll, men smalna av 7, 16 och 40; rad 50 stannar tills #799 är verifierad |
| Release blocker bakom feature flag |                        1 | Behåll som separat P1-grind och dela i barnpunkter                          |
| Trovärdig risk / behöver repro     |                       11 | Flytta ur huvudkön och ange exakt verifiering                               |
| Ägarbeslut / policy                |                        7 | Separat beslutslista med deadline och beslutsägare                          |
| Teknisk skuld / hardening          | 13 + delpunkt från rad 7 | Separat skuldlista, inte räknad som produktbuggar                           |
| Redan löst / absorberat            |                        4 | Arkivera med fixreferens                                                    |
| Totalt i tidigare `Aktiv kö`       |                       55 | Full spårbarhet bevaras; fler-premissrader delas                            |

De 13 tidigare repro-raderna och 46 policy-raderna redovisas separat i migrationsmatrisen nedan; de ingår inte i 55-raderstabellen ovan.

## Migrationsmatris för de tidigare sidoköerna

Varje tidigare rad har ett stabilt ID och en uttrycklig destination. `Arkiv` betyder den daterade filen `backlog-arkiv-2026-08-05.md`; `absorberad` behåller dessutom en pekare till den kanoniska raden.

| Tidigare kö/rad | Nytt ID | Destination                   | Identifiering                                       |
| --------------- | ------- | ----------------------------- | --------------------------------------------------- |
| Repro 1         | SW-056  | Repro                         | OpenClaw health transient 502                       |
| Repro 2         | SW-057  | Repro                         | F3 auto-kick kringgår stale-base                    |
| Repro 3         | SW-058  | Repro                         | Arcade Klarna merge-syntax                          |
| Repro 4         | SW-059  | Repro                         | Scaffold required files tappas                      |
| Repro 5         | SW-060  | Repro                         | Fontmaterialisering väljer Inter                    |
| Repro 6         | SW-061  | Repro                         | Element-crop vid DPI/zoom                           |
| Repro 7         | SW-062  | Repro                         | Mediafallback från preview-VM                       |
| Repro 8         | SW-063  | Repro                         | Analytics före cookie-consent                       |
| Repro 9         | SW-064  | Repro                         | Loopia re-link och duplicate DNS                    |
| Repro 10        | SW-065  | Repro                         | Socket tappas under generering                      |
| Repro 11        | SW-066  | Arkiv, absorberad i SW-069    | WebGL Context Lost                                  |
| Repro 12        | SW-067  | Repro                         | Synlig text saknas i accessible name                |
| Repro 13        | SW-068  | Repro                         | OpenClaw skills saknar beroenden                    |
| Policy 1        | SW-069  | Skuld                         | THREE-varningar och benign context-loss             |
| Policy 2        | SW-070  | Ägarbeslut                    | Browserfel når diagnostik men inte RepairGate       |
| Policy 3        | SW-071  | Arkiv, policy ratificerad     | Okänd revision är fail-open                         |
| Policy 4        | SW-072  | Ägarbeslut                    | Stripe-utbetalning kräver avstämning                |
| Policy 5        | SW-073  | Arkiv, absorberad i SW-054A/B | Eval mäter inte verklig generering                  |
| Policy 6        | SW-074  | Ägarbeslut                    | Placeholder ska visas degraded                      |
| Policy 7        | SW-075  | Ägarbeslut                    | Product Postcheck blockeringspolicy                 |
| Policy 8        | SW-076  | Ägarbeslut                    | Simplified Brief sänker kvalitet                    |
| Policy 9        | SW-077  | Ägarbeslut                    | Verifier-scope och recurring findings               |
| Policy 10       | SW-078  | Ägarbeslut                    | Cold-cache verify är fail-open                      |
| Policy 11       | SW-079  | Ägarbeslut                    | Follow-up-kvalitet och budget                       |
| Policy 12       | SW-080  | Skuld                         | Env-precedence och dokumentrefaktor                 |
| Policy 13       | SW-081  | Skuld                         | Säkerhetsresidualer kräver eget pass                |
| Policy 14       | SW-082  | Ägarbeslut                    | Quality gate utan telemetri är fail-open            |
| Policy 15       | SW-083  | Ägarbeslut                    | Clerk-middleware utan nycklar                       |
| Policy 16       | SW-084  | Arkiv, residual i SW-003      | Capability surface ownership                        |
| Policy 17       | SW-085  | Skuld                         | Write-on-read i `/files`-GET                        |
| Policy 18       | SW-086  | Arkiv                         | Draft-generation utan parent-lease                  |
| Policy 19       | SW-087  | Skuld                         | Scaffold-, variant- och fonttuning                  |
| Policy 20       | SW-088  | Skuld                         | Samlade produkt- och UX-gap                         |
| Policy 21       | SW-089  | Skuld                         | Logg-, observability- och storagestäd               |
| Policy 22       | SW-090  | Skuld                         | Deploytopologi och separata lanes                   |
| Policy 23       | SW-091  | Arkiv                         | A7-2-default redan avgjord                          |
| Policy 24       | SW-092  | Arkiv                         | CTA blockerar fast lane avsiktligt                  |
| Policy 25       | SW-093  | Arkiv                         | Canonical UI-skydd är avsiktligt                    |
| Policy 26       | SW-094  | Arkiv                         | Last-good preview-retention accepterad              |
| Policy 27       | SW-095  | Arkiv                         | Deferred re-verify täcks av watchdog                |
| Policy 28       | SW-096  | Arkiv                         | Repair-pass noll trots deadline                     |
| Policy 29       | SW-097  | Skuld                         | Dependabot auto-merge saknar grindar                |
| Policy 30       | SW-098  | Arkiv                         | Master-ruleset åtgärdat                             |
| Policy 31       | SW-099  | Ägarbeslut                    | Fler CI-jobb som required                           |
| Policy 32       | SW-100  | Ägarbeslut                    | Warn-only-stabilitet saknar signal                  |
| Policy 33       | SW-101  | Arkiv                         | Publikt repo uttryckligen valt                      |
| Policy 34       | SW-102  | Ägarbeslut                    | F2-deploy utan placeholder-env                      |
| Policy 35       | SW-103  | Skuld                         | Template-import, env och drift                      |
| Policy 36       | SW-104  | Skuld                         | Preview-förvärmning default av                      |
| Policy 37       | SW-105  | Arkiv                         | Parallell migration/deploy accepterad               |
| Policy 38       | SW-106  | Arkiv                         | Skippad ledger-check accepterad                     |
| Policy 39       | SW-107  | Skuld                         | Capability-proveniens splittrad                     |
| Policy 40       | SW-108  | Arkiv                         | `DATABASE_URL` utan registry är by design           |
| Policy 41       | SW-109  | Arkiv                         | CSP förblir report-only                             |
| Policy 42       | SW-110  | Ägarbeslut                    | Orphan-chat save/restore-policy                     |
| Policy 43       | SW-111  | Arkiv                         | Admin-klientgate åtgärdad                           |
| Policy 44       | SW-112  | Arkiv                         | Analytics-admingate åtgärdad                        |
| Policy 45       | SW-113  | Arkiv                         | Vercel-bulkradering säkrad                          |
| Policy 46       | SW-114  | Arkiv                         | Health visar process-liveness, inte modellkapacitet |

## Rekommenderad kanonisk struktur

1. Aktiva produktionsbuggar
2. Release blockers bakom feature flag
3. Bekräftade risker och behöver repro
4. Väntar på ägarbeslut
5. Säkerhet, infra och teknisk skuld
6. Arkiv

Varje aktiv rad bör vara kort och ha följande fält:

| Fält       | Regel                                                          |
| ---------- | -------------------------------------------------------------- |
| ID         | Stabilt ID, inte tabellposition eller flyktigt radnummer       |
| Prio       | P0–P3 med tydlig betydelse för aktuell räckvidd                |
| Räckvidd   | Produktion, feature flag, adminverktyg, CI eller latent config |
| Fel        | En enda falsifierbar premiss                                   |
| Kodbevis   | Fil och funktion, inte en lång historik                        |
| Förväntat  | Vad systemet ska göra                                          |
| Nästa steg | Fix eller exakt reprokommando/test                             |
| Verifierad | Datum och master-SHA                                           |
| Ägare      | Kodområde eller namngiven beslutsägare                         |

Lång historik, gamla PR-resonemang och kronologi bör flyttas till en separat granskningsjournal. Aktiv kö ska vara körbar utan att läsa flera hundra ord per rad.

## 1. Föreslagen aktiv produktbuggkö

|      Gammal rad | Prio | Kort fel                                                                    | Kodbevis / avgränsning                                                                         | Arbetsbar nästa åtgärd                                                              |
| --------------: | ---- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
|               2 | P2   | Misslyckad template-init lämnar evig spinner                                | Empty-state härleds bara ur templateId + saknad chatId; felvägen visar endast toast            | Tråda templateInitError, visa felvy och återställ attempt-key vid retry             |
|               4 | P3   | Primärknappens hover-text ligger under AA                                   | Default hover:bg-primary/90 ger cirka 4,14:1 med nuvarande tokens                              | Inför AA-testad opak hovernyans och kontrasttest för hover                          |
|               6 | P2   | Sync-scaffoldmatchern väljer första tröskelträff och ignorerar capabilities | Auth kan returneras innan ecommerce/app jämförs                                                | Rangordna samlade scores och låt högsta tillåtna scaffold vinna                     |
|               7 | P3   | starter-neutral säger either men skickar mörka EXACT-tokens                 | Metadata och promptinstruktion motsäger varandra                                               | Gör metadata och tokens konsekventa; flytta dashboard-light-gapet till skuld        |
|               8 | P2   | Kvalitetsgrinden stämplas grön innan grinden körts                          | Finalize skriver preflight_passed i fält som backoffice visar som slutlig grind                | Separera preflight från slutligt gateutfall och bevara advisoryfynd                 |
|              16 | P3   | Aktuellt F3-detaljkort kan säga planerad efter leverans i samma runda       | Snapshot/panel är post-merge-korrekta; tidig SSE/meta använder basfiler                        | Räkna om eller ersätt detaljkortets fileEvidence efter finalize                     |
|              28 | P2   | Postgres-dossier kan återställa helper utan schemafil                       | index.ts är verbatim och importerar rewritable schema.ts                                       | Gör schema deterministiskt närvarande eller gör helperkontraktet tolerant           |
|              29 | P3   | Aktiv previewflik följer inte intern iframe-navigation                      | Parentens previewUrl ändras inte när användaren klickar inne i multipage-preview               | Skicka validerat route-change via preview-bridgen                                   |
|              33 | P2   | F3-prompt kan få två integrationsauktoriteter samtidigt                     | Approval-plan renderas medan pre-generation contracts inte alltid suppressas                   | Suppressa eller slå ihop kontrakten när approvedProviders är aktivt                 |
|              36 | P2   | Klient-autofix tappar konkret install-/repairkontext                        | Filtrering för serverrepair används även för onAutoFix                                         | Dela till `SW-036A` för buggen och `SW-036B` för det saknade M#sel1-selectiontestet |
| 40 residual F10 | P2   | Repair/autofix skriver över samma version utan återgångspunkt               | Existing-version-vägen uppdaterar files_json in-place                                          | Skapa immutable repair-version eller snapshot + exponerad rollback                  |
|              43 | P3   | F3-marker tappar env-only-förslagsdetaljer                                  | Markern bär provider men inte requestedEnvKeys efter reload/approve                            | Persist requestedEnvKeys och regressionstesta env-only-flödet                       |
|              44 | P2   | Scaffold-val kan bryta manifestets allowedBuildIntents                      | Slutresultatet saknar manifestauktoritativ slutkontroll                                        | Validera effective intent efter avsiktlig promotion och falla tillbaka säkert       |
|              46 | P2   | Tier-2 iframe onLoad avtäcker preview före runtime-ready                    | Rå onLoad sätter iframeLoading=false utan readiness-gate                                       | Håll overlay tills sessionbunden runtime-/bridge-ready eller timeout                |
|              48 | P2   | Dependency-backfill tappar provideridentitet                                | Backfill återselektar default dossier från capability i stället för valda dossier-ID:n         | Driv från selectedDossierIds, capability-default endast som legacy fallback         |
|              49 | P2   | Deploy-repair no-op:ar på orelaterad repair_available                       | Idempotens kontrollerar globalt versionsstate, inte deployment eller ursprung                  | Lagra repair-provenance och gör idempotens per deploymentId/origin                  |
|              51 | P2   | Dämpad normaltext klarar inte AA                                            | muted-foreground/70 och text-gray-500 ligger under 4,5:1 på mörk bakgrund                      | Inför semantisk AA-token och kontrasttest per bakgrund                              |
|              52 | P3   | Vanlig Cursor-kommentar tar bort merge-ready-label                          | Workflowen saknar kontroll av Bugbot-markör/innehåll                                           | Invalidera bara för verkliga fynd, inte status- eller dokumentationskommentar       |
|              50 | P2   | Boot-fel återstartas tills TTL och når inte buildern                        | Splash/status kan re-trigga `ensureRuntimeForChat`; #799 inför cap och befintlig felprojektion | Merga och verifiera #799, arkivera först därefter                                   |

Prioriterad fixordning för den aktiva kön:

1. Dataintegritet och felåterhämtning: 40, 36, 49, 50.
2. Dossier/F3-kontrakt: 28, 33, 48, 43, 16.
3. Scaffold och rendering: 6, 44, 2, 46.
4. Tillgänglighet: 51, därefter 4.
5. Telemetri och mindre UI/CI: 8, 29, 52, 7.

## 2. P1-releasegrind: domänköp

Gammal rad 55 ska inte beskrivas som en aktiv produktionsincident eftersom SAJTMASKIN_DOMAIN_PURCHASE är avstängd. Den ska däremot stå som P1-release blocker: flaggan får inte aktiveras innan de ekonomiskt farliga delarna är stängda.

Rubriken säger elva fynd men listar (a)–(l), alltså tolv. Del (i) och (j) är delvis inaktuella och måste skrivas om.

| Del | Dom                             | Rekommenderad hantering                                                                           |
| --- | ------------------------------- | ------------------------------------------------------------------------------------------------- |
| a   | Bekräftad blocker + policy      | Rätta registrarendpoint och samla obligatorisk registrantdata med beslutad GDPR-hantering         |
| b   | Bekräftad pengabugg             | Inför post-dispatch reconciliation; refundera inte blint efter timeout/okänd registrarstatus      |
| c   | Bekräftad recovery-lucka        | Lease/watchdog/takeover för order som fastnar i registering                                       |
| d   | Bekräftad recovery-/ledgerlucka | Persist unmatched payment/refund-resultat; projektradering får inte lämna payable session osäkrad |
| e   | Bekräftad state-modellbrist     | Separat registration_unknown/manual_review som håller domännamnet reserverat                      |
| f   | Bekräftad configbugg            | Purchase-flaggan kräver även STRIPE_WEBHOOK_SECRET                                                |
| g   | Bekräftad urvalsbugg            | Availability och binding quote måste komma från samma faktiska fulfiller                          |
| h   | Bekräftad kontradiktion         | Räkna om purchasable när WHOIS ändrar available                                                   |
| i   | Delvis löst; residual UX        | Cancel-retur ska stoppa pending_payment-pollning direkt, inte vänta på Stripe-expiry              |
| j   | Delvis löst; residual P3        | Betalningsstatus återhämtas, men retur-URL kan tappa chat-/projektkontext                         |
| k   | Bekräftad recovery-lucka        | Lägg retry-link när domänen registrerats men project-link misslyckats                             |
| l   | Bekräftad produktlucka          | Gör in-app-köp nåbart från pre-publication-dialogen eller ta bort falsk köpsignal                 |

## 3. Trovärdiga risker och behöver repro

De här raderna får inte kallas bekräftade produktbuggar innan angiven verifiering är gjord.

| Gammal rad | Prio         | Hypotes                                                                          | Krav för att lämna repro-kön                                                    |
| ---------: | ------------ | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
|          5 | P3           | Automatisk boot av persisterad starting-session kan nollställa clean-exit-budget | Testa host-omstart/krasch under boot; flytta reset till explicit start-option   |
|         12 | P3           | Gammalt variant-ID kan överleva en lyckad explicit clear/rematch                 | Visa normal väg där finalize ger null med tidigare variant; annars arkivera     |
|         20 | P2           | Synliga template-gallerimallar kan fortfarande krascha/lata-ladda                | Kör aktuell catalog/blob-audit och click-smoke på endast synliga mallar         |
|         21 | P3           | Verify/export använder F2-placeholderkuvert även i F3                            | Reproducera konkret build/runtime-avvikelse innan kontraktet breddas            |
|         24 | P3           | F3-readiness och finalize kan läsa olika files_json vid samtidighet              | Lägg concurrencytest med user-edit/repair och verifiera mismatch                |
|         25 | P3           | Dubbla approve-svar kan lämna missvisande user-rad och köra förloraren som F2    | Lägg dubbel-submit-test; förloraren ska ge explicit conflict/no-op              |
|         27 | P3           | landing-page kan få separata /om och /contact trots one-page                     | Lägg deterministiskt route-evalfall utan explicit sidantal                      |
|         30 | P3           | analytics + dashboard-charts kan dubbelaktiveras felaktigt                       | Kräv konkret prompt och fil-/providerkollision; annars arkivera                 |
|         31 | P3           | Integrationsdetektorns regex kan missa integration                               | Kräv provider, filsnippet och regressionfixture; manifest är redan primär källa |
|         35 | P3           | Quick-edit applicerar basfiler före lease och kan bli stale                      | Lägg samtidig repair/quick-edit-test och läs om snapshot under lease            |
|         41 | P2 vid träff | DB-pool-svält kan kvarstå trots backoff och observability                        | Fånga pool x/3, idle, waiting och server-headroom under prodgeneration          |

## 4. Väntar på ägarbeslut

| Gammal rad | Prio | Beslut                                                                                                  |
| ---------: | ---- | ------------------------------------------------------------------------------------------------------- |
|          3 | P2   | Ska pending dossier ersätta modellbyggd serverkod, fråga användaren eller fortsatt byggas konservativt? |
|         11 | P2   | Ska stream_ended_without_version återbetalas när modelltext levererats men ingen version sparats?       |
|         14 | P3   | Ska tool-only-förslag + approval prissättas som två modellrundor eller ett användarsteg?                |
|         17 | P2   | Ska BuildPlanCard visas i normalvy eller ska Plan-läget döljas tills approvalflödet exponeras?          |
|         34 | P3   | Efter nuvarande minnesmitigering: vilken SLO kräver separat verify-lane från preview-VM:n?              |
|         45 | P2   | Vad betyder alla versioner failed per caller: historik i UI, men null/error i follow-up och deploy?     |
|         54 | P2   | `SW-054A`: återstarta en verklig baseline; `SW-054B`: välj signal för schemalagda evalfel               |

Ett beslut ska få ägare och datum. Beslutsrader utan deadline blir annars permanenta pseudobuggar.

## 5. Säkerhet, infra och teknisk skuld

| Gammal rad | Prio | Ny klass               | Kort åtgärd                                                                                                                                             |
| ---------: | ---- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
|          1 | P3   | Latent modellhardening | Validera env-override mot slutlig modells reasoning-capabilities                                                                                        |
| 7 residual | P3   | Variant-coverage       | Lägg ljus dashboardvariant först när ljust dashboardläge är ett uttryckligt produktkrav                                                                 |
|          9 | P3   | Test-/evalskuld        | Besluta evaltröskel; implementera must/mustNot och embedding textHash                                                                                   |
|         10 | P3   | Arkitekturskuld        | Ta bort dött SSE-callbackförsök och gör polling kanonisk                                                                                                |
|         13 | P3   | Latent promptkvalitet  | Mät budgettrigger; inför fil-/fence-medveten truncering                                                                                                 |
|         15 | P3   | Repohygien             | Normalisera CRLF separat eller on-touch; ingen runtimebugg                                                                                              |
|         18 | P3   | Legacy-yta             | Bestäm kompatibilitetsperiod och migrera/drop template_cache                                                                                            |
|         19 | P3   | UX-hardening           | Disable save under verifying/repairing och bevara lokal draft                                                                                           |
|         22 | P2   | Säkerhetshardening     | Ge läsande CI-jobb separat read-only prod-roll/DSN                                                                                                      |
|         23 | P3   | Dokumentationsskuld    | Låt avklarat-index bära status; detaljfil behåller endast invariants/provenance                                                                         |
|         26 | P3   | Observability-skuld    | Välj durable signal för deterministic_release_exempted endast om konsument finns                                                                        |
|         32 | P3   | Latent modellhardening | Separera budgetModelId från BuildSpec-modell vid planner-override                                                                                       |
|         38 | P3   | Testskuld              | Komplettera runtime-guards med kö-samspel och idle→hibernated→reboot                                                                                    |
|         53 | P3   | Modellkonfigskuld      | Flytta legacy-normaliserarens modellval till workload-manifestet; `gpt-5.4-mini` är fortfarande tillåten och premissen om retired modell är inte styrkt |

## 6. Arkivera eller absorbera

| Gammal rad | Dom                     | Bevis / destination                                                                                             |
| ---------: | ----------------------- | --------------------------------------------------------------------------------------------------------------- |
|         37 | Kodfixad                | #770 trådar innehållsrevision i både enskild och batchad status; grinden aktiverades i alla miljöer 2026-08-04  |
|         39 | Gammal/felaktig premiss | False-green-riktningen var avfärdad och stale revision degraderas; absorberas av revisionsrollout               |
|         42 | Kodfixad                | Revisionsgrind/cache och sessionens `filesRevision` är levererade; arkiveras som `SW-042A/B` med separata bevis |
|         47 | Kodfixad                | Preview-hostens status skiljer running, httpReady och readinessState                                            |

Rad 40:s gamla modertext ska också arkiveras efter att F10-residualen skapats som egen rad. Rad 7 och 16 ska på samma sätt arkivera sina redan lösta eller skuldklassade delar och bara behålla den smala aktiva premissen. Rad 53 flyttas i sin helhet till skuld.

## Full beslutsmatris för ursprungsraderna

| Rad | Ny dom                                      | Ny kö            | Åtgärd                                                           |
| --: | ------------------------------------------- | ---------------- | ---------------------------------------------------------------- |
|   1 | Latent risk                                 | Hardening        | Flytta                                                           |
|   2 | Bekräftad bugg                              | Aktiv            | Behåll, höj till P2                                              |
|   3 | Policy                                      | Ägarbeslut       | Flytta                                                           |
|   4 | Bekräftad a11y-bugg                         | Aktiv            | Behåll P3                                                        |
|   5 | Trovärdig risk                              | Repro            | Flytta                                                           |
|   6 | Bekräftad bugg                              | Aktiv            | Behåll P2                                                        |
|   7 | Delvis bugg, delvis coverage-gap            | Aktiv + skuld    | Dela                                                             |
|   8 | Bekräftad rapporteringsbugg                 | Aktiv            | Smalna och behåll P2                                             |
|   9 | Test-/evalskuld                             | Skuld            | Flytta och dela                                                  |
|  10 | Arkitekturskuld                             | Skuld            | Flytta                                                           |
|  11 | Bekräftat beteende, policy oklar            | Ägarbeslut       | Flytta                                                           |
|  12 | Otillräckligt bevis                         | Repro            | Flytta                                                           |
|  13 | Latent risk                                 | Hardening        | Flytta                                                           |
|  14 | Prissättningspolicy                         | Ägarbeslut       | Flytta                                                           |
|  15 | Repohygien                                  | Skuld            | Flytta                                                           |
|  16 | Delvis redan löst                           | Aktiv            | Smalna till detaljkortet, P3                                     |
|  17 | Medveten debug-gate                         | Ägarbeslut       | Flytta                                                           |
|  18 | Legacy-yta                                  | Skuld            | Flytta                                                           |
|  19 | UX-hardening                                | Skuld            | Flytta                                                           |
|  20 | Trovärdig men gammal evidens                | Repro            | Kör ny smoke                                                     |
|  21 | Trovärdig paritetsrisk                      | Repro            | Kräv konkret avvikelse                                           |
|  22 | Least-privilege-risk                        | Säkerhet         | Flytta, P2 hardening                                             |
|  23 | Dokumentationsskuld                         | Skuld            | Flytta                                                           |
|  24 | Concurrency-risk                            | Repro            | Lägg test                                                        |
|  25 | Concurrency-risk                            | Repro            | Lägg dubbel-submit-test                                          |
|  26 | Observability-skuld                         | Skuld            | Flytta                                                           |
|  27 | Trovärdig route-risk                        | Repro/eval       | Lägg deterministiskt fall                                        |
|  28 | Bekräftad bugg                              | Aktiv            | Behåll P2                                                        |
|  29 | Bekräftad UI-bugg                           | Aktiv            | Behåll P3                                                        |
|  30 | Obevisad premiss                            | Repro            | Kräv konkret kollision                                           |
|  31 | Obevisad regexmiss                          | Repro            | Kräv fixture                                                     |
|  32 | Latent modellrisk                           | Hardening        | Flytta                                                           |
|  33 | Bekräftad bugg                              | Aktiv            | Behåll P2                                                        |
|  34 | Historisk incident, mitigering finns        | Ägarbeslut/infra | Arkivera incident; skapa SLO-rad                                 |
|  35 | Trovärdig race                              | Repro            | Lägg concurrencytest                                             |
|  36 | Bekräftad bugg + testskuld                  | Aktiv + skuld    | Dela till SW-036A/B                                              |
|  37 | Redan löst                                  | Arkiv            | Arkivera med #770                                                |
|  38 | Testharness-gap                             | Skuld            | Flytta                                                           |
|  39 | Gammal/felaktig premiss                     | Arkiv            | Arkivera                                                         |
|  40 | Moder-rad levererad, F10 kvar               | Aktiv + arkiv    | Dela; behåll bara F10                                            |
|  41 | Historisk incident                          | Repro/infra      | Mät före åtgärd                                                  |
|  42 | Kodfixad                                    | Arkiv            | Dela beviset i SW-042A/B; ingen aktiv residual på aktuell master |
|  43 | Bekräftad smal bugg                         | Aktiv            | Behåll P3                                                        |
|  44 | Bekräftad bugg, smalare scope               | Aktiv            | Behåll P2                                                        |
|  45 | Caller-kontrakt saknar beslut               | Ägarbeslut       | Flytta                                                           |
|  46 | Bekräftad bugg                              | Aktiv            | Behåll P2                                                        |
|  47 | Redan löst                                  | Arkiv            | Arkivera                                                         |
|  48 | Bekräftad bugg                              | Aktiv            | Behåll P2                                                        |
|  49 | Bekräftad bugg                              | Aktiv            | Behåll P2; kräver provenance-kontrakt                            |
|  50 | Bekräftad bugg med öppen fix-PR             | Aktiv            | Behåll tills #799 är mergad och verifierad                       |
|  51 | Bekräftad a11y-bugg                         | Aktiv            | Behåll P2                                                        |
|  52 | Bekräftad workflowbugg                      | Aktiv            | Behåll P3                                                        |
|  53 | Modellkonfigskuld, ingen styrkt runtimebugg | Skuld            | Flytta                                                           |
|  54 | Ägaråtgärd + testskuld                      | Ägarbeslut       | Flytta och dela                                                  |
|  55 | Bekräftad avstängd releasegrind             | Release blocker  | Behåll P1, dela 12 delpunkter                                    |

## Föreslagen migrationsordning

1. Skapa stabila ID:n för alla 114 källrader och frys migrationsmatrisen.
2. Arkivera lösta/ratificerade rader med bevis; behåll 50 aktiv tills #799 är mergad och verifierad.
3. Dela 7, 9, 16, 36, 37, 40, 42, 54 och 55 så varje rad har en premiss eller ett separat bevis.
4. Flytta policy, repro och skuld till egna sektioner utan att radera historik.
5. Korta de 19 aktiva raderna till det kanoniska tabellformatet.
6. Uppdatera scripts/dev/check-bug-backlog.mjs och scripts/canvas/build-llm-flow-canvas.mjs i samma PR.
7. Kör formatkontroll, canvas-generator, relevanta riktade tester och en slutlig diffgranskning.

## Öppen PR:s påverkan

- PR #799 bekräftar att tidigare rad 50 inte var löst på `master` `59eb8064`. Den inför en sessionspersisterad boot-failure-budget och återanvänder befintlig felprojektion. Raden ligger kvar aktiv tills PR:n är mergad och dess slutliga head-SHA är verifierad.
