# B1 — Användbar export och ärligt äganderättsbesked

## Genomförandestatus 2026-09-15

B1 är levererad på `preview` i #1367 som `934eda6c7b189b84d1ecf7c18f774838a7245843` efter oberoende Sol/high PASS, grön ready-CI, Dossier acceptance och Vercel READY. GitGuardian-checken hanterades uttryckligen som false positive och blev `skipped` före merge. Kodens riktade verifiering omfattade 45 lokala tester och typecheck samt en fristående byggd Next-export med verklig PNG, ny origin och tomma env-värden.

Område: [02](../02-agandeskap-och-exit.md). Leveransen bygger vidare på
[C1](C1-sajtvy.md). C2 (#1384) är kodinkopplad i samma sajtvy; C2-runtime mot
riktig kunddomän är separat.

## Leveransbevis och kodägare

- Sajtvyn öppnar den befintliga, serverägargranskade GitHub-exporten via
  [`GitHubExportDialog.tsx`](../../../../../src/components/builder/project-transfer/GitHubExportDialog.tsx)
  och [`route.ts`](../../../../../src/app/api/github/export/route.ts).
- Uppladdade media materialiseras som varaktiga filer av
  [`project-export-media.ts`](../../../../../src/lib/projects/project-export-media.ts),
  inte som utgående signerade länkar.
- Installations-, build-, env- och begränsningsinformationen ägs av
  [`owner-transfer-package.ts`](../../../../../src/lib/gen/export/owner-transfer-package.ts).
  Den exporterar env-namn utan plattformshemligheter och beskriver externa
  beroenden som inte följer med. Samma ägare kräver en ny origin före byte av
  projektets tidigare canonical och tar inte med en tvingande redirect tillbaka
  till Sajtmaskin.
- Det portabla GitHub-filträdet och dess säkra uppdateringsplan ägs av
  [`github-tree-plan.ts`](../../../../../src/lib/gen/export/github-tree-plan.ts).
- Leveransen verifierades med 45 riktade tester och typecheck samt en fristående
  installerad Next-export med verklig PNG, ny origin och tomma env-värden.

Export-/medie-endpoints gör serverägd projektkontroll och vägen kräver inget
nytt köp, så exporten förblir tillgänglig under betalningspaus. Full databas-
eller registraröverföring ingår inte i B1.
