# B9 — inget ZIP-arkiv i hot path

Styrdokument: [`../00-master-plan.md`](../00-master-plan.md)

Status: **plan** — inte implementerad.
Kräver beslut: nej (liten härdning av befintligt kontrakt), men bör inte
blandas in i [B8](B8-brief-paritet-website-app.md).

## Bakgrund: frågan som ställdes

Ägaren frågade 2026-08-18 om det redan finns ett addendum i Vercel Blob som
LLM-flödet kan hämta inspiration och **delar** ur direkt, utan att ladda ner
hela `.zip`-arkiv — och om inte, att det borde börja göras.

**Svaret är att det redan görs, men inte från Blob.** Kartläggningen:

| Fråga | Verifierat svar |
|---|---|
| Hämtas hela ZIP:ar per generering? | **Nej** i normalfallet |
| Var ligger de förextraherade delarna? | `config/variant-template-addenda.json` — 491 KB, 69 poster, statiskt importerad i bundlen |
| Vad ligger i Blob? | 313 template-ZIP:ar, 313 stillbilder och tre embeddings-index — arkiv och sökindex, inte kodutdrag |
| Vad får LLM:en se? | Max 3 filutdrag / 9 000 tecken (`variant-template-addendum.ts:19-21`) plus **en** stillbilds-URL som providern hämtar — vi laddar aldrig ner bilden |

Kedjan är helt synkron ur bundlad JSON:
`finalizeOrchestrationPrompts` → `resolveVariantTemplateInspiration`
(`template-inspiration.ts:138-155`) → `resolveVariantTemplateAddendum`
(`variant-template-addendum.ts:260-281`) → `## Variant Template Inspiration`
(`scaffold-stack.ts:142-176`).

Att flytta addendumet **till** Blob vore alltså en ny lagringsyta, inte en
saknad förmåga — och den skulle byta en synkron minnesläsning mot ett
nätverksanrop i hot path. Det är fel riktning.

## Problemet som faktiskt finns

Det finns en väg där hot path **ändå** hämtar ett helt ZIP-arkiv.
`resolveVariantTemplateAddendum` returnerar `structuralReferences: null` i tre
lägen, och `null` — till skillnad från tom lista — utlöser ZIP-fallback
(`template-inspiration.ts:399-417`):

| State | `structuralReferences` | ZIP i runtime? |
|---|---|---|
| `hit` (även 0 utdrag) | `[]` | Nej |
| `disabled` | `[]` | Nej |
| `missing` (id saknas i registret) | `null` | **Ja** |
| `stale` (SHA-drift mot manifestet) | `null` | **Ja** |
| `invalid` (schemafel i posten) | `null` | **Ja** |

Fallbacken gör `fetch` av hela arkivet
(`local-v0-template-source.ts:380-415`), med 50 MB tak, 15 s timeout och bara
process-lokal cache som inte överlever en serverless cold start. Mediansnittet
i Blob är ~1,4 MB men 12 arkiv är ≥ 10 MB.

I dag är det **latent**: alla 69 poster finns och SHA-matchar. Men det är
precis den sortens gren som vaknar vid en regenerering av arkivet eller en
raderad post — och då mitt i en användares generering.

### Rättelse till B4

[B4](B4-kurera-variant-addenda.md) påstår att posten med 0 utdrag
(`mEefgKyVifq`) «ger i dag en ZIP-fallback utan att någon vet om det». Det
stämmer inte: `[] !== null`, så den räknas som `hit` och prompten får
«No structural excerpt». Rättat i B4. Slutsatsen där är ändå rätt av ett annat
skäl — **raderar** man posten blir den `missing`, och då blir det ZIP.
`disabled` är rätt åtgärd.

## Uppgift

Gör hot path oförmögen att hämta ett arkiv.

1. Låt `resolveVariantTemplateInspiration` behandla `missing`/`stale`/`invalid`
   som «inget utdrag» — samma utfall som `disabled` — i stället för att falla
   tillbaka på `loadDefaultStructuralReferences`.
2. Behåll stillbilden. Den är en URL som providern hämtar, inte en nedladdning.
3. Gör tystnaden mätbar: varje `missing`/`stale`/`invalid` ska ge en rad som
   går att räkna (samma kanal som B5 använder för shadcn-fel). I dag varnar
   `stale`/`invalid` men `missing` är helt tyst.
4. Flytta ZIP-extraktionen dit den hör hemma: `templates:addenda` (offline) är
   redan enda stället som *behöver* arkivet.
5. `loadLocalV0TemplateReferenceFiles` blir därmed anropslös i `src/` — radera
   den bara efter att `templates:addenda:check` bevisat att registret är
   komplett, annars byter man en långsam väg mot en tom.

## Ägarbeslut 2026-08-19

**ZIP hämtas aldrig för inspiration** när en användarsajt byggs. B9 stänger
fallbacken. Det är inte «välj en hel mall som projekt från prompten».

Init väljer **variant**; varianten har en fast `sourceTemplateIds`-lista; därifrån
tas högst ett addendum-utdrag + stillbild. Promptstyrd mall-inspiration går via
varianten ([B7](B7-variantens-auktoritetsordning.md)). Direkt val bland
`sourceTemplateIds` är en ny förmåga, inte B9. `POST /api/template` får fortfarande
läsa ZIP — det är import, inte inspiration.

## Vad som INTE ingår

- Flytta inte addendumet till Blob. Det är redan snabbare där det ligger.
- Rör inte gränserna (3 utdrag, 9 000 tecken) eller SHA-bindningen.
- Rör inte verbatim-import (`POST /api/template`) — den **ska** läsa hela
  arkivet, det är hela dess uppgift.
- Rör inte stillbilds-kanalen eller vision-budgeten.
- Bygg inte prompt→mall-id-val här. Det är B7 (via variant) eller en senare punkt.

## Verifiering

- `src/lib/gen/scaffold-variants/template-inspiration.test.ts` — befintliga
  fall `:261-275` (giltigt addendum rör inte ZIP-läsaren) och `:288-301`
  (`disabled` rör inte ZIP-läsaren) ska förbli gröna; nya fall för `missing`,
  `stale` och `invalid` ska bevisa samma sak.
- `npm run templates:addenda:check` grön.
- `npm run typecheck` + `npm run scaffolds:validate`.

## Klart när

Ingen kodväg som körs under en användargenerering kan hämta ett
template-arkiv, och de tre tidigare fallback-lägena syns i loggarna i stället
för att tyst kosta upp till 15 sekunder.
