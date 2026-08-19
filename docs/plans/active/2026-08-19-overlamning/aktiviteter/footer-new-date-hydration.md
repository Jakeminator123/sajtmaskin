# `new Date()` i genererad footer passerar preflight

Våg 3 · Cloud · `SM-061` · Liten, låg risk

## Målet

Preflight flaggar `new Date()` i `site-footer.tsx` men är advisory, så versionen
promotas ändå. Anropet är en hydration-risk: serverns år kan skilja sig från
klientens nära årsskiftet, och locale-formatering skiljer sig oftare än så.

## Fyndet

Ingen fixer skriver om copyright-året till en konstant.
`global-shadow-import-fixer` skyddar `new Date()` mot shadowing men tar inte
bort anropet — den gör tvärtom det säkrare att behålla.

Ankare (omverifiera):

- `src/lib/gen/autofix/rules/global-shadow-import-fixer.ts:10-18`
- preflight-loggens `d86af93ee7ef`-signatur

## Fix

Håll det i **befintlig** preflight/fixer. Två godtagbara vägar:

1. Ersätt footerns år med en statisk literal vid generering.
2. Eller sätt `suppressHydrationWarning` på just den noden.

Väg 1 är att föredra: en sajt som byggs i december och visas i januari ska inte
tyst visa fel år, och `suppressHydrationWarning` döljer felet i stället för att
lösa det.

## Gör inte

- Ingen ny LLM-repair och ingen ny fixer-kategori.
- Rör inte `global-shadow-import-fixer`s shadowing-skydd — det löser ett annat
  problem.
- Bredda inte till alla `new Date()` i genererad kod. Scope är footerns år.

## Verifiering

```powershell
npm run typecheck
npx vitest run src/lib/gen/autofix
```

Nytt test krävs: en genererad footer med `new Date()` ska efter fixern inte
längre innehålla anropet (eller bära suppression, beroende på vald väg).
