# D — bättre signal i redan säker extractor

Styrdokument: [`../00-master-plan.md`](../00-master-plan.md)
Status: väntar A.
Typ: **urval/prioritering**, inte omskrivning.

## Redan bra (observation)

Offline-extractorn (`templates:addenda` →
`extractVariantTemplateStructuralReferences`) är redan hård på säkerhet
och frontend-kontrakt:

- server/API/backend filtreras (`use server`, `next/server`, `server-only`, `/api/`)
- direktkomponent måste vara frontend-JSX (`.tsx`/`.jsx` + JSX-tagg)
- hash-binding / `extractorSha256`
- max 3 utdrag, 9 000 tecken totalt, per-fil-tak
- runtime hämtar inte ZIP i användarflödet
- `disabled` / `missing` / `stale` / `invalid` ger inga utdrag

Skriv inte om extractorn från grunden.

## Problemet (observation)

När flera frontendkomponenter kvalificerar väljs i praktiken den
**längsta**. Ordningen är page → direct-component → globals.css →
root-layout:

```ts
// src/lib/gen/scaffold-variants/template-inspiration.ts
frontendCandidates
  .filter((file) => /(^|\/)components?\//i.test(path))
  .sort(longestFirst)[0]
```

Längd ≠ kompositionsbärande design. Standardknappar och stora
tokenlistor kan tränga ut hero, nav och sektionsrytm.

Stillbilden kan ändå väljas när utdrag saknas — mät det i A.

## Undersök

1. A:s kvitto: hur ofta init/`clear-redesign` har bild men 0 utdrag, vs
   utdrag som är `components/ui/*` / globals-tokens. *(hypotes tills mätt)*
2. Stickprov i `config/variant-template-addenda.json` (bara
   `generated`/`reviewed`): hur många `direct-component` är hero/nav vs
   button/card/token-dump.
3. Om `looksLikeFrontendComponent` redan filtrerar hooks — och vad som
   ändå släpps igenom.
4. Nästa kurering: vilka **aktiva** poster som vinner på om-extraktion
   efter en ev. extractorändring. Inte «kör om alla 69».

## Möjlig fix (bara efter belägg)

Prioritera utdrag som visar hero, navigation eller sektionsrytm före
största generiska komponent. Behåll `page → … → layout`, hash och
storleksgränser. Skriv om bara utvalda `generated`-poster via Template
Curator (`templates:addenda --write --ids=…`). Rör inte `reviewed` utan
mänsklig genomgång. Rör inte de sju `disabled`.

## Inte detta steg

- Återaktivera inte MindSpace, Flowly, Pixar, SaaSify, Docs, Shadcn
  Dashboard eller Marketing Website.
- Ändra inte max 3 / 9 000 / SHA-bindning.
- Bygg inget nytt kurationsverktyg.
- Kör inte extractorn över hela registret «för att uppdatera».

## Klart när

Extractorn (eller en dokumenterad kureringsregel) väljer
kompositionsbärande utdrag före längsta generiska komponent, och A:s
kvitto kan visa att sådana utdrag faktiskt nådde prompten i ett
stickprov. `templates:addenda:check` förblir grön.
