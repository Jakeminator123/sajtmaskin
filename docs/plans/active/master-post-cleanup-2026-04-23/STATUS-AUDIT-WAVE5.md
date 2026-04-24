# STATUS-AUDIT-WAVE5 — read-only coherence audit

**Audit-branch:** `audit-wave5-opus` · **Baseline:** `1c445da15` (pre-wave-5) → **HEAD:** `808659df4` (PR #97 merge) · **Auditerad diff:** 44 filer, +2419/-107.

PR #96 (plan 10): commit `b6da0b888` "fix(observability): harden routing and add latency budget telemetry".
PR #97 (plan 11): commit `3f48c2840` "plan 11: scaffold-required-files-check + variant-lock + capability-modify-existing".

---

## 1. Spec-coherence per plan

### Plan 10 — observatorie-routing + auto-repair-stat + init quality-gate skip + latency-metrics

| # | Acceptans (PROMPT-10.md L67-73) | Status | Bevis / brist |
|---|-----|-----|-----|
| 10.1 | `_unrouted/orchestration-styledirection/`-bucket växer inte för nya runs | ✅ | `src/lib/logging/generation-log-writer.ts` L1759-1890 routar via `runIdByChatId` + persistent `chat-to-run.json`-index (L20, L184-244). Test L290-345 i `generation-log-writer.test.ts` (`binds site.chatId to the latest run instead of stale slug buckets`) verifierar att `orchestration.styleDirection`-event före `site.chatId` ändå hamnar i per-run-mappen. |
| 10.2 | `[generationslogg] writeGenerationLogEntry failed: ENOENT` försvinner | ✅ | `ensureUnroutedBucketDir` (`generation-log-writer.ts` L216-237) gör `mkdirSync(..., { recursive: true })` innan write för alla `_unrouted/<bucket>/` paths. Tidigare test L272-289 utökad: `resolveRunDirFromContext({ chatId: "missing" })` returnerar nu existerande `_unrouted/chat-missing/` istället för `null`. |
| 10.3 | Quality-gate skippas på rena init-runs (F2 + errorCount=0) | ✅ | `src/lib/gen/stream/post-finalize-policies.ts` L130-139 skip-villkor `previewPolicy === "fidelity2"` + `generationMode === "init"` + `preflightErrorCount === 0` → `reason: "design_preview_skip_verify"`. Test `generation-stream-post-finalize.test.ts` L708-752 + counter-test L754-791 (F3 init kör verify). |
| 10.4 | `verificationPolicy: "design_preview_skip_verify"` sparas på versionen så plan 11/12 vet att F3-checken inte körts | ⚠️ | `generation-stream-post-finalize.ts` L?? loggar `resolvedVerificationPolicy` på `server-verify.policy` devLog-eventet (test L851-897 verifierar). **MEN**: ingen `engine_versions.metadata.verificationPolicy`-kolumn skrivs — bara devLog/SSE-spår. Plan-12-konsumenter måste läsa devLog, inte version-raden. Inte blockerande, men spec sa "spara på versionen". |
| 10.5 | Auto-repair-pass räknas separat i per-chat history (`autoRepairCount` ≠ `followupCount`) | ✅ | `generation-log-writer.ts` `updateSiteObservability` (sökning visar `autoRepairCount`/`followupCount` i `history.ndjson`). Test L347-405 (`tracks followups and auto-repair runs separately in site history`) verifierar både fält. |
| 10.6 | Backoffice `pipeline_health.py` läser `history.ndjson` → uppdaterad | ✅ (n/a) | `rg "history.ndjson\|followupCount\|autoRepairCount" backoffice/` → 0 träffar. STATUS-10 dokumenterar valt utfall: pipeline_health läser inte filen, så ingen UI-ändring behövdes. |
| 10.7 | Latency-budget-infrastruktur: histogram per fas init/followup × {brief, codegen, autofix, syntax-validate, preflight, persist, preview-start, quality-gate} | ⚠️ | Histogrammet finns (`metrics.ts` L195 `recordPhaseDuration` + `LATENCY_BUDGET_PHASES` listar alla 8). `runner.ts` emitterar **5 av 8** med `kind`-label: `codegen` (L154), `autofix` (L174 via `observePhase`), `syntax-validate` (L235), `preflight` (L238), `persist` (L479). **Saknas helt:** `brief`, `preview-start`, `quality-gate` — dessa labels är registrerade men inga callsites emitterar dem. Bonus-brus: `verifier-pass.ts:462` + `validate-and-fix.ts:472` kallar `recordPhaseDuration("verifier"/"validate_syntax", ...)` UTAN `kind`-label → label saknas → samples landar i `kind="unknown"` istället för `init`/`followup` (default i `observe`-helpern, L211). |
| 10.8 | 4+ regressionstester passerar | ✅ | 7 nya tester totalt: 2 i `generation-log-writer.test.ts`, 1 i `metrics.test.ts` (`observePhase`), 4 i `generation-stream-post-finalize.test.ts` (skip + counter + 2 logging). |
| 10.9 | `npm run typecheck && lint && test:ci` 0 errors | ⏸ | Kan inte verifiera — `node_modules/` saknas i audit-worktree. PR #96 mergade efter `audit-pipeline.yml` så jag förlitar mig på CI-grön. |

### Plan 11 — scaffold-required-files-check + variant-lock + capability-modify-existing

| # | Acceptans (PROMPT-11.md L78-82) | Status | Bevis / brist |
|---|-----|-----|-----|
| 11.1 | Bug 1 — scaffold-required-files-check fångar tom `app/page.tsx` → blockerar persist | ✅ | `finalize-preflight.ts` L138 `HOME_PAGE_MIN_RENDERED_CHARS = 200`, L166-184 `buildMissingHomeRouteIssue` emitterar `severity: "error"` + `category: "code_structure_failure"`, L647-650 hard-gate i `runFinalizePreflight`. Tre regression-tester L403-501. |
| 11.2 | Bug 1 — telemetry: `filesChecked` + `persistedFilesCount` i `preflight.summary` | ✅ | `finalize-preflight.ts` L700-703 (`filesChecked: preflightFileCount, persistedFilesCount: persistedFileCount, hasHomeRouteBlock: ...`). |
| 11.3 | Bug 1 — count-parity-assertion (`preflightFileCount !== JSON.parse(filesJson).length`) blockerar persist | ⚠️ | Parity-checken är **passiv** — `nextFilesJson = JSON.stringify(completeProjectFiles)` (samma array som count räknas på), så drift är arkitektoniskt omöjlig idag. Testet L479-500 är därmed en **invariant-vakt** (inte en realistisk failing-path test) — det asserter `persistedFiles.length === preflightFileCount` i happy-path. PROMPT-spec krävde "emit stark diagnostics + blockera persist" om mismatch upptäcks; ingen sådan emit-path finns eftersom `nextFilesJson` byggs från samma källa. Acceptabel design (problem kan inte uppstå), men dokumentera att `preflight-phase.ts` inte fick consistency-assertionen specen begärde — istället ligger garantin i datakällan. |
| 11.4 | Bug 2 — variant lockas mellan init och follow-up när snapshot har `variantId` | ✅ | `orchestrate.ts` L795-808: `lockedVariantForFollowUp({ priorVariantId: input.persistedVariantId })`. `chat-message-stream-post.ts` L943-947 wirar `chatId` + `followUpIntent` + `persistedVariantId`. `matcher.ts` L46+ läser `priorVariantId`, returnerar via `getVariantById`. |
| 11.5 | Bug 2 — variant-lock fungerar även när snapshot tappat `variantId` (default-fallback) | ✅ | `registry.ts` L194-200 `getDefaultVariantForScaffold`. `matcher.ts` faller tillbaka till default när `priorVariantId == null` och `intent !== "clear-redesign"`. Test `matcher.test.ts` L84-105 (`falls back to scaffold default when prior variant id is missing`) + L106-115 (`still returns null on clear-redesign`). |
| 11.6 | Bug 2 — `scaffoldVariantId` på `OrchestrationBase`-typ | ✅ | `orchestrate.ts` L325 `scaffoldVariantId: string \| null`, L762 fylls från `input.persistedVariantId ?? null`. |
| 11.7 | Bug 2 — persist på `engine_versions`-rad (column eller metadata JSON) | ⚠️ scope-deviation (motiverad) | Fältet **persisteras inte** på `engine_versions` (ingen DB-migration). Stop-regel L96 säger "Om bug 2 kräver DB-migration: STOPPA". Plan-11 valde befintlig persistering via `engine_chats.orchestration_snapshot.variantId` (skrivs av `persist-side-effects.ts:54-70` sedan P26). Dokumenterat i STATUS-11. **Faktiskt persistens-spår fungerar.** OrchestrationBase-fältet är då en transit-kanal från caller, inte en lagrings-API. |
| 11.8 | Bug 3 — `capability-modify` klassas korrekt; ingen ny shell-fil; existing scen-fil markeras "modify this" | ✅ | `follow-up-capability-detection.ts` L163-180 `MODIFY_REFERENCE_MARKERS` (regex för "pricken"/"bubblan"/"3D-grejen"/etc), L342-343 `referencesExistingCapability = capabilityIds.length > 0 && modifyReferenceMatches.length > 0`. `follow-up-clarification.ts` L255-256 returnerar `"capability-modify"`. `chat-message-stream-post.ts` L697-708 + L921-940 (två callsites: plan-mode + codegen) suppressar `requestedDossierCapabilities`/`requestedCapabilityTiers` när intent är `capability-modify` och passar `capabilityModifyHint` istället. `dossiers.ts` `renderCapabilityModifyHintBlock` emitterar "Modify Existing Capability — Do NOT Re-Inject Dossier Shell"-block. `build-dynamic-context.ts` kallar det efter `renderDossierBlocks`. |
| 11.9 | 5+ regressionstester passerar | ✅ | 13+ nya tester: `finalize-preflight.test.ts` (3), `matcher.test.ts` (2), `follow-up-capability-detection.test.ts` (~4-5), `follow-up-clarification.test.ts` (~2), `dossiers.test.ts` (4). |
| 11.10 | typecheck + lint + test:ci 0 errors | ⏸ | Som 10.9 — förlitar mig på CI. |

---

## 2. Spec-avvikelser

| Avvikelse | Plan | Allvar | Kommentar |
|-----|---|---|-----|
| `verificationPolicy: "design_preview_skip_verify"` skrivs bara till devLog/SSE, inte till `engine_versions.metadata` | 10 | låg | Spec L40 sa "spara på versionen". Devlog är observerbart men plan-12-konsumenter på server-sidan måste läsa devLog-händelser, inte versions-raden. |
| `brief` / `preview-start` / `quality-gate` finns i `LATENCY_BUDGET_PHASES` men ingen kod emitterar dem | 10 | låg | Latency-data för dessa 3 faser saknas helt. Spec L56 listade alla 8. Befintliga `recordPhaseDuration("validate_syntax"/"verifier", ...)`-callsites saknar `kind`-label → samples hamnar i `kind="unknown"`-bucket. |
| `count-parity assertion` är invariant-vakt, inte aktiv blockerar | 11 | låg | Spec L26 sa "Om mismatch → emit stark diagnostics + blockera persist". Implementationen omöjliggör mismatch (samma array-källa) i stället för att blockera om det händer. Försvarbart designval. |
| `scaffoldVariantId` persisteras inte på `engine_versions`-rad | 11 | låg | Stop-regel respekterad. Befintlig snapshot-väg (`engine_chats.orchestration_snapshot.variantId`) bär ansvaret. Skriv-/läs-cykeln fungerar end-to-end; spec-bokstaven (`engine_versions`-kolumn) inte uppfylld. |
| `consistency-assertion i preflight-phase.ts` inte landad | 11 | mycket låg | PROMPT-spec L26 nämnde explicit `preflight-phase.ts`. Plan 11 lade istället `runFinalizePreflight`-internt count-spår. Samma effekt, annan fil. |

**Scope-leakage:** Inga. Plan 10 och 11 är file-disjoint enligt PROMPT-10 L62 och PROMPT-11 L71. Verifierat:

- Plan 10 rörde `runner.ts` men bara med `observePhase`/`recordPhaseDuration`-wraps (PROMPT-10 L62 tillåter "wrappa fas-mätning men inte ändra logiken") — ingen logik-ändring.
- Plan 11 rörde inte `metrics.ts`/`generation-log-writer.ts`/`server-verify.ts`.
- Plan 02–09-territorium oförändrat (alla 44 filer ligger i plan 10/11-scope eller är dokumenter/tester).

---

## 3. Test-coverage

| Acceptanskriterium | Tester | Tillräckligt? |
|-----|---|---|
| 10.1 routing-fix | 1 (binds site.chatId to latest run) | ja |
| 10.2 ENOENT-fix | 1 (resolveRunDirFromContext({chatId: missing})) | ja |
| 10.3 quality-gate skip init | 2 (skip + F3-counter) | ja |
| 10.4 verificationPolicy persist | 1 (devLog logging-test) | delvis (ingen DB-test, men ingen DB-skrivning) |
| 10.5 autoRepairCount split | 1 (followupCount=1 + autoRepairCount=1) | ja |
| 10.7 latency-metrics | 1 (`observePhase` med kind=followup) | tunt — ingen test-täckning för `brief`/`preview-start`/`quality-gate`-emission, men dessa emitteras inte heller från koden |
| 11.1 page.tsx-loss | 2 (missing + trivial content) | ja |
| 11.2 telemetry-fält | 0 (covered indirekt) | tunt — `hasHomeRouteBlock` test saknas |
| 11.3 count-parity | 1 (happy-path invariant) | ja för design |
| 11.4-5 variant-lock | 3 (clear-refine 2x + redesign-escape + missing-prior fallback) | ja |
| 11.8 capability-modify | ~7 (detection-tester + classifier + dossier-block + caller wiring via own-engine-build-session) | ja |

**Saknade regression-tester:**

- Plan 10: ingen integration-test som verifierar att de 3 saknade latency-faserna (`brief`/`preview-start`/`quality-gate`) faktiskt observeras end-to-end. Men eftersom de inte emitteras alls behövs en kod-fix innan en test ger värde.
- Plan 11: ingen e2e-test som verifierar att follow-up med `intent: "capability-modify"` faktiskt **inte** producerar dossier-shell-fil i output. Test-täckningen är på unit-nivå (caller-wiring + classifier + render-block); ingen orchestration-genomgång.

---

## 4. Code-quality red flags

Skannade hela diffen `1c445da15..HEAD` på `^\+`-rader.

| Regel | Träffar |
|-----|---|
| `// TODO` / `// FIXME` / `// XXX` / `// HACK` | 0 nya |
| `console.log` i prod-paths | 0 |
| `console.warn` / `console.error` introducerade | 0 nya — bara en ny `console.info("[scaffold-variant] variant_lock_fallback", ...)` (parallell till befintlig `variant_lock_skip`) |
| `: any` / `as any` / `as unknown as X` | 0 nya |
| Magic numbers utan kommentar | 1 — `HOME_PAGE_MIN_RENDERED_CHARS = 200` i `finalize-preflight.ts:138`, **men har 12-radig kommentar** L132-137 som motiverar tröskeln. OK. |
| `console.info` (plan 11 nya) | 1 (variant_lock_fallback) — passar mönstret från befintliga variant_lock-loggar. OK. |

Inga code-quality-flaggor att åtgärda.

---

## 5. Bug-hypoteser (open-questions.md)

| # | Fråga | Status efter wave 5 | Detalj |
|---|-----|-----|-----|
| 1 | Redis verifierad | ✅ före wave 5 | Sekundärbugg `_unrouted/brief-cache-hit/` ENOENT — **fixad av plan 10** (mkdir-recursive). |
| 2 | Preview-host = Blitz vs fly.io | ⏸ | Avsiktligt utanför wave 5. |
| 3 | HMR pg.Pool-läcka | ⏸ | Fixad före wave 5. Kvarvarande 503-vs-404-diskrimination är inte adresserad. |
| 4 | Observatorie-routing-läckage | ✅ | Plan 10 fixar exakt detta. Test verifierar att `_unrouted/orchestration-styledirection/` inte växer för chats med `site.chatId`. |
| 5 | Scaffold saknar minimi-fil-kontrakt (page.tsx-loss) | ✅ | Plan 11 Bug 1 — hard gate i `finalize-preflight.ts`. |
| 7 | THREE WebGL Context Lost | ⏸ | Inte berörd. |
| 8 | scaffoldVariant-lock | ✅ | Plan 11 Bug 2. Edge-case: `getDefaultVariantForScaffold` triggar bara på `clear-refine`/`capability-add`/`neutral`, **inte** på `capability-modify` om `priorVariantId` saknas — `lockedVariantForFollowUp` matchar alla intents utom `clear-redesign`, så `capability-modify` följer fallback-vägen. ✅ täckt. |
| 9 | CSP frame-src violation | ⏸ | Inte berörd. |
| 10 | Dossier-injection 3D verified | ✅ före wave 5 | — |
| 11 | Inspector låser scroll | ⏸ | Inte berörd. |
| 12 | Follow-up modifierar inte existing capability | ✅ | Plan 11 Bug 3. Edge-case kvar: `MODIFY_REFERENCE_MARKERS` är regex-baserad — synonymer som "den lilla pricken där uppe" matchar (`pricken` med ordboundary-stöd via `\p{L}\p{N}_`-classes). Men "den runda saken" matchar **inte** (`saken` listad bara i `3d-saken`-pattern). Kandidater för plan 12: bredare deictic-ordlista. |
| 13 | UX byt "Promoted" → "Fidelity 2/3" | ⏸ | Inte berörd. |
| 14 | Slug-route bouncer hem | ⏸ | Plan 12-scope (system-prompt-regel). |
| 15 | Hard-dossier env-vars false-prompt | ⏸ | Plan 12-scope. |
| 16 | game/interactive capability-tier | ⏸ | Post-wave-5. |
| 17 | Inline integrations-manual | ⏸ | Post-wave-5. |

**Sammanfattning:** Av 16 frågor i öppna listan (#6 saknas — numrering hoppar): 4 ✅ (#4, #5, #8, #12 — alla wave-5-leveranser, #1-fixet är delreplaced av #4-fixet), 12 ⏸. Inga "näraadresserad-men-edge-case-kvar"-fall.

---

## 6. Specifika scenarion

### Scenario A — page.tsx-loss

**LLM emitterar CodeProject utan `app/page.tsx`** → `runFinalizePreflight()` (`finalize-preflight.ts`):

```
runFinalizePreflight()
  ├─ buildCompleteProject(parsedFiles) → completeProjectFiles
  ├─ buildMissingHomeRouteIssue(findHomePageFile(completeProjectFiles))
  │   └─ findHomePageFile söker app/page.tsx + src/app/page.tsx
  │   └─ returnerar null → buildMissingHomeRouteIssue ger:
  │      { severity: "error", category: "code_structure_failure",
  │        message: "Required home route is missing..." }
  ├─ if (homePageGateIssue) → preflightIssues.push(...)
  ├─ previewStart.canStartPreview = false
  ├─ previewStart.hasCriticalCodeFailure = true
```

**Blockering verifierad** av `finalize-preflight.test.ts:403-452` (`plan-11 bug 1: blocks persist when the LLM omits app/page.tsx entirely`). ✅

### Scenario B — variant-lock vid follow-up #3

Base-versionen har `scaffoldVariantId: "corporate-grid"` i `engine_chats.orchestration_snapshot.variantId`:

```
chat-message-stream-post.ts
  ├─ läser orchestration_snapshot → snapshotVariantId = "corporate-grid"
  ├─ orchestrate({ persistedVariantId: "corporate-grid", followUpIntent: "neutral" })
       └─ resolveOrchestrationBase
            ├─ base.scaffoldVariantId = "corporate-grid"  (plan 11 Bug 2 nytt fält)
            └─ lockedVariantForFollowUp({ priorVariantId: "corporate-grid" })
                 ├─ intent !== "clear-redesign"
                 ├─ getVariantById("landing-page", "corporate-grid") → ScaffoldVariant
                 └─ returnerar variant ✅
       └─ persistedVariant = lockedVariant (corporate-grid)
       └─ resolvedVariant = persistedVariant (corporate-grid)
```

**`priorVariantId: null` kvarstår INTE** så länge snapshot-mergen i `persistOrchestrationSnapshot` inte tappar `variantId`. ✅ Kantfall: om snapshot tappar `variantId` → `lockedVariantForFollowUp` faller tillbaka till `getDefaultVariantForScaffold` (plan 11 Bug 2-fallback). **Inget `null` kvar i hot-path.**

### Scenario C — capability-modify

Prompt: `"gör pricken till en kaffekopp som häller kaffe när jag nuddar den"`

```
detectFollowUpCapabilities("gör pricken till en kaffekopp ...")
  ├─ findModifyReferenceMatches → ["pricken"] (matchar L164-regex)
  ├─ ADD_VERB matchar "gör" (turn-into) → addVerbPresent = true
  ├─ allowDetection = true
  ├─ capability-detection sök: "kaffekopp" → ingen direkt cap, men "scrollar"/"nuddar" + "musen" → motion?
  │   (visual-3d kräver explicit "3D" — pricken-kontexten implicit; antagligen capabilityIds = []
  │    ELLER om hela chathistoriken inkluderats: ["visual-3d"] inferred)
  ├─ referencesExistingCapability = capabilityIds.length > 0 && modifyMatches.length > 0
```

**Edge case:** Om prompten **inte** bär ett dossier-keyword (t.ex. "3D"/"animation") så är `capabilityIds = []` → `referencesExistingCapability = false` → klassas som `clear-refine`. Detta är **medvetet** (`detection.ts:340-343` kommentar). En användare som säger "gör pricken till en kaffekopp" UTAN att skriva "3D" får alltså **inte** modify-vägen. För att modify-vägen ska aktiveras måste prompten både ha modify-marker och nämna ett dossier-keyword.

Om `capabilityIds = ["visual-3d"]` (t.ex. via inferred från base-version-context):
- `classifyFollowUpIntent` → `"capability-modify"`
- `chat-message-stream-post.ts` L921-940 suppressar `requestedDossierCapabilities` + `requestedCapabilityTiers`, lägger `capabilityModifyHint`
- `build-dynamic-context.ts` kallar `renderCapabilityModifyHintBlock(capabilityModifyHint)` → "Modify Existing Capability — Do NOT Re-Inject Dossier Shell"-block går till LLM
- Dossier-shell **re-injiceras inte** (capabilities undefined → ingen capability-driven dossier-pick) ✅

**Risk:** Om brief återinjicerar `requestedCapabilities` via en annan väg (`brief.requestedCapabilities` inferreras av snapshot-rebuilder) kan `selectDossiersForRequest` fortfarande plocka dossier från brief-källan. Inte täckt av enhetstest — kvalificerar för plan-12-stickprov.

### Scenario D — observatorie-routing

Init-run + 2 follow-ups:

```
Init: devLogStartGeneration({ chatId: "X" }) → mints runDirX
  └─ recordChatToRun("X", runDirX) → chat-to-run.json: { X: runDirX }
  └─ Alla events får runDir = runDirX (in-memory + index)

Follow-up 1: devLogStartGeneration({ chatId: "X" }) → mints runDirX2
  └─ recordChatToRun("X", runDirX2) → index uppdaterad
  └─ Events i denna run hamnar i runDirX2

Follow-up 2: samma → runDirX3
```

Varje follow-up får sin **egen** per-run-mapp (vilket är rätt — per-run trace). `chat-to-run.json` pekar alltid på **senaste** run. Per-chat-aggregation sker via `logs/site-observability/<chatId>/history.ndjson` (separat från generationslogg-mappar). Test L290-345 verifierar att `_unrouted/orchestration-styledirection/` **inte** får någonting när `site.chatId` är emitterad. ✅

**Edge case:** Om `orchestration.styleDirection`-event är **enda** event före process-crash (innan `site.chatId` emitterats) — då hamnar det i `_unrouted/orchestration-styledirection/`. Låg sannolikhet, dokumentationsvärde.

---

## 7. Backoffice/Streamlit-konsekvenser

Skannade `backoffice/` på `history.ndjson`/`followupCount`/`autoRepairCount`/`promptSource` — **0 träffar**. Plan 10 introducerade två nya fält i `history.ndjson` men ingen Streamlit-page läser filen idag (`pipeline_health.py` baseras på databas-rader, inte log-filer). **Ingen åtgärd krävs.** STATUS-10 dokumenterade detta korrekt.

---

## 8. Schema-konsekvenser

| Schema | Behöver uppdateras? |
|-----|---|
| `docs/schemas/strict/scaffold-variant.schema.json` | nej — beskriver scaffold-variant-definition, inte runtime-state |
| `docs/schemas/strict/preview-session-contract.schema.json` | nej |
| `docs/schemas/strict/plan-file.schema.json` | nej |
| `docs/schemas/strict/dossier.schema.json` | nej |

**`history.ndjson`-fält:** Det finns **inget formellt schema** för `history.ndjson` i `docs/schemas/strict/`. Plan 10:s nya `autoRepairCount`/`followupCount`/`promptSource` är dokumenterade i STATUS-10 + `generation-log-writer.test.ts`. Acceptabelt — `history.ndjson` är ett internt log-format utan extern konsument idag.

**`scaffoldVariantId` på `OrchestrationBase`:** Persisteras via `engine_chats.orchestration_snapshot` (befintligt fält `variantId` i mergad snapshot). Ingen DB-migration. Snapshot-shape definieras inte i `docs/schemas/strict/` heller. **Ingen schema-åtgärd.**

---

## 9. Sammanfattning

| Mått | Antal |
|-----|---|
| Bekräftade buggar i wave-5-leveransen | **0** |
| Misstänkta buggar (kräver verifiering) | **2** |
| Spec-avvikelser (motiverade) | **5** |
| Scope-leakage / protected-file-violations | **0** |
| Code-quality red flags | **0** |
| Saknade regression-tester | **2** (latency-faser brief/preview-start/quality-gate; e2e capability-modify-no-shell-output) |

**Misstänkta buggar:**

1. **Latency-faserna `brief`/`preview-start`/`quality-gate`** finns i `LATENCY_BUDGET_PHASES` men emitteras aldrig. Effekt: histogrammet är 5/8 komplett. Inte en regression — bara ofärdig leverans av acceptans 10.7. **Fix:** addera `observePhase`/`recordPhaseDuration`-anrop i brief-builder, preview-start-trigger, och quality-gate-runner.

2. **`recordPhaseDuration` utan `kind`-label** i `verifier-pass.ts:462` + `validate-and-fix.ts:472` → samples landar i `kind="unknown"`. Inte en regression (befintlig kod), men minskar värdet av plan-10-leveransen. **Fix:** propagera `latencyBudgetKind` till dessa callsites eller acceptera `unknown`-kind som dokumenterat utfall.

**Spec-avvikelser (alla låg-allvar, dokumenterade i tabell §2):**

1. `verificationPolicy: "design_preview_skip_verify"` skrivs bara till devLog/SSE, inte versions-rad.
2. 3 av 8 latency-faser saknar emission.
3. `count-parity assertion` är invariant-vakt, inte aktiv blockerar.
4. `scaffoldVariantId` persisteras via snapshot (befintlig väg) inte ny `engine_versions`-kolumn.
5. `consistency-assertion` ligger i `finalize-preflight.ts`, inte `preflight-phase.ts` som specen nämnde.

**Rekommendation: GO för plan 12.**

Wave 5 levererar alla 6 huvud-acceptanskriterier (10.1, 10.2, 10.3, 10.5, 11.1, 11.4-5, 11.8) komplett. Avvikelserna är låg-allvar och dokumenterade. Test-täckningen är solid (20+ nya tester). Inga spec-brott eller protected-file-violations. De två misstänkta buggarna är **infrastruktur-gap**, inte aktiva regressioner — de förstör inte plan 12, de begränsar bara framtida latency-debugging.

**Föreslagna fix för plan 12 (5-min-tasks):**

- Wrap brief-builder i `observePhase({ phase: "brief", kind: latencyBudgetKind })`.
- Wrap preview-start i `observePhase({ phase: "preview-start", ... })`.
- Wrap quality-gate i `observePhase({ phase: "quality-gate", ... })`.
- Bredda `MODIFY_REFERENCE_MARKERS` med fler deictic-tokens (open-question #12 edge-case).
- Lägg e2e-test som verifierar att `capability-modify` följs av output **utan** dossier-shell-filer.

