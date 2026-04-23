# STATUS-04 fixer-surface

Status: **full** (inte `short`, inte `skip`).

## Exakta count

- Inventerade rader i `fixer-matrix.md`: **59**
  - `FIXER_REGISTRY`-rader: **49**
  - Extra aktiva pass/validator/policy/repair-call utanför registry: **10**
- Unika triggerpunkter i kod (grupperade callsites): **18**

## Merge-kandidater för plan 05

1. `react-import-fixer` + `react-hook-import-fixer` + `nextjs-navigation-import-fixer` (samma implementation, separata IDs/counters).
2. `llm-syntax-fixer` + `llm-verifier-fixer` + `llm-server-repair` (samma `runLlmFixer`-motor bakom flera gates).
3. `triggerServerVerification` + `triggerBuildErrorRepair` (+ manuell `/repair` route) till en tydligare repair-entrypoint.
4. `runProjectSanityChecks` + `runSeoPreflightChecks` + `crossCheckHrefsAgainstRoutes` + `collectTier2HygieneIssues` till en enad preflight-validatoryta.

## Remove-kandidater för plan 09

1. `llm-partial-file-repair` i `src/lib/gen/stream/finalize-version/partial-file.ts` (telemetri-blockad removekandidat, redan dokumenterad i planerna).

## Unknown-rader som kräver mer info

1. `next-config-remote-patterns` (hardkodad hostlista, oklar canonical owner).
2. `duplicate-default-export-fixer` (aktiv fixer, men registry `sourcePath` är stale).
3. `layout-provider-fixer` (nytta finns, men sitter i wrapper-surface med otydlig framtidsplats).
4. `checkScaffoldImports` (defensiv merge-era guard; kan vara overflodig efter mer scaffold-pruning).

## Tombstones lagda i denna plan

- `src/lib/gen/stream/finalize-version/partial-file.ts`
- `src/lib/gen/autofix/repair-generated-files.ts`
- `src/lib/gen/stream/finalize-preflight.ts`
- `src/lib/gen/stream/finalize-version/verifier-phase.ts`
- `src/lib/gen/autofix/rules/scaffold-import-checker.ts`

Samtliga kommentarer är av typen `TODO(plan-09)` och andrar inte beteende.

## Plan-02 konfliktkontroll

Ingen av tombstone-andringarna ror de skyddade plan-02-filerna (`Version*`, `useBuilder*`, `event-bus*`, `quality-gate-checks.ts`).
