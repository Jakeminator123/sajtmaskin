# Bug-backlog (konsoliderad)

Operativ sanning mot `master` **`2fef6230`**, kontrollerad 2026-08-24. Full
historik finns i git; återställ vid behov föregående snapshot från den committen.
Det tunna historikindexet finns i
[`docs/plans/avklarat/bug-swarm/README.md`](docs/plans/avklarat/bug-swarm/README.md).

Regler:

- `Aktiv kö` innehåller bara kod- eller prodverifierade fel på nuvarande `master`.
- Obevisade hypoteser ligger i `Behöver repro`; avstängda funktioner ligger som
  releaseblockerare. De påverkar inte canvasens antal öppna produktbuggar.
- Varje aktiv rad har ett stabilt `SM-###`. Nästa lediga ID är `SM-077`.
- En draft-PR är inte en fix. Arkivflytten ska ingå i samma fix-PR med PR- och
  planerat masterbevis; den blir kanonisk först när PR:n mergas till `master`.

## Aktiv kö

<!-- prettier-ignore -->
| Klar | Status | Prio | Fynd | Bevis på `master` | Nästa steg |
| --- | --- | --- | --- | --- | --- |
| [ ] | Öppen bug | P2 | `SM-001` Repair accepterar nya filer genom att skriva över samma versions `files_json`; ingen användbar rollbackpunkt skapas. | `saveRepairedFiles` och `acceptRepair` i `src/lib/db/chat-repository/repair.ts`. | Skapa immutable repair-version eller snapshot och exponera rollback. |
| [ ] | Öppen bug | P2 | `SM-003` Deploy-repair betraktar versionsglobal `repair_available` som bevis för att just den failade deploymenten redan reparerats. | `src/app/api/v0/deployments/repair/route.ts`. | Bind idempotens och provenance till `deploymentId` och repair-origin. |
| [ ] | Öppen bug | P2 | `SM-013` Misslyckad template-init lämnar `?templateId=...` utan `chatId`; tomläget fortsätter därför visa ”Läser in templaten” tills reload. | `useBuilderEffects.ts`, `PreviewPanelEmptyState.tsx` och `POST /api/template`. | Landa idempotent serverkontrakt, därefter explicit felläge och säker ”Försök igen”. |
| [ ] | Öppen bug | P3 | `SM-030` En sparad `postgres-drizzle`-dossier kan samexistera med en senare Mongo-markör från tool/F3, så BuildSpec och prompt kan bära två databasidentiteter. | Dossierselectionen väljer Postgres medan `detect-integrations.ts` fortfarande producerar `mongodb`; omklassning dokumenterad i draft [#1139](https://github.com/Jakeminator123/sajtmaskin/pull/1139). | Låt markören följa vald dossier; bevara dossierlös Mongo när ingen DB-dossier är vald. |
| [ ] | Bekräftad prod-bugg | P2 | `SM-033` Wizardns competitor/enrich-rutter har nått sina 25/30-sekunderstak, men saknar ovillkorlig terminal fastelemetri som visar dominant steg. | Prod-504 samt `src/app/api/wizard/competitors/route.ts` och `enrich/route.ts`. | Lägg content-free terminal event och gemensam deadline/abort; mät p95/p99 före ändrat tak. |
| [ ] | Bekräftad prod-bugg | P1 | `SM-072` Chromium-captures svälter `/tmp` på warm Fluid-instans: burst av postcheck/live review läcker tills nästa launch dör (`Target page, context or browser has been closed`) och versionen visas som Degraderad trots frisk sajt. | Vercel runtime 2026-08-31 (chat `30840b09`, dpl `dpl_81XhZUJJ…`): 513→31→23 MB fritt inom 5 min; DB-skip `playwright_unavailable` + `runtime_error`; plattformsbred defektsignatur `e18935fd85a9` (6 chattar sedan 22 aug). Utredning: `docs/plans/active/2026-09-01-verifieringsflode-och-inspector/`. | Kod mergad [#1234](https://github.com/Jakeminator123/sajtmaskin/pull/1234): (a) `core.chromium.*` raderas före varje serverless-launch, (b) exakt 1 omkörning vid infra-skip, (c) resume-vakt + åldersgräns 5 min, (d) `productBlocked` → throttlad LLM-auto-fix. Kvar: prod-burst utan `playwright_unavailable` i följd. Kvarvarande race: trycksvep i `src/lib/capture/browser.ts` raderar profiler äldre än 2 min i delad `os.tmpdir()` över isolate-gränsen; en levande `goto` kan då få `Target page closed`. Nästa kodfix: ägarregistrering per capture, ålder bara för föräldralösa rester. |
| [ ] | Bekräftad prod-bugg | P1 | `SM-073` Preview-hostens injicerade inspector-bridge saknar identitetsstämpel (`versionId`/`previewSessionId`/`lifecycleToken` utelämnas ur script-URL:en) när sessionsmetadata tappats ur hostens store; parent släpper fail-closed alla meddelanden och inspektorn dör tyst i det i prod döda kartläget. | Injektionsbevis 2026-08-31 (chat `cdf5e0aa`): `<script src=".../api/inspect-bridge?parent=...">` utan identitetsparametrar; `/admin/sessions` = 0 trots servande runtime; live-repro med "Hovra över ett element först" på Verifierad version. `inspectInjectionScriptSrc` i `preview-host/src/runtime/preview-proxy.js`. | Klientdiagnos landad. Host-sidan: Fly-deploy v59 (2026-09-01) bär full identitetsstämpel. Kvar: prod-stickprov — hover inom ~1 s på färsk sajt. Arkivera efter det. |

| [ ] | Bekräftad prod-bugg | P1 | `SM-074` `preview_ready_timeout`-bannern falsklarmar permanent på frisk sajt. REVIDERAD ROTORSAK 2026-09-01: en follow-up mot en hibernerad VM handoff:ar den GAMLA sessionsidentiteten till den nya versionen (`preview_followup_lane: lane=update, reason=runtime_not_running` → `preview_url_handoff` med gammal `previewSessionId`; `updatePreviewHostSession` hårdkodar `startOutcome: "resumed"`) medan boot:en kommer upp under NY session/lifecycle. Klientens identitetsmatchning kan då aldrig lyckas: deadline fäller bannern, late recovery läser running+mismatch som terminalt och stänger utan att armera self-heal, och inspectorn dör fail-closed på ostämplade/felstämplade bridge-meddelanden. Höjd reload-timeout hjälper inte — ingen reload försöks. | Live-repro 2026-09-01 (chat `c2371f9c`, v3): Vercel-runtimelogg 04:32:34 UTC visar handoff `ps_4d04a764` för v3 medan `/preview-status` från 04:34:30 svarade `running` med `ps_5222ca2b` för samma version; klientens sessionsbärande polls (alla `ps_4d04a764`) upphörde 04:36:11 och bannern stod kvar efter `promoted/passed`. Friska syskon i samma chat: v1 (prewarm) och v2 (update mot levande runtime) — enda skillnadsvariabeln är hibernerad VM. Äldre repro `4cac8fb0` (samma symtom). Utredning: `docs/plans/active/2026-09-01-verifieringsflode-och-inspector/`. | Klientfix mergad [#1232](https://github.com/Jakeminator123/sajtmaskin/pull/1232) (`onPreviewSessionRotated`). Sanningsraden ovanför previewn tas bort i [#1237](https://github.com/Jakeminator123/sajtmaskin/pull/1237). Ägarbeslut 2026-09-01 (chat `5efde3c4`, 14:13): timeout-bannern tas bort helt — `version_mismatch_auto_resync` läkte ytan medan den röda bannern låg kvar över en frisk sajt. Recovery + telemetri (`preview_ready_timeout`, suspect, late recovery, auto-resync) behålls tysta. Kvar: prod-follow-up mot hibernerad VM utan banner; valfri serverhärdning av handoff vid `reason=runtime_not_running`. |

Prioritering: `SM-072`, `SM-073` och `SM-074` först; därefter `SM-033`,
`SM-013`, `SM-003` och `SM-001`; sist `SM-030`.

## Releaseblockerare bakom avstängd flagga

De här är inte nåbara produktbuggar medan respektive flagga är av.

<!-- prettier-ignore -->
| ID | Prio | Flagga | Kvar före aktivering |
| --- | --- | --- | --- |
| `SM-007` | P1 | `SAJTMASKIN_DOMAIN_PURCHASE` | Registrar-kontrakt och registrantdata, pengar/reconciliation, crash recovery/ledger, konsekvent provider/pris/state samt färdig retur-, relink- och köp-UX. |
| `SM-070` | P2 | `SAJTMASKIN_LIVE_REVIEW` | Idempotent Blob-retry, verklig sju-dagarsrensning inklusive chat-delete samt beständig modellförsöksbudget över persistfel/abandon. |

### `SM-007` — domänköp

Flaggan förblir av. Före aktivering måste hela kedjan stängas:

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
| `SM-071` | Fem äldre `app-shell`-körningar misslyckades, men manifestet ändrades 21 aug och en ny variant landade 23 aug; historiken bevisar därför inte fel på dagens `master`. | Kör en ny `app-shell` mot nuvarande master och lokalisera första preview-/buildfelet innan raden återaktiveras. |
| `SM-035` | Historisk Fly `npm install` exit 254 saknar klassificerad återkomst. | Nästa träff ska bära bounded manager/mode/duration, OOM-, disk-, machine- och regiondata. |
| `SM-037` | Historiska hydrationkrockar saknar aktuell producent. | Browser/preview-host-test med patch-lane på och HMR av; bind served och selected version till session. |
| Hydration → RepairGate | Inga säkra par av klientfel och hydration-advisory för samma revision. | Läs ny proddata; koppla till befintlig repair-loop bara vid versionsbundet par. |
| Fast Edit Lane | Stale chunk efter quick edit är fortfarande en hypotes. | Repro på Fly med patch utan HMR; utan mismatch ändras inte lanen. |
| Template-galleri | Evidensen för synliga mallars crash/lazy-load är gammal. | Kör catalog/blob-audit och click-smoke på dagens synliga mallar. |
| DB-pool | Poolsvält kan finnas trots backoff. | Fånga pool `x/3`, idle, waiting och headroom under samma prodgenerering. |
| Socket loss | Det är okänt vilken genereringsendpoint som tappar anslutningen. | Samla HAR/SSE och namnge exakt endpoint innan buggrad skapas. |
| OpenClaw health | En 502 följdes av 200 och kan ha varit cold start. | Korrelera nästa träff med Vercel runtime-logg i samma tidsfönster. |
| Analytics/consent | Initiering före consent är inte app-brett verifierad. | Auditera genererad sajt och skapa säkerhetsrad endast vid konkret förtidig init. |

Landingens tidigare ”kortet ligger 65 px lågt”-hypotes är inte längre giltig
evidens efter ombyggnaden i #1136. Ny visuell avvikelse kräver ny mätning.

## Väntar på ägarbeslut

Jake äger samtliga frågor. Detaljunderlag ligger i länkad plan eller i git före
denna trim; tabellen håller bara själva beslutet och när det behövs.

<!-- prettier-ignore -->
| Prio | Fråga | Senast när |
| --- | --- | --- |
| P3 | Ska ”Publik preview” döpas om till vad kontrollen faktiskt gör, och ska ”Hantera domän” flyttas från domän-chevronen till Publicera-menyn? | Fritt. |
| P3 | Briefing N3–N5: återinför Refine efter verifierarfynd, prova bevarande `clear-refine`, och betala extra variant-embedding? | Före B6 steg 2/B7; se aktiva Briefing-planen. |
| P3 | Dossier D5: ska Backoffice få fri add/remove efter att D2–D4 landat? | Före D5. |
| P3 | Är per-rubrikstaket 480 rätt när `selected-sections` breddas? | Före D4. |
| P2 | Ska högst en hard dossier väljas per promptrunda? | Nästa dossier-härdning. |
| P2 | Ska `SAJTMASKIN_REFUSE_DOSSIER_STUBS` vara på i production? | Verifiera aktuell env före nästa flaggändring. |
| P2 | Ska en pending dossier ersätta modellbyggd kod för samma capability, fråga användaren eller samexistera? | Nästa F3-vägändring. |
| P2 | Ska `stream_ended_without_version` återbetalas när text levererats men ingen version sparats? | Före MVP-leverans. |
| P2 | Ska `BuildPlanCard` visas normalt, och vilket kontrakt gäller när alla versioner är failed? | Före MVP/nästa versionsläsändring. |
| P2 | Ska en dossierfil med `defect.kind: compile` blockera i stället för att vara advisory? | Nästa F3-incident/härdningspass. |
| P2 | Vid oenighet mellan Visual QA (källregex) och live-review (skärmdump): ska renderingsbevis vinna, eller slås de ihop till ett viktat tal? | Nästa verifieringsomgång efter att #1243 landat. |
| P2 | Ska klientpolling få Sajtmaskin-build-id för att pausa under redeploy? | Nästa reproducerade redeploy-500-skur. |
| P2 | Ska F2 köra verifier-LLM-passet; vilken SLO motiverar separat verify-lane och senare parallell codegen? | När latens prioriteras, post-MVP för parallell codegen. |
| P2 | Rotera Actions `OPENAI_API_KEY` och ersätt den gamla eval-baselinen medvetet? | Före nästa gång baselinen används som bevis. |
| P3 | Ska tool-only-förslag plus approval prissättas som ett eller två modellsteg? | Före MVP-prissättning. |
| P3 | Ska tvetydig eller helnegerad providerfråga ställas tillbaka till användaren? | Nästa providerpass. |
| P3 | Ska verifier-LLM sluta få hela projektet varje gång (`SM-047`)? | När verifierkostnad/latens prioriteras. |
| P2 | Ska generation flyttas ur HTTP-anslutningen (`T9b`) efter mobilens frånkopplingsincident? | Nästa döda generation eller uttrycklig beställning. |
| P2 | Ska en loop-säker Vercel Log Drain skapas (`T11`)? | Endast när ägaren kör runbooken. |
| P2 | Ska preview-hostens Fly-maskin uppgraderas, och i så fall till vilken klass? `shared`-vCPU har enligt Flys dokumentation en baseline på 5 ms per 80 ms-period och vCPU, delad över maskinen — dagens `shared-cpu-4x` sustainar därför ~0,25 kärna när burst-balansen är slut, vilket träffar `npm install`/`tsc` rakt i previewlatensen. Månadspris i `arn` vid drift dygnet runt: nuvarande `shared-cpu-4x`/8 GB **$44**, `shared-cpu-8x`/8 GB **$47** (dubbel kvot, +$3), `performance-2x`/8 GB **$85** (~2,0 kärnor sustained), `performance-4x`/8 GB **$129**. Mer RAM utan mer CPU hjälper bara om det faktiskt är OOM/swap-tröskning. Mät throttling/burst-balans i Flys metrics före beslut. | Före MVP-lansering, eller vid nästa previewlatens-klagomål. |
| P3 | Flytta stor historik till Blob och därefter eventuellt `git filter-repo`? | När PR-kön är tom och alla kloner kan ersättas. |
| P3 | Kör produktbenchmark på 20–30 verkliga byggen? | Inför lansering/värdering. |

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
| P3 | UX (lastbärande copy) | Preview-hostens boot-splash visar rått internt sessionsstatus för användaren (`Status: warm_project`) på en mörk placeholder. Texten är **inte** fri att skriva om: `hasPreviewHostBootMarkers` i `src/lib/capture/preview-boot-page.ts` klassar boot-sidan på fyra exakta markörer — rubrikerna `^Startar (om )?preview$` och `^Preview kunde inte starta$`, brödtexterna `Preview-host bygger projektet och startar Next.js` / `Preview-runtimen startar om i bakgrunden`, samt `Status: warm_project`. Alla fyra sänds från `preview-proxy.js` (`sendRuntimeStartingPage` **och** `sendHeldPreviewErrorPage`); skriv om bara en av sidorna och detektorn tappar den. Snyggare copy kräver en maskinläsbar markör (meta/data-attribut) plus samtidig ändring av detektorn — annars kan produktkontrollen sluta känna igen boot-sidan och rapportera grönt på en sajt som bara startar. |
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

Stängda eller supersedade PR-utkast räknas inte som mergebevis. Det gäller bland
annat de äldre arkivrader som beskrev en draft som ”kodfixad”; aktuell kod på
`master` eller en mergad PR är alltid auktoritet.
