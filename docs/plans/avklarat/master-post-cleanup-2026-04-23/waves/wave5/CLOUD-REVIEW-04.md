# CLOUD-REVIEW-04 — Scope-creep + boundary-violation-koll

**Du är cloud-review-agent #04.** READ-ONLY. Producera audit-rapport.

## Din uppgift

Verifiera att plan-10 + plan-11 INTE rörde filer utanför sin scope (= bröt hårda begränsningar).

## Förläs

- `docs/plans/active/master-post-cleanup-2026-04-23/wave5/PROMPT-10.md` — sektion "Hårda begränsningar"
- `docs/plans/active/master-post-cleanup-2026-04-23/wave5/PROMPT-11.md` — sektion "Hårda begränsningar"
- Tidigare planers PROMPTs (PROMPT-02 t.o.m. PROMPT-09) i `wave1/`, `wave2/`, `wave3/`, `wave4/` — för att veta vilka filer som var deras scope

## Metod

1. `git diff <pre-wave-5-sha>..HEAD --name-only` — alla filer ändrade i wave 5
2. För varje fil, kolla om den var en del av plan-10:s eller plan-11:s explicita scope (per PROMPT-10/11)
3. Om INTE: kolla om filen var en TIDIGARE plans territorium (plan 02-09)
4. Flagga alla "scope-creep"-träffar

## Specifika filer att kolla

Plan-10:s explicita scope:
- `src/lib/logging/generation-log-writer.ts`
- `src/lib/observability/metrics.ts`
- `src/lib/gen/verify/server-verify.ts`
- `src/lib/gen/stream/post-finalize-policies.ts`
- `src/lib/gen/stream/finalize-version/runner.ts` (begränsat — bara `observePhase` wrap)
- Tester för dessa

Plan-11:s explicita scope:
- `src/lib/gen/stream/finalize-merge.ts` (Bug 1)
- `src/lib/gen/stream/finalize-preflight.ts` (Bug 1)
- `src/lib/gen/stream/finalize-version/preflight-phase.ts` (Bug 1)
- `src/lib/gen/orchestrate.ts` (Bug 2)
- `src/lib/gen/scaffold-variants/**` (Bug 2)
- `src/lib/builder/follow-up-capability-detection.ts` (Bug 3)
- `src/lib/gen/system-prompt/sections/dossiers.ts` (Bug 3)
- `src/lib/providers/own-engine/follow-up-clarification.ts` (Bug 3)
- Tester för dessa

Filer som SKULLE varit OFF-LIMITS:
- `src/lib/gen/autofix/**` (plan 04/05)
- `src/components/builder/Version*` (plan 02)
- `src/lib/gen/verify/repair-loop.ts` (plan 03)
- `src/components/builder/preview-panel/**` (plan 02)
- `src/components/builder/ThinkingOverlay.tsx` (plan 02)

## Edge-case att undersöka

Plan-11 var branched FÖRE plan-10 mergades. Three-way merge användes för att kombinera. Verifiera:
- Inga rader i master ÄR förlorade pga merge-konflikt-resolution
- Plan-10:s ändringar i `generation-log-writer.ts` finns kvar EFTER plan-11-merge
- Plan-10:s `observePhase` finns kvar i `runner.ts` EFTER plan-11-merge

`git log --merges` + `git show <merge-commit>` för att se hur konflikter löstes.

## Output

Skriv `docs/plans/active/master-post-cleanup-2026-04-23/audit-reports/AUDIT-04-scope-creep-<agent-id>.md`.

Innehåll:
- Tabell: fil → vilken plan ägde den → vem ändrade i wave 5 → ✅ inom scope / ⚠️ gråzon / ❌ scope-creep
- Lista över förlorade rader pga merge (om någon)
- Sammanfattning: ren / smutsig leverans

## Klart = PR öppnad.
