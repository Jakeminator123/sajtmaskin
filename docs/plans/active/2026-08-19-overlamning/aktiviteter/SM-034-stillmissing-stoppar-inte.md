# Skyddad route kan saknas efter repair utan att save stoppas

**Klar 2026-08-20 — [#1066](https://github.com/Jakeminator123/sajtmaskin/pull/1066).**

Våg 3 · Cloud · `SM-034` · Medel risk — rör repair-grinden

## Målet

En repair kan droppa en scaffold-skyddad fil och ändå sparas. Loggen visar
`reinjected: []` och `stillMissing: [app/api/placeholder/route.ts]`, varefter
persist fortsätter som om allt vore i sin ordning.

Skyddade paths heter skyddade för att sajten inte fungerar utan dem.

## Fyndet

`reinjectProtectedPathsFromFallback` återställer bara filen om fallbacken
**har** den. Saknar både LLM-utdata och fallback filen loggas `stillMissing`
och skrivningen går vidare.

Ankare (omverifiera):

- `src/lib/gen/scaffolds/protected-paths.ts:91-120`
- `src/lib/gen/verify/server-verify/repair-execution.ts:210-241`
- `src/app/api/engine/chats/[chatId]/repair/route.ts:397-426`

Delvis härdat redan: reinject-vägen finns. Det som saknas är att `stillMissing`
faktiskt stoppar.

## Fix

Blockera save när `stillMissing.length > 0` för skyddade paths. Fallback-
reinjecten finns redan och ska köras först — det här är sista utvägen när den
inte räckte.

Tänk igenom felvägen: användaren ska få veta **vilken** fil som saknas och att
versionen inte sparades, inte bara ett tyst fel. Använd befintlig felkanal.

## Gör inte

- Bygg ingen ny reinject-mekanism — härda den som finns.
- Utöka inte listan över skyddade paths i samma PR.
- Rör inte `product-postcheck.ts` eller telemetrin (andra paket i samma våg).

## Verifiering

```powershell
npm run typecheck
npm run scaffolds:validate
npx vitest run src/lib/gen/scaffolds src/lib/gen/verify
```

Nytt test krävs: en repair där både LLM-utdata och fallback saknar en skyddad
path ska **inte** sparas. Testet ska falla före fixen.
