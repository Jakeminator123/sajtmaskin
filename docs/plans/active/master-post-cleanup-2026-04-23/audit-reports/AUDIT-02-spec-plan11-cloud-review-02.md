# AUDIT-02 — Spec-coherence plan-11 (PR #97)

| Fält | Värde |
|------|--------|
| Agent | cloud-review-02 |
| Datum | 2026-04-24 |
| Repo / worktree | `audit-r02` (kodläsning mot aktuell HEAD) |
| Underlag | `wave5/PROMPT-11.md`, `STATUS-INVESTIGATE-PAGETSX-LOSS.md`, `STATUS-11-unified-repair.md`, `open-questions.md` #5 / #8 / #12, `CHECKLIST.md` (PR #97 merged) |

## Sammanfattning

| Bug | Mot spec + investigation | Plan 12 |
|-----|---------------------------|---------|
| 1 page.tsx-loss | Kärnfixar landade; avvikelser i **issue-kod**, **fil-placering** för parity, **test (c)** och **negativ parity-test** | **GO** — ev. polish |
| 2 scaffoldVariant | Låsning + fallback **löser symtomet**; **ingen** `engine_versions`-persist av variantId; test matchar inte ordagrant acceptance-exemplet | **GO** med känt gap om snapshot aldrig får `variantId` |
| 3 capability-modify | Regex-väg (ingen LLM-classifier); injektion suppressed + prompt-block; **saknar** E2E “ingen ny shell-fil” / “that thing” | **GO** — rest i plan 12 om önskat |

**Samlat utlåtande:** **GO** för plan 12 — plan 11 levererar de tre buggarnas **avsiktliga säkerhets- och routing-beteende**. Återstående punkter är dokumentations-/test-gap mot den ursprungliga checklistans ordalydelse, inte blockers för nästa plan.

---

## Bug 1 — page.tsx-loss (`scaffold-required-files-check`)

| Krav (investigation / PROMPT-11) | Status | Notis |
|----------------------------------|--------|--------|
| Hard gate efter `completeProjectFiles`: `app/page.tsx` **eller** `src/app/page.tsx`, >200 tecken “rendered”, annars `severity: "error"` | ✅ | `HOME_PAGE_MIN_RENDERED_CHARS`, `HOME_PAGE_REQUIRED_PATHS`, `buildMissingHomeRouteIssue` i `src/lib/gen/stream/finalize-preflight.ts` |
| Issue-`code`: `missing_required_route` **eller motsvarande** | ⚠️ | Implementation använder konsekvent **`code_structure_failure`** (via `createIssue`), inte den namngivna koden i PROMPT-11 — semantiskt blockerande fel, avvikelse mot ordagrann spec |
| Count-parity: `preflightFileCount !== JSON.parse(filesJson).length` → blockera persist | ✅ | Invariant i `finalize-preflight.ts` (rad ~661–696), inte duplicerad i `preflight-phase.ts` |
| Investigation punkt 2 fil: `preflight-phase.ts` | ⚠️ | Parity **sitter i** `finalize-preflight.ts` (source of truth för `nextFilesJson`); `preflight-phase.ts` anropar bara `runFinalizePreflight` — beteende OK, **plats** skiljer från skriven spec |
| 3 regression-tester: (a) saknad page, (b) parity, (c) preview-bootstrap samma set | ⚠️ | (a) ✅, trivial home ✅; (b) testet är **happy path** (`expect(parityIssue).toBeUndefined()`) — **saknar negativ** “tvingad drift”-case; (c) **ingen** dedikerad test i `generation-stream-post-finalize.test.ts` för preview-bootstrap vs preflight-set (specifik fil nämnd i investigation) |
| Telemetry: `filesChecked` + `persistedFilesCount` i **samma** `preflight.summary`-event | ✅ | `devLogAppend` `type: "preflight.summary"` med `filesChecked`, `persistedFilesCount`, `hasHomeRouteBlock` |

---

## Bug 2 — scaffoldVariant-loss

| Krav | Status | Notis |
|------|--------|--------|
| `scaffoldVariantId: string \| null` på `OrchestrationBase` | ✅ | `src/lib/gen/orchestrate.ts` + typer |
| Persistens på `engine_versions` (kolumn eller metadata JSON) | ❌ / avsiktligt | **Ej implementerat** — `STATUS-11-unified-repair.md` stop-regel: ingen DB-migration. Variant kommer från `orchestration_snapshot.variantId` → `persistedVariantId` i `chat-message-stream-post.ts` (~897) + **`lockedVariantForFollowUp`**-fallback |
| `resolveOrchestrationBase` läser bas-versionens variantId vid follow-up | ⚠️ | Läser **`input.persistedVariantId`** (snapshot), exponerar som `scaffoldVariantId`; **inte** läst från `engine_versions`-rad |
| Test: follow-up med `corporate-grid` → log `priorVariantId: 'corporate-grid'`, lock succeeds | ⚠️ | `matcher.test.ts` låser **`priorVariantId` från `getVariantsForScaffold`[0]** och testar **saknad** prior → default-fallback; **ingen** test som assertar `priorVariantId: "corporate-grid"` + `[scaffold-variant]` lock success enligt PROMPT-11:s exempel |
| Symtomfix `corporate-grid → warm-local` när `priorVariantId === null` | ✅ | `lockedVariantForFollowUp` anropar `getDefaultVariantForScaffold`; för `landing-page` är **`corporate-grid`** `default: true` i `config/scaffold-variants/landing-page/corporate-grid.json` — stabil fallback i stället för fri embedding-pick |

