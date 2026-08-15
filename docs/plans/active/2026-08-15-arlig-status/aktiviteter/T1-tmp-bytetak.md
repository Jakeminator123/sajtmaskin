# T1 — `/tmp`-spegelns tak: antal → byte

Styrdokument: [`../00-master-plan.md`](../00-master-plan.md)

## Problemet

Vercel-instansens `/tmp` är ~525 MB och delas av tre saker: Chromium-binären,
läckta Playwright-profiler, och NDJSON-spegeln som `src/lib/logging/event-bus.ts`
skriver till `os.tmpdir()/sajtmaskin/data/runs`.

2026-08-14 21:41:08Z loggade appen i prod:

```text
[capture-browser] free space in temporary directory: 6MB of 525MB (/tmp)
```

Sex megabyte fritt. Sekunderna efter dog produktkontrollen och miniatyrbilden —
båda kör Chromium. Det gjorde en fullt fungerande sajt oläsbar för kontrollerna
och gav användaren en felindikator.

Taket som ska hindra detta räknar **mappar**, inte bytes:

```text
src/lib/logging/event-bus.ts:108
export const MAX_TMP_MIRROR_VERSION_DIRS = 50;
```

Femtio versionsmappar kan vara 5 MB eller 400 MB. Taket vet inte vilket, så det
kan inte skydda en disk med en storleksgräns.

## Uppgift

Ge `/tmp`-spegelns prune ett **byte-tak** i stället för (eller utöver) antalstaket,
så att spegeln har en känd övre gräns i megabyte.

Krav:

- Byte-taket ska vara den bindande gränsen. Antalstaket får finnas kvar som
  billig snabbväg, men det får inte vara det enda skyddet.
- Behåll åldersgolvet `TMP_MIRROR_PRUNE_MIN_IDLE_MS` (20 min) — en mapp som kan
  tillhöra en pågående körning ska inte raderas. Finalize + verify + repair ryms
  i ~16 min via `maxDuration 950`.
- Prunen ska förbli **fail-open**: ett fel i storleksmätningen får aldrig stoppa
  en körning.
- Rör **inte** den lokala `data/runs/` under repo-roten. Koden har redan
  `isInsideTmpDir(RUNS_ROOT_DIR)` som grind — behåll den.
- Gränsen ska vara läsbar/justerbar på samma sätt som resten av filens konstanter.
  Väljer du env-styrning: registrera nyckeln i `config/env-policy.json` och
  `docs/ENV.md`, annars låt den vara en exporterad konstant.

## Vad som INTE ingår

- Ändra inte Chromium-/Playwright-städningen i `src/lib/capture/browser.ts`. Den
  har sin egen backlograd.
- Bygg ingen ny mätning eller telemetri-yta. `[capture-browser] free space…`
  finns redan och räcker.
- Höj ingen tidsgräns någonstans.

## Verifiering

- Enhetstest som visar att spegeln hålls under byte-taket när många/stora mappar
  finns, och att en mapp yngre än åldersgolvet **inte** raderas.
- Test som visar att prunen är fail-open när storleksmätningen kastar.
- `npm run typecheck`
- Riktad vitest: `src/lib/logging/event-bus.test.ts`

## Klart när

Byte-taket är bindande, testerna låser båda riktningarna (för stort → prunas,
för ungt → sparas), och kommentaren i filen förklarar varför antalstaket inte
räckte — med hänvisning till 6 MB-mätningen 2026-08-14.
