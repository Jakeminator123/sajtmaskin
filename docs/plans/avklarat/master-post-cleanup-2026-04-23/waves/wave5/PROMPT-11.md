# Du är plan-11-agenten — scaffold-required-files-check + variant-lock + capability-modify-existing

## Din roll och kontext

Du är en autonom kodagent i en isolerad git worktree på branchen `plan-11-unified-repair`. Du arbetar **parallellt** med plan-10-agenten i wave 5. Era scopes är file-disjoint. När du är klar öppnar du PR mot `master`.

**Viktigt — scope omdefinierad efter investigation:** Plan 11 var ursprungligen "samla LLM-repair i tydlig väg" (vagt). Efter `STATUS-INVESTIGATE-PAGETSX-LOSS.md` har du nu **konkret fix-spec** för tre samrelaterade bugs. Detta är din PRIMÄRA uppgift.

## Repo-state du ärver

- HEAD: `master @ <senaste hot-fix>` (efter plan 02–09 + investigation + hot-fixes)
- **Läs FÖRST `STATUS-INVESTIGATE-PAGETSX-LOSS.md`** — den ger dig EXAKT rotsorsak + 4 specifika fix-recipes
- **Läs `docs/architecture/open-questions.md` #5, #8, #12** — de tre samrelaterade bugs

## De tre samrelaterade buggarna (din primära input)

### Bug 1: page.tsx-loss (open-question #5, investigation root-cause confirmed)

**Rotsorsak:** `LLM_ONLY_PATHS = new Set(["app/page.tsx", "src/app/page.tsx"])` i `src/lib/gen/stream/finalize-merge.ts:87-90` filtrerar avsiktligt bort scaffoldens page.tsx från base-merge för att tvinga LLM:n att skriva en ny med riktig content. **Men ingen safety-net** om LLM:n missar.

**Verifierat skadeläge:** Run A (chat `1fa58609`) + Run B (chat `b71dafb3`) gav båda promotade sajter med 6 filer på disk, tom `<main>`, 0 sektioner. Sajten "fungerar" men är blank.

**Fix från investigation (4 specifika åtgärder):**

1. **Hard gate i `src/lib/gen/stream/finalize-preflight.ts`:** Efter `completeProjectFiles` byggts, kräv `app/page.tsx` ELLER `src/app/page.tsx` med non-trivial content (>200 chars rendered). Om saknad → `severity: "error"`, `code: "missing_required_route"`.
2. **Consistency-assertion i `src/lib/gen/stream/finalize-version/preflight-phase.ts`:** Om `preflightFileCount !== JSON.parse(filesJson).length` → emit stark diagnostics + blockera persist. Förhindrar 26-vs-6-typ av silent drift.
3. **3 regression-tester:** (a) LLM missar page.tsx i init → preflight blockerar persist, (b) preflight-count vs persisted-count parity, (c) preview bootstrap använder samma set som preflight validerade.
4. **Telemetry hardening:** Logga både `filesChecked` och `persistedFilesCount` i `preflight.summary`-event så samma diskrepans är 1-grep-bort nästa gång.

### Bug 2: scaffoldVariant ej lockad mellan init/follow-up (open-question #8)

**Symptom:** Init valde `corporate-grid`, follow-up rullade `warm-local` → sajten bytte look mellan v1 och v2.

```
[scaffold-variant] variant_lock_skip {
  reason: 'missing_prior_variant_id',
  priorVariantId: null
}
```

**Trolig rotsorsak:** `OrchestrationBase` saknar `scaffoldVariantId`-fält som persisteras på version. Eller `resolveOrchestrationBase` läser inte variantId från base-version.

**Fix:**
- Lägg `scaffoldVariantId: string | null` på `OrchestrationBase` typ + persist på `engine_versions`-rad (column eller i `metadata` JSON)
- I `resolveOrchestrationBase` (för follow-ups), läs base-versionens `scaffoldVariantId` och fyll i som default
- Filer: `src/lib/gen/orchestrate.ts`, `src/lib/gen/scaffold-variants/`-modul, möjligen `src/lib/api/engine/chats/chat-message-stream-post.ts`
- Test: follow-up på chat med variant `corporate-grid` ärver samma variant (verifiera i `[scaffold-variant]` log → `intent: 'capability-add'`, `priorVariantId: 'corporate-grid'`, lock succeeds)

