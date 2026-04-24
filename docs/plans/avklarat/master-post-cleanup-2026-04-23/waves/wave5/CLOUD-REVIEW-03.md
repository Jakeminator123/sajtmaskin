# CLOUD-REVIEW-03 — Test-coverage audit för wave 5

**Du är cloud-review-agent #03.** READ-ONLY. Producera audit-rapport.

## Din uppgift

Mäta test-coverage på wave-5-fixarna. Identifiera saknade regression-tester.

## Förläs

- `docs/plans/active/master-post-cleanup-2026-04-23/wave5/PROMPT-10.md` + `PROMPT-11.md` (acceptance-criteria som måste ha tester)
- `docs/plans/active/master-post-cleanup-2026-04-23/audit-reports/README.md` (output-konvention)

## Test-filer att granska

Kör `git diff <pre-wave-5-sha>..HEAD --name-only -- '*.test.ts'` för att hitta alla wave-5-modifierade test-filer. Pre-wave-5-sha är ungefär `1c445da15` (commit "wave 5 prompts + checklist").

Nya/modifierade test-filer (väntat antal):
- `src/lib/gen/stream/finalize-preflight.test.ts` (Bug 1 regression)
- `src/lib/gen/scaffold-variants/matcher.test.ts` (Bug 2 regression)
- `src/lib/builder/follow-up-capability-detection.test.ts` (Bug 3 regression)
- `src/lib/providers/own-engine/follow-up-clarification.test.ts` (Bug 3 intent-classification)
- `src/lib/gen/system-prompt/sections/dossiers.test.ts` (Bug 3 dossier-injection-skip)
- `src/lib/logging/generation-log-writer.test.ts` (Plan 10 routing-fix)
- `src/lib/observability/metrics.test.ts` (Plan 10 latency-infra)
- `src/lib/providers/own-engine/generation-stream-post-finalize.test.ts` (Plan 10 quality-gate-skip)

## Kontroll-frågor

För varje acceptance-kriterium från PROMPT-10/11:
1. Finns ett test som faktiskt kör fix-pathen med expected output?
2. Finns ett counter-test (= utan fix) som visar att FIXEN är aktiv?
3. Finns edge-case-tester (t.ex. tom input, null-värden, gränsvärden)?

## Specifika hål att leta efter

- Bug 1: Test som verifierar att `app/page.tsx` med <200 chars rendered content **också** blockerar (inte bara helt saknad fil)
- Bug 1: Test för `src/app/page.tsx` som alternative path
- Bug 2: Test för follow-up-2 (variant-lock över FLERA follow-ups, inte bara en)
- Bug 3: Test för "gör om den" (kort prompt utan capability-noun) → ska INTE bli capability-modify
- Bug 3: Test för "lägg till en till 3D-grej" (capability + add-verb i samma prompt) → ska bli capability-add, inte modify
- Plan 10: Test för LRU-prune av `_unrouted/<bucket>/`-mappar (ska de prunas?)

## Output

Skriv `docs/plans/active/master-post-cleanup-2026-04-23/audit-reports/AUDIT-03-test-coverage-<agent-id>.md`.

Innehåll:
- Tabell: acceptance-criterium → test-fil → ✅/⚠️/❌
- Lista över saknade tester (med förslag på test-namn + scenario)
- Sammanfattning: är coverage tillräcklig för plan 12 ska kunna byggas på wave 5?

## Klart = PR öppnad.
