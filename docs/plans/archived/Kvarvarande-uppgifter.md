# Sajtmaskin — kvarvarande uppgifter (kanonisk lista)

> **Historik (superseded 2026-07-07):** Detta är en frusen wave-logg. LLM-flödets sanning ligger nu i [`../../architecture/llm-pipeline.md`](../../architecture/llm-pipeline.md); buggsanning i [`../../../BUG-SWARM-BACKLOG.md`](../../../BUG-SWARM-BACKLOG.md). Länkar nedan till `omtag-2026-04-23/`, `status-archive/`, `docs/reports/` och `2026-04-28-llm-flode-startlinje.md` pekar på filer som konsoliderats bort — använd git-historik vid behov.

Senast uppdaterad: 2026-05-01 efter LLM-plan-konsolidering och VersionHistory-statuspass. Tidigare: 2026-04-23 efter OMTAG-waven (11 uppdrag mergade), 2026-04-22 efter LLM-flow-audit + follow-up-pass. **Tier S = 7/7, Tier A = 9/12, Tier B = 5/13.** Se [`../avklarat/omtag-2026-04-23/status/STATUS-2026-04-23-omtag-complete.md`](../avklarat/omtag-2026-04-23/status/STATUS-2026-04-23-omtag-complete.md) + [`../../status-archive/STATUS-2026-04-20.md`](../../status-archive/STATUS-2026-04-20.md) + [`../avklarat/omtag-2026-04-23/`](../avklarat/omtag-2026-04-23/) för fullständig wave-sammanfattning + Linear-projektet [Sajtmaskin-skuld 2026-04-20](https://linear.app/sajtmaskin/project/sajtmaskin-skuld-2026-04-20-1f82a9728a0a).

## Roll efter LLM-plan-konsolidering 2026-05-01

Den här filen är **tvärgående kö** för rester som inte ryms i en smal LLM-plan. För LLM-flödet är numera [`../../architecture/llm-pipeline.md`](../../architecture/llm-pipeline.md) kanonisk källa (den gamla masterplanen `2026-04-28-llm-flode-startlinje.md` är konsoliderad bort). `BUG-SWARM-BACKLOG.md` äger buggstatus; den här filen äger bara exekveringsordning när en backloggrad blir ett konkret arbetsspår.

## Avklarat i OMTAG-waven (2026-04-23)

11 uppdrag över 9 agenter i 3 faser. Kärnresultat: 4 monoliter splittade (system-prompt.ts, build-spec.ts, promptAssist.ts, finalize-version.ts → paket), eval-baseline etablerad, 11 env-flaggor borta, dossier-AJV-validator wire:ad, scaffold-default-block för app/page.tsx ("Nordic Future Summit"-klassen), follow-up-predicate konsoliderad, unified status event-bus, content-site→landing-page merged. Detaljer + kördokument: [`../avklarat/omtag-2026-04-23/meta/INDEX.md`](../avklarat/omtag-2026-04-23/meta/INDEX.md). Slutrapport med +delta mot gpt-rapport: [`../avklarat/omtag-2026-04-23/status/STATUS-2026-04-23-omtag-complete.md`](../avklarat/omtag-2026-04-23/status/STATUS-2026-04-23-omtag-complete.md).

## Avklarat i LLM-flow-audit + follow-up (2026-04-22)

Triage av 8 parallella audit-rapporter → 13 verifierade buggar fixade, 11 var by-design eller doc-drift. Sedan ett follow-up-pass där 5 nya agentrapporter triagerades mot master efter fixarna.

**Commit a35eaa05e — första fix-vågen:**

| Område | Vad |
|---|---|
| Orkestrering | UI Recipes använder nu `intentSourcePrompt` istället för wrappad `prompt`; `scaffold_drift`/`scaffold_unknown_brief_nomination` loggar `resolvedMode`; init fick `routePlanPrompt`+`buildSpecPrompt`+`contractsPrompt`+`scaffoldMatchPrompt` precis som follow-up; plan mode fick `engineModelId`+`lifecycleStage`; `buildFollowUpBriefFromSnapshot` rehydrerar `visualDirection.styleKeywords` + `toneAndVoice`; `effectiveInitRouteCount` respekterar `isFirstCodeGeneration`. |
| Intent-klassning | Alla svenska `\b`-regex i `follow-up-clarification.ts` och `request-kind.ts` konverterade till Unicode look-arounds; `MULTI_CHANGE` tog emot cardinalen `tre` (typo `trea` fixad); refine-patterns fick bare `byt`; specific-targets fick `rubrik/title/headline`. |
| Verifier-pass | `checkUndefinedJsxSymbols` registrerar nu TS generic type params (`<T>`, `<TData, U extends X>` etc.); `lazy(`-bailout smalnades till `React.lazy` eller `lazy` importerat från `react`/`react-dom`. |
| Fixer-fallback | `server-verify.ts` använder nu `DEFAULT_MODEL_ID` när chat-modell inte mappar till canonical tier. |
| Docs + backoffice | `llm-signal-flow.md` speglar `buildFollowUpBriefFromSnapshot` + canonical `BUILD_INTENT_GUIDANCE`; `quality-gate.md` beskriver verifier-pass som hybrid; `backoffice/pages/preview.py` + `_ops_impl.py` uppdaterade. |

Rapportsammanfattning: `audit-reports/2026-04-22-llm-flow/SUMMARY.md`.

**Commit 8de85797b — Unicode-regex-grundinfrastruktur:**

| Vad | Fil |
|---|---|
| Canonical helper: `uWord`, `uWordRegex`, `containsUnicodeWord`, `escapeRegexLiteral` + `UNICODE_WB_LEFT`/`RIGHT` | `src/lib/utils/unicode-word-boundary.ts` (+ 11 tester) |
| Cursor-regel som varnar framtida agenter | `.cursor/rules/unicode-regex.mdc` |
| Preflight-guard — failar om `\b` sitter direkt bredvid icke-ASCII-bokstav | `scripts/dev/check-unicode-regex.mjs` (inkopplad i `preflight:common`) |
| Fixar sista kvarvarande riktiga bugg: `\bnaturmiljö\b` + `\bklippmiljö\b` | `src/lib/images/unsplash-query-fallback.ts` |

**Follow-up-commit (denna session) — 5 nya audit-rapporter triagerade:**

Av ~15 nya fynd från 5 parallella agenter var 7 äkta buggar, resten dubbletter/design-val/missförstånd (se "Fynd som inte är buggar" nedan).

| Fix | Fil |
|---|---|
| Plan mode (init) fick samma rå-signalpaket som huvudflödet (`routePlanPrompt`+`buildSpecPrompt`+`contractsPrompt`+`scaffoldMatchPrompt`+`capabilitiesPrompt`) | `src/lib/api/engine/chats/create-chat-stream-post.ts` |
| Plan mode (follow-up) fick `contractsPrompt`+`scaffoldMatchPrompt`+`capabilitiesPrompt` + snapshot-brief-hydrering via `buildFollowUpBriefFromSnapshot` | `src/lib/api/engine/chats/chat-message-stream-post.ts` |
| `fixerModel` fallback till `DEFAULT_MODEL_ID` i alla 4 kvarvarande callsites (partial-file-repair, verifier-fixer, tsc-fixer, eslint-fixer, syntax-fixer) | `src/lib/gen/stream/finalize-version.ts` + `src/lib/gen/autofix/validate-and-fix.ts` |
| P32-kommentaren i `orchestrate.ts` förtydligad att `requestKind` är medvetet inaktiv tills Fas B | `src/lib/gen/orchestrate.ts` |
| `flytta`/`change`/`move` tillagda i refine-patterns (engelska + svenska layout-edits) | `src/lib/providers/own-engine/follow-up-clarification.ts` |
| Shell-page-generator: ogiltig JS-identifierare om titel börjar med siffra (`3DPage` → `Page3D`); catch-all-route preview-URL (`/blog/...slug` → `/blog/example`) | `src/lib/gen/stream/finalize-preflight/shell-pages.ts` |
| `domainProfile` rehydreras nu som slug-string istället för object så `system-prompt.ts`+`guidance-resolvers.ts` faktiskt ser domain-override från init→follow-up | `src/lib/gen/orchestration-snapshot.ts` |

**Fynd som inte är buggar (återkommer i rapporter, dokumenteras här så triage inte måste göras om):**

- `P32 requestKind` når inte `deriveBuildSpec` — **by design, Fas A only.** Se `P32-request-type-taxonomy.md`. Kommentaren i `orchestrate.ts` är nu förtydligad.
- `classifyFollowUpIntentWithLlmFallback` ej inkopplad i runtime — **deliberate feature-flag**, planerat för P32 Fas F.
- `inferContextPolicy`/`inferVerificationPolicy` använder inte `isFirstCodeGeneration` — **designval**; `isEffectiveInit` är medvetet begränsat till route-realization. Bredare semantik kräver aktivt designbeslut.
- `fixerTier = originatingTier ?? DEFAULT_MODEL_ID` i `server-verify.ts` — **intentional**, bättre än `undefined`.
- `useCreateChat` skickar rå prompt till streamen oavsett om brief finns eller inte (sedan 2026-04-28; mekaniska wrappern togs bort eftersom Core Rules + ev. brief redan bär semantiken). `formatPrompt()` lever vidare i prompt-wizard och prompt-assist/runner, men inte i create-chat-init-vägen.
- Flaky 1/863 i `warm-eslint.test.ts` under bred parallell testsvit — känd race, passerar isolerat; inte relaterat till LLM-flödet.
- `"Byt bild till en elefant. Gör också hela bakgrunden mörk"` → `clear-redesign` — **design call** (verb+noun-combo med `bakgrund`).

## Avklarat i cleanup-wave pass 1+2 (2026-04-22)

Kirurgisk uppföljning ovanpå den halvmergade 2026-04-21-waven (PR #81), körd direkt mot dagens master utan konflikter.

| Commit | Vad | Varför |
|---|---|---|
| `refactor(cleanup/P2)` | Spec-first-kedjan borttagen: `/api/ai/spec`-route, `WebsiteSpec`/`SajtmaskinSpec`-typer + schema, `processPromptWithSpec`/`briefToSpec`/`promptToSpec`, `SPEC_MODEL`/`DEFAULT_SPEC_MODEL`/`DEFAULT_SPEC_MODE`, `SAJTMASKIN_SPEC_MODEL` + `SAJTMASKIN_MAX_AI_SPEC_PROMPT_CHARS` env-keys, `briefing.specModel` i manifest + schema + zod + parity-test, `MAX_AI_SPEC_PROMPT_CHARS` export, `specMode`-query i kostnadsfri-page, `DEFAULT_SPEC_MODE`-state i useBuilderState, `spec-route` i model-trace, Streamlit-input i `backoffice/pages/ai_models.py`. `promptAssistContext.ts` 440 → 70 rader. | Hela kedjan markerad "borttagen" i glossary sedan Fas 1 världsklass men levde kvar som dödkod. Deep Brief är enda pre-generation-expansionen. |
| `refactor(cleanup/P5)` | Fyra dormant FEATURES-flaggor hårdkodade ON: `useBuildSpec`, `useLightweightScaffoldSerialization`, `useFollowUpLightContext`, `useFinalizeDeepPath`. Tog bort `isBuildSpecEnabled()`-helper och SSE-meta-fältet `buildSpecEnabled` (3 callsites, 0 readers). 4 env-keys bort ur `env.ts` + `env-policy.json`. | Off-grenen flippades aldrig i produktion. |
| `chore(cleanup/P1)` | `pendingSpecRef` bort (alla writes var `null`, reader branchade bort alltid false) — tråd genom 4 builder-hooks. `SPEC_FILE_INSTRUCTION` bort (noll callers). | Dödkodsrester från spec-first-borttagningen. |
| `docs(cleanup/S3)` | 17 `~~strikethrough~~`-rader rensade ur glossary-huvudtabellerna (Fas 1/Fas 2/Fas 3/preview). Legacy-sektionen expanderad med allt från denna wave. | Mindre brus när man slår upp kanoniska termer. |
| `chore(cleanup/knip)` | Downgraded intra-file-exports: `LEGACY_ALIAS`, `LEGACY_MODEL_IDS`, `EMPTY_VERIFIER_FINDINGS`, `promoteForcedBlockingFindings`, `isAutoRepairBuildErrorEnabled`. Raderade dead exports: `getPromptAssistModelOptions`, `resolvePlanModePlannerModelId`, `_resetTier3DenyCacheForTests`, `isServerVerifyInFlight`. | Knip-driven dead-export-purge på dagens master. |
| `refactor(cleanup/P3)` | `legacyShimPreviewUrl`-fältet borttaget ur API-kontrakt + typer + UI-callers + test-fixtures. Servern satte alltid fältet till `null`, klienter läste det aldrig meningsfullt. Shim-preview-rutten (`/api/preview-render`, env-flaggad) är oförändrad. | Död API-kontrakt. 9 filer. |
| `docs(cleanup/P6)` | Docs-sync: `legacyShimPreviewUrl`-raden rensad ur preview-sektionen i glossary. | Speglar koden. |

Typecheck 0 fel, lint 0 fel, 1417/1417 tester gröna efter varje commit. Branchen: `cursor/cleanup-pass1-all` (PR #84 mot master).

**Aktivt skippat denna wave** (semantisk konflikt-risk mot dagens master): `P7/R2` (system-prompt.ts split), `S1/T2` (build-spec.ts split), `U1/U2` (promptAssist.ts dedupe/extract), `R3/R3+` (finalize-version.ts split). Dessa filer har master-ändringar som skulle kräva semantisk hand-merge; principerna kan appliceras inom framtida commits när någon ändå rör de filerna.

## Öppna punkter (smal lista)

| # | Område | Beskrivning | Prio | Blocker |
|---|--------|-------------|------|---------|
| 1 | UX (P25b-rest) | VersionHistory-tooltips/statuslabels ("Verifierar"/"Fel"/"Publicerad") + `VersionMismatchOverlayPayload`-konsument/render-path finns (`usePreviewSession` → `BuilderShellContent` → `PreviewPanelFrame`); kvar är visuell verifiering av badge/overlay-layout. | Låg | Visuell verifiering — [SAJ-23](https://linear.app/sajtmaskin/issue/SAJ-23) |
| 2 | ~~Ingress (P19 Steg 3)~~ | ~~UX-transparens vid follow-up-bas != latest.~~ **Klart via OMTAG fas 2·A 2026-04-23** (amber basversions-badge i chat-composer). | — | — |
| 3 | Eval | ~~Automatisk baseline-uppdatering (CI-script för eval-svit). Grund etablerad via OMTAG fas 0·02; CI-gate kvar.~~ **Klart 2026-04-24:** veckovis `eval-baseline-update.yml` (måndag 04:11 UTC) kör `cli.ts --gate --save-baseline` och öppnar draft-PR vid förbättring. **Backoffice klart 2026-04-27:** `Overhead → Eval` kan köra `npm run eval:gate` manuellt och sparar datumstämplade rapporter i `docs/evals/` utan att uppdatera baseline. PR-triggered eval:gate saknas medvetet (kostnad). Lokalt `npm run eval:baseline` är nu också `--gate --save-baseline` (förhindrar att råka commita regression). Se `src/lib/gen/eval/README.md`. | — | — |
| 4 | Pre-existing test failures | 4 fail på master (phase-routing 3, model-selection 1) — inte rörda. **Dossier-failet borta 2026-04-20** efter v2-refactor. | Medel | Egen PR |
| 5 | shadcn (P20 Nivå 3) | Uppströms `registry:font`-ingestion (fullt format). CI-MVP-validering klar 2026-04-20. | Låg | Inte blockerande |
| 6 | shadcn (P20 Nivå 2) | Uppströms `registry:block`-integration (fullt format). Deterministic-pick shrink-leverans klar 2026-04-20. | Låg | Inte blockerande |
| 7 | ~~E3 — recurring quality-patterns~~ | **Klart i dev/follow-up:** verifier-fynd aggregeras nu in i `fix-patterns.json`; `renderRecurringFailuresBlockLines(chatId)` läser `logs/site-observability/<chatId>/latest/fix-patterns.json` och injiceras via route-plan-blocket när `FEATURES.recurringPatternsInMainPrompt` är aktiv. Tester: `generation-log-writer.test.ts`, `system-prompt-recurring-failures.test.ts` + `sections/route-plan.test.ts`. Prod-on är separat produktbeslut/eval-gate. | — | — |
| 8 | **P26-rest: PR3–9** | Kvarstående från ursprungliga P26-paketet efter OMTAG fas 2·A (se OMTAG-arkivet `../avklarat/omtag-2026-04-23/meta/INDEX.md` och arkiverad P26-sammanfattning): PR3 quality-gate readiness probe (HEAD 200 innan gate startar), ~~PR4 HMR-spam mitigation~~ **klart 2026-04-23** via inline RFC 6455 101-handshake i `proxyPreviewUpgrade` (404-stubben visade sig trigga HMR-klientens retry-loop; handshake-and-hold tystar konsolen), PR5 raw-message logging, PR6 `Bygg integrationer` UX-copy, PR7 backoffice scaffold_lifecycle FileNotFound fix, PR8 dossier re-embed (delvis gjord via fas 2·B variant-embeddings), PR9 three-fiber-dossier (kan redan finnas i `soft/three-fiber-canvas`). | Låg–Medel per PR | Individuell |
| 9 | **Core-simplification: `orchestrate.ts`** | `route-plan` är redan paket (`src/lib/gen/route-plan/{index,route-plan-builder,route-plan-parse,route-plan-verify,...}.ts`). Kvarvarande core-split v2 gäller främst `src/lib/gen/orchestrate.ts` (~965 rader) + ev. mindre helper-extraktionar där call-sites är tydliga. | Medel | Egen agent-session |
| 10 | **Core-simplification: `config/ai_models/manifest.json`** | ~1023 rader. Delningskandidat per phase-routing-grupp. | Låg | Telemetri-data |
| 11 | **Event-bus UI-flip (spår A) + UX-copy-konsolidering (spår B)** | Delvis hårdat 2026-05-01: `VersionHistory` skiljer runtime/preview-badge från verifieringsbadge (`Design redo`/`Verifierar`/`Verifierad`). **Backend/read-path klar 2026-05-01:** `version.degraded` event + `degradations[]` på `VersionStatus` (commit `6b139fb5a`), `GET /api/engine/chats/[chatId]/version-status` + `useVersionStatus`-hook (commit `448102f53`). Två emitterar wireade: `verifier_skipped_by_policy` + `product_postcheck_skipped` (inkl. runtime_error-grenen). Kvar i **spår A (consumer cut-over)**: `BuilderShellContent`/`VersionHistory` läser fortfarande DB-helper `resolveEngineVersionDisplayStatus` — flip till `useVersionStatus` per-komponent när UX-mappning av `phase + degradations[]` → labels är klar. Kvar i **spår B (copy/städ)**: konsolidera F2/F3-ordval i [`2026-05-01-f2-f3-ux-copy-konsolidering.md`](./2026-05-01-f2-f3-ux-copy-konsolidering.md). | Låg–Medel | — |

> Tidigare punkt #1 (`Source_Sans_3`-violation) löstes 2026-04-20 i cloud-loopen, commit `808735e2`.

### UX-statusspår A/B (operativ split)

| ID | Klassning | Kräver ny backend-signal först? | Ägare |
|---|---|---|---|
| `G#32` + #11 | Produkt/UX-status (preview vs verifierad) | Nej (signal finns), men UI-flip krävs | #11 spår A |
| `G#35` | Degraded UX | Backend klar 2026-05-01 (`version.degraded` + `degradations[]`); UI-konsument kvar | #11 spår A (UX-mappning + flip) |
| `G#60` | Observability → UX | Backend klar 2026-05-01 (samma kanal som `G#35`) | #11 spår A (UX-mappning + flip) |
| `G#58` + `U#80` + `U#2` | Copy/terminologi | Nej för v1 | #11 spår B + copy-plan |

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

## Avklarat i LLM-flöde-audit 2026-04-21 (init/follow-up + env)

| Vad | Var |
|-----|-----|
| **A1+A2 (follow-up brief läckage)** — `extractBriefSummary` persisterar nu `requestedCapabilities` + `domainProfile`, ny export `buildFollowUpBriefFromSnapshot` återskapar minimal brief från snapshot, `chat-message-stream-post.ts` använder den när inline-brief saknas. Kapabilitetsdriven dossier-pick fungerar nu på follow-up (var noll dossiers innan). 5 nya tester, 32/32 relaterade tester gröna. | `src/lib/own-engine/session/own-engine-build-session.ts`, `src/lib/gen/orchestration-snapshot.ts`, `src/lib/gen/orchestration-snapshot.test.ts`, `src/lib/api/engine/chats/chat-message-stream-post.ts` |
| **Env-städ** — `.env.local` typo `_ASSE` → `_ASSERT=1`, raderade vestigials `LOG_PROMPTS`, `SAJTMASKIN_GENERATION_JOURNAL`, kommenterad `DEFAULT_SPEC_MODE`. Kommentar över `SAJTMASKIN_BUILD_SPEC_ENABLED` klargör att flaggan bara påverkar SSE-meta. | `.env.local` (gitignored, lokal) |
| **Plan-filer skapade** för fortsatt LLM-kedje-städning (E1–E7, M1–M4, L1–L3) + körlista som index. | `docs/plans/active/{E,M,L1,L2,L3}-*.md`, lokalt körlista i `.cursor/plans/` |

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
| **Etapp A — F2 quality-gate `build`-check (audit Tier S #7 / §1.5):** Historiskt levererat 2026-04-20, men **ersatt av 2026-04-23-policy**: `qualityGateTiers.designPreview` är nu `["typecheck"]` (build reserverat för F3 `integrationsBuild`). Backoffice surfar alltid aktuell policy via manifestet. | `config/ai_models/manifest.json`, `src/lib/gen/verify/quality-gate-checks.ts`, `src/lib/gen/verify/preview-quality-gate.ts`, `src/lib/gen/verify/server-verify.test.ts`, `src/lib/gen/verify/preview-quality-gate.test.ts`, `docs/reports/audit-2026-04-20-komplexitet-vs-varde/01-buggar.md` |
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
| **Bug-fix:** Community-registry-val använder DJB-hash av `prompt::sectionType::namespace` istället för `Math.random()`. Samma prompt → samma section-recipes över reruns; sluter en nondeterminism-läcka i en annars deterministisk pipeline. Logiken är numera absorberad i `shadcn-ui-recipes.ts`. | `src/lib/gen/data/shadcn-ui-recipes.ts` |
| **Bug-fix (P19 ingress 1):** `updateVersionFiles()` nollställer nu `preview_url`. Tidigare kunde `/files`-mutationer maskeras av att nästa preview-session-request kortslöt till `startOutcome: "reused_url"` mot stale tier-2 VM-snapshot. | `src/lib/db/chat-repository-pg.ts` |
| **Audit Tier S #3:** Manifest-schema synkat — `qualityGateTiers.required` följer nu runtime (`["designPreview", "integrationsBuild"]`), inte pre-konsoliderings-namnen. Audit-rapporten pekade på `docs/schemas/strict/manifest.schema.json` (existerar inte); kanoniska schemat är `config/ai_models/manifest.schema.json`. Audit §1.6 markerad DONE. | `config/ai_models/manifest.schema.json`, `docs/reports/audit-2026-04-20-komplexitet-vs-varde/01-buggar.md` |
| **Audit Tier S #10:** Filnamn-typo: `docs/övergipande-vision-och-mål.md` → `docs/övergripande-vision-och-mål.md`. ÅÄÖ-policy: behåll svenska tecken i docs-filnamn. Audit §1.4 markerad DONE. | `docs/övergripande-vision-och-mål.md` |
| **Audit Tier S #4:** ESLint `--cache --cache-location .eslintcache` på `lint`/`lint:fix`/`lint:watch`. Cache i `.gitignore`. 5–10× snabbare lokal lint. | `package.json`, `.gitignore` |
| **Audit Tier A #11:** `preflight:common` extraherad och delas av `predev`/`prebuild`; aktuell checkkedja ägs av `package.json` (`preflight:common`). Lucide-icon-check körs nu i dev också — asymmetrin som var källan till audit-bug §1.5/Tier A #11 är borta. | `package.json` |
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
<!-- Borttaget 2026-04-21: `recommendedScaffoldFamilies` / `recommendedScaffoldIds` är v1-fält och finns inte i v2-dossier-manifest (`docs/schemas/strict/dossier.schema.json`). Raden var stale. -->

| Schema-docs uppdaterade (README, scaffold-contract, glossary) | `7bdcc766c`, `5001347af` |
| Planfiler konsoliderade, `halvfärdiga_filer/` borttagen | `fb53a87ea` |

## Strykt (bekräftat inte uppgifter)

- ~~Fallback-guidance (MOTION/VISUAL/QUALITY)~~ — aktiv motion-inference-logik, inte ett problem att fixa
- ~~Konsolidera backoffice-ytor~~ — redan gjort: `sajtmaskin_backoffice.py` → `backoffice/` (legacy-stubbar forwärdar)
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
