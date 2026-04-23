# Fixer Surface Matrix (Plan 04)

Inventeringstidpunkt: `2026-04-23` mot branch `plan-04-fixer-surface`.

- Aktiv yta i matrisen: **59 rader** (`49` från `FIXER_REGISTRY` + `10` aktiva pass/validator/policy utanför registry).
- Unika triggerpunkter i kod: **18**.

| # | Fixer/pass | Triggerpunkt (kod) | Fas | Typ | Init/follow-up | F2 | Status | Legacy/notering |
|---|---|---|---|---|---|---|---|---|
| 1 | `escape-leakage-fixer` | `runAutoFixSinglePass()` i `src/lib/gen/autofix/pipeline.ts` | 2 | mekanisk | bada | ja | keep | - |
| 2 | `use-client-fixer` | `runAutoFixSinglePass()` i `src/lib/gen/autofix/pipeline.ts` | 2 | mekanisk | bada | ja | keep | - |
| 3 | `tier3-sdk-guard-fixer` | `runAutoFixSinglePass()` i `src/lib/gen/autofix/pipeline.ts` | 2 | mekanisk | bada | ja | keep | F2-hardguard |
| 4 | `import-validator` | `runAutoFixSinglePass()` i `src/lib/gen/autofix/pipeline.ts` | 2 | mekanisk | bada | ja | keep | - |
| 5 | `react-import-fixer` | `runAutoFixSinglePass()` i `src/lib/gen/autofix/pipeline.ts` | 2 | mekanisk | bada | ja | merge | Delad implementation med #6/#7 |
| 6 | `react-hook-import-fixer` | `runAutoFixSinglePass()` i `src/lib/gen/autofix/pipeline.ts` | 2 | mekanisk | bada | ja | merge | Delad implementation med #5/#7 |
| 7 | `nextjs-navigation-import-fixer` | `runAutoFixSinglePass()` i `src/lib/gen/autofix/pipeline.ts` | 2 | mekanisk | bada | ja | merge | Delad implementation med #5/#6 |
| 8 | `react-type-import-fixer` | `runAutoFixSinglePass()` i `src/lib/gen/autofix/pipeline.ts` | 2 | mekanisk | bada | ja | keep | - |
| 9 | `import-alias-type-syntax-fixer` | `runAutoFixSinglePass()` i `src/lib/gen/autofix/pipeline.ts` | 2 | mekanisk | bada | ja | keep | - |
| 10 | `type-only-import-fixer` | `runAutoFixSinglePass()` i `src/lib/gen/autofix/pipeline.ts` | 2 | mekanisk | bada | ja | keep | - |
| 11 | `value-used-from-type-import-fixer` | `runAutoFixSinglePass()` i `src/lib/gen/autofix/pipeline.ts` | 2 | mekanisk | bada | ja | keep | - |
| 12 | `dom-builtin-jsx-fixer` | `runAutoFixSinglePass()` i `src/lib/gen/autofix/pipeline.ts` | 2 | mekanisk | bada | ja | keep | - |
| 13 | `duplicate-import-local-type-collision-fixer` | `runAutoFixSinglePass()` i `src/lib/gen/autofix/pipeline.ts` | 2 | mekanisk | bada | ja | keep | - |
| 14 | `type-only-module-default-import-fixer` | `fixTypeOnlyModuleDefaultImports()` i `src/lib/gen/stream/finalize-merge.ts` | 2 | mekanisk | bada | ja | keep | Post-merge cross-file pass |
| 15 | `next-image-import-fixer` | `runAutoFixSinglePass()` i `src/lib/gen/autofix/pipeline.ts` | 2 | mekanisk | bada | ja | keep | - |
| 16 | `next-og-image-response-import-fixer` | `runAutoFixSinglePass()` i `src/lib/gen/autofix/pipeline.ts` | 2 | mekanisk | bada | ja | keep | - |
| 17 | `local-symbol-import-fixer` | `runAutoFixSinglePass()` i `src/lib/gen/autofix/pipeline.ts` | 2 | mekanisk | bada | ja | keep | - |
| 18 | `local-named-import-default-fixer` | `runAutoFixSinglePass()` i `src/lib/gen/autofix/pipeline.ts` | 2 | mekanisk | bada | ja | keep | - |
| 19 | `local-default-import-fixer` | `runAutoFixSinglePass()` i `src/lib/gen/autofix/pipeline.ts` | 2 | mekanisk | bada | ja | keep | - |
| 20 | `import-declaration-conflict-fixer` | `runAutoFixSinglePass()` i `src/lib/gen/autofix/pipeline.ts` | 2 | mekanisk | bada | ja | keep | - |
| 21 | `duplicate-import-binding-fixer` | `runAutoFixSinglePass()` i `src/lib/gen/autofix/pipeline.ts` | 2 | mekanisk | bada | ja | keep | - |
| 22 | `metadata-import-fixer` | `runAutoFixSinglePass()` i `src/lib/gen/autofix/pipeline.ts` | 2 | mekanisk | bada | ja | keep | - |
| 23 | `metadata-route-import-fixer` | `runAutoFixSinglePass()` i `src/lib/gen/autofix/pipeline.ts` | 2 | mekanisk | bada | ja | keep | - |
| 24 | `cn-import-conflict-fixer` | `runAutoFixSinglePass()` i `src/lib/gen/autofix/pipeline.ts` | 2 | mekanisk | bada | ja | keep | - |
| 25 | `cn-import-fixer` | `runAutoFixSinglePass()` i `src/lib/gen/autofix/pipeline.ts` | 2 | mekanisk | bada | ja | keep | - |
| 26 | `lucide-image-fixer` | `runAutoFixSinglePass()` i `src/lib/gen/autofix/pipeline.ts` | 2 | mekanisk | bada | ja | keep | - |
| 27 | `lucide-link-fixer` | `runAutoFixSinglePass()` i `src/lib/gen/autofix/pipeline.ts` | 2 | mekanisk | bada | ja | keep | - |
| 28 | `tailwind-font-arbitrary-fixer` | `runAutoFixSinglePass()` i `src/lib/gen/autofix/pipeline.ts` | 2 | mekanisk | bada | ja | keep | - |
| 29 | `font-import-fixer` | `runAutoFixSinglePass()` i `src/lib/gen/autofix/pipeline.ts` | 2 | mekanisk | bada | ja | keep | - |
| 30 | `metadata-client-conflict-fixer` | `runAutoFixSinglePass()` i `src/lib/gen/autofix/pipeline.ts` | 2 | mekanisk | bada | ja | keep | - |
| 31 | `icon-component-value-fixer` | `runAutoFixSinglePass()` i `src/lib/gen/autofix/pipeline.ts` | 2 | mekanisk | bada | ja | keep | - |
| 32 | `as-const-boolean-keys` | `runAutoFixSinglePass()` i `src/lib/gen/autofix/pipeline.ts` | 2 | mekanisk | bada | ja | keep | - |
| 33 | `r3f-vector-tuple-fixer` | `runAutoFixSinglePass()` i `src/lib/gen/autofix/pipeline.ts` | 2 | mekanisk | bada | ja | keep | - |
| 34 | `scroll-smooth-html-fixer` | `runAutoFixSinglePass()` i `src/lib/gen/autofix/pipeline.ts` | 2 | mekanisk | bada | ja | keep | Next16-compat |
| 35 | `scroll-smooth-css-fixer` | `runAutoFixSinglePass()` i `src/lib/gen/autofix/pipeline.ts` | 2 | mekanisk | bada | ja | keep | Next16-compat |
| 36 | `tier2-preview-basepath-next-config` | `runAutoFixSinglePass()` i `src/lib/gen/autofix/pipeline.ts` | 2 | mekanisk | bada | ja | keep | preview-host hardening |
| 37 | `tailwind-apply-component-fixer` | `runAutoFixSinglePass()` i `src/lib/gen/autofix/pipeline.ts` | 2 | mekanisk | bada | ja | keep | - |
| 38 | `next-config-remote-patterns` | `repairGeneratedFiles()` i `src/lib/gen/autofix/repair-generated-files.ts` (kallas av preflight/preview/export) | 2 | mekanisk | bada | ja | unknown | Hardkodad hostlista, oklar framtida agare |
| 39 | `duplicate-default-export-fixer` | `runImportValidator()` via `runAutoFixSinglePass()` | 2 | mekanisk | bada | ja | unknown | Registry pekar stale `sourcePath` |
| 40 | `layout-provider-fixer` | `repairGeneratedFiles()` i `src/lib/gen/autofix/repair-generated-files.ts` | 2 | mekanisk | bada | ja | unknown | Wrapper-bunden post-merge guard |
| 41 | `syntax-validator` | `validateSyntax()` i `runAutoFixSinglePass()` | 2 | validator | bada | ja | keep | - |
| 42 | `jsx-checker` | `runJsxChecker()` i `runAutoFixSinglePass()` | 2 | validator+mekanisk | bada | ja | keep | - |
| 43 | `dep-completer` | `runDepCompleter()` i `runAutoFixSinglePass()` | 2 | validator+mekanisk | bada | ja | keep | - |
| 44 | `dep-version-validator` | `validateAndUpgradeDeps()` i `runAutoFixSinglePass()` | 2 | validator+mekanisk | bada | ja | keep | - |
| 45 | `llm-syntax-fixer` | `validateAndFixInner()` + warm tsc/eslint-fix i `src/lib/gen/autofix/validate-and-fix.ts` | 2 | llm | bada | ja | merge | En av flera `runLlmFixer`-gates |
| 46 | `llm-verifier-fixer` | `runVerifierPhase()` i `src/lib/gen/stream/finalize-version/verifier-phase.ts` | 2/3 | llm | bada | ja | merge | En av flera `runLlmFixer`-gates |
| 47 | `llm-partial-file-repair` | `tryRepairPartialFileOutput()` i `src/lib/gen/stream/finalize-version/partial-file.ts` | 2 | llm | bada | ja | remove | Redan markerad som removekandidat i telemetri-plan |
| 48 | `llm-server-repair` | `runRepairLoop()` i `src/lib/gen/verify/repair-loop.ts` (server-verify + `/repair`) | 3 | llm | bada | ja | merge | En av flera `runLlmFixer`-gates |
| 49 | `verifier-pass` | `runVerifierPhase()` -> `runVerifierPass()` | 2/3 | hybrid (deterministisk + llm read-only) | bada | ja | keep | - |
| 50 | `checkScaffoldImports` | `mergeGeneratedProjectFiles()` i `src/lib/gen/stream/finalize-merge.ts` | 2 | mekanisk | bada | ja | unknown | Defensive merge-era guard (tombstone satt) |
| 51 | `runProjectSanityChecks` | `runFinalizePreflight()` i `src/lib/gen/stream/finalize-preflight.ts` | 2 | validator | bada | ja | merge | Overlap med andra preflight-validatorer |
| 52 | `runSeoPreflightChecks` | `runFinalizePreflight()` i `src/lib/gen/stream/finalize-preflight.ts` | 2 | validator | bada | ja | merge | Overlap med preflight quality-surface |
| 53 | `crossCheckHrefsAgainstRoutes` | `runFinalizePreflight()` i `src/lib/gen/stream/finalize-preflight.ts` | 2 | validator | bada | ja | merge | Egen pass trots samma preflight-fas |
| 54 | `collectTier2HygieneIssues` | intern pass i `runFinalizePreflight()` | 2 | validator | bada | ja | merge | Kandidat till enad preflight-validator |
| 55 | `resolveServerRepairEarlyStopReason` | `runRepairLoop()` i `src/lib/gen/verify/repair-loop.ts` | none | policyregel | bada | ja | keep | Gate-fix for quality-gate-only fel |
| 56 | `triggerServerVerification` | `src/lib/gen/verify/server-verify.ts` (post-finalize bakgrundsloop) | 3 | repair-call orchestrator | bada | ja | merge | Delad loop med andra entrypoints |
| 57 | `triggerBuildErrorRepair` | `src/lib/gen/verify/server-verify.ts` (preview build-error trigger) | 3 | repair-call orchestrator | bada | ja | merge | Delad loop med #56 och manuell `/repair` |
| 58 | `resolveVerifierPassPolicy` | `runFinalizeFastPath()` i `src/lib/gen/stream/finalize-version/fast-path.ts` | none | policyregel | bada | ja | keep | - |
| 59 | `resolveFinalizePathPolicy` | `finalizeAndSaveVersion()` i `src/lib/gen/stream/finalize-version/runner.ts` | none | policyregel | bada | ja | keep | Legacy light/deep split efter hardcoded flaggor |

