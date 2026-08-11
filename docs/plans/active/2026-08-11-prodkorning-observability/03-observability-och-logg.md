# 03 — Observability-luckan och vad `/logg` nu gör

**Status:** steg 3c infört i `/logg` · resterande punkter öppna
**Bakgrund:** fyra riktiga defekter syntes bara i Vercels loggvy och missades av en full `/logg`-körning.

## Vad som gick fel i observationen

`/logg` läste prod-Postgres, Vercel build/runtime per deploy och Fly. Det den **inte**
läste var appens egna `console.warn`/`console.error` under själva genereringen — de
persisteras aldrig till `engine_version_error_logs`.

Följden: DB sa `product_postcheck.skipped` i sex körningar i rad, vilket lät som en
artig policy-skip, medan Vercel-loggen visade en kraschad Chromium. Signaturen
kallades till och med "plattformsbrus" i den första rapporten. Rätt data, fel källa,
fel slutsats.

## Vad som ändrats

`/logg` har ett **obligatoriskt steg 3c**:

- `.cursor/skills/logg/SKILL.md` — nytt steg 3c med kommando, sökmönster och tolkningstabell; DB-poolen blev 3d; ny rad i källtabellen och rapportmallen; checklistan uppdaterad.
- `.cursor/commands/logg.md` — samma steg som punkt under steg 4.

```powershell
vercel logs https://sajtmaskin.vercel.app --json
```

| Mönster | Betyder |
|---|---|
| `[product-postcheck] skipped` | Postcheck kraschade — kolla `skippedReason` i DB |
| `free space in temporary directory` · `AllocateRingBuffer` | `/tmp` slut ([`02`](02-tmp-krasch.md)) |
| `Thumbnail capture failed` | samma rotorsak |
| `stillMissing: [` | scaffold-skyddad fil droppad utan återinjicering |
| `Vercel Runtime Timeout Error` | rutt slog i sin `maxDuration` |
| `[CSP Violation]` | egen CSP blockerar något sajten behöver |
| `AI SDK Warning` | modell-/parameterproblem |

## Vad de fyra fynden var

1. **Postcheck kraschar** — se [`02`](02-tmp-krasch.md).
2. **Scaffold-fil försvann i Gen3-repair** — `branch: 'manual-repair'`, `droppedPaths: ['app/api/placeholder/route.ts']`, `reinjected: []`, `stillMissing: [...]`. Fallback-filerna saknade själva sökvägen (`reinjectProtectedPathsFromFallback`), så versionen gick vidare utan scaffold-routen. Bara `console.warn` — ingen DB-rad, ingen UI-signal.
3. **Wizard-rutter timeoutar** — `/api/wizard/competitors` 504 vid 25s (dess egen `maxDuration = 25`), `/api/wizard/enrich` 504 vid 30s. Analyserad-flödet.
4. **Google Maps blockeras av egen CSP** — `src/lib/google-maps-loader.ts` laddar Places-scriptet, men `buildCspPolicy()` i `src/proxy.ts` har varken `maps.googleapis.com` i `scriptSrc` eller `connectSrc`. Adressautocomplete på startsidan kan aldrig ha fungerat i prod. Browser-nyckeln syns i klartext i CSP-rapporten — publik till sin natur, men bör referrer-låsas i Google Cloud.

## Build-varningar 2026-08-11 (från Vercels build-logg)

### Turbopack: `event-bus.ts:126` matchar 10 194 filer

```
The file pattern (<dynamic> '/' <dynamic> ... | '/ROOT/data/runs/' <dynamic> ...)
matches 10194 files in [project]/
> 126 |   return path.join(RUNS_ROOT_DIR, versionId, runId);
```

**Vad det är:** `RUNS_ROOT_DIR` räknas ut vid modulladdning
(`os.tmpdir()` på Vercel, `process.cwd()/data/runs` lokalt). Turbopacks statiska
analys kan inte se vad den blir, så `path.join(...)` tolkas som en dynamisk
filsökväg och tracern drar in allt som *skulle kunna* matcha — hela projektet.

**Vad det kostar:** över-bundling. Varje rutt som importerar event-bussen — och det
är många, inklusive `version-status` — får ett uppblåst funktionspaket. Följden är
långsammare cold start och större deploy. Koden varnar redan för exakt det här i
kommentaren vid `resolveRunsRootDir` (`turbopackIgnore` sattes på `process.cwd()`),
men skyddet räcker inte: det är *join-stället* på rad 126 som flaggas.

