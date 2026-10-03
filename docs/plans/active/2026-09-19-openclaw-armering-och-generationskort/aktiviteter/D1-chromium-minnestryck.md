# D1 — Chromium-core-dump och minnestryck: bevaka, bygg inte om

## Status

**Parkerat, inte löst.** Känd residual av `SM-072`. Ingen kod i det här
initiativet. Beställ ingen ny prune-fix — `#1234` och `#1318` finns redan.

## Vad som observerades

Efter varje bygge tar Sajtmaskin skärmdumpar av den körande previewen med
Chromium i en Vercel-funktion. Processen dör vid nedstängning och Linux skriver
en minnesavbild till `/tmp`.

- 391 MB efter init-postchecken
- 914 MB efter AUTO-FIX-postchecken

Två processer, två filer. Siffran är rapporterad filstorlek på en gles fil, inte
allokerad disk — därför kan 914 MB «rymmas» på en 525 MB-volym. Samma storlek
sågs i `SM-072`-underlaget 2026-09-01.

## Varför det inte blockerade

`/tmp` gick 513 → 305 MB fritt mellan körningarna. Tryckgränsen i
[`src/lib/capture/browser.ts`](../../../../../src/lib/capture/browser.ts) är
200 MB, så nästa Chromium-start överlevde. Båda postcheckarna returnerade
`verdict=passed` och `product_degraded=false`.

Den ursprungliga `SM-072`-skadan — 513 → 31 → 23 MB, nästa start dör, sajten
visas som «Degraderad» — inträffade inte.

De ~208 MB som försvann var **inte** den första dumpen; den prunades före andra
starten. Det är annan `/tmp`-läcka, troligen Playwright-profiler eller
Sparticuz-extraktion. Exakt vad är inte fastställt.

## Förhållande till de andra spåren

Core-dumpen är **en** av varningarna inuti de två «Kontroller att se över»-korten
i spår B1, tillsammans med live review och autofix-risk. Den är inte orsaken
till att korten finns, och inte orsaken till att sajten byggdes.
`product_postcheck.browser_crashed` är avsedd yta: den finns för att göra
kraschen synlig, inte för att blockera.

## Bevakning

Utred vidare först när något av detta inträffar:

- En burst som går **under** 200 MB fritt `/tmp`. Då loggas raden med största
  konsumenter och namnger boven.
- `browser-closed` **med** gott om fritt `/tmp`. Då är det `SM-025`, inte
  `SM-072`.
- Nytt minnes- eller disktryck i en annan capture-väg.

## Owner

- [`src/lib/capture/browser.ts`](../../../../../src/lib/capture/browser.ts)
- [`src/lib/gen/verify/product-postcheck.ts`](../../../../../src/lib/gen/verify/product-postcheck.ts)

Backloggrad: `SM-072` i
[`BUG-SWARM-BACKLOG.md`](../../../../../BUG-SWARM-BACKLOG.md). Ingen ny rad.
