# C1 — Visa live-review-bilderna i kontrollresultatet

## Mål

Desktop- och mobilbilden som live review redan tar ska gå att se i
vänsterchatten, hopfällt under kontrollresultatet.

## Rotorsak (bevisad)

Bilderna skapas och lagras. Det som saknas är UI-kopplingen.

- Capture sker i
  [`product-postcheck.ts`](../../../../../src/lib/gen/verify/product-postcheck.ts),
  persist i
  [`live-review.ts`](../../../../../src/lib/gen/verify/live-review.ts) med
  `access: "public"` och filnamn `live-review-{desktop|mobile}-{revision}.jpg`.
- URL:erna skrivs till `live_review_runs` och till
  `engine_version_error_logs` (`category=product_postcheck.live_review`,
  `meta.screenshots`).
- De **når browsern** i syskon-payloaden
  `tool-post-check.output.productPostcheck.screenshots`.
- Den dedikerade `tool-live-review`-delen bär bara verdikten. `LiveReviewRow`
  har inga `img`-element
  ([`LiveReviewRow.tsx`](../../../../../src/components/builder/chat/LiveReviewRow.tsx)).
- Ingen annan builder-, admin- eller backoffice-yta renderar dem. OpenClaw får
  adresserna som text i `[LIVE-REVIEW]`-kontexten, enligt beslutet 2026-08-27.

## Krav

1. Verifiera **först** att `tool-post-check.output.productPostcheck` överlever
   message-persist och omladdning. Det kontraktet är inte bekräftat. Om det inte
   håller: skicka `screenshots` på `tool-live-review` i stället, och acceptera
   att gamla meddelanden saknar bilder.
2. Rendera desktop och mobil som hopfällbara miniatyrer i kontrollresultatet.
   Vänsterkolumnen är smal — visa dem inte expanderade som default.
3. Hantera raderade bilder. Blobbarna städas när nästa revision blir klar och
   har 7 dagars TTL. Ett `onError` som döljer miniatyren räcker; ett trasigt
   bildkryss gör mer skada än ingen bild.
4. Skapa ingen ny lagring, ingen ny capture, ingen ny route.

## Owner

- [`src/components/builder/chat/LiveReviewRow.tsx`](../../../../../src/components/builder/chat/LiveReviewRow.tsx)
- [`src/components/builder/chat/tooling/output-parsers.ts`](../../../../../src/components/builder/chat/tooling/output-parsers.ts)

## Risker

- Blobbarna är avsiktligt publika med osannolik path. Att visa dem i UI ändrar
  inte åtkomstmodellen, men gör adressen lättare att kopiera vidare.
- Bilden visar previewens innehåll, inklusive formulärtext som genererats.
- Inget befintligt beslut förbjuder visning; inget kräver den heller. Om ägaren
  hellre vill ha bilderna bakom en signerad väg är det ett eget spår.

## Tester

1. En completed live review med båda URL:erna renderar två miniatyrer.
2. En skippad live review renderar ingenting, som idag.
3. En raderad blob ger ingen trasig bild.
4. Omladdning av chatten behåller miniatyrerna, eller degraderar tyst.

## Acceptans

Miniatyrerna syns i kontrollresultatet för en färsk körning, och en gammal
körning med städade blobbar ser oförändrad ut.
