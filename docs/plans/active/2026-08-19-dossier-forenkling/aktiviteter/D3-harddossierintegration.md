# D3 — slå ihop promptblocken till `HardDossierIntegration`

Beror på: [D2](D2-configinputs-providersetup.md). **Börja inte före D2 är mergad.**
Blockerar: inget.

## Problemet

Ett hard-dossier når byggmodellen genom flera separata block som byggs på olika
ställen i `src/lib/gen/system-prompt/sections/dossiers.ts`. Blocken har vuxit fram
ett i taget, och därför finns ingen plats där man kan läsa vad *ett* kopplat
dossier faktiskt skickar. Det gör två saker svåra: att se om två block säger
motstridiga saker, och att lägga till ett fält utan att röra fyra kodvägar.

Med `configInputs` och `providerSetup` från D2 blir det värre om det inte slås
ihop — då är det ytterligare två fält att strö ut.

## Uppgiften

Samla det ett hard-dossier bidrar med till prompten i **en** representation,
`HardDossierIntegration`, och låt renderaren gå via den.

Det här är en refaktor. Prompten som når modellen ska vara **oförändrad** för de
nio hard-dossiererna, med undantag för de fält D2 införde. Bevisa det — ett
golden-test eller ett snapshot-test över den renderade prompten per dossier är
rätt verktyg, och repot har redan mönstret
(`src/lib/providers/own-engine/generation-stream.golden.test.ts`).

## Gränser

- **Lägg inte till ett nytt orkestreringssteg eller en ny signal.**
 [`pipeline-rules.mdc`](../../../../../.cursor/rules/pipeline-rules.mdc) är tydlig:
 stärk befintlig ägare i stället för att införa en ny. Det här är en
 sammanslagning, inte ett nytt lager.
- **Rör inte** `SELECTED_SECTION_CHAR_CAP` eller läges-logiken i
 `resolveInstructionMode`. `selected-sections` för fler dossiers är D4.
- **Rör inte** knappen «Bygg integrationer» — beslut 2026-08-17, se
 [styrdokumentet](../00-master-plan.md#vad-som-inte-ska-göras).
- Soft-dossiers går genom samma renderare. Bryt dem inte medan du städar hard-vägen.

## Klart när

- `HardDossierIntegration` finns och renderaren bygger sitt block ur den.
- Ett test visar att den renderade prompten per hard-dossier är oförändrad frånsett D2-fälten.
- Soft-dossiers renderar oförändrat.
- Hela verifieringslistan i [styrdokumentet](../00-master-plan.md#verifiering-per-ändring) är grön.

## Agentprompt

> Du arbetar i Sajtmaskin. Läs först `AGENTS.md`,
> `docs/contracts/dossier-system.md`, `.cursor/rules/pipeline-rules.mdc` och
> `.cursor/rules/workflow.mdc`. Läs sedan
> `docs/plans/active/2026-08-19-dossier-forenkling/00-master-plan.md` och den här
> filen. Aktiviteten D2 ska redan vara mergad — utgå från `origin/master`.
>
> Uppgift: samla det ett hard-dossier bidrar med till kodgeneratorns prompt i en
> representation, `HardDossierIntegration`, och låt renderaren i
> `src/lib/gen/system-prompt/sections/dossiers.ts` gå via den i stället för via
> flera separata block.
>
> Det är en refaktor: prompten som når modellen ska vara **oförändrad** för de nio
> hard-dossiererna frånsett de fält D2 införde. Skriv ett test som bevisar det —
> repot har golden-test-mönstret i
> `src/lib/providers/own-engine/generation-stream.golden.test.ts`.
>
> Inför inget nytt orkestreringssteg och ingen ny signal; pipeline-regeln förbjuder
> det när befintlig ägare duger. Rör inte `SELECTED_SECTION_CHAR_CAP`,
> `resolveInstructionMode` eller knappen «Bygg integrationer». Soft-dossiers går
> genom samma renderare — bryt dem inte.
>
> Verifiering (allt måste vara grönt): `npm run dossiers:validate-all`,
> `npm run dossiers:capability-map:write`, `npm run docs:generate`,
> `npm run docs:check`, `npm run docs:links`, `npm run typecheck`,
> `npx vitest run src/lib/gen/dossiers`.
>
> Kör ett Cursor Bugbot-pass på din egen diff innan PR (`bugbot`-subagent,
> `readonly: true`, enligt den kanoniska modellregeln). Lämna EN PR mot `master`. **Merga inte.**
