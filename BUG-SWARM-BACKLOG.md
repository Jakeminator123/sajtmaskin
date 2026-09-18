# Bug-backlog (konsoliderad)

Statuspass **2026-09-17** mot `master` **`2566eec511`** och `preview`
**`41687de6ea`**. Hygienpass samma dygn mot `preview` **`a90d9da43`** (efter
#1445) rör bara `SM-030`, `SM-080` och `SM-071`-noten; övriga rader är inte
omverifierade. Preview fortsatte sedan till `25438d0fe` via #1443; det
omverifierar inte dessa rader. Rubriken mot `2fef6230` (2026-08-24) är historik, inte aktuell
sanning. Ett senare tillägg gör inte alla äldre rader nyverifierade. Full
historik finns i git; återställ vid behov föregående snapshot från den committen.
Det tunna historikindexet finns i
[`docs/plans/avklarat/bug-swarm/README.md`](docs/plans/avklarat/bug-swarm/README.md).

Regler:

- `Aktiv kö` är den kanoniska ID-tabellen. Status-cellen skiljer `Öppen kodbugg`,
  `Befintlig fix-PR`, `Kodfix i preview`, `Kodfix i master`,
  `Kvarvarande driftprov`, `Delvis åtgärdad` och `Behöver aktuell repro`.
- Kodfix i preview eller master är inte ett nytt implementationsuppdrag.
  Kvarvarande arbete är promotion, driftprov, historisk data eller
  produktbeslut — inte en andra kopia av samma fix.
- Obevisade hypoteser ligger i `Behöver repro`; avstängda funktioner ligger som
  releaseblockerare. De påverkar inte canvasens antal öppna produktbuggar.
- Varje aktiv rad har ett stabilt `SM-###`. Nästa lediga ID är `SM-093`.
- En draft-PR är inte en fix. Arkivflytten ska ingå i samma fix-PR med PR- och
  planerat masterbevis; den blir kanonisk först när PR:n mergas till `master`.

Kodläsning i detta pass är låst till SHA:na ovan. `wizard_runs`-ACL lästes
skrivskyddat 2026-09-16 22:02:54 UTC i det registrerade prodprojektet. Inga nya
browserresor, AI-genereringar eller promotion. `SM-033` landade på preview efter
granskningsfilens tip (`a0b1c73c4` → `41687de6ea` via #1434).

## Aktiv kö

<!-- prettier-ignore -->
| Klar | Status | Prio | Fynd | Bevis på `master` | Nästa steg |
| --- | --- | --- | --- | --- | --- |
| [ ] | Delvis åtgärdad | P1 | `SM-078` Tidigare: `wizard_runs` läs-/skrivbar via publika roller. Live ACL 2026-09-17: RLS på; anon/authenticated saknar SELECT/INSERT/UPDATE/DELETE/TRUNCATE; service_role har avsedd backendåtkomst. Direktåtkomstluckan är därmed motsagd. Backendens applikationsresa är inte rökt i detta pass. | Skrivskyddad metadata 2026-09-16 22:02:54 UTC mot registrerat prodprojekt (`config/db-targets.json`). Policy `wizard_runs_backend_full_access` för postgres/service_role. Äldre 2026-09-09-bevis (RLS av) är historik. | Beställ inte samma härdningsmigration igen. Kvar: ett avgränsat app-/REST-prov mot backendvägen. Historiska rader och wizardavgift är separat residual, inte ny ACL-kod. |
| [ ] | Kodfix i master | P1 | `SM-079` Google-koppling kunde aktivera lösenordet från en overifierad förregistrering. Fixkod finns: `createGoogleUser` kör transaktion, identitets-/radlås, nekar identitetskonflikt och nollar `password_hash` när det tidigare kontot var overifierat. | `src/lib/db/services/users.ts` på `2566eec511`. Ursprungsrepro mot `678594c` är historik. | Beställ inte samma Google-länk-fix igen. Kvar: redan historiskt felkopplade konton (separat restpunkt) och ev. driftprov efter promote. |
| [ ] | Öppen kodbugg | P1 | `SM-080` Preview-projekt kör i samma filsystem/processidentitet och kan läsa andra projekts filer. | `preview-host/src/runtime/process-lifecycle.js` och `workspace-files.js` på `2566eec511`; syntetisk syskonfil 2026-09-09. Inget nytt korsprojektprov 2026-09-17. | **Blockerar öppen lansering.** Path-jail #1445 (ersatte #1409) landade på preview `a90d9da43` och begränsar intern workspace-skrivning; det är inte sandboxisolering. Beställ inte en tredje jail-rematch. Separat exekveringsmiljö per projekt. Live Fly-health 2026-09-17 bar `release.sourceSha` `d37011919`, inte #1445. |
| [ ] | Delvis åtgärdad | P1 | `SM-081` Parallella genereringar kunde passera samma förkontroll innan AI-kostnaden uppstod. Kontolås finns: `prepareGenerationCredits` tar användarlås och gör ny behörighets-/saldokontroll under låset. Funktionen är inte kostnadsreservation. | `src/lib/credits/generation-admission.ts` på `2566eec511`. | Beställ inte samma kontolås igen. Kvar: gemensam Redis-konfiguration i drift, faktisk budgetreservation/kostnadstak och övriga betalda körvägar. |
| [ ] | Kodfix i master | P1 | `SM-082` `icon-component-value-fixer` skrev om `{x.icon}` inne i attribut och införde TS2322/TS2339/TS2604; fixaren var `safe`. | Prod 2026-09-10 chat `5d809cc1`. `src/lib/gen/autofix/rules/icon-component-value-fixer.ts` på `2566eec511` använder `ICON_CHILD_RENDER_RE` (JSX-barn) och undantar attribututtryck. | Beställ inte en ny kopia av fixaren. Kvar: ev. regressionstest-/leveransbevis, inte ny implementation. |
| [ ] | Kodfix i master | P1 | `SM-083` Advisory-promotad designversion med typfel kunde publiceras till Vercel. | Ursprungsincident 2026-09-10. Nuvarande kod på `2566eec511`: `resolveDeployTypecheckAdvisoryGate` och 409 `DEPLOY_TYPECHECK_ADVISORY` i deploy-POST (`src/lib/db/engine-version-lifecycle.ts`, `src/app/api/v0/deployments/_route/post.ts`). | Beställ inte samma publiceringsspärr igen. Separera andra deployfel från den gamla rotorsaken. Kvar: ev. runtime-stickprov. |
| [ ] | Kodfix i master | P2 | `SM-084` Verify-lanens `tsc` kunde räkna `TS1005` från Nexts `.next/dev/types/routes.d.ts` som fallen typecheck. Inte: allt `.next/`-brus. | Prod-signatur `9bf13221eb3e`. Nuvarande kod på `2566eec511`: `normalizeTypecheckResult` viker bara `routes.d.ts` + `TS1005`. Andra `.next/`-validatorfel behålls. | Återinför inte ett bredare `.next/`-undantag. Kvar: hostens städning av `.next/dev/types` före `tsc` (ej omverifierad 2026-09-17). |
| [ ] | Behöver aktuell repro | P2 | `SM-001` Repair accepterar nya filer genom att skriva över samma versions `files_json`; ingen användbar rollbackpunkt skapas. | `saveRepairedFiles` och `acceptRepair` i `src/lib/db/chat-repository/repair.ts` på `2566eec511`. Ingen ny repair/accept-kedja kördes 2026-09-17. | Kontrollera aktuell repair/accept och rollbackmöjlighet innan implementation beställs. Gammalt bevisdatum räcker inte som nybekräftat fel. |
| [ ] | Kodfix i preview | P2 | `SM-003` Deploy-repair betraktade versionsglobal `repair_available` som bevis för just den failade deploymenten. | Original [#1410](https://github.com/Jakeminator123/sajtmaskin/pull/1410). Preview-merge [#1431](https://github.com/Jakeminator123/sajtmaskin/pull/1431) `9304186b2` (2026-09-16). Finns inte på `master` `2566eec511`. | Väntar promotion och produktionsstickprov. Beställ inte en tredje implementation. |
| [ ] | Behöver aktuell repro | P2 | `SM-013` Misslyckad template-init lämnar `?templateId=...` utan `chatId`; tomläget kan visa ”Läser in templaten” tills reload. | `useBuilderEffects.ts`, `PreviewPanelEmptyState.tsx` och `POST /api/template` på `2566eec511`. Ingen ny template-init-resa 2026-09-17. | Kontrollera aktuella fel-/retryvägar innan implementation beställs. |
| [ ] | Behöver aktuell repro | P3 | `SM-030` En sparad `postgres-drizzle`-dossier kan samexistera med en senare Mongo-markör från tool/F3, så BuildSpec och prompt kan bära två databasidentiteter. Detta är den omklassificerade workflowbuggen från #1139, inte ett beslut att införa MongoDB. `mongodb-atlas` är parkerad; generisk Mongo finns kvar som integration/provider. | `detect-integrations.ts` på `41687de6ea` matchar fortfarande `mongoose` / `mongodb+srv:` / `MONGODB_URI`. `align-database-marker.ts` saknas på preview. [#1414](https://github.com/Jakeminator123/sajtmaskin/pull/1414) stängdes 2026-09-17 utan merge; den är inte en öppen fixkandidat. | Reproducera ett current-round-fall mot preview där vald `postgres-drizzle` + separat F3-`mongodb`-markör båda når BuildSpec/prompt. Utebliven reproduktion är inte åtgärd. Landa inte den gamla defensiva koden utan det beviset. |
| [ ] | Kodfix i preview | P2 | `SM-033` Wizardns competitor/enrich-rutter saknade ovillkorlig terminal fastelemetri vid 25/30-sekunderstak. | Original [#1412](https://github.com/Jakeminator123/sajtmaskin/pull/1412) stängd som superseded. Preview-merge [#1434](https://github.com/Jakeminator123/sajtmaskin/pull/1434) `41687de6ea` (2026-09-16). Finns inte på `master` `2566eec511`. | Väntar promotion. Beställ inte en dubblett. P95/P99 och ev. ändrade `maxDuration`-tak är separat beslut. |
| [ ] | Delvis åtgärdad | P1 | `SM-072` Chromium-captures svälter `/tmp` på warm Fluid-instans; burst kan döda nästa launch och visa Degraderad trots frisk sajt. | Vercel runtime 2026-08-31 (chat `30840b09`). Kod på master via [#1234](https://github.com/Jakeminator123/sajtmaskin/pull/1234). Ytterligare preview [#1318](https://github.com/Jakeminator123/sajtmaskin/pull/1318). Inget nytt host-/captureprov 2026-09-17. | Återöppna inte accepterade residualer utan ny evidens. Kvar: prod-burst utan `playwright_unavailable` i följd; `/tmp`-race i `src/lib/capture/browser.ts`; ev. burstprov. |
| [ ] | Kvarvarande driftprov | P1 | `SM-073` Preview-hostens inspector-bridge kunde sakna identitetsstämpel när sessionsmetadata tappats; parent släppte fail-closed och inspektorn dog tyst. | Injektionsbevis 2026-08-31 (chat `cdf5e0aa`). `inspectInjectionScriptSrc` i `preview-host/src/runtime/preview-proxy.js`. Listan säger Fly v59 (2026-09-01) bär stämpeln; det hostpåståendet omverifierades inte live 2026-09-17. | Beställ inte en ny generell hostfix. Kvar: prod-stickprov — hover inom ~1 s på färsk sajt. Arkivera efter dokumenterat aktuellt stickprov. |
| [ ] | Delvis åtgärdad | P1 | `SM-074` `preview_ready_timeout`-bannern falsklarmar permanent på frisk sajt. REVIDERAD ROTORSAK 2026-09-01: en follow-up mot en hibernerad VM handoff:ar den GAMLA sessionsidentiteten till den nya versionen (`preview_followup_lane: lane=update, reason=runtime_not_running` → `preview_url_handoff` med gammal `previewSessionId`; `updatePreviewHostSession` hårdkodar `startOutcome: "resumed"`) medan boot:en kommer upp under NY session/lifecycle. Klientens identitetsmatchning kan då aldrig lyckas: deadline fäller bannern, late recovery läser running+mismatch som terminalt och stänger utan att armera self-heal, och inspectorn dör fail-closed på ostämplade/felstämplade bridge-meddelanden. Höjd reload-timeout hjälper inte — ingen reload försöks. | Live-repro 2026-09-01 (chat `c2371f9c`, v3): Vercel-runtimelogg 04:32:34 UTC visar handoff `ps_4d04a764` för v3 medan `/preview-status` från 04:34:30 svarade `running` med `ps_5222ca2b` för samma version; klientens sessionsbärande polls (alla `ps_4d04a764`) upphörde 04:36:11 och bannern stod kvar efter `promoted/passed`. Friska syskon i samma chat: v1 (prewarm) och v2 (update mot levande runtime) — enda skillnadsvariabeln är hibernerad VM. Äldre repro `4cac8fb0` (samma symtom). Utredning: `docs/plans/active/2026-09-01-verifieringsflode-och-inspector/`. | Levererat: klientfix [#1232](https://github.com/Jakeminator123/sajtmaskin/pull/1232), sanningsrad [#1237](https://github.com/Jakeminator123/sajtmaskin/pull/1237), delhärdning i preview [#1314](https://github.com/Jakeminator123/sajtmaskin/pull/1314). Beställ inte borttagning av gammal banner utan att se att den fortfarande finns. Ingen ny browser-/hiberneringsrepro 2026-09-17. Kvar: prod-follow-up mot hibernerad VM; valfri serverhärdning vid `reason=runtime_not_running`. |
| [ ] | Kodfix i master | P2 | `SM-085` Sen product-postcheck/live review av en äldre version kunde läsa chattens senaste user-prompt som `userRequest`. | `src/lib/gen/verify/live-review.ts` (`resolveUserRequestForVersion`) på `2566eec511` väljer via `versionMessageId`, därefter `versionCreatedAt`, och loggar latest-user-fallback. Ursprungsobservation 2026-09-01 chat `5efde3c4`. | Beställ inte samma resolver igen. Kvar: anropsvägar och sen review av rätt version (full browserkedja inte körd 2026-09-17). Annan rotorsak än `SM-077`. |
| [ ] | Kodfix i master | P2 | `SM-086` Desktop-skärmbilden för live review kunde bli `null` utan fynd, och granskningen kunde låtsas att båda viewportarna fanns. | `src/lib/gen/verify/live-review.ts` (`screenshotViewportCoverage`) på `2566eec511` skiljer desktop+mobile, `desktop_only`, `mobile_only` och `none`. Ursprungsobservation 2026-09-01 chat `5efde3c4`. | Sluta beskriva all coverage-logik som saknad. Kvar: capture-retry, varning, konsumentkoppling och verkligt bortfall innan full stängning. |
| [ ] | Kodfix i master | P3 | `SM-089` Init-turens plan-läge skrev inga `plan_mode_turn_entry`/`plan_mode_turn_exit`-rader; bara uppföljningsturen lämnade spår. | Prod 2026-09-15 chat `f550445e`. Nuvarande kod på `2566eec511`: `create-chat-stream-post.ts` anropar `startTracedCreateChatPlanModeResponse`. | Beställ inte en ny trace-implementation. Kvar: aktuellt prov. Arkivera efter dokumenterat stickprov, inte efter den gamla PR-formuleringen. |
| [ ] | Kodfix i master | P1 | `SM-088` Plan-läge dog tyst efter besvarade frågor: `BuildPlanCard` syntes bara i felsökningsvy. | Prod 2026-09-14/15 chat `f550445e`. `src/components/builder/chat/MessageList.tsx` på `2566eec511` bygger `planParts` utan debugfilter och renderar `BuildPlanCard` också när `showStructuredParts` är av. | Beskriv kodfixen som levererad. Ev. avgränsat vanligt UI-smoke. Blanda inte ihop med beslutet om alla versioner är failed. |
| [ ] | Kodfix i preview | P2 | `SM-077` Sen preview-boot gav ingen omverifiering: boot-splash klassades som timing, men när VM:n kom upp kördes ingen ny kontroll. | Live-observation 2026-09-08 chat `fc197819`. Original [#1411](https://github.com/Jakeminator123/sajtmaskin/pull/1411) stängd som superseded. Preview-merge [#1432](https://github.com/Jakeminator123/sajtmaskin/pull/1432) `a0b1c73c4` (2026-09-16). Finns inte på `master` `2566eec511`. | Väntar promotion och relevant runtimeprov. Skapa inte en tredje version av samma fix. |
| [ ] | Behöver aktuell repro | P1 | `SM-092` Resend nekade verifieringsmejlet i prod med 403 «The sajtmaskin.se domain is not verified». Om det gäller nu kan en nyregistrerad inte verifiera sin e-post. Leverantörskonfiguration, inte en kodväg som ska byggas om. | Vercel runtime, senast 2026-09-16, rutt `/api/auth/register`. Loggägare `src/lib/email/send.ts` och `src/app/api/auth/register/route.ts`. Först sedd 2026-07-03, alltså inte en ny regression. | Kontrollera avsändardomänens status hos Resend och kör ett registreringsprov. Bygg ingen ny mejlväg. Arkivera som historik om domänen redan är verifierad. |
| [ ] | Behöver aktuell repro | P2 | `SM-090` Prod-asserten `missing-separator` slog: systemprompten saknade `SYSTEM_PROMPT_SEPARATOR`, alltså kringgicks `composeEngineSystemPrompt()` eller emitterades statisk core utan separator. Vilken kodväg som gjorde det är inte identifierad. | Vercel runtime 5 träffar, senast 2026-09-15, rutter `/api/engine/chats/stream` och `/api/engine/chats/[chatId]/stream`. Guard: `src/lib/gen/system-prompt-assert.ts` (`assertSystemPromptShape`), anropad från `src/lib/gen/engine.ts`. | Reproducera vilken väg som emitterar prompt utan separator. Sänk inte asserten till varning för att tysta loggen. |
| [ ] | Behöver aktuell repro | P2 | `SM-091` Init av importerat arkiv föll med 403 «Archive download forbidden» i prod. Samma klass som den privat-repo-smoke som står som residual efter #1461 — inte ett nytt importsystem. | Vercel runtime 4 träffar 2026-09-15, rutt `/api/engine/chats/init`. 403-mappningen ligger i `src/lib/import/github-import-transport.ts` (`zip_forbidden`) med kontrakt i `src/lib/import/import-init-contract.ts`. | Avgör om det var privat repo utan token, utgången token eller borttaget arkiv. Rör inte latch/SSRF/auth. Kör privat-repo-smoken när `TEST_USER_*` finns. |

MVP före öppen lansering: `SM-080` (isolering) är fortfarande spärr.
`SM-078` kvar är appväg, inte ny ACL-migration. `SM-079` kvar är historiska
konton. `SM-081` kvar är reservation, inte kontolåset.

Beställ inte ny implementation för kod som redan ligger i master
(`SM-082`/`SM-083`/`SM-084`/`SM-085`/`SM-086`/`SM-088`/`SM-089`) eller preview
(`SM-003`/`SM-077`/`SM-033`). `SM-001`/`SM-013` kräver aktuell repro.
`SM-030` saknar current-round-repro; #1414 är inte en öppen fixkandidat.
`SM-072`/`SM-073`/`SM-074` är residual/driftprov, inte första implementation.

`SM-090`–`SM-092` kommer från en read-only 7-dygnsläsning av Vercel runtime
2026-09-18 och hade ingen ägande plan. Samma läsning visade 28 Chromium
core-dumps (389–436 MB) 2026-09-11→17, alla på preview-deploy `13843edc` och
en användare — det är `SM-072`-mönstret på preview, inte en produktionsincident.
En 24-timmarsläsning visar bara de två sista och underskattar frekvensen.

## Releaseblockerare bakom avstängd flagga

De här är inte nåbara produktbuggar medan respektive flagga är av.
Flaggstatus, Fly-konfiguration och priser nedan är daterat underlag — inte
omverifierade 2026-09-17.

<!-- prettier-ignore -->
| ID | Prio | Flagga | Kvar före aktivering |
| --- | --- | --- | --- |
| `SM-007` | P1 | `SAJTMASKIN_DOMAIN_PURCHASE` | Registrar-kontrakt och registrantdata, pengar/reconciliation, crash recovery/ledger, konsekvent provider/pris/state samt färdig retur-, relink- och köp-UX. |
| `SM-070` | P2 | `SAJTMASKIN_LIVE_REVIEW` | Idempotent Blob-retry, verklig sju-dagarsrensning inklusive chat-delete samt beständig modellförsöksbudget över persistfel/abandon. |

### `SM-007` — domänköp

Flaggan förblir av. Domänpåslaget är **x2** och styrs av admin via
`pricing_settings`; `config/domain-pricing.json` äger det inte längre. Själva
köpvägen är oförändrad och fortfarande parkerad. Före aktivering måste hela
kedjan stängas:

1. Byt den utfasade Vercel-buy-endpointen och samla/livscykelhantera obligatorisk
   `contactInformation` med uttryckligt GDPR-beslut.
2. Efter registrar-dispatch: reconcila okänt resultat; återbetala inte blint vid
   timeout. Återuppta kraschat `registering` med lease/watchdog.
3. Persistera unmatched payment/refund och hindra projektradering från att ta
   bort orderledgern. Reservera namnet i `registration_unknown/manual_review`.
4. Kräv `STRIPE_WEBHOOK_SECRET`; samma fulfiller ska äga både tillgänglighet och
   bindande pris; räkna om `purchasable` efter WHOIS.
5. Hantera Checkout-cancel direkt och bevara chat-/projektkontext i retur-URL.
6. Erbjud relink för registrerad men olänkad domän och gör köp nåbart från
   pre-publication-dialogen.

### `SM-070` — live review

Åtkomstgrinden och atomisk claim/cache finns via #1089/#1098. Före aktivering:

1. Gör same-revision-upload retrybar även efter partiell Blob-upload.
2. Kör schemalagd purge på `expiresAt` och koppla rensning till chat-delete.
3. Bevara `modelAttempts` när resultatsparning misslyckas eller claim överges.

Production kräver dessutom ett separat ägarbeslut efter grönt Preview-smoke.

## Behöver repro

Detta är testkö, inte bekräftade buggar. Fulla körvägar finns i
[`docs/runbooks/live-verifiering.md`](docs/runbooks/live-verifiering.md).

<!-- prettier-ignore -->
| Ref | Osäkerhet | Vad avgör raden |
| --- | --- | --- |
| Block/Marknadsblock | Flaggan är på men riktig Pro-källa är inte livebevisad. | Infoga `hero1` i prod och verifiera hämtad källkod, inte metadata-fallback. |
| OpenAI E2E | UX-kedjan finns; tidigare projektnyckel saknade quota. | Spara riktig projektägd nyckel, bygg integrationen en gång, få providersvar och reloada. |
| `SM-025` | Product Postcheck kan fortfarande kollidera med thumbnail i annan isolate. 2026-08-31:s `browser-closed`-skips (chat `30840b09`) förklaras av `/tmp`-svält (`SM-072`) — kollisionshypotesen är fortfarande obevisad separat. | Nästa `browser-closed`-skip **med gott om fritt `/tmp`** i samma logg är kollisionsbeviset; med lågt fritt utrymme hör fyndet till `SM-072`. |
| Scaffold-kohort | `(null)` kan vara blandning av explicit off, import och pending. | Kör `control-stats.mjs` per kohort; skapa buggrad endast för konkret fallande kohort. |
| `SM-071` | Fem äldre `app-shell`-körningar misslyckades, men manifestet ändrades 21 aug och en ny variant landade 23 aug; historiken bevisar därför inte fel på dagens `master`. Ett `auth-pages`-bootprov på preview 2026-09-17 (`boot_grace_period` → `running`) är inte denna rad och inte historisk rotorsak. | Kör en ny `app-shell` mot nuvarande master och lokalisera första preview-/buildfelet innan raden återaktiveras. |
| `SM-035` | Historisk Fly `npm install` exit 254 saknar klassificerad återkomst. | Nästa träff ska bära bounded manager/mode/duration, OOM-, disk-, machine- och regiondata. |
| `SM-037` | Historiska hydrationkrockar saknar aktuell producent. | Browser/preview-host-test med patch-lane på och HMR av; bind served och selected version till session. |
| Hydration → RepairGate | Inga säkra par av klientfel och hydration-advisory för samma revision. | Läs ny proddata; koppla till befintlig repair-loop bara vid versionsbundet par. |
| Fast Edit Lane | Stale chunk efter quick edit är fortfarande en hypotes. | Repro på Fly med patch utan HMR; utan mismatch ändras inte lanen. |
| Template-galleri | Evidensen för synliga mallars crash/lazy-load är gammal. | Kör catalog/blob-audit och click-smoke på dagens synliga mallar. |
| DB-pool | Poolsvält kan finnas trots backoff. | Fånga pool `x/3`, idle, waiting och headroom under samma prodgenerering. |
| Socket loss | Det är okänt vilken genereringsendpoint som tappar anslutningen. | Samla HAR/SSE och namnge exakt endpoint innan buggrad skapas. |
| OpenClaw health | En 502 följdes av 200 och kan ha varit cold start. | Korrelera nästa träff med Vercel runtime-logg i samma tidsfönster. |
| Analytics/consent | Initiering före consent är inte app-brett verifierad. | Auditera genererad sajt och skapa säkerhetsrad endast vid konkret förtidig init. |
| CI-flake quality-core | **Orsak bevisad och åtgärdad — raden kvar bara som bevakning.** Två oberoende filer föll på samma sätt: `PreviewPanelDossiers.env-races.test.tsx` (master-run `34229404191`, 2026-09-08) och `PreviewPanelF3Trigger.test.tsx` (PR #1326 run `34346616372`, 1 fail av 10 064), båda gröna isolerat och på ren rerun utan kodändring. Gemensam nämnare var inte testerna utan testing-librarys `asyncUtilTimeout`-default på 1 s, som antar att en sekund wall clock räcker för att en komponent ska sätta sig — ett antagande som håller på en tom maskin och brister när ~10 000 tester delar workerpoolen. Deadline höjd till 5 s i `vitest.setup.ts`, med `testTimeout` ovanför i `vitest.config.ts`. Verifierat: ett prov som sätter sig efter 2,5 s faller på exakt 1026 ms med gamla defaulten och passerar med den nya. | Bevakning: nästa enstaka `waitFor`-fail i `quality-core` som är grön på rerun betyder att 5 s inte räckte — höj inte blint, mät då hur långt över deadline workern låg. En återkommande `waitFor`-fail kan fortfarande vara infrastrukturbetingad; en grön rerun kan dölja ett intermittent produktfel. Rapportera observerat utfall och rotorsaksbevis separat. |

Landingens tidigare ”kortet ligger 65 px lågt”-hypotes är inte längre giltig
evidens efter ombyggnaden i #1136. Ny visuell avvikelse kräver ny mätning.

## Väntar på ägarbeslut

Jake äger samtliga frågor. Detaljunderlag ligger i länkad plan eller i git före
denna trim; tabellen håller bara själva beslutet och när det behövs.

<!-- prettier-ignore -->
| Prio | Fråga | Senast när |
| --- | --- | --- |
| P3 | Ska ”Publik preview” döpas om till vad kontrollen faktiskt gör, och ska ”Hantera domän” flyttas från domän-chevronen till Publicera-menyn? | Fritt. |
| P3 | Briefing N3–N5: återinför Refine efter verifierarfynd, prova bevarande `clear-refine`, och betala extra variant-embedding? | Inte före kvalitetsplanens A-mätning. Se [`docs/plans/archived/2026-08-18-briefing-och-kallpaket.md`](docs/plans/archived/2026-08-18-briefing-och-kallpaket.md). |
| P3 | Dossier D5: ska Backoffice få fri add/remove efter att D2–D4 landat? | D2–D4 är parkerade. Se [`docs/plans/archived/2026-08-19-dossier-forenkling.md`](docs/plans/archived/2026-08-19-dossier-forenkling.md). |
| P3 | Är per-rubrikstaket 480 rätt när `selected-sections` breddas? | Inte aktuellt: D2–D4 är parkerade, så breddningen är inte planerad. Taket självt är ratificerat skydd i [`docs/decisions/README.md`](docs/decisions/README.md). |
| P2 | Ska högst en hard dossier väljas per promptrunda? | Nästa dossier-härdning. |
| P2 | Ska `SAJTMASKIN_REFUSE_DOSSIER_STUBS` vara på i production? | Verifiera aktuell env före nästa flaggändring. |
| P3 | OpenClaw Builder: starta som projektledande byggagent, eller skrota? Underlag (proposal 2026-08-24, ingen produktionskod) är parkerat i [`docs/plans/archived/2026-08-24-openclaw-builder/`](docs/plans/archived/2026-08-24-openclaw-builder/README.md). | Fritt — när ägaren tar fram det för Cursor-agenter. |
| P2 | Ska en pending dossier ersätta modellbyggd kod för samma capability, fråga användaren eller samexistera? | Nästa F3-vägändring. |
| P2 | Ska `stream_ended_without_version` återbetalas när text levererats men ingen version sparats? | Före MVP-leverans. |
| P2 | Vilket kontrakt gäller för `BuildPlanCard` när alla versioner är failed? Visningen i default-UI är beslutad 2026-09-15. | Före nästa versionsläsändring. |
| P2 | Ska en dossierfil med `defect.kind: compile` blockera i stället för att vara advisory? | Nästa F3-incident/härdningspass. |
| P2 | Vid oenighet mellan Visual QA (källregex) och live-review (skärmdump): ska renderingsbevis vinna, eller slås de ihop till ett viktat tal? | Nästa verifieringsomgång efter att #1243 landat. |
| P2 | Ska klientpolling få Sajtmaskin-build-id för att pausa under redeploy? | Nästa reproducerade redeploy-500-skur. |
| P2 | Ska F2 köra verifier-LLM-passet; vilken SLO motiverar separat verify-lane och senare parallell codegen? | När latens prioriteras, post-MVP för parallell codegen. |
| P2 | Konsolidera reparationslagren (mätning 2026-09-11, baslinje 2): (a) kör warm-tsc i F2 även när grinden är planerad (`skipWarmTsc` i `fast-path.ts`) och låt tsc avgöra om verifieraren behövs, (b) skärp `risky_fixes`-triggern så `import-validator`/`dep-completer` (mekaniska, katalogdrivna) inte tvingar verifieraren på 47 % av körningarna, (c) gata live review på sensorfynd även vid init. Vinst mäts mot `control-stats-baseline-2026-09-11.json`, inte mot Fas 0. | Efter att `SM-082`–`SM-084` landat och ett nytt 14-dagarsfönster mätts. |
| P3 | Nav-synken filtrerar bort länkar till oplanerade rutter men lägger aldrig till dem, medan filmerge behåller modellskrivna sidor — resultatet är olänkade sidor (`/categories`, `/om` i chat `5d809cc1`). Ska nav-synken lägga till länkar för modellskrivna sidor, ska sådana sidor droppas, eller ska preflight-varningen `non_blocking_quality_warning` bli blockerande? Bara «en sida» räknas medvetet inte som sidgräns (`detectExplicitPageCount`). | Nästa scaffold-/ruttplanspass. |
| P2 | Rotera Actions `OPENAI_API_KEY` och ersätt den gamla eval-baselinen medvetet? | Före nästa gång baselinen används som bevis. |
| P3 | Ska tool-only-förslag plus approval prissättas som ett eller två modellsteg? | Före MVP-prissättning. |
| P3 | Ska tvetydig eller helnegerad providerfråga ställas tillbaka till användaren? | Nästa providerpass. |
| P3 | Ska verifier-LLM sluta få hela projektet varje gång (`SM-047`)? | När verifierkostnad/latens prioriteras. |
| P2 | Ska generation flyttas ur HTTP-anslutningen (`T9b`) efter mobilens frånkopplingsincident? | Nästa döda generation eller uttrycklig beställning. |
| P2 | Ska en loop-säker Vercel Log Drain skapas (`T11`)? | Endast när ägaren kör runbooken. |
| P2 | Ska preview-hostens Fly-maskin uppgraderas, och i så fall till vilken klass? `shared`-vCPU har enligt Flys dokumentation en baseline på 5 ms per 80 ms-period och vCPU, delad över maskinen — dagens `shared-cpu-4x` sustainar därför ~0,25 kärna när burst-balansen är slut, vilket träffar `npm install`/`tsc` rakt i previewlatensen. Månadspris i `arn` vid drift dygnet runt: nuvarande `shared-cpu-4x`/8 GB **$44**, `shared-cpu-8x`/8 GB **$47** (dubbel kvot, +$3), `performance-2x`/8 GB **$85** (~2,0 kärnor sustained), `performance-4x`/8 GB **$129**. Mer RAM utan mer CPU hjälper bara om det faktiskt är OOM/swap-tröskning. Mät throttling/burst-balans i Flys metrics före beslut. Ny datapunkt 2026-09-08 (samma host, samma kväll): sajt 1 (chat `fc197819`) ~20 min på `warm_project` innan runtimen kom upp, sajt 2 (chat `4a2aa301`) ~2 min — domänhypotesen avfärdad, throttling kvarstår som huvudspår. | Före MVP-lansering, eller vid nästa previewlatens-klagomål. |
| P3 | Flytta stor historik till Blob och därefter eventuellt `git filter-repo`? | När PR-kön är tom och alla kloner kan ersättas. |
| P3 | Kör produktbenchmark på 20–30 verkliga byggen? | Inför lansering/värdering. |
| P3 | Kostnadsfri: ska `SAJTMASKIN_PREVIEW_PREWARM` slås på så preview-VM:en värms vid init-generering? Spekulativ init före mini-wizarden är avgjord (nej, 2026-09-15); prewarm-flaggan är kvar och kräver mätning på preview-hosten först. | Fritt. |

Fattade beslut flyttas till
[`docs/decisions/README.md`](docs/decisions/README.md); implementationen hör
inte hemma i denna tabell.

## Säkerhet, infra och teknisk skuld

Endast konkret, fortfarande relevant skuld. Äldre idéer utan aktuell kodägare
eller reproducerbar signal är borttagna från den operativa filen, inte påstått
fixade; de finns i git-snapshoten `feac0570e`.

<!-- prettier-ignore -->
| Prio | Klass | Kvarvarande skuld |
| --- | --- | --- |
| P2 | Env (`SM-087`) | Live-nycklar och webhook på production är **på plats** (test i development/preview, live i production). `STRIPE_PRICE_*` är medvetet osatta. Runtime nekar `sk_test`/`pk_test` i `VERCEL_ENV=production`. Kvar: production-posterna är Vercel `sensitive` så de inte går att läsa tillbaka. Att skriva om **samma live-värden** per production-mål med `vercel env add … --force --no-sensitive` är ägarstyrd secrets-/driftinställning, inte städ och inte automatisk buggfix. Stripe-payouts slår ägaren på i Stripe Dashboard. Beslut: [`docs/decisions/README.md`](docs/decisions/README.md) (Stripe / live-läge). |
| P2 | Observability | `engine_version_error_logs.version_id` är `NOT NULL`, så fel före första versionen kan inte loggas (`T3`). |
| P2 | Säkerhet | Läsande CI-jobb delar prod-credentials med skrivande jobb; inför separat read-only-roll/DSN. |
| P2 | Säkerhet (cross-tenant) | `sites.sajtmaskin.se` saknar Public-Suffix-List-post, så en kundsajt skulle kunna sätta cookie på den delade parent-domänen och nå syskonsajter. Blockerar branded-rollouten — se [`docs/runbooks/branded-user-urls.md`](docs/runbooks/branded-user-urls.md). |
| P2 | Observability (`SM-045`) | Brief-anropets `llm_usage` saknar både `chat_id` och `session_id`, till skillnad från resten av körningen. |
| P2 | Sanningsskuld (`SM-054`) | `verification_state` bär ingen `filesRevision`; ett lagrat verdikt kan därför gälla äldre innehåll. |
| P3 | Kontraktsasymmetri (`SM-056`) | Ruttplanens filfilter gäller scaffoldfiler men inte modellens egna emitterade sidfiler. |
| P3 | Config (`SM-046`) | `deploy-assistant` finns i manifest/fasrouter/Backoffice men har ingen runtime-anropare. |
| P3 | Env/export | Verbatim-export kan falla tillbaka till hela placeholder-katalogen i `.env.local`; tråda dossier-scope. |
| P3 | Dependency | Generatorpaket saknar egen deklarativ katalog och paritetsvakten täcker bara en del av `KNOWN_PACKAGES`; #1134 minskar AI SDK-drift men har ett öppet cwd-fynd och stänger inte helheten. |
| P3 | Test | Runtime-guards saknar full kö- och `idle → hibernated → reboot`-täckning. |
| P3 | Arkitektur | Ta bort dött SSE-callbackförsök och gör polling till enda kanoniska väg. |
| P3 | Prompt | Budgettruncering är blind; mät triggerfrekvens och gör den fil-/fence-medveten. |
| P3 | Legacy | Bestäm kompatibilitetsperiod och migration för `template_cache`. |
| P3 | UX | Blockera save under `verifying/repairing` utan att tappa lokal draft. |
| P3 | UX (lastbärande copy) | Preview-hostens boot-placeholder har nu primär maskinmarkör `data-sajtmaskin-preview-boot` / `<meta name="sajtmaskin-preview-boot">` (`starting` / `recovering` / `error`). Titlarna `Startar preview`, `Startar om preview` och `Preview kunde inte starta` plus gamla brödtexter/`Status: warm_project` är bakåtkompatibel fallback för split Fly/app-rollout. Synlig H1/brödtext är friare. Byt inte titlarna förrän production-appen läser markören. |
| P3 | Dossier-test | Demotester bevisar inte övergång till riktig projektnyckel; lägg representativa aktiveringstest. |
| P3 | Dossier-arkitektur | `STAGING_BY_ID` är en handkodad placeringskarta parallellt med manifesten. |
| P3 | Uppdelning | Dela `DossiersPanelView`, `usePreviewPanelDossiersController`, `audit-modal`, `repair-loop`, `import-validator` och `scaffold_wizard` bakom oförändrade fasader. |
| P3 | Lint | Betala per-fil Python F401, bredda lint till `scripts/` och ta bort React hook-disables en yta i taget. |
| P3 | Migration | `v0ChatId` har levande DB- och previewkontrakt; namnbyte/borttagning kräver migrationsplan. |
| P3 | Testinfra | Global Vitest-`jsdom` belastar rena Node-tester; dela testmiljöer. |
| P3 | Backoffice | `backoffice.shared` fryser 99 namn och åtta ytor duplicerar Node-subprocess/JSON-hantering. |
| P3 | Observability | Fault-matrix trunkerar joinen vid 200 nycklar; antal och ”ingen fixer” kan bli missvisande. |
| P3 | Backoffice | Template-kuratorn uppdaterar session-binding men inte visad analys-addenda efter write. |
| P3 | Legacy | Två `prompt_assist`-ytor är konfigurerade men saknar skrivare/konsument. |
| P3 | Test | Färgtokenfix #1049 saknar dark-variant-smoke över en genererad sajt. |

`SM-070` redovisas bara som releaseblockerare ovan; samma skuld dupliceras inte här.

## Arkiv

Endast avslut som tillkom i denna sanningssynk ligger kvar här. Äldre arkiv,
draftbeskrivningar och journalprosa finns i git och i
[`bug-swarm/README.md`](docs/plans/avklarat/bug-swarm/README.md).

<!-- prettier-ignore -->
| Klar | Rad | Status på `master` | Bevis |
| --- | --- | --- | --- |
| [x] | `SM-014` | Fixad | [#1124](https://github.com/Jakeminator123/sajtmaskin/pull/1124) binder preview-overlay till runtime-readiness. |
| [x] | `SM-018` | Fixad | [#1126](https://github.com/Jakeminator123/sajtmaskin/pull/1126) synkar parentens aktiva route med iframe-navigation. |
| [x] | `SM-032` | Fixad | [#1124](https://github.com/Jakeminator123/sajtmaskin/pull/1124) lägger minsta Maps-hostar i CSP med test. |
| [x] | `SM-038` | Fixad | [#1124](https://github.com/Jakeminator123/sajtmaskin/pull/1124) återanvänder kanonisk bloggrutt i stället för parallell aliasstruktur. |
| [x] | `SM-040` | Fixad | [#1137](https://github.com/Jakeminator123/sajtmaskin/pull/1137) tillåter exakt `Data Protection Policy` efter `och`/`and`, även med yttre citattecken och terminal interpunktion, utan att släppa igenom okända treordstitlar eller instruktionssvansar. |
| [x] | `SM-075` | Fixad | PR #1242 lägger `TS2724` och `TS2693` i `RENDER_RISK_TS_CODES` så F2-gaten inte advisory-promotar samma render-riskklass som TS2305/TS2614/TS1361. |
| [x] | `SM-076` | Fixad | PR #1242 anropar `failVersionVerification` i build-error-repairens catch när `files_json` är oförändrad, så raden inte hänger i `repairing` efter att leasen släppts. |
| [x] | `SM-015` | Fixad | [#1138](https://github.com/Jakeminator123/sajtmaskin/pull/1138) använder opak `text-muted-foreground` för läsbar audittext, sökplaceholder, previewhjälp och diagnostikkod. Kontrasttester låser 5,75–6,45:1 mot `background`, `card`, `popover` och `muted`; käll- och komponenttester hindrar de svaga `/70`, `text-gray-500` och `text-zinc-500`-fallen från att återkomma. |
| [x] | Affärsmodell / månadsavgift | Beslutad 2026-09-11, inte byggd | Riktningen ratificerad i [`docs/decisions/README.md`](docs/decisions/README.md) (Prissättning / affärsmodell). Implementation återstår: inget abonnemangsstöd, checkout är `mode: "payment"`, `users` har inga Stripe-fält. |

Stängda eller supersedade PR-utkast räknas inte som mergebevis. Det gäller bland
annat de äldre arkivrader som beskrev en draft som ”kodfixad”; aktuell kod på
`master` eller en mergad PR är alltid auktoritet.
