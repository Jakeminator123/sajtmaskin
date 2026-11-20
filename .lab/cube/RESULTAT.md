# Kuben – labbmätning (2026-11-20, headless Chromium, 1440x900, DPR 1)

Endast labb, ska inte mergas. Skript: Playwright mot `next dev` på `/lab/cube`.

| Kontroll | Resultat |
|---|---|
| 6 sidor + 4 extra vridningar, upprätt och utan transform i vila | 10/10, `transform: none`, sidan 400x560 på samma pixelruta |
| Skärpa: skärmbild av chattsidan före/efter 8 vridningar | byte-identisk (B och A) |
| Utkast, scroll (600 px), `<video>` (MediaStream) efter 10 vridningar + 2 kub/kort-byten | kvar, samma DOM-noder, video spelar |
| Snabba klick (5 flikar, 40 ms isär) | landar på sista (Verktyg), ingen transform kvar |
| Avbrott mitt i vridning (B) | max 16°/ruta, sidor dyker upp/försvinner kantställda |
| Drag-clamp | 12 px marginal på alla kanter; knapp i huvudet startar ingen dragning |
| Grepp + piltangenter | +10 px, Skift +40 px |
| Reducerad rörelse | 0 transformer observerade; opacitet 0,81 mitt i övertoningen |
| 390 px | flikläge i full bredd, ingen dragning, ingen horisontell scroll |
| Dold sida: `content-visibility`/`visibility` | scrollTop läsbar 600 medan dold; video spelar |
| Dold sida: `display:none` | scrollTop läses 0 medan dold, återställs till 600 vid visning; video spelar |
| Rutor under 8 vridningar (headless, mjukvarurendering) | B p50 16,7 ms, A p50 16,7 ms; skillnaden inom brus |
