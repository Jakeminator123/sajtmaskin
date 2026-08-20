# Våg 2 — Thumbnail-rutten väntar obundet i en 60-sekundersbudget

Skuldrad (inte Aktiv kö): härdning. Ingen prodincident bunden till den ännu.
Beror på: inget. Blockerar: inget.
Ägda filer: `src/lib/projects/thumbnail-capture.ts`,
`src/lib/projects/thumbnail-capture.test.ts`.

## Det verifierade fyndet

Rutten har `maxDuration = 60`
(`src/app/api/projects/[id]/thumbnail/route.ts:39`). Den **kontrollerade**
budgeten i captureflödet är 54,4 sekunder och testlåst:

| Konstant | Värde |
|---|---|
| `NAVIGATION_TIMEOUT_MS` | 25 000 |
| `NETWORK_IDLE_TIMEOUT_MS` | 8 000 |
| `PRE_PROBE_SETTLE_MS` | 400 |
| `THUMBNAIL_SETTLE_PHASE_BUDGET_MS` | 6 000 |
| `SCREENSHOT_TIMEOUT_MS` | 15 000 |
| **Summa** | **54 400** (`thumbnail-capture.ts:101-111`, låst i `thumbnail-capture.test.ts:323-330`) |

Kodens egen kommentar (`:96-99`) säger att summan medvetet **utesluter**
browserstart, fontväntan och Blob-uppladdning. Två av de uteslutna är obundna:

```
src/lib/projects/thumbnail-capture.ts:419-429
    await page
      .evaluate(async () => {
        const fontsApi = (document as Document & { fonts?: ... }).fonts;
        if (!fontsApi?.ready) return;
        try {
          await fontsApi.ready;
```

```
src/lib/projects/thumbnail-capture.ts:436-443
    const bootProbe = await page
      .evaluate(() => ({ title: ..., h1: ..., bodyText: ... }))
      .catch(() => null);
```

Varken `Promise.race`, `withHostDeadline` eller en `timeout`-parameter. Hjälparen
`withHostDeadline` finns redan i samma fil (`:187-199`) men används bara för
mät-/scroll-evaluates.

En sajt med en font som aldrig blir klar (död `@font-face`-URL, långsam CDN) kan
alltså hänga tills plattformen dödar rutten. Då finns ingen thumbnail och inget
klassificerat fel — bara en timeout.

## Uppgiften

Ge de två obundna väntorna en tidsgräns, och håll totalen under rutten.

1. Slå `withHostDeadline` (eller motsvarande) runt fontväntan och boot-proben med
   små, uttalade budgetar. Att fonterna inte hinner bli klara ska degradera
   bilden, inte döda rutten.
2. Räkna in de nya budgetarna i `thumbnailCaptureControlledBudgetMs` och uppdatera
   testlåset. Kommentaren på `:96-99` ska efteråt vara sann — det som fortfarande
   är utanför summan ska räknas upp explicit.
3. Lämna huvudmarginalen intakt: summan plus dina nya budgetar ska ha kvar
   utrymme för browserstart och Blob-uppladdning inom 60 sekunder. Behöver du
   sänka någon av de fem befintliga siffrorna: skriv i PR-bodyn vilken och varför,
   och håll dig till en.

## Gränser

- Höj **inte** `maxDuration`. Att lyfta taket är att flytta problemet.
- Lägg ingen retry-loop och ingen ny capture-runda.
- Rör inte `src/lib/capture/browser.ts` eller postcheckens capture — de har eget
  processlås och egna incidenter (`SM-025`).
- Ingen ny telemetriyta. Finns redan en loggkategori för capture-degradering:
  använd den.

## Klart när

- Ett test där fontväntan aldrig resolvar och capture ändå slutförs inom sin
  budget.
- Ett test där boot-proben hänger och capture ändå slutförs.
- `thumbnailCaptureControlledBudgetMs` uppdaterad, testlåst och fortfarande
  säkert under 60 sekunder med marginal för browserstart och upload — visa
  aritmetiken i PR-bodyn.
- `npm run typecheck` + `npx vitest run src/lib/projects` gröna.

## Agentprompt

> Du är Builder i Sajtmaskin. Utgå från origin/master. Läs
> `docs/plans/active/2026-08-20-vagschema/00-master-plan.md` (agentkontraktet)
> och sedan den här filen.
>
> Uppgift: `src/lib/projects/thumbnail-capture.ts` väntar obundet på
> `document.fonts.ready` (`:419-429`) och på boot-proben (`:436-443`), medan den
> kontrollerade budgeten redan är 54 400 ms av en rutt med `maxDuration = 60`.
> Sätt tidsgränser med den befintliga `withHostDeadline`-hjälparen, räkna in dem i
> `thumbnailCaptureControlledBudgetMs`, uppdatera testlåset och visa aritmetiken.
>
> Höj inte `maxDuration`. Ingen retry-loop, ingen ny capture-runda, ingen ny
> telemetriyta. Rör inte `src/lib/capture/browser.ts`.
>
> Verifiering: `npm run typecheck`, `npx vitest run src/lib/projects`.
>
> EN PR mot master, inte draft. Bugbot-pass på egen diff, sign-off-kommentar
> innan `merge:ready`. Du mergar inte. Rör inte `BUG-SWARM-BACKLOG.md`.
