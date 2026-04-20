# Sajtmaskin — kvarvarande uppgifter (kanonisk lista)

Senast uppdaterad: 2026-04-20 (9 etapper levererade: A) F2 build-check, B-F) P29 v0/engine helt stängd, G) Tier A #8 verifierat non-issue, H) auto-archive-script, I) Prometheus/OTel observability-grund (avlåser Tier A #12+#16). Tier S = 7/7, Tier A = 8/12 + 2 unlocked, Tier B = 2/13. P19 Steg 2 + P20 Nivå 1+2 levererade. P28 + P29 spår stängda. Aktiva spår nedan.).

## Öppna punkter

| # | Område | Beskrivning | Prio | P-fil |
|---|--------|-------------|------|-------|
| 1 | shadcn | Nivå 2 (Blocks → section recipes): **shrink-leverans 2026-04-20** — deterministic block-pick (DJB-hash istället för `Math.random`) i `community-registry-fetch.ts`. Fullt registry:block-integration ej levererad (subagent-rec: kräver inte). | Låg | P20 |
| 2 | shadcn | Nivå 3: `registry:font` — konsolidera upstream font-format med nuvarande `fontPairings` + `google-font-registry.ts`. Subagent-MVP: CI-script som validerar att alla `fontPairings` finns i registret (~4–8h). | Låg | P20 |
| 3 | Ingress | Old-content ingress hardening — Steg 2 klar 2026-04-20 (`preview_url` invalideras vid `/files`-mutation, ingress-punkt 1 stängd). Återstår: Steg 1 (telemetri på `reused_url`/`engineBaseVersionId`), Steg 3 (UI-transparens vid follow-up-bas != latest), Steg 4 (v0-import freshness-signal). | Medel | P19 |
| 4 | Eval | Automatisk baseline-uppdatering (CI/script för eval-svit) | Låg | — |
| 5 | UX polish | VersionHistory-tooltips ("Verifying"/"Fel" badges) + mjuk "promoted"-badge + `VersionMismatchOverlayPayload` overlay-rendering i `PreviewPanelFrame.tsx`. Kräver visuell verifiering. Tidigare spårad som P25b — plan-fil borttagen i konsolidering, scope kvar. | Låg | — |
| 6 | Hygien-städ (rest av P28) | **STÄNGD 2026-04-20** efter full vitest-körning: alla 7 ursprungliga P28-fails är gröna (env-encryption, route × 2, preview-status × 2, isolation × 2 — fixades organiskt av Wave 1-4 + dagens hygien-pass). Två stream-route-tests (mock-drift) fixade samma dag genom att lägga till `rejectedShrinks: []` + `rejectedStructural: []` i mock-objekten. Schema-mismatch i `qualityGateTiers` löst (kanonisk path: `config/ai_models/manifest.schema.json`). Lint-fel borta. **Slutläge:** 1176 tester totalt, 1176 passar. | — | — |
| 7 | API-yta | **DONE 2026-04-20:** P29 helt stängd. Fas 1A (18 testlösa v0-chat-routes) + Fas 1B (10 routes med migrerade tester + `v0-chats-compat.ts` borta) + Fas 2-beslut (7 Class C-routes på `/api/v0/` är canonical permanent — ej rename). Plan flyttad till `docs/plans/avklarat/P29-v0-engine-consolidation.md`. | — | — |
| 8 | F2 quality-gate | **DONE 2026-04-20:** `build`-check aktiverad i `qualityGateTiers.designPreview`. Fångar Next-runtime-fel före preview-iframe. +5–10 USD/mån. | — | — |
| 9 | Plans-arkiv | **DONE 2026-04-20:** `npm run plans:archive` (dry-run) + `:apply` (`git mv`) via `scripts/plans/auto-archive.mjs`. Hjälp för framtida agenter att hålla `docs/plans/active/` rensat. Audit Tier B #22 / §1.7. | — | — |
| 10 | Observability | **DONE 2026-04-20:** Prometheus/OTel-grund (`src/lib/observability/metrics.ts` + `GET /api/metrics`). `prom-client@^15`, singleton-Registry hot-reload-säker, helpers wirade i `validate-and-fix.ts` (phase + early-stop) + `verifier-pass.ts` (phase + per-finding blocking) + `finalize-version.ts` (partial-file-repair outcome). Token via `SAJTMASKIN_METRICS_TOKEN` (dokumenterat i `config/env-policy.json`). Audit Tier B #19 / §1.1. **Avlåser** audit Tier A #12 (P50 metric) och #16 (early-stop-inventering). | — | — |

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
