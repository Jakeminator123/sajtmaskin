# Code map

Den här kartan pekar enbart på primära owners. Den ersätter inte IDE-index,
`rg` eller runtime-registries.

| Område                     | Primär ägare                                                                                                         |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Builder och chat           | `src/app/builder/`, `src/components/builder/`, `src/lib/hooks/chat/`                                                 |
| Engine API                 | `src/app/api/engine/`, `src/lib/api/engine/`                                                                         |
| Own-engine boundary        | `src/lib/own-engine/`, `src/lib/providers/own-engine/`                                                               |
| Orkestrering               | `src/lib/gen/orchestrate.ts`, `src/lib/gen/orchestrate/`                                                             |
| BuildSpec                  | `src/lib/gen/build-spec/`                                                                                            |
| Prompt                     | `src/lib/gen/system-prompt/`, `config/prompt-core/`                                                                  |
| Scaffolds                  | `src/lib/gen/scaffolds/`                                                                                             |
| Variants                   | `src/lib/gen/scaffold-variants/`, `config/scaffold-variants/`                                                        |
| Capabilities och dossiers  | `src/lib/gen/dossiers/`, `data/dossiers/`                                                                            |
| Routes och contracts       | `src/lib/gen/route-plan/`, `src/lib/gen/contract/`                                                                   |
| Normalize                  | `src/lib/gen/autofix/`                                                                                               |
| RepairGate och repair-loop | `src/lib/gen/autofix/llm-repair-gate.ts`, `src/lib/gen/verify/repair-loop.ts`, `src/lib/gen/verify/server-verify.ts` |
| Finalize                   | `src/lib/gen/stream/finalize-version/`, `src/lib/gen/stream/finalize-merge.ts`                                       |
| Verify                     | `src/lib/gen/verify/`                                                                                                |
| Preview                    | `src/lib/gen/preview/`, `preview-host/`                                                                              |
| Persistens                 | `src/lib/db/`, `scripts/db/`                                                                                         |
| Status och loggning        | `src/lib/logging/`, `scripts/observability/`                                                                         |
| Env                        | `src/lib/env.ts`, `config/env-policy.json`, `scripts/env/`                                                           |
| Modeller                   | `config/ai_models/manifest.json`, `src/lib/models/`                                                                  |
| Templates                  | `src/lib/templates/`, `src/app/api/template/`                                                                        |
| Publicering                | `src/app/api/v0/deployments/`, `src/lib/deploy/`                                                                     |

Om kartan behöver exakta radnummer eller fullständiga inventarier ska den
informationen genereras eller valideras i kod i stället.
