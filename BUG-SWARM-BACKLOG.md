# Bug-backlog (konsoliderad)

Bugggranskning **2026-10-19** mot `preview` **`d2bdd5c4b`** (plus #1634
`28375f143`) och `master` **`c3f62b636`**. 40 punkter verifierades read-only
mot koden, två per agent (20 agenter, Grok 4.7 xhigh): de 24 öppna raderna i
förra kön, `SM-025`/`SM-035`/`SM-071` ur repro-kön och svärmfynden `A#1`–`A#13`
från `.cursor/swarms/FINDINGS.md`. `SM-090` och `SM-077` stickprovades
dessutom av författaren. Rader som inte ingick är markerade som ej
omverifierade. Föregående snapshot (statuspass 2026-09-17) finns i git;
historikindex i
[`docs/plans/avklarat/bug-swarm/README.md`](docs/plans/avklarat/bug-swarm/README.md).

Detta är den enda kanoniska bugglistan. `.cursor/swarms/` är ett gitignorerat
triageförråd; bekräftade fynd lyfts hit med ett stabilt ID.

Regler:

- `Aktiv kö` är den kanoniska ID-tabellen. Status-cellen skiljer `Öppen kodbugg`,
  `Befintlig fix-PR`, `Kodfix i preview`, `Kodfix i master`,
  `Kvarvarande driftprov`, `Delvis åtgärdad` och `Behöver aktuell repro`.
- Kodfix på både preview och master flyttas till `Arkiv` med bevis. Kodfix bara
  på preview stannar i kön tills promote.
- Varje aktiv rad har ett stabilt `SM-###`. Nästa lediga ID är `SM-099`.
- En draft-PR är inte en fix. Kolumnen «Bevis på `master`» anger alltid vilken
  gren beviset gäller.

## Aktiv kö

