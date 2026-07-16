# Init och follow-up

Init och follow-up använder samma generation core men har olika ansvar. Init
bygger projektets grund. Follow-up ändrar en befintlig graph.

## Init

Init är den första riktiga code generation-rundan i chatten. Den får välja:

- scaffold och variant,
- route plan,
- capabilities och dossiers,
- BuildSpec för den första versionen.

En runda efter en kontraktsfråga kan fortfarande ha init-semantik om ingen kod
har genererats ännu. Den bedömningen ägs av `isEffectiveInit()` i
`src/lib/gen/build-spec/`.

## Follow-up

Follow-up är en deltaoperation. Tidigare version och orchestration snapshot är
basen; den nya prompten beskriver vad som ska ändras.

Standardkontraktet är:

- scaffold bevaras,
- variant bevaras för att undvika design drift,
- tidigare routes är ett **floor**, inte ett ceiling,
- capabilities får växa men inte tyst försvinna,
- high-value UI ska inte tappas utan tydlig signal.

Ett route floor betyder att befintliga routes ska finnas kvar, inte att nya
routes är förbjudna.

## Redesign och borttagning

En full rematch av scaffold eller variant kräver en tydlig redesign-signal.
Kosmetiska ord eller en lokal layoutändring ska inte räcka.

Capability removal är ett separat explicit undantag. När användaren tydligt ber
att ta bort en integration får dess capability och dossierfiler försvinna, men
delade filer som fortfarande ägs av ett aktivt dossier ska bevaras.

## F3-follow-up

Can-only-grow gäller som grund även i follow-up. I F3 filtreras därefter
capability-setet till det användaren frågar efter, uttryckligen godkända
providers och integrationer med filbevis. Det hindrar en liten F3-åtgärd från
att återaktivera alla capabilities som en äldre brief någon gång nominerade.

Ägarskap finns i [`../architecture/code-map.md`](../architecture/code-map.md).
Bindande invariants och fördjupning:

- [`../architecture/llm-pipeline.md`](../architecture/llm-pipeline.md)
- [`../architecture/runtime-contracts.md`](../architecture/runtime-contracts.md)
- [`mental-model.md`](mental-model.md)
