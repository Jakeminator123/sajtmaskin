# P07: SEO-varningar — visuell separation från errors

## Problem

I Lansering-panelen (`LaunchReadinessCard.tsx`) renderas blockers och warnings
med identisk `renderItem`-funktion. SEO-varningar ser ut som blockerande errors,
vilket vilseleder användaren.

## Filer att ändra

- `src/components/builder/LaunchReadinessCard.tsx` (~rad 24-41, 79-91)
  - `renderItem` behöver differentiera på `severity` ("blocker" vs "warning").
  - Blockers: rött/orange border, AlertTriangle-ikon.
  - Warnings: grå/dämpad border, Info-ikon, `text-muted-foreground`.

- `src/app/api/engine/chats/[chatId]/readiness/route.ts`
  - Kontrollera att `severity`-fältet sätts korrekt (redan "warning" vs "blocker").

## Verifiering

- Visuell inspektion: generera en sajt som triggar SEO-varning.
- Bekräfta att SEO-item ser dämpad ut jämfört med faktiska blockers.

## Status

**Klar.** `renderItem` differentierar nu baserat på `severity`. Warnings
får dämpad styling (muted border/bg/text), blockers behåller stark styling.

## Prioritet

Medel — UX-förbättring, ingen funktionell bugg.
