# Källkvittot ljuger nedåt

Våg 1 · Cloud · Ur svärmläsning, **ej omverifierad** · Liten

## Målet

`reachedPrompt` i källkvittot svarar «nej» i fall där inspirationen faktiskt nådde
modellen. Signalen finns för att kunna felsöka frågan «nådde inspirationen
fram?», så ett falskt nej skickar felsökningen åt fel håll.

En signal som ljuger nedåt är värre än ingen signal: den stänger en fråga som
borde stå öppen.

## Fyndet

`reachedPrompt` följer **bara** textblocket `variant_template_inspiration`. Det
blocket kan prunas bort av promptbudgeten. Samtidigt byggs och skickas
variantbilden ändå som visionbilaga — den vägen räknas inte.

Ankare (kommer från en läs-svärm, inte från egen läsning — bekräfta varje rad):

- `src/lib/gen/orchestrate/source-receipt.ts:80`
- `src/lib/gen/system-prompt/budget.ts:43` (pruningen)
- `src/lib/gen/orchestrate/finalize-prompts.ts:152-154` (bilagan byggs)
- `src/lib/gen/stream/codegen-turn.ts:503-506` (bilagan skickas)

## Bekräfta först

Läs de fyra ställena och avgör själv om båda vägarna finns. Går bilden verkligen
fram när textblocket prunas? Om nej — skriv det i rapporten och ändra ingenting.
Ett motbevisat fynd är ett lika värdefullt svar som en fix.

## Fix

Räkna visionbilagan som en väg fram: `reachedPrompt` ska vara sant om
**antingen** textblocket överlevde budgeten **eller** bilden bifogades.

Överväg att skilja på *hur* den nådde fram — men gör inte om hela kvittomodellen
för det. Håll ändringen i den befintliga strukturen.

## Bevis

Test för båda vägarna. Fallet «textblock prunat + bild bifogad» ska ge `true`
och ska falla före fixen.

## Verifiering

```powershell
npm run typecheck
npx vitest run src/lib/gen/orchestrate src/lib/gen/system-prompt
```

## Gör inte

- Bygg inte om kvittomodellen.
- Rör inte budgetens pruning-ordning — bara läsningen av utfallet.
- Slå inte ihop med andra kvittofält i samma PR.
