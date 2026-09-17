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
3. Stickprov på aktuell `preview`: hur ofta är `reachedPrompt` sant utan
   att `variant_template_inspiration` finns i `keptBlockKeys`.
   *(hypotes tills mätt)*
4. Om `GenerationSource` kan bära extra flaggor utan att bli ett nytt
   system — IDs/origin/reason/status, aldrig prompttext eller utdrag.

## Möjlig fix (bara efter belägg)

Separata signaler på befintlig `variant-reference`-rad, till exempel:

| Signal | Betydelse |
|---|---|
| stillImageSent | stillbilden fanns i visionpayloaden |
| addendumTextSent | textblocket överlevde budget **och** posten hade utdrag |
| addendumPruned | inspiration vald, textblocket prunat |
| noUsableAddendum | disabled/missing/stale/invalid, ev. bara bild |

`reachedPrompt` kan behållas som bakåtkompatibel OR, eller smalnas av
när UI:t visar de nya fälten. Inget nytt kvittosystem.

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