---

## Bug 3 — capability-modify-existing

| Krav | Status | Notis |
|------|--------|--------|
| `MODIFY_REFERENCE_MARKERS` regex i `follow-up-capability-detection.ts` | ✅ | Array ~rad 163–176; **inga LLM-anrop** i denna väg — stoppregel från PROMPT-11 följd |
| Markers: svenska + engelska inkl. lista i cloud-prompt | ⚠️ | `pricken`, `bubblan`, `figuren`, `3d-…saken/grejen`, kontextbundna `den/det` (`gör den till` …), `befintliga/existerande/nuvarande`, engelska `the existing` / `turn it into` / … — **`that thing`** (exemplen i review-prompen) **saknas** som fristående mönster |
| `capability-modify` som `FollowUpIntentMode` | ✅ | `src/lib/gen/follow-up-intent-types.ts` + `classifyFollowUpIntent` i `follow-up-clarification.ts` |
| Plan 07 / dossier: `capability-modify` triggar **inte** re-injection | ✅ | `requestedDossierCapabilities` / `requestedCapabilityTiers` **undertrycks** när `followUpIntent === "capability-modify"` i `chat-message-stream-post.ts` (plan-läge + codegen-sträng ~697–707, ~921–931) |
| Befintlig scen-fil: “modify this” i system-prompt | ✅ | `renderCapabilityModifyHintBlock` i `src/lib/gen/system-prompt/sections/dossiers.ts` + wiring i `build-dynamic-context.ts` |
| Test: “gör pricken till X” → `capability-modify`, ingen ny shell-fil, fil taggad | ⚠️ | **Unit/integration:** `follow-up-clarification.test.ts`, `follow-up-capability-detection.test.ts`, `dossiers.test.ts` täcker klassificering + hint-text — **saknar** assertion om **inga** nya shell-filer / faktisk fil-taggning i generator-LLM-output (E2E) |

---

## Hårda begränsningar (plan-11 fick inte röra)

| Fil | Verifikation |
|-----|----------------|
| `generation-log-writer.ts` | Ingen plan-11-koppling i diff-scope per `STATUS-11`; filen innehåller **`fs.mkdirSync(..., { recursive: true })`** på flera ställen — förenligt med plan-10-hardening som ska ligga kvar |
| `metrics.ts` | Senaste commit-touch i HEAD-trädet: `b6da0b888` (observability) — **ingen** indikation att plan-11 skulle ha revert:at plan-10 |
| `server-verify.ts` | Senaste: `c7798dce5` — separat spår från plan-11 |
| `promptOrchestration.ts` | **Ingen** träff på `capability-modify` / plan-11 i filen |

Plan-11 **branch/merge** kontra plan-10: checklist markerar PR #97 merged; kodbasen bär fortfarande observability-/writer-förändringar — **inga tecken** på att plan-11 skulle ha tagit bort plan-10-leverans i dessa filer (begränsad git-spårning per fil, se ovan).

---

## Stoppregel PROMPT-11 (Bug 3)

**Uppfylld:** `MODIFY_REFERENCE_MARKERS` är **ren regex** — inget LLM-classifier-pass tillagt; inget behov att delegera bug 3 till plan 12 av den anledningen.

---

## GO / NO-GO för plan 12

| Beslut | Motivering |
|--------|------------|
| **GO** | Bug 1: tom/saknad home route blockeras; parity-invariant + telemetri finns. Bug 2: variant drift vid `null` prior hanteras deterministiskt via registry-default. Bug 3: `capability-modify` + suppression + explicit modify-hint i prompt — regex-only. |
| **Residualer för plan 12 (valfritt)** | (1) Alias/issue-kod `missing_required_route` om loggrep ska matcha PROMPT-11 ordagrant. (2) Negativ parity-test + ev. explicit preview-bootstrap-test om man vill sluta investigation-checklist 100%. (3) `engine_versions` eller snapshot-hårdning om `variantId` fortfarande kan förloras **med** icke-default init-variant. (4) Utöka `MODIFY_REFERENCE_MARKERS` för engelska “that thing” m.m. + E2E-capability-modify om produktion kräver bevis för “ingen ny shell-fil”. |
