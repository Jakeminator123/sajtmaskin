# 02 — Varför Chromium dör i prod: `/tmp` tar slut

**Status:** starkt indicium, ej bevisat · mätsteget nedan väntar på go
**Frågan:** är det för lite minne, för många samtidiga genereringar, eller är preview-VM:en full?

## Kort svar

| Hypotes | Dom |
|---|---|
| "för lite minne" | **Halvrätt** — inte RAM, utan **disk**: `/tmp` i Vercel-funktionen (~500 MB, går inte att höja) |
| "fler sajter genererades samtidigt" | **Bidragande** — Fluid Compute låter flera körningar dela samma instans och samma `/tmp` |
| "min VM har för mycket skit" | **Nej** — Fly-VM:en (`vm-fly-jakem`) är en annan maskin och oskyldig |
| "någon konstig env" | **Nej** — ingen env-variabel styr `/tmp` |

## Beviskedjan

### 1. Vad Chromium säger

Vercel-logg 2026-08-11 12:47:04, under `/api/engine/chats/…/product-postcheck`:

```
[pid=805][err] WARNING: Less than 64MB of free space in temporary directory
                        for shared memory files: 0
[pid=805][err] ERROR: ContextResult::kFatalFailure:
                      CommandBufferHelper::AllocateRingBuffer() failed
```

Noll byte ledigt. Chromium startas med `--disable-dev-shm-usage`, alltså lägger den
sina delade minnesfiler i `/tmp` i stället för `/dev/shm`. Är `/tmp` fullt kan den
inte allokera → `browser.newPage` dör. Den gången tog det **82 ms**.

### 2. Vad plattformen är konfigurerad som

`vercel api /v9/projects/sajtmaskin`:

```json
"fluid": true,
"elasticConcurrencyEnabled": true,
"functionDefaultMemoryType": "performance",
"functionDefaultRegions": ["iad1", "arn1"]
```

**Fluid Compute** ändrar spelreglerna: instansen är långlivad och tar emot flera
samtidiga anrop i **samma Node-process**. `/tmp` städas inte mellan körningarna —
den ackumulerar under hela instansens liv. `performance` betyder att RAM redan
ligger i den högre klassen; att höja minnet ändrar inte `/tmp`.

### 3. Vem fyller `/tmp`

| Skrivare | Sökväg | Städas? |
|---|---|---|
| `@sparticuz/chromium` packar upp binären | `/tmp` | nej (avsiktlig cache) |
| Playwright user-data-dir per start | `/tmp/playwright_chromiumdev_profile-XXXX` (syns i loggen) | bara vid ren `browser.close()` — läcker vid krasch |
| Event-bus speglar run-NDJSON | `/tmp/sajtmaskin/data/runs/` (`event-bus.ts` → `resolveRunsRootDir`) | **nej** — append-only, ingen prune-kod finns |
| npm-registry-cache | `/tmp/sajtmaskin-npm-cache/` | 24h TTL |

En instans som levt länge och kört många genereringar har alltså en uppackad
Chromium, en hög läckta profilkataloger och en växande NDJSON-katalog. Sedan kommer
nästa Postcheck.

### 4. Samma rotorsak, annat symptom

`/api/projects/…/thumbnail` gav två `502` samma förmiddag
(`page.screenshot: Timeout 15000ms exceeded` och `Unable to capture screenshot`).
Samma `launchCaptureBrowser`.

### 5. Delvis känt sedan tidigare

`src/lib/capture/browser.ts` har en mutex med kommentaren:

> Product Postcheck and thumbnail capture both call `launchCaptureBrowser` from
> separate API routes. On a warm Vercel instance they can overlap … **Cross-isolate
> races are out of scope for this mutex.** (SM-025)

Mutexen löser samtidighet inom ett isolat. Den gör ingenting åt ackumulerad disk.

### 6. Vad DB-signalen sa i stället

| Gen | Tid | `skippedReason` | Vercel-loggen |
|---|---|---|---|
| 1 | 09:08 | `missing_preview_url` | ofarligt |
| 1 | 09:19 | `playwright_unavailable` | `page.evaluate: Target page … closed` |
| 2 | 10:00 | `navigation_failed` | `page.goto: Target page … closed` |
| 2 | 10:47 | `playwright_unavailable` (82 ms) | `browser.newPage: Target page … closed` |
| 3 | 10:07 ×2, 10:38 | `navigation_failed` | `page.goto: Target page … closed` |

Signaturen `30be40afccf4` ("Product Postcheck skipped", 22 ggr över 8 chattar) lästes
som normalt plattformsbrus. Minst hälften är tysta krascher.

## Vad som INTE är orsaken

- **Fly-VM:en.** `fly logs -a vm-fly-jakem` visar bara `Reaped child process … SIGTERM/SIGINT`.
- **RAM.** Ingen OOM, minnesklassen är redan `performance`.
- **Lokala maskinen.** Allt sker i Vercels funktion.
- **Databasen.** 0 connect-timeouts, 0 `EMAXCONNSESSION`.

## Åtgärder — billigast först

| # | Åtgärd | Storlek | Effekt |
|---|---|---|---|
| 1 | ~~Mät~~ **GJORT 2026-08-11:** `logTmpFreeSpaceBestEffort()` i `src/lib/capture/browser.ts` loggar `[capture-browser] free space in temporary directory: XMB of YMB` före varje serverless Chromium-start (fail-open) | ~15 rader | läs av i Vercel-loggen efter nästa deploy |
| 2 | Prune `/tmp/sajtmaskin/data/runs` till N senaste versioner vid skrivning | liten | tar bort den enda obegränsat växande posten |
| 3 | Städa `/tmp/playwright_chromiumdev_profile-*` äldre än X min före varje launch | liten | återvinner disk efter krascher |
| 4 | Höj skip-loggnivån (se [`01`](01-product-postcheck.md) åtgärd 3) | liten | felet slutar gömma sig |
| 5 | `maxDuration`/`memory` per capture-rutt i `vercel.json` | liten | påverkar **inte** `/tmp` — gör bara om timeout också är ett problem |

Ordning: **mät → prune NDJSON → städa profiler → höj loggnivån.** Allt är härdning av
befintliga kontrakt, ingen ny feature.

## Öppen fråga

`/tmp` går inte att inspektera utifrån — bara inifrån funktionen. Därför står
mätsteget först. Tills det är gjort är slutsatsen ett **starkt indicium**: Chromiums
egen felrad säger noll byte ledigt, men vi vet inte exakt vad som tog dem.