### Bug 3: Follow-up modifierar inte existing capability-output (open-question #12)

**Symptom:** Användaren skrev "gör pricken till en kaffekopp som häller kaffe när jag nuddar den med musen". LLM:n re-injicerade dossier-shell + error-boundary istället för att modifiera existing `floating-coffee-overlay.tsx`.

**Rotsorsak (hypotes):** Plan 06 detekterar `capability-add` när "3D" eller "kaffekopp" finns i prompten. Men det är fel — användaren refererar till EXISTING capability ("pricken" = den befintliga 3D-bubblan). Det borde klassas som `capability-modify`.

**Fix:**
- Plan 06:s `detectFollowUpCapabilities` (`src/lib/builder/follow-up-capability-detection.ts`) — utöka med `MODIFY_REFERENCE_MARKERS`-detection: `"den"`, `"pricken"`, `"bubblan"`, `"figuren"`, `"3D-saken"`, `"3D-grejjen"`, etc. När capability-keyword finns OCH modify-reference finns → klassa som `capability-modify`, inte `capability-add`.
- Plan 07 / dossier-injection — när `capability-modify` triggas, INTE re-injicera dossier-shell. Istället peka LLM till existing scen-fil i system-prompt (`src/lib/gen/system-prompt/sections/dossiers.ts`).
- Test: follow-up "gör pricken till X" på chat som har existing 3D-output → `capability-modify`, ingen ny shell-fil, existing scen-fil markerad i prompt som "modify this".

## Plan 11s ursprungliga scope (INTE primärt)

Original plan 11 var "samla LLM-repair i tydlig väg". Det är **lägre prio** nu — efter plan 05 har lane-tag + entrypoint-konsolidering redan landat. Om tiden räcker:

- Verifiera att `runRepairLoop()` (`src/lib/gen/verify/repair-loop.ts`) har gemensam reason/budget/pass_id-shape med autofix-lanen
- Annars: dokumentera nuvarande shape-skillnader för plan 12

Detta är **valfritt**. Bug 1-3 är obligatoriska.

## Hårda begränsningar

- Rör INTE plan-10-filer: `src/lib/logging/generation-log-writer.ts`, `src/lib/observability/metrics.ts`, `src/lib/gen/verify/server-verify.ts` (utom om strikt nödvändigt för bug-fix — då koordinera).
- Rör INTE plan-12-filer: `src/lib/builder/promptOrchestration.ts` (utöver `detectFollowUpCapabilities`-utökning som plan 06-territorium men nu mat för plan 11)
- Rör INTE preview-host-fungerande kod om inte direkt nödvändigt
- Maxbudget: ~20 filer rörda (3 buggar = mycket scope, men investigation har redan spec).

## Acceptans

- Bug 1: scaffold-required-files-check fångar tom page.tsx → blockerar persist
- Bug 2: variant lockas mellan init och follow-up
- Bug 3: capability-modify klassas korrekt → ingen re-injection
- 5+ regressionstester passerar
- `npm run typecheck && npm run lint && npm run test:ci` 0 errors

## Workflow

1. **Sätt en kort plan** (vilka filer per bug).
2. **Bug 1 först** — investigation har komplett spec.
3. **Bug 2 sedan** — kortare diff.
4. **Bug 3 sist** — krävs designtänk för MODIFY_REFERENCE_MARKERS.
5. **Skriv `STATUS-11-unified-repair.md`** i `docs/plans/active/master-post-cleanup-2026-04-23/`.
6. **Push + öppna PR** med titel `plan 11: scaffold-required-files-check + variant-lock + capability-modify-existing`.

## Stoppregler

- Om bug 3 visar sig kräva LLM-classifier-pass (regex inte räcker): dokumentera och lämna åt plan 12.
- Om bug 2 kräver DB-migration (ny column): STOPPA, beskriv migrations-plan, lämna implementation åt user.

## Klart =

PR öppnad, STATUS-11 committad, alla tester passerar.
