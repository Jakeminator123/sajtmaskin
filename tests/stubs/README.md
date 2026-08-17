# `tests/stubs`

Handskrivna Clerk-falsker för **det här repots** tester och typecheck. Inte en lokal körningsdump, och inte Sajtmaskins produktion.

`@clerk/nextjs` tillhör den _genererade_ användarsajten (Byggblocket `clerk-auth`). Sajtmaskin själv har inte paketet installerat. Därför aliasar `tsconfig.json` och `vitest.config.ts` importen hit, så dossier-komponenttester kan resolva utan riktig SDK.

| Yta                                   | Vad som körs                                            |
| ------------------------------------- | ------------------------------------------------------- |
| Sajtmaskin i prod                     | Inte de här filerna. Ingen Clerk-import i appen.        |
| Genererad användarsajt med inloggning | Riktiga `@clerk/nextjs` från dossierets `package.json`. |
| CI / `vitest` / `tsc` i det här repot | Stubbarna, så typecheck inte kräver Clerk-SDK:n.        |

Warm-cache/pre-VM typecheck aliasar **inte** hit — den droppar oavgörbara modul-fel i stället (`src/lib/gen/preview/generated-only-modules.ts`).
