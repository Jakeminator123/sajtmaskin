# Buggar closeout

Datum: 2026-04-08

## Vad som ar sant idag

Kvarvarande verifierade buggar i autofix-/route-sparet ar nu stangda med tester:

- `common-import-fixer` hanterar nu destruktureringsalias i lokala deklarationer.
- named->default-rewire klarar nu lokala aliasfall dar targetmodulen bara har default-export.
- route-preflight markerar inte langre parent-route som saknad nar faktisk route ar dynamisk (t.ex. `/blog/[slug]`).

Dessutom ar tidigare fixar i detta pass kvar:

- mindre aggressiv follow-up route-removal-heurstik i `route-plan`.
- mindre aggressiv `page-addition`-klassning i `build-spec`.
- robustare React hook-importfixer.

## Berorda kodfiler

- `src/lib/gen/autofix/common-import-fixer.ts`
- `src/lib/gen/autofix/common-import-fixer.test.ts`
- `src/lib/gen/route-plan.ts`
- `src/lib/gen/route-plan.test.ts`
- `src/lib/gen/build-spec.ts`
- `src/lib/gen/build-spec.test.ts`
- `src/lib/gen/autofix/react-hook-import-fixer.ts`
- `src/lib/gen/autofix/react-hook-import-fixer.test.ts`

## Cleanup i samma pass

- `.gitignore`: slutade ignorera `docs/plans/avklarat/` sa den stammer med repoets dokumentationsavsikt.
- `.cursor/rules/repo-env-indexing.mdc`: tog bort missvisande exempel som namnde `docs/plans/avklarat/` som cursorignored.

## Kvarvarande avgransning

- `.cursorignore` gick inte att skriva i detta pass pa grund av aktuell permissions-konfiguration (write denied).
- Ovrig `.cursorignore`-finjustering (prompt-dumps/output/path-kommentarer) ar darfor inte landad i samma commit.

## Verifiering

- `npx vitest run src/lib/gen/autofix/common-import-fixer.test.ts src/lib/gen/route-plan.test.ts src/lib/gen/build-spec.test.ts src/lib/gen/autofix/react-hook-import-fixer.test.ts`
- `npm run typecheck`

Alla ovan var grona i passet.
