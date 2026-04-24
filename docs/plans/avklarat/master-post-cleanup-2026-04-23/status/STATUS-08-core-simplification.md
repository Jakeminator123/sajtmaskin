# STATUS 08 - core simplification (no behavior change)

## Utfall

| Del | Status | Notering |
|---|---|---|
| `orchestrate.ts` mekanisk split | Klar | Policy + package-helpers flyttade till `orchestrate/*` med re-export i `orchestrate.ts`. |
| `route-plan.ts` mekanisk split | Klar | Locale/path/matcher/planning-helpers flyttade till `route-plan/*` med bevarad publik API-yta. |
| No-behavior-change | Klar | Endast kodflytt/kompositionssplit; inga policybrancher eller LLM-call-sekvenser andrade. |

## Radcount fore/efter

| Fil | Fore | Efter | Delta |
|---|---:|---:|---:|
| `src/lib/gen/orchestrate.ts` | 957 | 835 | -122 |
| `src/lib/gen/route-plan.ts` | 742 | 364 | -378 |

## Nya moduler och ansvar

| Modul | Ansvar |
|---|---|
| `src/lib/gen/route-plan/path-utils.ts` | `normalizeRoutePath` + path-extraktion fran App Router-filstigar. |
| `src/lib/gen/route-plan/route-matchers.ts` | Route-pattern-regex + required-route-missmatchning mot faktiska routes. |
| `src/lib/gen/route-plan/locale-dedupe.ts` | Locale-alternate dedupe (`/blog` vs `/blogg` etc.) for planerade routes/path-listor. |
| `src/lib/gen/route-plan/planning-helpers.ts` | Prompt/brief/scaffold-route-adders, explicit page-count och route-removal/intents. |
| `src/lib/gen/orchestrate/policy-helpers.ts` | Build-intent promotion gate + quality-target inheritance helper. |
| `src/lib/gen/orchestrate/generation-package.ts` | GenerationInputPackage-lineage + orchestration dynamic dump-writer. |

## Verifiering

| Kommando | Resultat |
|---|---|
| `npm run test:ci` (fore split) | 219 filer, 1586 tester passerade |
| `npm run test:ci` (efter split) | 219 filer, 1586 tester passerade |
| `npm run lint` | passerade |
| `npm run typecheck` | passerade |

## Planbekraftelse

Plan 08 ar levererad som **full**: mekanisk core-simplification genomford med bevarat beteende och utan policyandringar.
