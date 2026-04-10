# P01: Fault-fix-index — visa faktiska felmeddelanden

## Problem

`fault-fix-index.csv` och `.md` loggar bara räknare ("2 syntaxfel") i problem-kolumnen.
De faktiska felmeddelandena (fil, rad, meddelande) finns redan i `timeline.ndjson`
under `data.errors[]` i `syntax-validation.pass`-entries, men extraheras aldrig till indexet.

## Mål

Problem-kolumnen i fault-fix-index (Markdown + CSV + global CSV) ska innehålla
de faktiska felmeddelandena formaterade som `fil:rad: meddelande`, inte bara räknaren.

## Filer att ändra

- `src/lib/logging/generation-log-writer.ts`
  - `"syntax-validation.pass"` handler (~rad 316-337): läs `e.data.errors` och formatera.
  - `"syntax-validation.fixer.start"` handler (~rad 341): samma — berika med `e.data.errors`.
  - Eventuellt `"merged-syntax.invalid"` handler om den finns.

## Implementation

1. I `FAULT_FIX_TYPES["syntax-validation.pass"]`: casta `e.data.errors` till `Array<{file, line, message}>`.
2. Formatera som `fil:rad: meddelande` (max ~5 fel, trunkera med "… +N").
3. Sätt `problem` till den formaterade strängen istället för `${errorCount} syntaxfel`.
4. Gör samma sak för `fixer.start` hanteraren.

## Verifiering

- Kör en generation som triggar syntaxfel.
- Kontrollera att `fault-fix-index.md`, `.csv` och `error-log.csv` visar faktiska fel.
- Kör `generation-log-writer.test.ts`.

## Status

**Klar.** `formatErrorDetails` helper tillagd i `generation-log-writer.ts`.
Hanterar både strukturerade `{file, line, message}`-objekt och råa string-arrayer
(fixer.start). Tester gröna.

## Prioritet

Hög — direkt informationsförlust vid debugging.
