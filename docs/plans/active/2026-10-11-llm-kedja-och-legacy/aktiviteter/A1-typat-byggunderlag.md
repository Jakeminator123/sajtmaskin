# A1 — ett beslutat byggunderlag

Utförare: 1. Beroende: registrering och skrivpaket från samordnaren.
Status: se [körbordet](../00-master-plan.md).

## Ändring

Utgå från `src/lib/gen/generation-input-package.ts` och dess builder i
`orchestrate/generation-package.ts`. Följ överlämningen genom
`own-engine/session/own-engine-pipeline-generation.ts`, provider-streamen och
`gen/stream/finalize-version/{types,runner}.ts`.

1. Gör beslutade fält som behövs nedströms typade och entydiga. Skilj
   requested/approved/present/removed och frånvaro från en explicit tom lista.
2. Ersätt manuell parallell överföring där den är samma semantik; använd smala
   projektioner av befintligt paket. Ingen ny allomfattande context-bag.
3. Ta bort finalizerns återselektion för moderna anrop. Historiska sparade
   format normaliseras vid en tydlig gräns där kompatibilitet behövs.
4. Förenkla init/followup:s dubbla fan-in där gemensamma anrop faktiskt räcker.
   Behåll avsiktliga skillnader, såsom planläge och init-lås.

## Klart och verifiering

Valda dossiers/variant/routes kommer från samma beslut; finalize gissar inte
om det. Import, explicit borttagning och `[]` bevaras. Befintliga nära tester
återanvänds; komplettera just kontraktsluckorna + typecheck. Testa inga modeller
live bara för denna typ-/överföringsändring. Lista borttagna fallbacks och
de eventuella äldre konsumenter som fortfarande kräver adapter.

## Resultat

A1.2 implementerad lokalt på `b5b7474e…`; oberoende review klar. Init och
followup skickar samma smala projektion av `GenerationInputPackage` genom
provider-streamen till finalizer. Finalizer använder beslutade dossiers,
variant, routes och providerkontrakt direkt, inklusive explicit `[]` och
borttagningar; äldre anrop utan paket behåller metadatanormalisering vid
gränsen. Duplicerad `OrchestrationBaseLike`, fem separata överföringsfält per
init/followup och dubbel dossierupplösning togs bort. Tolv kod-/testfiler
ändrades. Node 22.23.1; 227 riktade tester, typecheck och `git diff --check`
passerade. `verify:pr -- --plan` valde full CI-profil. Ingen commit/push eller
live-modellkörning.

Readonly-review fann inga konkreta revisions-, tenant- eller
kompatibilitetsfel i det frysta 12-filsdeltat. Bevisgräns: ingen live-runtime
eller persistens; followup-mock bevisar inte ensam paketidentitet genom varje
providerbyte/importväg. Detta följs i A2/runtimeacceptans, inte som A1-fynd.
