# T2 + T4 — skilj "fick inget svar" från "Fly visar startsidan", och fråga readiness

Styrdokument: [`../00-master-plan.md`](../00-master-plan.md)

De två punkterna slås samman till **en PR** eftersom de rör samma fil och samma
grundfel: kontrollen gissar i stället för att fråga.

## Problem A — tomt svar anklagar fel part

`src/lib/capture/preview-boot-page.ts` avgör om previewen visar preview-hostens
egen svarta startsida. Sista grenen:

```text
src/lib/capture/preview-boot-page.ts:64-66
if (!title && !h1 && body.length === 0) {
  return true;
}
```

Ett **tomt** svar klassas alltså som "Fly visar startsidan". Men ett tomt svar
uppstår också när appens egen Chromium misslyckas — t.ex. när `/tmp` är fullt,
vilket bevisligen hände 2026-08-14 21:41:08Z (6 MB fritt av 525). Följden blev att
loggen skyllde på preview-hosten:

```text
product_postcheck.preview_boot_page:
"Preview-host visar fortfarande start-/omstartssidan — sajten är inte ready än."
```

Felet satt i appen. Meddelandet pekade på Fly. Det kostade en hel felsökningsrunda.

## Problem B — 20-sekundersbudgeten är en gissning

```text
src/lib/gen/verify/product-postcheck.ts:116
const PREVIEW_BOOT_MAX_WAIT_MS = 20_000;
```

Kontrollen pollar HTML i 20 sekunder och drar sedan en slutsats. 2026-08-14:

```text
21:41:33.135Z  Produktkontroll ger upp → productBlocked
21:41:34.060Z  Fly: Runtime ready on port 4162
```

Den missade med **0,9 sekunder**. Repo-brett har `preview_boot_page` inträffat
5 gånger över 4 chattar, och `product_postcheck.skipped` 36 gånger över 14.

Preview-hosten **vet** när runtimen är klar — den har ett readiness-tillstånd,
en `acceptingTraffic`-grind och loggar `Runtime ready on …`. Kontrollen ska fråga
den, inte stirra på HTML och gissa.

## Uppgift

1. **Två skilda utfall.** Inför en egen klassning för "probe misslyckades / tomt
   svar" skild från "startsidan visades". Nya varningskoden ska in i
   `ProductPostcheckWarningCode` och meddelandet får inte påstå något om
   preview-hosten när vi inte vet. Behåll `preview_boot_page` för de fall där
   markörerna faktiskt matchade (`Startar preview`, `Status: warm_project`,
   `Preview-host bygger projektet…`).
2. **Fråga i stället för att polla.** Låt produktkontrollen fråga preview-hostens
   readiness innan den drar en slutsats om att sajten inte är klar. Klienten finns
   i `src/lib/gen/preview/preview-host-client.ts`; preview-hostens ytor ligger i
   `preview-host/src/server/routes.js`. Använd den signal som redan finns —
   uppfinn ingen ny endpoint utan att först kontrollera vad hosten exponerar.
   Kan readiness inte hämtas: fall tillbaka till nuvarande pollning, men
   klassa utfallet som "vet inte" enligt punkt 1, inte som blockerande.
3. **Ta bort gissningen där den ersätts.** Om readiness-frågan gör
   `PREVIEW_BOOT_MAX_WAIT_MS`-loopen onödig ska loopen bort, inte ligga kvar
   parallellt.

Samma detektor används av miniatyrbilden
(`src/app/api/projects/[id]/thumbnail/route.ts`) och `src/lib/chat-readiness.ts` —
uppdatera dem i samma ändring så ingen konsument sitter kvar på gammal semantik.

## Vad som INTE ingår

- **Höj inte** `PREVIEW_BOOT_MAX_WAIT_MS`. Det flyttar bara myntkastet — en långsam
  install tog 44 s i ett annat prod-fall.
- Rör inte `/tmp`-städningen (egen uppgift, T1).
- Ändra inte om `productBlocked` ska påverka readiness — det är T7.
- Lägg inte till någon ny visuell yta i buildern.

## Verifiering

- Test för **båda** grenarna: äkta startsida → `preview_boot_page`; tomt/misslyckat
  svar → den nya koden, och **inte** ett påstående om preview-hosten.
- Test som visar att ett boot som blir klart **efter** den gamla budgeten inte
  längre klassas som blockerande när readiness svarar att runtimen är klar.
- Befintliga sviter måste fortsatt vara gröna:
  `src/lib/capture/preview-boot-page.test.ts`,
  `src/lib/gen/verify/product-postcheck.test.ts`,
  `src/lib/projects/thumbnail-capture.test.ts`,
  `src/app/api/projects/[id]/thumbnail/route.test.ts`,
  `src/lib/chat-readiness.test.ts`
- `npm run typecheck`
- Rörs `docs/schemas/strict/product-postcheck.schema.json` eller genererade docs:
  `npm run docs:generate` + `npm run docs:check` + `npm run docs:links`

## Klart när

Ett tomt svar aldrig längre kan formuleras som "preview-host visar startsidan",
kontrollen frågar readiness i stället för att gissa på 20 sekunder, och den gamla
poll-loopen är borta där den ersatts.
