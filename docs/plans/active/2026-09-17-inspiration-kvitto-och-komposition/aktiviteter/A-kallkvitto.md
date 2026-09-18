# A — källkvitto: förfina bild / utdrag / budget-dropp

Styrdokument: [`../00-master-plan.md`](../00-master-plan.md)
Status: inte startad. Undersök först.
Typ: **observability refinement**, inte nytt telemetrisystem.

## Redan på plats (observation)

Källkvittot finns. `GenerationSource` bär id/origin/reason/authority/
`reachedPrompt`. Inmatningen känner redan till:

- `variantTemplateImageSent` — true bara när stillbilden faktiskt ligger
  i vision-payloaden (`source-receipt.ts`, `finalize-prompts.ts`)
- `keptBlockKeys` / pruning
- addendum-`state` (`hit` / `missing` / `stale` / `invalid` / disabled)
- `structuralReferences`

Bygg inte observability från noll.

## Problemet (observation)

En variantreferens kan få `reachedPrompt: true` när **bara stillbilden**
skickades. Det går inte att se om kodutdragen nådde byggmodellen eller
om budgeten strök dem.

```ts
// src/lib/gen/orchestrate/source-receipt.ts — variant-reference
reachedPrompt:
  reachedPrompt(input.pruning, VARIANT_BLOCK_KEYS) ||
  input.variantTemplateImageSent === true
```

Testerna i `source-receipt.test.ts` låser OR-beteendet medvetet
(«text pruned but still image sent» → `true`).
`GenerationSource` har inga separata fält för bild vs text.
Backoffice (`selection_rationale.py`) visar en ja/nej-kolumn. Kontraktet:
`docs/schemas/orchestration-signal-contract.md`.

Inspirationsblocket har prio 84 och är **inte** `required`
(`budget.ts`). Disabled addenda ger tomma utdrag men stillbilden kan
ändå väljas.

## Undersök

1. Vilka fält som redan finns tyst (listan ovan).
2. Var kvittot läses: dump-meta, `generation_telemetry.meta.sources`,
   Selection Rationale.
3. ~~Stickprov på aktuell `preview`~~ — **går inte på befintliga rader.**
   `meta.sources` bär bara kvittots sex fält (`persist-telemetry.ts`);
   `keptBlockKeys` persisteras aldrig, Selection Rationale visar ja/nej,
   och prompt-dumpen hoppas över på prod. Frågan «hur ofta är
   `reachedPrompt` sant utan att inspirationsblocket överlevde budgeten»
   kan därför inte besvaras retroaktivt. Kodobservation, inte hypotes.
4. Om `GenerationSource` kan bära extra flaggor utan att bli ett nytt
   system — IDs/origin/reason/status, aldrig prompttext eller utdrag.

## Fixen kommer före mätningen

Ordningen i planen är «mät först» generellt, men för A gäller det
omvända: emittera de tysta flaggorna, mät sedan på **nya** rader. Punkt 3
ovan visar varför — annars finns inget att mäta.

Separata signaler på befintlig `variant-reference`-rad:

| Signal | Betydelse |
|---|---|
| stillImageSent | stillbilden fanns i visionpayloaden |
| inspirationBlockKept | blocket överlevde promptbudgeten |
| addendumTextSent | blocket överlevde **och** posten hade utdrag |

`stillImageSent` ensamt kan inte skilja bild-only från båda — därav
`inspirationBlockKept`. `addendumPruned` och `noUsableAddendum` härleds ur
de tre plus befintlig `reason` (`addendum:${state}`) och behöver inga egna
fält.

`reachedPrompt` **behålls** som bakåtkompatibel OR. Smalna inte av den:
bild-only skulle då bli `false`, och `sourcesReachedPrompt` plus
historiska tidsserier bryts. Kanalerna är medvetet oberoende — fyra
användarbilder kan tränga ut stillbilden medan textblocket ändå räknas.

Inget nytt kvittosystem, inga nya tabeller, inga utdrag i telemetrin.

## Inte detta steg

- Ändra inte 03 (#1464), Quality Bar, varianter eller extractorn.
- Öppna inte disabled-poster.
- Bygg inte ny Backoffice-yta. Utgå från Selection Rationale.
- Hämta inte ZIP i användarflödet.

## Klart när

En människa kan från ett kvitto säga om en sajt fick **bild**,
**kodutdrag**, båda eller inget — utan att öppna prompt-dumpen.
Befintliga tester uppdateras så OR-sammanblandningen inte längre är
det enda kontraktet.
