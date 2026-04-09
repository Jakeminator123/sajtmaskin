# P06: scroll-smooth — fånga i CSS, inte bara HTML className

## Problem

Autofix-pipelinen fångar `scroll-smooth` i HTML `className` men inte när det
sitter i CSS (`globals.css` eller annan CSS-fil) som `scroll-behavior: smooth`
på `:root` eller `html`-selektorn.

## Filer att ändra

- `src/lib/gen/repair-generated-files.ts` (~rad 39-40, 406-421)
  - Befintlig fix: `HTML_SCROLL_SMOOTH_RE` matchar `<html ... className="...scroll-smooth..."`.
  - Ny fix: lägg till en CSS-regelparse som matchar
    `scroll-behavior:\s*smooth` i `:root`/`html`-selektorer.
  - Ersätt med `scroll-behavior: auto` eller ta bort raden.

## Implementation

1. Identifiera CSS-filer i `files_json` (filnamn slutar på `.css`).
2. Regex: `/(:root|html)\s*\{[^}]*scroll-behavior:\s*smooth/` (multi-line).
3. Ersätt `scroll-behavior: smooth` med `scroll-behavior: auto` eller ta bort.
4. Logga ändringen likt HTML-fixen.

## Verifiering

- Generera en sajt som producerar `globals.css` med `html { scroll-behavior: smooth }`.
- Bekräfta att det byts ut i repair-steget.
- Befintliga tester för HTML-varianten ska fortfarande passera.

## Status

**Klar.** `CSS_SCROLL_SMOOTH_RE` tillagd i `repair-generated-files.ts`.
Ersätter `scroll-behavior: smooth` med `scroll-behavior: auto` i CSS-filer.
Typecheck rent.

## Prioritet

Medel.
