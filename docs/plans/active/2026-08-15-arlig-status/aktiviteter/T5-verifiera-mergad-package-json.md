# T5 — verifiera den mergade `package.json`, inte modellens utkast

Styrdokument: [`../00-master-plan.md`](../00-master-plan.md)

## Problemet

I prod-körning `6e865848-8df5-46e9-aa81-c52ce7221d07` (2026-08-14 21:41:02Z) loggades
ett **blockerande** verifieringsfynd:

```text
quality-gate:verifier-blocking
package.json lacks next, react, react-dom, and tailwindcss
required by app/layout.tsx, app/page.tsx, and app/globals.css
```

Fyndet var falskt. Den **sparade** versionens `package.json` innehåller 28
beroenden inklusive `next` och `react`, plus scripten `dev/build/start/typecheck/lint`.
Det är verifierat direkt mot `engine_versions.files_json` i prod.

Orsaken är ordningen. Modellen emitterar ofta en tunn `package.json` — i den här
körningen sex rader. `mergePackageJsonWithBaseline`
(`src/lib/gen/export/project-scaffold.ts:582`) lägger den ovanpå Sajtmaskins
baslinje, och `buildCompleteProject` anropar den på tre ställen (~rad 918, 921, 940).
Verifieraren läser **före** den mergen och ser därför utkastet.

Konsekvensen är dubbel: ett falskt blockerande fynd, och en reparationsrunda som
försöker laga något som inte är trasigt — vilket i sin tur gav `fix-failed` och
gjorde hela slutsteget rött (den delen är åtgärdad i #1001).

## Detta är återkommande

`error_log_events` i prod har fyra släktingar, alla med `result=still-failing`:

| Datum | `fault` |
|---|---|
| 2026-08-05 | `package-build-setup` |
| 2026-08-11 | `missing-next-runtime-dependencies` |
| 2026-08-14 20:47 | `missing-build-dependencies` |
| 2026-08-14 21:40 | `missing-project-dependencies` |

Samma felklass under minst tio dagar. Det är inte otur i en körning.

## Uppgift

Låt verifieraren bedöma den `package.json` som faktiskt hamnar i versionen.

Krav:

- Kör verifierarens beroendekontroll mot resultatet av
  `mergePackageJsonWithBaseline` / `buildCompleteProject`, inte mot modellens råa
  utkast. Ändra den kanoniska ägaren — flytta inte problemet till konsumenterna.
- **Viktig nyans:** `tailwindcss` ligger i baslinjens `devDependencies`, inte i
  `dependencies`. En kontroll som bara tittar i `dependencies` kommer fortsätta
  larma om `tailwindcss` även efter mergen. Kontrollen måste därför läsa **både**
  `dependencies` och `devDependencies` innan den kallar ett beroende saknat.
- Ett beroende som verkligen saknas efter mergen ska fortfarande blockera. Fixen
  ska ta bort **falska** larm, inte tysta kontrollen.

## Vad som INTE ingår

- Ändra inte `mergePackageJsonWithBaseline` självt — baslinjen är rätt.
- Rör inte klientens färgsättning av Slutsteg (levererat i #1001).
- Rör inte preview-hostens installsteg.
- Lägg inte till en env-flagga.

## Verifiering

- Test som ger verifieraren en tunn modell-`package.json` (bara `name` + `version`)
  och visar att inget blockerande beroendefynd uppstår efter mergen.
- Test som visar att ett beroende som saknas i **både** `dependencies` och
  `devDependencies` efter mergen fortfarande blockerar.
- Test som specifikt täcker `tailwindcss` i `devDependencies` — det är fallet som
  annars smiter förbi.
- `npm run typecheck` + riktad vitest på verifierarens sviter.
- Rörs genererade docs/scheman: `npm run docs:generate`, `npm run docs:check`,
  `npm run docs:links`.

## Klart när

En tunn modell-`package.json` inte längre kan producera ett blockerande
beroendefynd, ett verkligt saknat beroende fortfarande gör det, och
`tailwindcss` i `devDependencies` räknas som närvarande.
