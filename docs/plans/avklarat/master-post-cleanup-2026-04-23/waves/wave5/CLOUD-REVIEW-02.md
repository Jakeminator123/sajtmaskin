# CLOUD-REVIEW-02 — Spec-coherence plan-11

**Du är cloud-review-agent #02.** READ-ONLY. Producera audit-rapport, ingen kodändring.

## Din uppgift

Verifiera att **plan-11:s leverans (PR #97) faktiskt löser alla 3 buggar** från `wave5/PROMPT-11.md` + `STATUS-INVESTIGATE-PAGETSX-LOSS.md`.

## Förläs

1. `docs/plans/active/master-post-cleanup-2026-04-23/wave5/PROMPT-11.md` — original spec (3 buggar)
2. `docs/plans/active/master-post-cleanup-2026-04-23/STATUS-INVESTIGATE-PAGETSX-LOSS.md` — investigation-rapport
3. `docs/plans/active/master-post-cleanup-2026-04-23/STATUS-11-unified-repair.md` — agent self-report (om finns; annars i plan-11-worktree)
4. `docs/architecture/open-questions.md` #5, #8, #12

## Spec-checklist

### Bug 1: page.tsx-loss (scaffold-required-files-check)

Investigation specade 4 fixar:
- [ ] Hard gate i `src/lib/gen/stream/finalize-preflight.ts` — kräver `app/page.tsx` ELLER `src/app/page.tsx` med non-trivial content (>200 chars rendered) → annars `severity: "error"`, `code: "missing_required_route"` eller motsvarande. Sök på `HOME_PAGE_REQUIRED_PATHS`.
- [ ] Consistency-assertion i `src/lib/gen/stream/finalize-version/preflight-phase.ts` — `preflightFileCount !== JSON.parse(filesJson).length` → blockera persist
- [ ] 3 regression-tester (LLM missar page.tsx, count-parity, preview-bootstrap-set)
- [ ] Telemetry hardening — `filesChecked` + `persistedFilesCount` i samma event

### Bug 2: scaffoldVariant-loss

- [ ] `scaffoldVariantId: string | null` på `OrchestrationBase` typ
- [ ] Persistens på `engine_versions`-rad (column eller metadata JSON)
- [ ] `resolveOrchestrationBase` läser base-versionens variantId vid follow-up
- [ ] Test: follow-up på chat med variant `corporate-grid` ärver samma → `[scaffold-variant]` log visar `priorVariantId: 'corporate-grid'`, lock succeeds

### Bug 3: capability-modify-existing

- [ ] `MODIFY_REFERENCE_MARKERS` regex i `src/lib/builder/follow-up-capability-detection.ts` (verifierat — finns på rad 163)
- [ ] Markers täcker svenska + engelska: `den`, `pricken`, `bubblan`, `figuren`, `3D-saken`, `3D-grejjen`, `the existing`, `that thing`, etc
- [ ] När capability + modify-reference matchar → `intent: 'capability-modify'` (ny variant av FollowUpIntentMode)
- [ ] Plan 07 / dossier-injection-vägen — `capability-modify` triggar INTE re-injection
- [ ] Existing scen-fil markeras i system-prompt som "modify this" (i `src/lib/gen/system-prompt/sections/dossiers.ts`)
- [ ] Test: "gör pricken till X" → `capability-modify`, ingen ny shell-fil, existing scen-fil tagged

## Hårda begränsningar (verifiera)

Plan-11 fick INTE röra:
- `src/lib/logging/generation-log-writer.ts` (plan 10)
- `src/lib/observability/metrics.ts` (plan 10)
- `src/lib/gen/verify/server-verify.ts` (plan 10)
- `src/lib/builder/promptOrchestration.ts` (plan 12)

**OBS:** Plan-11 var branched från master innan plan-10-merge. Three-way-merge hanterade det. Verifiera att plan-10:s ändringar fortfarande finns i master efter plan-11-merge.

## Stoppregler från PROMPT-11

PROMPT-11 sa "om bug 3 kräver LLM-classifier-pass: dokumentera och lämna åt plan 12". Verifiera att `MODIFY_REFERENCE_MARKERS` är ren regex (inte LLM-anrop).

## Output

Skriv `docs/plans/active/master-post-cleanup-2026-04-23/audit-reports/AUDIT-02-spec-plan11-<agent-id>.md` enligt formatet.

Innehåll: ✅/⚠️/❌ per bug-fix + sammanfattning GO/NO-GO för plan 12.

## Klart = PR öppnad.
