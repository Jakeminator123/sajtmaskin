# D — vilka kodutdrag som väljs

Styrdokument: [`../00-master-plan.md`](../00-master-plan.md)
Status: väntar A.

## Problemet

Offline-extractorn (`templates:addenda` →
`extractVariantTemplateStructuralReferences`) tar högst tre utdrag i
ordning **sida → direktkomponent → global CSS → root-layout**.
Direktkomponenten är den **längsta** frontendfilen under `components/`:

```ts
// src/lib/gen/scaffold-variants/template-inspiration.ts
// direktkomponent = längsta frontendfil under components/
frontendCandidates
  .filter((file) => /(^|\/)components?\//i.test(path))
  .sort(longestFirst)[0]
```

Längd ≠ intressant design. Standardknappar och stora tokenlistor kan
tränga ut hero, nav och sektionskomposition. Hashkontroll,
`extractorSha256` och taket (3 filer, 9 000 tecken) ska stå kvar.

Runtime skickar de lagrade utdragen; den hämtar inte ZIP i
användarflödet. `disabled` / `missing` / `stale` / `invalid` ger inga
utdrag. Stillbilden kan ändå väljas — mät det i A.

## Undersök

1. A:s kvitto: hur ofta init/`clear-redesign` har bild men 0 utdrag, vs
   utdrag som är `components/ui/*` / globals-tokens.
2. Stickprov i `config/variant-template-addenda.json` (bara
   `generated`/`reviewed`): hur många `direct-component` är hero/nav vs
   button/card/token-dump.
3. Om `looksLikeFrontendComponent` redan filtrerar hooks — och vad som
   ändå släpps igenom.
4. Nästa kurering: vilka **aktiva** poster som vinner på om-extraktion
   efter en ev. extractorändring. Inte «kör om alla 69».

## Möjlig fix (bara efter belägg)

Vid nästa kurering: prioritera utdrag som visar hero, navigation eller
sektionsrytm. Behåll `page → … → layout`, hash och storleksgränser.
Skriv om bara utvalda `generated`-poster via Template Curator
(`templates:addenda --write --ids=…`). Rör inte `reviewed` utan
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
