# Sajtmaskin — kvarvarande uppgifter (kanonisk lista)

Senast uppdaterad: 2026-04-20 (LLM-flöde Fas 2/3-leverans: Wave 1 strukturella drops i SSE + pre-VM typecheck-fixer hardening + golden-test fixture; Wave 2 verifier-fynd matas in i `runLlmFixer`; Wave 3 `pre_vm_typecheck` sammanslaget i `validate_syntax` (audit §2.1 stängd, §3.1 alt 4 levererad); Wave 4 `SAJTMASKIN_AUTO_REPAIR_BUILD_ERROR` default ON i dev/preview. Backoffice `pages/preview.py` synkad till nya validate-steget. Tidigare: P27-validator A+B+D körda; P22b caller-wiring; P28 #6 lint-fix. P25b och resten av P28 stannar som känd skuld nedan.).

## Öppna punkter

| # | Område | Beskrivning | Prio | P-fil |
|---|--------|-------------|------|-------|
| 1 | shadcn | Nivå 2: Blocks-metadata / section recipes — undersök om upstream `registry:block` kan bli sektionsval i generatorn | Medel | P20 |
| 2 | shadcn | Nivå 3: `registry:font` — konsolidera upstream font-format med nuvarande `fontPairings` + `google-font-registry.ts` | Medel | P20 |
| 3 | Ingress | Old-content ingress hardening — bevisa ingresspunkter, sedan små fixar | Medel-hög | P19 |
| 4 | Eval | Automatisk baseline-uppdatering (CI/script för eval-svit) | Låg | — |
| 5 | UX polish | VersionHistory-tooltips ("Verifying"/"Fel" badges) + mjuk "promoted"-badge + `VersionMismatchOverlayPayload` overlay-rendering i `PreviewPanelFrame.tsx`. Kräver visuell verifiering. Tidigare spårad som P25b — plan-fil borttagen i konsolidering, scope kvar. | Låg | — |
| 6 | Hygien-städ (rest av P28) | 7 pre-existing test-failures: env-encryption fail-closed (`project-env-vars.test.ts`), route × 2 (`v0/chats/[chatId]/route.test.ts`), preview-status × 2 (`v0/...preview-status` + `engine/...preview-status`), två stream-route-tests (mock-drift: behöver `createOwnEnginePipelineAndGenerationStream` + `tryGenerateServerAutoBrief` mockade). Plus schema-mismatch i `qualityGateTiers` (`docs/schemas/strict/manifest.schema.json`) och engine-test isolation (`engine.test.ts` failar i full suite men passerar standalone — `vi.resetModules()` saknas i någon av P22/P23/P26:s nya test-filer). Lint-felet `font-import-fixer.ts:45` är fixat (konsolidering 2026-04-20). | Låg | — |

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
- `useDeploymentStatus` använder `/api/v0/` (naming debt, ej trasigt).
- `useIntegrationStatus` har `previewUrl` i dependency-array för re-trigger (funktionellt korrekt).
- Fas 2 worldclass-pass är genomfört (kod + docs + schemas + backoffice sync).
- P18 är nu stängd: varningen var Three/Fiber deprecation (inte bekräftad hydration-bugg i egen kod).
- PartialFileOutputError har nu en retry-mekanism (1 LLM-repair-försök, 60 s timeout) istället för hård abort.
