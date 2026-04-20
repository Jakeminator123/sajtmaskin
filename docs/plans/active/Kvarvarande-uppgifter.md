# Sajtmaskin — kvarvarande uppgifter (kanonisk lista)

Senast uppdaterad: 2026-04-20 efter cloud-loop (PR #69 — 21 commits) ovanpå master `51751bd30`. **Tier S = 7/7, Tier A = 9/12, Tier B = 5/13. + 21 nya etapper (Block 0+1+2 i cloud-loopen).** Se `STATUS-2026-04-20.md` i repo-roten för fullständig sammanfattning + Linear-projektet [Sajtmaskin-skuld 2026-04-20](https://linear.app/sajtmaskin/project/sajtmaskin-skuld-2026-04-20-1f82a9728a0a).

## Öppna punkter (smal lista — 4 saker)

| # | Område | Beskrivning | Prio | Blocker |
|---|--------|-------------|------|---------|
| 1 | UX (P25b-rest) | VersionHistory-tooltips ("Verifying"/"Fel" badges) + mjuk "promoted"-badge + `VersionMismatchOverlayPayload` overlay-rendering i `PreviewPanelFrame.tsx`. | Låg | Visuell verifiering — [SAJ-23](https://linear.app/sajtmaskin/issue/SAJ-23) |
| 2 | Ingress (P19 Steg 3) | UX-transparens vid follow-up-bas != latest ("du redigerar version X, inte senaste Y"). | Låg | UI-arbete (4–8h) — [SAJ-22](https://linear.app/sajtmaskin/issue/SAJ-22) |
| 3 | Eval | Automatisk baseline-uppdatering (CI-script för eval-svit). | Låg | — |
| 4 | Pre-existing test failures | 5 fail på master (phase-routing 3, model-selection 1, dossiers 1) — inte rörda i cloud-loopen. | Medel | Egen PR |
| 5 | shadcn (P20 Nivå 3) | Uppströms `registry:font`-ingestion (fullt format). CI-MVP-validering klar 2026-04-20. | Låg | Inte blockerande |
| 6 | shadcn (P20 Nivå 2) | Uppströms `registry:block`-integration (fullt format). Deterministic-pick shrink-leverans klar 2026-04-20. | Låg | Inte blockerande |

> Tidigare punkt #1 (`Source_Sans_3`-violation) löstes 2026-04-20 i cloud-loopen, commit `808735e2`.

## Telemetri-blockad (vänta 1 vecka, sen plocka)

| # | Vad | Counter att läsa |
|---|---|---|
| 7 | **Audit Tier A #16** Inventera early-stop-flaggor i `validateAndFix`/`runRepairLoop` | `sajtmaskin_early_stop_total{reason, phase}` |
| 8 | **Audit §3.1** Verifier asynk eller helt bort | `sajtmaskin_verifier_blocking_total{finding_id}` |
| 9 | **Audit §3.3** Partial-file-repair-removal (kräver också fast-tier byts till GPT-5+) | `sajtmaskin_partial_file_repair_total{outcome}` |
| 10 | **Audit Tier A #12 / Audit Tier A #17** P50-utvärdering / Brief A/B-test | `sajtmaskin_prompt_to_done_ms_bucket{outcome, kind}` + `sajtmaskin_brief_cache_total{outcome}` |

## Strategiska / stora satsningar

| # | Vad | Effort | Värde |
|---|---|---|---|
| 11 | **Audit §3.2** Slå ihop `server-verify` + `quality-gate` + `accept-repair` | 1 vecka | -1 lifecycle-state, mer förutsägbar UX |
| 12 | **Audit Tier D #38** WebContainers-migration | 2-3 veckor | **Boot 2-5 min → 5 sek (50-60×). Tar betyget 6.5 → 8.** |

## Externa förutsättningar

| # | Vad | Blocker |
|---|---|---|
| 13 | **Tier A #9** ÅÄÖ pre-commit hook | Husky/lint-staged install |
| 14 | **Skuld-spår från arkiverade rapport-dokument** (FIXA.txt + imorgon.txt — borttagna 2026-04-20) | **Stort framsteg i cloud-loopen 2026-04-20:** Topp-15 från FIXA + I1 från imorgon adresserade. Klara: A1, A2, A3, A4, A5, A6, A7, A8, A10, A11, A12, A13, A15, A16, A18, B1, B2, B3, B4, B5, C1, C2, C3, I1 (24 av ~35). Defer:ade per blocker eller telemetri-vänta: B6/B7/B8/B9 (utredning), I2 (kräver `done.rejectedStructural`-data). Se `STATUS-2026-04-20.md` för commit-mappning. |

## Avklarat i cloud-loop 2026-04-20 (PR #69, 21 commits, branch `cursor/source-sans-3-registrering-02d5`)

> Källa: `STATUS-2026-04-20.md` i repo-roten + Linear-projekt [Sajtmaskin-skuld 2026-04-20](https://linear.app/sajtmaskin/project/sajtmaskin-skuld-2026-04-20-1f82a9728a0a).

| Block | Vad | Commits |
|---|---|---|
| **Block 0 — Bugsvep (9)** | Source_Sans_3 + C1 Turbopack + I1 fly.dev + C2 sandbox + B2 verifier-retry + B3 OpenAI-felmappning + B4 detectPromptType + B5 follow-up brief + B1 DB pool | `808735e2` `5375807e` `7df48d48` `8fabf4ef` `9059e35d` `9141049f` `a3fb69d5` `c03c5db7` `3a4decf0` |
| **Block 1 — FIXA topp-rest (6)** | A5 ThemeProvider + A2 Lucide-alias + A1 stub-förbud + A4 rapier-bort + A3 source.unsplash.com + C3 inspector-overlay | `671b7a55` `3fe52147` `b43772f7` `d57ac978` `8ce87312` `0d6ba30a` |
| **Block 2 — FIXA polish (10 prompt-regler i 2 commits)** | A6 + A7 + A8 + A10 + A15 + A16 + A18 / A11 + A12 + A13 | `83c0dfa4` `b51b0e2b` |
| **Slutleverans** | Audit-mapp → `docs/reports/avklarade/`, denna fil uppdaterad, `STATUS-2026-04-20.md` skapad i roten, handoff orörd | (denna commit) |

## Avklarat i LLM-flöde Fas 2/3-leverans (2026-04-20)

| Vad | Var |
|-----|-----|
| Wave 1 — Element Preservation Guard rejections bubblas via SSE `done.rejectedStructural` + `warnLog`. Tidigare tysta "byt hero till intro"-buggen är nu observerbar både server-side och i UI:t. | `src/lib/gen/stream/finalize-merge.ts`, `src/lib/gen/stream/finalize-version.ts`, `src/lib/providers/own-engine/generation-stream-post-finalize.ts` |
| Wave 1 — Pre-VM typecheck-fixern (medan den fortfarande var ett eget steg) fick `model`/`thinking`/`reasoningEffort`/`abortSignal` med 60 s timeout via `phaseRouting.fixer`. Hårdningen sögs upp i Wave 3-konsolideringen. | `src/lib/gen/stream/finalize-version.ts` (borttagen som del av Wave 3) |
| Wave 1 — Remerge-shrinks/structural rejections efter partial-file repair konkateneras nu till de samlade arrayerna istället för att tappas. | `src/lib/gen/stream/finalize-version.ts` |
| Wave 1 — Golden-test fixture uppdaterad med `rejectedShrinks` + `rejectedStructural` så `tsc --noEmit` går igen. | `src/lib/providers/own-engine/generation-stream.golden.test.ts` |
| Wave 2 — Verifier blocking-fynd matas in i `runLlmFixer` direkt efter verifier-passet via `formatVerifierFindingsAsFixerErrors()`. Lyckad fixer-pass rensar `verifierBlockingFindings` så versionen inte markeras blocked. SSE `verifier`-eventet får `phase: "fixing"` och `phase: "fixed"`. Test täcker hela banan. (audit §3.1 alt 4) | `src/lib/gen/verify/verifier-pass.ts`, `src/lib/gen/stream/finalize-version.ts`, `src/lib/gen/stream/finalize-version.test.ts` |
| Wave 3 — `pre_vm_typecheck` sammanslaget i `validate_syntax`. `runWarmTscPass` körs efter esbuild når `passed`, delar `fixBudgetMs` och `runLlmFixer`-loop. Pipeline-kontraktet uppdaterat (en fas mindre); `OWN_ENGINE_FINALIZE_FAST_ONLY_PHASES` likaså. F3 sätter `forceTsc: true`. SSE phases utökade. (audit §2.1) | `src/lib/gen/autofix/validate-and-fix.ts`, `src/lib/gen/stream/finalize-pipeline-contract.ts`, `src/lib/gen/stream/finalize-version.ts`, `src/lib/gen/autofix/validate-and-fix.test.ts`, `src/lib/gen/stream/finalize-pipeline-contract.test.ts` |
| Wave 4 — `triggerBuildErrorRepair` default ON i `development` + Vercel `preview`, default OFF i `production` via `isAutoRepairBuildErrorEnabled()`. Tidigare default OFF överallt — tysta vit-sida-buggar i dev när VM:en kraschade. | `src/lib/gen/verify/server-verify.ts`, `config/env-policy.json` |
| Docs-sync: glossary-rader för Verifier Pass, Validate-step (esbuild + warm tsc), Element Preservation Guard, SAJTMASKIN_AUTO_REPAIR_BUILD_ERROR. Pipeline-tabellen i `fas2-orchestration-and-build.md`. Mental-model-vs-actual-flow uppdaterad. Audit §2.1 + §3.1 markerade levererade. Backoffice `pages/preview.py` synkad. | `docs/architecture/glossary.md`, `docs/architecture/fas2-orchestration-and-build.md`, `docs/architecture/mental-model-vs-actual-flow.md`, `docs/reports/audit-2026-04-20-komplexitet-vs-varde/03-konsolidering-pipeline.md`, `backoffice/pages/preview.py` |

## Avklarat i etapp-pass (2026-04-20, efter hygien + bug-fix-pass)

| Vad | Var |
|-----|-----|
| **Etapp A — F2 quality-gate `build`-check (audit Tier S #7 / §1.5):** `qualityGateTiers.designPreview` uppdaterat till `["typecheck", "build"]` i manifestet + matchande default-fallback i `quality-gate-checks.ts`. Tester uppdaterade. Backoffice surfar nya policyn automatiskt (läser direkt från manifest). Audit §1.5 markerad DONE. | `config/ai_models/manifest.json`, `src/lib/gen/verify/quality-gate-checks.ts`, `src/lib/gen/verify/preview-quality-gate.ts`, `src/lib/gen/verify/server-verify.test.ts`, `src/lib/gen/verify/preview-quality-gate.test.ts`, `docs/reports/audit-2026-04-20-komplexitet-vs-varde/01-buggar.md` |
| **Etapp B — P29 Fas 1A: 18 v0-chat-routes borttagna (audit §3.4 partial):** Alla pure re-exports utan unique test-coverage. Halverar antalet `v0/chats/**/route.ts`-filer från 28 → 10. Verifierat: 1176/1176 tester gröna efter deletion. Fas 1B (10 routes med tester) deferras till dedikerad migration-session per `P29-v0-engine-consolidation.md`. | 18 borttagna `route.ts`-filer under `src/app/api/v0/chats/**`, kommentar-uppdatering i `src/lib/utils/image-validator.ts`, `docs/plans/active/P29-v0-engine-consolidation.md`, `docs/reports/audit-2026-04-20-komplexitet-vs-varde/03-konsolidering-pipeline.md` |
| **Etapp D — P29 Fas 1B: 10 v0-chat-routes med UNIQUE tester konsoliderade till engine-sidan + v0-chats-compat-modul borta:** Två parallella write-subagents migrerade test-assertioner (5 nya engine-test-filer, 5 utökade) innan jag raderade alla 20 v0-filer + `v0-chats-compat.ts`. `/api/v0/chats/**` är nu tom i runtime-trädet. Audit §3.4 stängd för chat-ytan. 1172/1172 tester gröna (-4 mot 1176 = duplikat-coverage som engine redan hade). Strategi: enkelhet + kvalitet utan att tappa behavioral coverage. | 5 nya `src/app/api/engine/chats/.../route.test.ts`, 5 utökade `src/app/api/engine/chats/.../route.test.ts`, 20 borttagna under `src/app/api/v0/chats/**`, `src/lib/api/engine/chats/v0-chats-compat.ts` borttagen |
| **Etapp F — P29 Fas 2 + audit-städning: P29 helt stängd:** Aktivt beslut att behålla 7 Class C-routes (`init-registry`, `integrations/vercel/projects`, `projects/instructions`, `projects/[id]/env-vars`, `deployments/*`) på `/api/v0/` — ingen rename. Motivering: routerna är canonical permanent URL för deras features, rename = kosmetisk risk utan värde. Dokumenterat i `engine-chats-path.ts` JSDoc + glossary + P29-plan. Audit §2.1 (P28-tabell) + §3.4 (v0/engine) + §2.4 (duplikatbug) markerade DONE. 00-README "Top-10"-tabell uppdaterad med status-kolumn. P29-plan flyttad till `docs/plans/avklarat/`. `useDeploymentStatus` "naming debt" avskriven som icke-skuld. | `src/lib/api/engine-chats-path.ts`, `docs/plans/active/P29-v0-engine-consolidation.md` → `docs/plans/avklarat/`, `docs/architecture/glossary.md`, `docs/reports/audit-2026-04-20-komplexitet-vs-varde/{00-README,01-buggar,03-konsolidering-pipeline}.md`, denna fil |
| **Etapp G — Tier A #8 verifierad som non-issue + kostnadsmatris-städning:** Mätte `npm run typecheck` cold vs warm — `incremental: true` redan i `tsconfig.json` (rad 18) ger 3.4× speedup utan ändringar (cold 27s → warm 8s). `tsconfig.tsbuildinfo` redan i `.gitignore`. Audit-rekommendationen att introducera `tsc --build` med `composite: true` skulle krocka med Next.js setup (`noEmit` + paths) utan mätbar vinst. Audit §1.3 markerad EFFEKTIVT KLART. Kostnadsmatris (`04-kostnadsmatris.md`) uppdaterad med Status-kolumn för hela Tier S + Tier A. **Tier S = 7/7, Tier A = 8/12** efter denna etapp. | `docs/reports/audit-2026-04-20-komplexitet-vs-varde/{02-forbattringar,04-kostnadsmatris}.md`, denna fil |
| **Etapp H — Auto-archive avklarade plan-filer + städning av P19/P20-status (audit Tier B #22 / §1.7):** Pragmatiskt script `scripts/plans/auto-archive.mjs` (dry-run default, `--apply` flag). Skippar `Kvarvarande-uppgifter.md` + `README.md` (levande listor); matchar prosa-status (`Status: DONE`/`Closed`/`Stängd`/`Avslutad`) istället för audit-rapportens YAML-frontmatter (vi har inte YAML i plan-filerna). Datum-tröskel slopad — vi har för få plan-filer. Plus städning: P19 Steg 2 markerad DONE (commit `72837c500`), P20 Nivå 1+2 markerade KLARA (Nivå 2 = shrink-leverans i commit `6c9b20b25`), audit `05-korplan.md` fick "Faktisk progress sedan rapport-datum"-sektion överst med commit-tabell. **Tier B = 1/13** efter denna etapp. | `scripts/plans/auto-archive.mjs` (ny), `package.json` (`plans:archive` + `:apply`), `docs/plans/active/{P19,P20}-*.md`, `docs/reports/audit-2026-04-20-komplexitet-vs-varde/{02-forbattringar,04-kostnadsmatris,05-korplan}.md`, denna fil |
| **Etapp K — Stort pass med 4 parallella write-subagents 2026-04-20:** (K.1 commit `bac91042b`) Ny Streamlit-page `backoffice/pages/observability.py` som parsar `/api/metrics` med stdlib `urllib.request`, visar P50/P95-cards, per-fas histogram, counter-tabeller, partial-file-repair-utfall. Helper `resolve_metrics_endpoint()` i `shared.py`. (K.2 commit `70b22f861`) Brief-cache i Redis 24h på `brief:v1:<modelId>:<chat>:<sha256-24>`, gated på `FEATURES.useRedisCache`, headers `X-Brief-Cache: hit\|miss\|skip`, counter `sajtmaskin_brief_cache_total`. Audit Tier B #20 DONE. (K.3 commit `d817227f6`) P19 Steg 1 ingress-telemetri: ny `incIngressEvent`-helper, wirad i `preview-session/route.ts` (reused-url branch) + `version-manager.ts` (followup-base resolution). Counter `sajtmaskin_ingress_event_total{type, reason}`. (K.4 commit `37decf766`) `npm run typography:validate-pairings` script + 4 tester. **Verklig violation funnen:** `Source_Sans_3` saknas i `google-font-registry.ts` men refereras av `editorial-serif.json` — lämnad att åtgärdas (produktbeslut om att lägga till font vs byta i variant). 14 nya tester totalt. Full suite 1214/1214. | Se per-commit-beskrivning ovan |
| **Etapp J — Stort pass med 3 parallella write-subagents 2026-04-20:** (J.1 commit `f7d33c640`) P50 prompt-to-done histogram `sajtmaskin_prompt_to_done_ms` med labels `{outcome, kind}`, wirad i `create-chat-stream-post.ts` (kind=init) + `chat-message-stream-post.ts` (kind=followup) via ny `src/lib/observability/prompt-to-done-stream.ts` (transparent `TransformStream` som byte-detekterar SSE `event: done`; try/finally i handler var inte möjligt eftersom done-frame emitteras djupt i nested streams efter handler redan returnerat Response). 10 nya tester (4 metrics + 6 stream-wrap). Audit Tier A #12 DONE. (J.2 commit `04ee54240`) Unified `allowed.models` i manifest.json + `getPromptAssistAllowedFromManifest()` som fallback-kompatibelt fält. Audit Tier B #23 DONE. Tier B #21 (data/dossiers gitignore) verifierat redan klart (git status -- data/dossiers/ tom). (J.3 commit `018b5bb36`) P19 Steg 4 — `source`-metadata (`timestamp`, `ageSeconds`, `stale`) i `/api/template`-respons + devLog vid stale. 3 nya tester i template-route. Full suite 1200/1200 grön. | Se per-commit-beskrivning ovan |
| **Etapp I — Prometheus/OTel observability-grund (audit Tier B #19 / §1.1):** `prom-client@^15` installerat. Två parallella write-subagents skapade `src/lib/observability/metrics.ts` (singleton-Registry, hot-reload-säker via `globalThis`) och `src/app/api/metrics/route.ts` (bearer-auth via `SAJTMASKIN_METRICS_TOKEN`, 503 vid disabled, 401 vid fel token, 200 + Prometheus text/plain vid rätt). Helpers `recordPhaseDuration / incFixerCall / incVerifierBlocking / incPartialFileRepair / incEarlyStop` exponerade. Wirad in i 3 strategiska punkter: `validate-and-fix.ts` (phase duration via try/finally + alla 6 early-stop-rader får `incEarlyStop`), `verifier-pass.ts` (phase duration + per-finding `incVerifierBlocking` på `recordOnExit`-helper), `finalize-version.ts` (`incPartialFileRepair("success"|"fail")` på `triggerPartialFileRepair`-utfall). Alla call-sites fail-safe (`try { ... } catch {}` så telemetri aldrig bryter codegen). 17 nya tester, full suite 1189/1189 grön. Token-key dokumenterad i `config/env-policy.json`. **Avlåser audit Tier A #12 (P50 metric) och #16 (early-stop-inventering)** + ger §3.1-data om FORCE_BLOCKING_IDS. | `src/lib/observability/{metrics,metrics.test}.ts` (nya), `src/app/api/metrics/{route,route.test}.ts` (nya), `src/lib/gen/autofix/validate-and-fix.ts`, `src/lib/gen/verify/verifier-pass.ts`, `src/lib/gen/stream/finalize-version.ts`, `config/env-policy.json`, `package.json`, `docs/architecture/glossary.md`, `docs/reports/audit-2026-04-20-komplexitet-vs-varde/{02-forbattringar,04-kostnadsmatris}.md`, denna fil |

## Avklarat i hygien + bug-fix-pass (2026-04-20, efter Fas 2/3-leverans)

| Vad | Var |
|-----|-----|
| **Bug-fix:** `validateAndFix`-loop:en kör nu LLM-fixern på alla pass inom budget. Tidigare låg `gave-up`-grenen *före* fixer-blocket på sista pass, vilket gjorde fixern dead code när `pass === SYNTAX_FIX_MAX_PASSES` (och helt oåtkomlig om `syntaxFixPasses: 1`). Regress-test pinar att fixern triggas alla 4 passes. | `src/lib/gen/autofix/validate-and-fix.ts`, `src/lib/gen/autofix/validate-and-fix.test.ts` |
| **Bug-fix:** `selectCandidates()` i community-registry-fetch använder DJB-hash av `prompt::sectionType::namespace` istället för `Math.random()`. Samma prompt → samma section-recipes över reruns; sluter en nondeterminism-läcka i en annars deterministisk pipeline. | `src/lib/gen/data/community-registry-fetch.ts`, `src/lib/gen/data/community-registry-fetch.test.ts` |
| **Bug-fix (P19 ingress 1):** `updateVersionFiles()` nollställer nu `preview_url`. Tidigare kunde `/files`-mutationer maskeras av att nästa preview-session-request kortslöt till `startOutcome: "reused_url"` mot stale tier-2 VM-snapshot. | `src/lib/db/chat-repository-pg.ts` |
| **Audit Tier S #3:** Manifest-schema synkat — `qualityGateTiers.required` följer nu runtime (`["designPreview", "integrationsBuild"]`), inte pre-konsoliderings-namnen. Audit-rapporten pekade på `docs/schemas/strict/manifest.schema.json` (existerar inte); kanoniska schemat är `config/ai_models/manifest.schema.json`. Audit §1.6 markerad DONE. | `config/ai_models/manifest.schema.json`, `docs/reports/audit-2026-04-20-komplexitet-vs-varde/01-buggar.md` |
| **Audit Tier S #10:** Filnamn-typo: `docs/övergipande-vision-och-mål.md` → `docs/övergripande-vision-och-mål.md`. ÅÄÖ-policy: behåll svenska tecken i docs-filnamn. Audit §1.4 markerad DONE. | `docs/övergripande-vision-och-mål.md` |
| **Audit Tier S #4:** ESLint `--cache --cache-location .eslintcache` på `lint`/`lint:fix`/`lint:watch`. Cache i `.gitignore`. 5–10× snabbare lokal lint. | `package.json`, `.gitignore` |
| **Audit Tier A #11:** `preflight:common` extraherad (`check-systemprompt && check-lucide-icons`), delas av `predev` och `prebuild`. Lucide-icon-check körs nu i dev också — asymmetrin som var källan till audit-bug §1.5/Tier A #11 är borta. | `package.json` |
| Glossary + fas2-orchestration-and-build synkade: `Validate-step`-entry, ny entry `Preview-URL invalidation (P19 ingress 1)`, ny entry `Community registry block selection (deterministic)`. | `docs/architecture/glossary.md`, `docs/architecture/fas2-orchestration-and-build.md` |

## Avklarat i konsolideringspass (2026-04-20)

| Vad | Var |
|-----|-----|
| P22b core wiring: `chatId` + `followUpIntent` + `priorQualityTarget` skickas in i `OrchestrationInput` på follow-up-grenen, så `inheritQualityTargetFromPriorVersion` och `lockedVariantForFollowUp` aktiveras runtime istället för att vara dead code. `priorQualityTarget` hämtas från `engineChat.orchestration_snapshot.buildSpec.qualityTarget` och valideras mot union-typen innan användning. | `src/lib/api/engine/chats/chat-message-stream-post.ts` |
| P28 #6 lint-fix: `prefer-const` på `workingCode` i `font-import-fixer.ts:45`. | `src/lib/gen/autofix/rules/font-import-fixer.ts` |

## Avklarat denna session (2026-04-15)

| Vad | Commit |
|-----|--------|
| Repair/verify worldclass-pass: delad `runRepairLoop`, warm repair (targeted filer + imports) | 2026-04-15 |
| Quality-gate tiers flyttade till `manifest.json` (`qualityGateTiers`) | 2026-04-15 |
| Partial-file repair: manifeststyrt antal försök + `partial-file-repair.outcome` telemetry | 2026-04-15 |
| Transparent serverrepair: `repair_available`, `repaired_files_json`, `accept-repair` API, SSE `version-repair-available` | 2026-04-15 |
| Auto-accept timeout för pending repair via `repairAcceptTimeoutMinutes` | 2026-04-15 |
| Structured repair context: `RepairErrorManifest` med filgruppering + beroendeprioritering | 2026-04-15 |
| Preview-host verify: primär install utan `--legacy-peer-deps`, fallback endast vid peer-konflikt | 2026-04-15 |
| Preview-host verify: fingerprint-baserad `node_modules`-delning live↔verify (`install-cache-share`) | 2026-04-15 |
| jsx-checker: `import type { … }` räknas nu som import — undviker lucide/Three `Group`-kollision | 2026-04-15 |
| P17: Unsplash felklassning (401/429/network/timeout) | `e75325c9d` |
| Font-register: 75 Google Fonts, autofix whitelist, importnamn i prompt | `c28be72db` |
| Scaffold-aware komponentpool (`## Your Toolkit` per scaffold) | `65921ac53` |
| `BUILD_INTENT_GUIDANCE` dubblett löst (extraherad till `intent-guidance.ts`) | `b89147172` |
| Scaffold-specifik toolkit + komponentpool per scaffold | `65921ac53` |
| WSS/HMR till Fly — löst (stabil) | redan i drift |
| P18: Landing-varning verifierad och stängd (Three/Fiber Clock-deprecation) | denna session |
| Template-library pipeline: hydrate repo-cache | redan i drift |
| Dossier-manifests: `recommendedScaffoldFamilies` → `recommendedScaffoldIds` | redan i drift |
| Schema-docs uppdaterade (README, scaffold-contract, glossary) | `7bdcc766c`, `5001347af` |
| Planfiler konsoliderade, `halvfärdiga_filer/` borttagen | `fb53a87ea` |

## Strykt (bekräftat inte uppgifter)

- ~~Fallback-guidance (MOTION/VISUAL/QUALITY)~~ — aktiv motion-inference-logik, inte ett problem att fixa
- ~~Konsolidera dashboards~~ — redan gjort: `sajtmaskin_backoffice.py` → `backoffice/` (legacy-stubbar forwärdar)
- ~~themeTokens aktivare i prompten~~ — redan aktiv via `formatThemeTokenLines()` i `system-prompt.ts`
- ~~Keyword taxonomy consolidation~~ — keywords kan fasas ut helt
- ~~Cart-provider cross-file-kedja~~ — låg prio, möjligen löst
- ~~Nya scaffolds~~ — inte aktuellt
- ~~Template guidance v1.75 / v2~~ — struket, konceptet dokumenterat
- ~~`searchTemplateLibrary()` oanvänd~~ — ingår i ovan

## Noterat (inte uppgifter)

- **Landing-page variant audit (2026-04-18, 20 prompts, embeddings on)** — körs via `npx tsx scripts/scaffolds/eval-landing-variants.ts`, full data i `data/scaffold-eval/reports/landing-variant-latest.json`.
  - Vinster: `nature-flow=7`, `bold-startup=6`, `warm-local=4`, `editorial-lux=3`, `corporate-grid=0`.
  - Körplan-frågan "behövs både `nature-flow` och `warm-local`?": **ja**, båda vinner cases. Inga av dem kandidat för borttagning.
  - **Oväntad signal:** `corporate-grid` (default-varianten för landing-page, `default: true`) vann 0 av 20 — inkl. de 4 prompts som var explicit kuraterade för B2B/byrå/finans/professional. Embedding-pickern verkar systematiskt välja `bold-startup` eller `warm-local` istället. Ej kandidat för borttagning ännu (default-rollen kvarstår), men candidate for further investigation: variant-embeddings för `corporate-grid` vs prompts kan behöva regenereras eller hints justeras. Spåras inte som öppen punkt — auditen är beviset, ingen åtgärd schemalagd.
- **Landing-page variant uplift (2026-04-18)** — alla 5 landing-varianter har nu en alternativ `fontPairings`-entry så Brief-LLM får valfrihet. `editorial-lux` fick `bodyBackgroundImage` (radial guld-glow) för att matcha sin "atmospheric, premium contrast"-motif som tidigare ramlade ut platt-svart. `system-prompt.ts` renderar nu (a) `Import names` för **alla** pairings (tidigare bara första — modellen visste inte hur den importerade alternativet) och (b) `bodyBackgroundImage` som en explicit "apply on `body { background-image: ... }` in `app/globals.css`"-recipe i stället för en stray CSS-token-rad.
- `@/hooks/use-mobile` och `@/hooks/use-toast` behålls som bakåtkompatibel fallback.
- `useDeploymentStatus` använder `/api/v0/` — **ej naming debt** (P29 Fas 2-beslut 2026-04-20: `/api/v0/deployments/*` är canonical permanent URL för Class C-routes; rename till `/api/legacy/v0/*` skulle vara kosmetiskt med deploy-koordineringsrisk utan funktionellt värde).
- `useIntegrationStatus` har `previewUrl` i dependency-array för re-trigger (funktionellt korrekt).
- Fas 2 worldclass-pass är genomfört (kod + docs + schemas + backoffice sync).
- P18 är nu stängd: varningen var Three/Fiber deprecation (inte bekräftad hydration-bugg i egen kod).
- PartialFileOutputError har nu en retry-mekanism (1 LLM-repair-försök, 60 s timeout) istället för hård abort.
