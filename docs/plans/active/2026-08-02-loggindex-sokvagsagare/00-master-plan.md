---
status: active
owner: unassigned
topic: Sökvägen logs/llm-segmentts-and-index är hårdkodad på sju ställen i tre språk. Konsolidera ägarskapet först (steg 1), döp om mappen efter MVP (steg 2).
created: 2026-08-02
source: Utredning 2026-08-02 av rotfiler och data-/logs-mappar. Alla radnummer grep-verifierade mot arbetsträdet samma dag.
---

# Loggindex: sökvägsägare före omdöpning

## Problemet i en mening

Mappen `logs/llm-segmentts-and-index` är **felstavad** ("segmentts", dubbel t),
men det verkliga problemet är att sökvägen till den är **hårdkodad på sju
ställen i tre språk** trots att det finns en konstant för den.

## Beslut

Omdöpningen delas i två steg som levereras som **separata PR:ar**:

| Steg | Vad | När | Värde |
|---|---|---|---|
| [`01-konsolidera-sokvagsagare.md`](01-konsolidera-sokvagsagare.md) | Gör konstanten till enda källan per språk | Kan göras när som helst | **Högt** — ren refaktorering, inga filer flyttas |
| [`02-omdopning.md`](02-omdopning.md) | Själva omdöpningen + migrering | **Efter MVP** | Lågt — kosmetiskt |

Steg 1 är värt att göra oavsett om steg 2 någonsin körs. Steg 2 är blockerat på
[`mvp-scope-freeze.mdc`](../../../../.cursor/rules/mvp-scope-freeze.mdc):
omdöpningen ger noll funktionell vinst och kräver en manuell migrering på varje
utvecklarmaskin.

## Varför inte ett vanligt rename

**1. Tyst historikförlust.** `generation-log-writer/run-dirs.ts:39-40` gör
`mkdirSync` när mappen saknas. Efter ett rename skapas alltså en tom mapp, och
`error-log.csv` + `error-log.ndjson` under det gamla namnet blir osynliga — utan
felmeddelande. RAG-indexet i `data/observability/error-log-tfidf-meta.json`
pekar då på data ingen längre läser. Mapparna är gitignorerade (`.gitignore:185`
`logs/*`), så det går inte att lösa i git: varje maskin måste flytta sin egen.

**2. Halva ändringen saknar skyddsnät.** Parity-testet för
`config/dashboard/domain-map.json` undantar uttryckligen `logs/**`
(`src/lib/config/dashboard-domain-map.parity.test.ts:76`), eftersom mapparna
aldrig finns på en ren CI-checkout. Missar du en av de fem domain-map-raderna
går CI grönt medan backoffice-sidan pekar på en död sökväg. Python-sökvägarna
har inget skydd alls — pyright kör i `basic`-läge och en sträng är en sträng.

## Filkarta — var sökvägen bor idag

Sju ställen konstruerar sökvägen. Bara det första är en konstant:

| Fil | Rad | Språk | Not |
|---|---|---|---|
| `src/lib/logging/generation-log-writer/constants.ts` | 5 | TS | `LEGACY_INDEX_DIR` — enda konstanten |
| `src/lib/logging/error-log-rag.ts` | 48 | TS | egen kopia (`ERROR_LOG_DIR`) |
| `src/lib/observability/fault-promotion-report-cli.ts` | 50 | TS | inline i funktion |
| `scripts/observability/index-error-log-rag.mjs` | 31 | mjs | kan inte importera TS |
| `scripts/dev/clean-scratch.mjs` | 55 | mjs | bara mappnamnet, i `AGE_SKIP_NAMES` |
| `backoffice/shared.py` | 177 | Python | `BackofficeContext.error_log_csv` |
| `backoffice/pages/llm_config.py` | 33 | Python | kringgår kontexten |
| `backoffice/pages/error_log_rag.py` | 32, 45 | Python | kringgår kontexten |

Två filer följer automatiskt med konstanten och behöver **inga** ändringar:
`generation-log-writer/fault-fix-index.ts` (rad 5, 798) och
`generation-log-writer/run-dirs.ts` (rad 6, 39-40).

Övriga förekomster är text, inte kod:

- `config/dashboard/domain-map.json` — rad 37, 42, 43, 541, 570
- `src/lib/logging/generation-log-writer.test.ts:163` — assertion på sökvägen
- `docs/canvases/llm-flow.canvas.txt:95` — **genererad**, byggs om med `npm run canvas:build`
- `.gitignore:184` — kommentar om retention
- `backoffice/pages/error_log_rag.py:124` — UI-text
- `docs/plans/avklarat/repair-loop-hardening.md:100` — **arkiv, rör inte**

## Namnfråga att avgöra i steg 2

Mappen innehåller `error-log.csv`, `error-log.ndjson` och `readme.txt`. En ren
stavfix till `llm-segments-and-index` beskriver alltså fortfarande inte
innehållet. **Rekommendation: `error-log-index`.**

Notera att konstanten heter `LEGACY_INDEX_DIR`. Om mappen ska fasas ut helt på
sikt är omdöpningen bortkastat arbete — avgör det innan steg 2 påbörjas.
