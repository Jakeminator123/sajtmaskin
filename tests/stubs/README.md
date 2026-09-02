# `tests/stubs`

Handskrivna providerfalsker för **det här repots** dossier-tester och typecheck. Inte en lokal körningsdump, och inte Sajtmaskins produktion.

`@clerk/nextjs`, `@calcom/embed-react` och `matter-js` tillhör _genererade_ användarsajter (Byggblocken `clerk-auth`, `calcom-booking` respektive `matter-physics-2d`). Sajtmaskin själv har inte paketen installerade. Därför aliasar `tsconfig.json` och `vitest.config.ts` importerna hit, så dossier-komponenttester kan resolva utan riktiga SDK:er.

| Yta                                       | Vad som körs                                                            |
| ----------------------------------------- | ----------------------------------------------------------------------- |
| Sajtmaskin i prod                         | Inte de här filerna. Inga providerimporter från dessa dossiers i appen. |
| Genererad användarsajt med valt byggblock | Riktigt providerpaket från dossierets materialiserade `package.json`.    |
| CI / `vitest` / `tsc` i det här repot     | Stubbarna, så typecheck inte kräver provider-SDK:erna i plattformsappen. |

Warm-cache/pre-VM typecheck aliasar **inte** hit — den droppar oavgörbara modul-fel i stället (`src/lib/gen/preview/generated-only-modules.ts`).