<!-- prettier-ignore -->
| Klar | Status | Prio | Fynd | Bevis på `master` | Nästa steg |
| --- | --- | --- | --- | --- | --- |
| [ ] | Öppen kodbugg | P1 | `SM-080` Preview-projekt på Fly-hosten delar OS-identitet och filsystem; ett projekts install/dev-process kan läsa andra projekts filer. | `preview-host/src/runtime/process-lifecycle.js:911`, `preview-host/src/runtime/shared.js:982`, `preview-host/Dockerfile` (ingen `USER`); samma kod på preview och master. Path-jail #1445 skyddar bara hostens egna skrivningar och är live på Fly sedan v65; v66 kör `c3f62b636` sedan 2026-10-19. | **Blockerar öppen lansering.** Riktningen är ratificerad 2026-09-18: isolerad Fly Machine per kundprojekt, fail-closed vid obevisad isolering ([`docs/decisions/README.md`](docs/decisions/README.md)). Sizing, volymtopologi, idle-timeout och pooling bevisas i pilot. |
| [ ] | Delvis åtgärdad | P1 | `SM-081` Parallella genereringar kan inte längre passera samma kreditförkontroll, men det finns ingen budgetreservation eller kostnadstak. | `src/lib/credits/generation-admission.ts:13`, `src/lib/gen/stream/generation-lock.ts:135`; preview och master. Utan Redis i production/preview nekas starten med 503. | Kvar: faktisk reservation/kostnadstak och övriga betalda körvägar. Beställ inte kontolåset igen. |
| [ ] | Delvis åtgärdad | P1 | `SM-072` Chromium-captures kan svälta `/tmp` på en varm Fluid-instans; en burst kan döda nästa launch. | `src/lib/capture/browser.ts:203` och `:395`: core-dumpar rensas före launch och `browser_crashed` visas inte som Degraderad, men profiler yngre än 300 s lämnas kvar. #1572 finns bara på preview. Burst-evidens preview 2026-09-20 (chat `a0b134d9`, 382–979 MB). | Kvar: städning av unga profiler under tryck och ett burstprov utan `playwright_unavailable`. |
| [ ] | Delvis åtgärdad | P1 | `SM-073` Inspector-bridgen stämplar bara meddelanden när `previewSessionId` finns; utan den släpper parent fail-closed. | `preview-host/src/runtime/inspect-bridge-src.js:44`, `src/components/builder/preview-panel/inspect/usePreviewInspectBridge.ts:390` (`93a9a0d2f`); preview och master. Ett avvisat ready visas nu i stället för att dö tyst. | Kvar: prod-stickprov (hover inom ~1 s på färsk sajt) eller stämpel även när sessionsmetadata saknas. |
| [ ] | Behöver aktuell repro | P1 | `SM-092` Resend nekade verifieringsmejl i prod med 403 «domain is not verified»; då kan en nyregistrerad inte verifiera sin e-post. | `src/lib/email/send.ts:153` klassar felet som `sender_not_verified`, `src/app/api/auth/register/route.ts:102` och `auth-modal.tsx:156` visar det; ingen retry. Senast i prod 2026-09-16. | (1) Kontrollera Resend-status för `sajtmaskin.se`. (2) Kör ett riktigt registrerings-/verifieringsmejl. PASS ⇒ arkivera; fortfarande 403 ⇒ launch-blockerande providerkonfiguration. Bygg ingen ny mejlväg. |
| [ ] | Öppen kodbugg | P2 | `SM-090` Planläget bygger systemprompten med `\n\n---\n\n` i stället för `SYSTEM_PROMPT_SEPARATOR`, så prod-asserten `missing-separator` slår. | `src/lib/own-engine/session/own-engine-plan-mode.ts:30` mot `src/lib/gen/system-prompt/compose.ts:35`; asserten anropas från `src/lib/gen/engine.ts:161`. Samma på preview och master. Prod: 5 träffar t.o.m. 2026-09-15 på båda stream-rutterna. | Låt planläget använda samma separator (eller sammansättning) som codegen. Sänk inte asserten till varning. |
| [ ] | Öppen kodbugg | P2 | `SM-001` Repair-accept skriver över samma versions `files_json`; ingen rollbackpunkt skapas. | `src/lib/db/chat-repository/repair.ts:386` (preview), `:281` (master): `acceptRepair` skriver payload över versionsraden och nollar `repaired_files_json`. | Avgör om accept ska skapa ny version eller filhistorik. |
| [ ] | Öppen kodbugg | P2 | `SM-094` Billing-upserten kopplar aldrig kampanj i efterhand: en version som först skrevs utan `campaign_entitlement_id`/`campaign_phase` får dem aldrig. Från svärmfynd `A#13`. | `src/lib/db/services/generation-billing.ts:196` (`onConflictDoUpdate`); preview och master. Debiteringen läser bara de sparade kolumnerna. Visningen täcks av #1630, debiteringen inte. | Sätt kampanjfälten i konfliktgrenen och lås med test. |
| [ ] | Öppen kodbugg | P2 | `SM-095` Falskgrönt: warm-tsc sätter `repaired:true` när LLM-fixern rapporterar success utan ny `tsc`, så yttre status blir `passed` med `errorsAfter:0`. Från `A#5`. | `src/lib/gen/autofix/validate-and-fix.ts:333` och `:563`; testet `validate-and-fix.test.ts:286` låser beteendet. Preview och master. | Kör om `tsc` efter fixern innan `repaired`, och ändra testet. |
| [ ] | Öppen kodbugg | P2 | `SM-096` En deadline efter `reserve` i LLM-repair-grinden stänger varken budgeten eller sätter `aborted`, så nästa `begin` dedup-blockar reparationen. Från `A#7`. | `src/lib/gen/autofix/llm-repair-gate.ts:269` och `:122`; koden finns bara på preview (`d2bdd5c4b`). | Fixa före nästa promote, annars når den prod. |
| [ ] | Öppen kodbugg | P2 | `SM-097` Bakgrundsverify sätter `kind:"superseded"` och settle:ar resume-försöket även när supersede-skrivningen returnerar null. Från `A#6`. | `src/lib/gen/verify/server-verify/verify-run.ts:527` och `:469` på preview; master ignorerar null men har ingen resume-settle. | Fixa före nästa promote. |
| [ ] | Delvis åtgärdad | P2 | `SM-077` Sen preview-boot gav ingen omverifiering. Master har klientens omförsök; preview har bytt till server-ägda efterkontroller. | Master: `src/lib/hooks/chat/useResumePendingVerification.ts:738` (`scheduleRetry`, #1432). Preview: hooken borttagen i #1593 `e75641052`; server-resume i `src/lib/gen/verify/server-verify/verify-run.ts:230`. | Bevisa på preview att en sen boot leder till omverifiering innan nästa promote, annars är det en regression mot master. |
| [ ] | Delvis åtgärdad | P2 | `SM-093` Flera flikar på samma `chatId` kan hålla en version i `pending` via upprepad `preview_superseded`. | Preview: 8 s backoff och högst en omstart per körning (`src/lib/gen/verify/server-verify/verify-run.ts:443`), men `superseded` räknas inte mot försökstaket 3 eller hold-taket 20 (`src/lib/db/services/server-repair-budget.ts:86`), så `pending` kan förnyas i upp till sju dagar. Master: `scheduleRetry` utan tak. | Räkna supersede mot ett tak eller avbryt i stället för att lämna `pending`. Repro med exakt två flikar. |
| [ ] | Delvis åtgärdad | P2 | `SM-091` Import-zip som ger 403 efter lyckad metadata säger inte om orsaken är privat repo, utgången token eller borttaget arkiv. | `src/lib/import/github-import-transport.ts:334` och `:470`; preview och master. Rå «Archive download forbidden» är ersatt med svensk text; meta-403 har egna meningar. | Skilj orsakerna i zip-403 när det går; kör privat-repo-smoken när `TEST_USER_*` finns. |
| [ ] | Delvis åtgärdad | P3 | `SM-030` En `postgres-drizzle`-dossier kan samexistera med en senare Mongo-markör, så BuildSpec/prompt bär två databasidentiteter. | `detect-integrations.ts:221` matchar fortfarande Mongo; preview kan 409-stoppa en godkänd Mongo-markör mot igenkänd postgres-drizzle-kärna (`tier3-readiness.ts:541`), master saknar spärren. `align-database-marker.ts` finns inte; #1414 stängdes utan merge. | Kvar: promptbygget när spärren inte tar. Reproducera innan ny kod landar. |
| [ ] | Öppen kodbugg | P3 | `SM-098` `hooks:install:soft` sväljer en hookinstallations-exit 1 och `predev` kör den vid varje dev-start, så pre-push kan saknas tyst. Från `A#12`. | `package.json:38`, `scripts/dev/predev.mjs:31`, `scripts/dev/install-git-hooks.mjs:444`; preview och master. Konflikttexten skrivs till stderr men dev fortsätter. | Gör saknad pre-push synlig vid dev-start eller i `npm run inbox`. |

MVP före öppen lansering: `SM-080` (isolering) är spärren; `SM-092` måste
kontrolleras live. `SM-096`, `SM-097` och `SM-077` gäller kod som bara finns på
preview och ska lösas eller bevisas före nästa promote.

Svärmfynd som är fixade bara på preview och når prod vid nästa promote:
`A#1` (#1634), `A#2` (#1633), `A#3` och `A#4` (#1632), `A#8`, `A#9` och `A#11`
(#1635). `A#10` gäller gitignorerade lokala `source-command-*`-speglingar i en
checkout, inte spårad kod.

## Releaseblockerare bakom avstängd flagga

Inte nåbara produktbuggar medan flaggan är av. Ej omverifierade 2026-10-19.

<!-- prettier-ignore -->
| ID | Prio | Flagga | Kvar före aktivering |
| --- | --- | --- | --- |
| `SM-007` | P1 | `SAJTMASKIN_DOMAIN_PURCHASE` | Registrar-kontrakt och registrantdata, pengar/reconciliation, crash recovery/ledger, konsekvent provider/pris/state samt färdig retur-, relink- och köp-UX. Domänpåslaget x2 styrs av admin via `pricing_settings`. |
| `SM-070` | P2 | `SAJTMASKIN_LIVE_REVIEW` | Idempotent Blob-retry, verklig sju-dagarsrensning inklusive chat-delete samt beständig modellförsöksbudget över persistfel/abandon. Production kräver separat ägarbeslut efter grönt Preview-smoke. |

## Behöver repro

Testkö, inte bekräftade buggar. Körvägar i
[`docs/runbooks/live-verifiering.md`](docs/runbooks/live-verifiering.md).
Bara `SM-035` och `SM-071` omverifierades mot kod 2026-10-19.

<!-- prettier-ignore -->
| Ref | Osäkerhet | Vad avgör raden |
| --- | --- | --- |
| `SM-035` | Historisk Fly `npm install` exit 254. Koden klassar nu OOM och disk (`preview-host/src/runtime/package-install.js:630`), men `installDiagnostics` saknar pakethanterare, läge och duration. | Nästa träff ska bära manager/mode/duration och machine-/regiondata. |
| `SM-071` | Fem äldre `app-shell`-körningar misslyckades före manifeständringarna 21–23 aug. Kodläget är en komplett app-shell med fyra varianter (`src/lib/gen/scaffolds/app-shell/manifest.ts`). | Kör en ny `app-shell` mot nuvarande master och lokalisera första preview-/buildfelet. |
| `SM-037` | Historiska hydrationkrockar saknar aktuell producent. | Browser/preview-host-test med patch-lane på och HMR av; bind served och selected version till session. |
| Block/Marknadsblock | Flaggan är på men riktig Pro-källa är inte livebevisad. | Infoga `hero1` i prod och verifiera hämtad källkod, inte metadata-fallback. |
| OpenAI E2E | UX-kedjan finns; tidigare projektnyckel saknade quota. | Spara riktig projektägd nyckel, bygg integrationen en gång, få providersvar och reloada. |
| Scaffold-kohort | `(null)` kan vara blandning av explicit off, import och pending. | Kör `control-stats.mjs` per kohort; skapa buggrad endast för konkret fallande kohort. |
| Hydration → RepairGate | Inga säkra par av klientfel och hydration-advisory för samma revision. | Läs ny proddata; koppla till befintlig repair-loop bara vid versionsbundet par. |
| Fast Edit Lane | Stale chunk efter quick edit är en hypotes. | Repro på Fly med patch utan HMR. |
| Template-galleri | Evidensen för synliga mallars crash/lazy-load är gammal. | Kör catalog/blob-audit och click-smoke på dagens synliga mallar. |
| DB-pool | Poolsvält kan finnas trots backoff (pool max 3 per instans mot pooler). | Fånga pool `x/3`, idle, waiting och headroom under samma prodgenerering. |
| Socket loss | Okänt vilken genereringsendpoint som tappar anslutningen. | Samla HAR/SSE och namnge exakt endpoint innan buggrad skapas. |
| OpenClaw health | En 502 följdes av 200 och kan ha varit cold start. | Korrelera nästa träff med Vercel runtime-logg. |
| Analytics/consent | Initiering före consent är inte app-brett verifierad. | Auditera genererad sajt; skapa säkerhetsrad endast vid konkret förtidig init. |
| CI-flake quality-core | Orsaken (testing-librarys 1 s-default) är åtgärdad med 5 s i `vitest.setup.ts`; raden är bevakning. | Nästa enstaka `waitFor`-fail som är grön på rerun: mät hur långt över deadline workern låg i stället för att höja blint. |

## Väntar på ägarbeslut

Jake äger samtliga frågor. Ej omverifierade 2026-10-19.

<!-- prettier-ignore -->
| Prio | Fråga | Senast när |
| --- | --- | --- |
| P3 | Ska ”Publik preview” döpas om till vad kontrollen faktiskt gör, och ska ”Hantera domän” flyttas från domän-chevronen till Publicera-menyn? | Fritt. |
| P3 | Briefing N3–N5: återinför Refine efter verifierarfynd, prova bevarande `clear-refine`, och betala extra variant-embedding? | Inte före kvalitetsplanens A-mätning. Se [`docs/plans/archived/2026-08-18-briefing-och-kallpaket.md`](docs/plans/archived/2026-08-18-briefing-och-kallpaket.md). |
| P3 | Dossier D5: ska Backoffice få fri add/remove efter att D2–D4 landat? | D2–D4 är parkerade. Se [`docs/plans/archived/2026-08-19-dossier-forenkling.md`](docs/plans/archived/2026-08-19-dossier-forenkling.md). |
| P3 | Är per-rubrikstaket 480 rätt när `selected-sections` breddas? | Inte aktuellt; taket är ratificerat i [`docs/decisions/README.md`](docs/decisions/README.md). |
| P2 | Ska högst en hard dossier väljas per promptrunda? | Nästa dossier-härdning. |
| P2 | Ska `SAJTMASKIN_REFUSE_DOSSIER_STUBS` vara på i production? | Verifiera aktuell env före nästa flaggändring. |
| P3 | OpenClaw Builder: starta som projektledande byggagent, eller skrota? Underlag i [`docs/plans/archived/2026-08-24-openclaw-builder/`](docs/plans/archived/2026-08-24-openclaw-builder/README.md). | Fritt. |
| P2 | Ska en pending dossier ersätta modellbyggd kod för samma capability, fråga användaren eller samexistera? | Nästa F3-vägändring. |
| P2 | Ska `stream_ended_without_version` återbetalas när text levererats men ingen version sparats? | Före MVP-leverans. |
| P2 | Vilket kontrakt gäller för `BuildPlanCard` när alla versioner är failed? | Före nästa versionsläsändring. |
| P2 | Ska en dossierfil med `defect.kind: compile` blockera i stället för att vara advisory? | Nästa F3-incident/härdningspass. |
| P2 | Vid oenighet mellan Visual QA (källregex) och live-review (skärmdump): ska renderingsbevis vinna, eller viktas de? | Nästa verifieringsomgång. |
| P2 | Ska klientpolling få Sajtmaskin-build-id för att pausa under redeploy? | Nästa reproducerade redeploy-500-skur. |
| P2 | Ska F2 köra verifier-LLM-passet; vilken SLO motiverar separat verify-lane och senare parallell codegen? | När latens prioriteras. |
| P2 | Konsolidera reparationslagren: warm-tsc i F2 även när grinden är planerad, skärpt `risky_fixes`-trigger, live review gatad på sensorfynd vid init. Mäts mot `control-stats-baseline-2026-09-11.json`. | Efter ett nytt 14-dagarsfönster. |
| P3 | Nav-synken lägger aldrig till länkar för modellskrivna sidor (olänkade sidor som `/categories`, `/om`). Lägga till länkar, droppa sidorna, eller göra `non_blocking_quality_warning` blockerande? | Nästa scaffold-/ruttplanspass. |
| P2 | Rotera Actions `OPENAI_API_KEY` och ersätt den gamla eval-baselinen medvetet? | Före nästa gång baselinen används som bevis. |
| P3 | Ska tool-only-förslag plus approval prissättas som ett eller två modellsteg? | Före MVP-prissättning. |
| P3 | Ska tvetydig eller helnegerad providerfråga ställas tillbaka till användaren? | Nästa providerpass. |
| P3 | Ska verifier-LLM sluta få hela projektet varje gång (`SM-047`)? | När verifierkostnad/latens prioriteras. |
| P2 | Ska generation flyttas ur HTTP-anslutningen (`T9b`) efter mobilens frånkopplingsincident? | Nästa döda generation eller uttrycklig beställning. |
| P2 | Ska en loop-säker Vercel Log Drain skapas (`T11`)? | Endast när ägaren kör runbooken. |
| P3 | Flytta stor historik till Blob och därefter eventuellt `git filter-repo`? | När PR-kön är tom och alla kloner kan ersättas. |
| P3 | Kör produktbenchmark på 20–30 verkliga byggen? | Inför lansering/värdering. |
| P3 | Kostnadsfri: ska `SAJTMASKIN_PREVIEW_PREWARM` slås på så preview-VM:en värms vid init-generering? Kräver mätning på preview-hosten först. | Fritt. |

Fattade beslut flyttas till
[`docs/decisions/README.md`](docs/decisions/README.md); implementationen hör
inte hemma i denna tabell.

## Säkerhet, infra och teknisk skuld

Konkret, fortfarande relevant skuld. Ej omverifierad 2026-10-19.

<!-- prettier-ignore -->
| Prio | Klass | Kvarvarande skuld |
| --- | --- | --- |
| P2 | Env (`SM-087`) | Stripe live-nycklar och webhook finns i production; `STRIPE_PRICE_*` är medvetet osatta. Production-posterna är Vercel `sensitive` och kan inte läsas tillbaka; att skriva om dem är ägarstyrd driftinställning. Beslut: [`docs/decisions/README.md`](docs/decisions/README.md) (Stripe / live-läge). |
| P2 | Observability | `engine_version_error_logs.version_id` är `NOT NULL`, så fel före första versionen kan inte loggas (`T3`). |
| P2 | Säkerhet | Läsande CI-jobb delar prod-credentials med skrivande jobb; inför separat read-only-roll/DSN. |
| P2 | Säkerhet (cross-tenant) | `sites.sajtmaskin.se` saknar Public-Suffix-List-post, så en kundsajt skulle kunna sätta cookie på den delade parent-domänen. Blockerar branded-rollouten — se [`docs/runbooks/branded-user-urls.md`](docs/runbooks/branded-user-urls.md). |
| P2 | Observability (`SM-045`) | Brief-anropets `llm_usage` saknar både `chat_id` och `session_id`. |
| P2 | Sanningsskuld (`SM-054`) | `verification_state` bär ingen `filesRevision`; ett lagrat verdikt kan gälla äldre innehåll. |
| P3 | Kontraktsasymmetri (`SM-056`) | Ruttplanens filfilter gäller scaffoldfiler men inte modellens egna emitterade sidfiler. |
| P3 | Config (`SM-046`) | `deploy-assistant` finns i manifest/fasrouter/Backoffice men har ingen runtime-anropare. |
| P3 | Env/export | Verbatim-export kan falla tillbaka till hela placeholder-katalogen i `.env.local`; tråda dossier-scope. |
| P3 | Dependency | Generatorpaket saknar egen deklarativ katalog och paritetsvakten täcker bara en del av `KNOWN_PACKAGES`. |
| P3 | Test | Runtime-guards saknar full kö- och `idle → hibernated → reboot`-täckning. |
| P3 | Arkitektur | Ta bort dött SSE-callbackförsök och gör polling till enda kanoniska väg. |
| P3 | Prompt | Budgettruncering är blind; mät triggerfrekvens och gör den fil-/fence-medveten. |
| P3 | Legacy | Bestäm kompatibilitetsperiod och migration för `template_cache`. |
| P3 | UX | Blockera save under `verifying/repairing` utan att tappa lokal draft. |
| P3 | UX (lastbärande copy) | Boot-placeholderns titlar är bakåtkompatibel fallback bredvid maskinmarkören `data-sajtmaskin-preview-boot`; byt inte titlarna förrän production-appen läser markören. |
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

## Arkiv

Avslut med kodfix på både preview och master. Verifierade 2026-10-19 om inget
annat anges; äldre arkiv finns i git och i
[`bug-swarm/README.md`](docs/plans/avklarat/bug-swarm/README.md).

<!-- prettier-ignore -->
| Klar | Rad | Status på `master` | Bevis |
| --- | --- | --- | --- |
| [x] | `SM-078` | Fixad | RLS och revoke av PUBLIC/anon/authenticated i `src/lib/db/migrations/harden-wizard-runs-access.sql`; tabellen nås bara via serverns pg-pool. #1325 / master #1344. |
| [x] | `SM-079` | Fixad | `createGoogleUser` (`src/lib/db/services/users.ts:72`) kör transaktion med identitets-/radlås, nekar konflikt och nollar `password_hash` för overifierat konto. #1325 / master #1344. Historiskt felkopplade konton är separat dataresidual. |
| [x] | `SM-082` | Fixad | `icon-component-value-fixer.ts:47` matchar bara JSX-barn; regressionstest finns. |
| [x] | `SM-083` | Fixad | 409 `DEPLOY_TYPECHECK_ADVISORY` före Vercel-anrop (`src/app/api/v0/deployments/_route/post.ts:185`, `engine-version-lifecycle.ts:182`). |
| [x] | `SM-084` | Fixad | `quality-gate-checks.ts:177` viker bara `routes.d.ts` + `TS1005`; hosten städar inte `.next/dev/types`, men det behövs inte med folden. |
| [x] | `SM-003` | Fixad | Deploy-repair no-opar bara när stämpeln gäller just den failade deploymenten (`src/app/api/v0/deployments/repair/route.ts:95`, #1431). |
| [x] | `SM-013` | Fixad | Misslyckad template-init visar feltext och Försök igen (`PreviewPanelEmptyState.tsx:108`, #1376 / master #1416). |
| [x] | `SM-088` | Fixad | `MessageList.tsx:483` bygger `planParts` utan debugfilter; `BuildPlanCard` renderas i default-UI (#1373 / master #1394). |
| [x] | `SM-089` | Fixad | Init-planläget skriver entry/exit via `startTracedCreateChatPlanModeResponse` (`create-chat-stream-post.ts:751`, #1377 / master #1416). |
| [x] | `SM-033` | Fixad | Terminal wizard-telemetri skickas alltid i `finally` före taket (`src/lib/wizard/route-budget.ts:46`, #1434 / master #1459). |
| [x] | `SM-074` | Fixad | Klienten adopterar `running` med ny session/lifecycle (`usePreviewIframe.ts:66`); hårdkodad `startOutcome: "resumed"` finns kvar men orsakar inte längre falsklarm. |
| [x] | `SM-085` | Fixad | `resolveUserRequestForVersion` (`live-review.ts:346`) används av HTTP-routen och server-verify (#1375). |
| [x] | `SM-086` | Fixad | `screenshotViewportCoverage` används av prompt, bilddelar och `maybeAttachLiveReview` (`live-review.ts:138`, #1375). |
| [x] | `SM-025` | Avfärdad | Postcheck och thumbnail startar varsin browser och `captureBrowserGate` köar bara inom samma isolate (`src/lib/capture/browser.ts:35`, #843); en annan isolates close når inte browsern. |
| [x] | `SM-014` | Fixad | [#1124](https://github.com/Jakeminator123/sajtmaskin/pull/1124) binder preview-overlay till runtime-readiness. |
| [x] | `SM-018` | Fixad | [#1126](https://github.com/Jakeminator123/sajtmaskin/pull/1126) synkar parentens aktiva route med iframe-navigation. |
| [x] | `SM-032` | Fixad | [#1124](https://github.com/Jakeminator123/sajtmaskin/pull/1124) lägger minsta Maps-hostar i CSP med test. |
| [x] | `SM-038` | Fixad | [#1124](https://github.com/Jakeminator123/sajtmaskin/pull/1124) återanvänder kanonisk bloggrutt. |
| [x] | `SM-040` | Fixad | [#1137](https://github.com/Jakeminator123/sajtmaskin/pull/1137) tillåter exakt `Data Protection Policy` efter `och`/`and`. |
| [x] | `SM-075` | Fixad | PR #1242 lägger `TS2724` och `TS2693` i `RENDER_RISK_TS_CODES`. |
| [x] | `SM-076` | Fixad | PR #1242 anropar `failVersionVerification` i build-error-repairens catch när `files_json` är oförändrad. |
| [x] | `SM-015` | Fixad | [#1138](https://github.com/Jakeminator123/sajtmaskin/pull/1138) använder opak `text-muted-foreground`; kontrasttester låser 5,75–6,45:1. |
| [x] | Affärsmodell / månadsavgift | Beslutad 2026-09-11, inte byggd | Riktningen ratificerad i [`docs/decisions/README.md`](docs/decisions/README.md). Implementation återstår. |

Stängda eller supersedade PR-utkast räknas inte som mergebevis; aktuell kod på
`master` eller en mergad PR är alltid auktoritet.