## Merge-kandidater (plan 05)

- `react-import-fixer` + `react-hook-import-fixer` + `nextjs-navigation-import-fixer`: en implementation men tre IDs/counters.
- `llm-syntax-fixer` + `llm-verifier-fixer` + `llm-server-repair` (+ entrypoint-split #56/#57): flera repair-gates runt samma `runLlmFixer`.
- `runProjectSanityChecks` + `runSeoPreflightChecks` + `crossCheckHrefsAgainstRoutes` + `collectTier2HygieneIssues`: fyra separata validatorpass i samma preflightfas.

## Remove-kandidater (plan 09)

- `llm-partial-file-repair`: redan dokumenterad som telemetri-blockad removekandidat nar fast-tier byts och fullfiler blir stabila.

## Unknown-kandidater (kraver mer data)

- `next-config-remote-patterns`: hardkodade hosts kan vara ratt idag men agarskap saknar canonical config-kalla.
- `duplicate-default-export-fixer`: aktiv, men registry-metadata pekar fel `sourcePath`, oklart om split/rename blev halvklart.
- `layout-provider-fixer`: ger skydd men ligger i wrappern `repairGeneratedFiles`, svag signal om fortsatt separat pass.
- `checkScaffoldImports`: defensiv merge-era guard som kan vara onodig om scaffold-defaults fortsatter fasas ut.
