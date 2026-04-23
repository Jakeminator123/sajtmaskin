---
id: omtag-01-embedding-diagnos
title: Embedding-diagnos — varför faller scaffold-/dossier-matching tillbaka till keyword-only
phase: 0
priority: P0
parallell_med: [02-eval-baseline, 04-env-flag-collapse, 07-static-core-type-imports]
blockerad_av: []
estimat: "30 min–2 h"
owner_files:
  - src/lib/gen/scaffolds/matcher.ts
  - src/lib/gen/semantic-search/**
  - src/lib/gen/dossiers/select.ts (read-only)
  - src/lib/gen/dossiers/select.test.ts
---

# 01 — Embedding-diagnos

## Mål

Ta reda på **varför** `embeddingAvailable=false` kickar in under live-trafik, dokumentera orsaken, och fixa om fixen är < 1 h. Om fixen är större → skriv en tight task-beskrivning som gatekeeps fas 2.

## Varför det här först

`STATUS-2026-04-20.md` listar `src/lib/gen/dossiers/select.test.ts` — "fallback when no embeddings + no API key" — som **pre-existing failure på master redan 2026-04-20**, alltså **före Wave**. Om embedding tyst faller tillbaka till keyword-matching i live-trafik är det den enskilt mest plausibla förklaringen till "sämre kvalitet senaste dygnet": scaffold-val, variant-val, dossier-pålägg och stylePack får alla sämre signal samtidigt.

Detta måste utredas innan någon plan som "stärker" matchningen läggs ovanpå.

## Scope

| In | Ut |
|---|---|
| Läsa `matcher.ts:580–680` + dossier-select + semantic-search-modulen | Reject LLM-fixer / ny prompt-regel |
| Kolla `searchScaffoldsWithDiagnostics` + `EMPTY_SEMANTIC_RESPONSE` | Röra `system-prompt.ts`, `build-spec.ts` |
| Verifiera vid vilken `unavailableReason` fallback triggar | Lägga till nya env-flaggor |

## Inputs (läs i ordning)

1. `src/lib/gen/scaffolds/matcher.ts` — rader 580–680 (keyword vs embedding-path)
2. `src/lib/gen/scaffolds/matcher.ts` — sök efter `searchScaffoldsWithDiagnostics`-import, hitta definitionen
3. `src/lib/gen/dossiers/select.ts` — se hur samma embedding-källa konsumeras där
4. `src/lib/gen/dossiers/select.test.ts` — det pre-existing fail-testet
5. `docs/architecture/dossier-system.md` om det finns
6. Dev-log från senaste live-generering i `data/dev-logs/` eller liknande — sök efter `semanticUnavailableReason` eller `embeddingFailed`

## Exekveringssteg

1. **Reproducera i test:** kör `npx vitest run src/lib/gen/scaffolds/matcher` + `npx vitest run src/lib/gen/dossiers/select`. Notera vilka tester som gör mock på embedding och vilka som förväntar sig live-path.
2. **Spåra vilken kod returnerar `EMPTY_SEMANTIC_RESPONSE`** — när returnerar `searchScaffoldsWithDiagnostics` tomt? (Inga OPENAI_API_KEY? Inget embeddings-index på disk? Fetch-timeout? Env-flagga off?)
3. **Kör en manuell diagnostik-query** via ett litet script i `scripts/diagnostic/check-embedding-path.mjs`:
   - Kalla `searchScaffoldsWithDiagnostics("lyxig restaurangsajt", 3)` från server-kontext
   - Skriv ut `diagnostics.available`, `diagnostics.failed`, `diagnostics.unavailableReason`
4. **Skriv fynden** i `OMTAG/01-FINDINGS.md` med rubrikerna:
   - `Orsak` (en mening)
   - `Bevis` (3–5 stack-traces eller env-avläsningar)
   - `Fix — om < 1 h` (koddiff + test)
   - `Fix — om större` (task-beskrivning för fas 2, max 10 rader)

## Får INTE göras

- Inga nya env-flaggor (det ägs av 04).
- Ingen refaktor av `matcher.ts`-strukturen (det ägs av 03 när build-spec är klar).
- Ingen "hybrid fallback som vägter keyword+embedding via ny viktning" — det är ett nytt lager.

## Acceptance criteria

- [ ] `OMTAG/01-FINDINGS.md` finns och är ≤ 100 rader.
- [ ] Antingen: PR-fixar `embeddingAvailable=false`-orsaken med test som failar på master och passar på branch, ELLER: tydlig gate-task till fas 2 som del av 03/06.
- [ ] `npx vitest run src/lib/gen/scaffolds src/lib/gen/dossiers` — minst lika bra som master (5 pre-existing fails inte värre).
- [ ] `npm run typecheck` + `npm run lint` grönt.

## Branch

`omtag/01-embedding-diagnos`
