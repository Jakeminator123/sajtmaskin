# Builder: en tydlig visningskedja

Detta dokument beskriver **en** mental modell för hur användaren ser genererad sajt i byggaren — utan att blanda in interna API-namn (`/api/preview-render`, “fidelity”, “legacy”) i användargränssnittet.

## Tre nivåer (i ordning)

1. **Snabb visning**  
   Intern, förenklad rendering av sparade filer så att något syns direkt efter generation. Motsvarar **inte** full Next.js-produktion (ingen App Router, begränsad import-upplösning).  
   *Tekniskt:* samma URL som tidigare kan peka på intern render-route; det ska inte märkas i UI med “low fidelity”.

2. **Sandlåda**  
   Isolerad Node/Next-miljö — närmast “riktig” runtime i byggaren.

3. **Deploy**  
   Publicerad miljö (Vercel m.m.).

## Vad användaren ska se

- **Etiketter:** “Snabb visning”, “Sandlåda”, “Extern visning”, “Webbvisning” — inte “Legacy preview”, “Runtime preview”, “Fidelity”.
- **Flik (mobil):** “Visning”, inte “Preview”.
- **Ingen** hörnbadge med “Snabb preview — begränsad fidelity”.

## Loggar

- I dev-logg ska `site.done` visa `demoUrl=...` (inte `preview=...`) för att undvika förväxling med produktions-preview.

## Se även

- `docs/architecture/engine-status.md` — motor- och preview-detaljer för utvecklare.
- `src/lib/gen/demo-url.ts` — hur `demoUrl` väljs (sandbox vs intern snabb visning).