**Vad det inte är:** det påverkar `/var/task` (koden), inte `/tmp` (skrivytan). Alltså
inte samma sak som [`02`](02-tmp-krasch.md), även om båda handlar om event-bussen.

**Föreslagen fix:** lägg `"./data/runs/**"` i `outputFileTracingExcludes["*"]` i
`next.config.ts` — listan finns redan (`templates_v0`, `archive`, `output`). Väntar
på go.

### `[error-log-rag] indexer finished (41ms)` — RAG:en är inte trasig

Raden är förväntad och betyder **ingenting går fel**:

1. Indexeraren läser `logs/llm-segmentts-and-index/error-log.ndjson`. Den katalogen är gitignorerad, alltså finns den inte i Vercel-bygget → skriptet loggar "nothing to index. Skipping" och skriver bara en meta-fil. 41 ms är korrekt för "hittade ingenting".
2. `data/observability/` (där disk-snapshoten skulle ligga) är också gitignorerad.
3. Därför **kör prod redan DB-vägen**: `loadIndexForRetrieval()` hittar ingen disk-snapshot och faller igenom till `triggerDbIndexRefresh()` → `loadRecentErrorLogDocsFromDb()`, som läser de senaste 5 000 raderna ur `error_log_events`. Cachen värms dessutom vid modulladdning (`warmErrorLogIndexBestEffort`) med 60s-throttling.

Frågan "borde den gå via databas i produktion?" är alltså redan besvarad i koden —
det gör den. Disk-snapshoten är dev-vägen.

**Liten kantfall värd att notera:** om NDJSON-filen *finns men är tom* skriver
indexeraren en tom snapshot. Då hoppar `warmErrorLogIndexBestEffort` över
DB-uppvärmningen (`fs.existsSync` är sann), medan `loadIndexForRetrieval` ändå
faller tillbaka på DB vid första riktiga anropet. Konsekvens: bara en förlorad
cold-start-försprång, ingen utebliven retrieval. Inte akut.

## Kvarvarande luckor

| Lucka | Förslag | Status |
|---|---|---|
| Kraschad Postcheck loggas som `info` | gör `playwright_unavailable`/`navigation_failed`/`timeout`/`runtime_error` till `warning` | föreslaget, kodändring, väntar på go |
| Vercels loggfönster är kort | Log Drains | inte utrett, plan-beroende |
| `defects`-aggregatet blandar ofarliga och farliga skips | följer av punkt 1 | — |
| Vercel-MCP kräver auth | `plugin-vercel-vercel` och `user-vercel` är båda `needsAuth`; CLI används i stället | acceptabelt |

## Om Vercel Agent

Utvärderat på ägarens fråga. Slutsats: **löser inte det här problemet.**

| Tjänst | Kostnad | Bedömning |
|---|---|---|
| Agent *Investigation* | Observability Plus + $0.30/körning | AI-rotorsak på anomali-larm. Raderna vi behövde fanns redan — problemet var att ingen läste dem |
| Agent *Code Review* | $0.30/PR | överlappar Bugbot, som redan är obligatorisk före PR och push |
| Agent *Installation* | gratis | installerar Analytics/Speed Insights-SDK. Orelaterat |
| Log Drains | plan-beroende | enda som faktiskt adresserar luckan (historik) |

Rekommendation: hoppa över Agent. Steg 3c + höjd loggnivå på postcheck-krascher
täcker samma behov till noll kronor.

## Metod som fungerade (återanvänd den)

1. `dump-logs` per chatId med **alla** kinds, plus `defects` en gång till **utan** `--chat` för att skilja plattformsbrus från chattspecifikt.
2. `vercel inspect <dpl> --logs` för sajtens build — där syntes att `/api/chat` faktiskt fanns i bygget.
3. Direkt HTTP mot den publicerade sajten — där syntes att routen fungerade men sidan inte använde den.
4. `vercel logs --json` för appens `console`-rader — där låg de fyra defekterna ovan.

Steg 3 var det som avgjorde AI-chatt-frågan: DB och build sa "allt finns", men ett
riktigt anrop plus en titt i HTML:en visade attrappen.
