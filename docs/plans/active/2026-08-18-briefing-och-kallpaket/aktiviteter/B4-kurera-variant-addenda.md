# B4 — kurera variant-addendumen

Styrdokument: [`../00-master-plan.md`](../00-master-plan.md)

## Problemet

Variant-template-addendumet är den källa som ger kodgeneratorn **konkret
kodinspiration** vid init — och ingen post är granskad.

Räknat i `config/variant-template-addenda.json` 2026-08-18:

| Mått | Värde |
|---|---|
| poster totalt | 69 |
| `reviewStatus: generated` | 69 |
| `reviewStatus: reviewed` | 0 |
| `reviewStatus: disabled` | 0 |
| poster med 3 utdrag | 66 |
| poster med 2 utdrag | 2 |
| poster med 0 utdrag | 1 |

Alla 31 variantfiler i `config/scaffold-variants/` bär `sourceTemplateIds`, och
tillsammans pekar de på samma 69 ID. Runtime accepterar `generated` som träff
(`src/lib/gen/scaffold-variants/variant-template-addendum.ts:219-235`) — `reviewed`
krävs inte. Maskinellt extraherade utdrag ur samma templatepool är alltså den
konkreta kodreferens varje ny sajt får se.

Det är den mest sannolika enskilda orsaken till att genererade sajter känns lika:
samma hero, samma kortgrid, samma bakgrundsmönster om samma referenser återkommer.

Verktyget finns: Backoffice **Template Curator**
(`backoffice/pages/template_curator.py`) kör de runner-ägda kommandona
`templates:addenda --write` och `templates:addenda:check`, och har redan
`--refresh-reviewed` som ersätter maskinutdrag med manuella.

## Uppgift

Granska de mest använda posterna manuellt och stäng de generiska. Detta är
huvudsakligen **kurationsarbete**, inte kodarbete.

Krav:

- Använd B3:s källkvitto för att lista vilka template-ID som faktiskt valts
  oftast. Utan den listan blir urvalet en gissning — **kör B3 först**.
- Granska de tio mest använda: markera `reviewed` med en kort `reviewNotes`, eller
  `disabled` när referensen är för generisk eller inte tillför något.
- `disabled` måste ha noll `structuralReferences` — schemat kräver det
  (`variant-template-addendum.ts:95-99`).
- Sprid urvalet: kontrollera att en landningssida, en app, en portfolio och en
  redaktionell sajt inte får referenser ur samma kategori. Kandidatpoolen ligger i
  varianternas `sourceTemplateIds`.
- Markera posten med 0 utdrag `disabled` — **radera den inte**. En
  `generated`-träff med tom `structuralReferences` är `hit` med `[]` och går
  **inte** till ZIP-läsaren (`template-inspiration.ts`); tom `generated` är
  alltså tyst «ingen kodinspiration», inte en dold ZIP. [B9](B9-inget-zip-i-hot-path.md)
  stänger ZIP-vägen även för `missing` / `stale` / `invalid` (tomma utdrag +
  varning). `disabled` är ändå rätt när posten medvetet inte ska ge inspiration.
- Dokumentera i `docs/architecture/templates.md` att `generated` inte är samma
  kvalitetsnivå som `reviewed`, och vad runtime gör med respektive status.

## Vad som INTE ingår

- Ändra inte gränserna (max 3 utdrag, 9 000 tecken) och inte SHA-bindningen.
  De är rätt avvägda och skyddar mot att ett regenererat arkiv smyger in.
- Kör inte om extraktorn över alla 69 för att «uppdatera» dem — det byter bara ut
  ogranskat mot ogranskat.
- Bygg inget nytt kurationsverktyg. Template Curator finns.
- Rör inte Blob-manifestet eller de faktiska ZIP-arkiven.

## Verifiering

- `npm run typecheck` (schemat är typat) + `npm run scaffolds:validate`.
- `src/lib/gen/scaffold-variants/variant-template-addendum.test.ts` och
  `variant-integrity.test.ts`.
- `templates:addenda:check` ska vara grön efter ändringen: alla ID finns i
  manifestet och alla SHA matchar.
- Backoffice-testerna för curator: `backoffice/test_template_curator_*.py`.
- Manuell: generera fyra sajter av olika typ och jämför vilka referenser som valdes
  via B3-kvittot.

## Klart när

Minst tio poster har en mänsklig bedömning, minst en generisk referens är
`disabled`, och `docs/architecture/templates.md` säger vad statusarna betyder.
