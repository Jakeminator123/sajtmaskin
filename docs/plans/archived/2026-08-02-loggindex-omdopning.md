---
status: active
owner: unassigned
topic: Steg 2 — själva omdöpningen av logs/llm-segmentts-and-index. Blockerad på MVP-leverans + ägarens namnbeslut. Kräver manuell migrering per maskin.
created: 2026-08-02
source: Master-planens riskavsnitt. Förutsätter att steg 1 är levererat.
---

# Steg 2: omdöpningen

## Blockerad tills två saker är sanna

1. **MVP är levererad.** [`mvp-scope-freeze.mdc`](../../../../.cursor/rules/mvp-scope-freeze.mdc)
   säger stabilitet före kosmetik, och den här ändringen är ren kosmetik.
2. **Ägaren har valt målnamn** — och samtidigt avgjort om mappen ska leva vidare
   alls. Konstanten heter `LEGACY_INDEX_DIR`; ska mappen fasas ut är omdöpningen
   bortkastat arbete.

Rekommenderat namn: **`error-log-index`** (innehållet är `error-log.csv`,
`error-log.ndjson` och `readme.txt` — "llm-segments" beskriver det inte).

**Förutsätter [`01-konsolidera-sokvagsagare.md`](01-konsolidera-sokvagsagare.md).**
Utan steg 1 är detta en sök-och-ersätt över sju ställen i tre språk med svagt
skyddsnät — precis det som gör ändringen riskabel.

## Kodändringar när steg 1 är på plats

| Fil | Ändring |
|---|---|
| `generation-log-writer/constants.ts` | `LEGACY_INDEX_DIR_NAME` → nytt namn (byt även konstantnamnet om mappen inte längre är "legacy") |
| `scripts/observability/index-error-log-rag.mjs` | strängen + pekar-kommentaren |
| `scripts/dev/clean-scratch.mjs` | posten i `AGE_SKIP_NAMES` |
| `backoffice/shared.py` | de tre sökvägarna i `build_backoffice_context` |
| `generation-log-writer.test.ts:163` | assertionen |
| `config/dashboard/domain-map.json` | **fem** rader: 37, 42, 43, 541, 570 |
| `backoffice/pages/error_log_rag.py:124` | UI-texten |
| `.gitignore:184` | retention-kommentaren |
| `logs/.../readme.txt` | `git mv` — filen är spårad trots `logs/*` |

Regenerera sedan `docs/canvases/llm-flow.canvas.txt` med `npm run canvas:build`
— redigera den inte för hand.

**Rör inte** `docs/plans/avklarat/repair-loop-hardening.md:100`. Arkiverade
planer beskriver vad som gällde då; att skriva om historik döljer att namnet
någonsin var ett annat.

## Migreringen — det som faktiskt kan gå fel

Mapparna är gitignorerade (`.gitignore:185` `logs/*`), så **git migrerar
ingenting**. Varje maskin med logghistorik måste flytta sin egen mapp, annars
skapar `run-dirs.ts:39-40` tyst en tom mapp och gammal `error-log.csv` /
`error-log.ndjson` blir osynlig. Inget felmeddelande, ingen tom-fil-varning.

Kör detta **före** du drar hem PR:en, på varje maskin som kört generationer:

```powershell
$gammal = "logs/llm-segmentts-and-index"
$ny     = "logs/error-log-index"
if ((Test-Path $gammal) -and -not (Test-Path $ny)) { Move-Item $gammal $ny }
Get-ChildItem $ny
```

Sätt samma kommando i PR-beskrivningen. En agent som drar hem ändringen på en
ny maskin utan historik behöver inte göra något — mappen skapas tom ändå.

Bygg om RAG-indexet efteråt, eftersom
`data/observability/error-log-tfidf-meta.json` refererar den gamla källan:

```powershell
npm run rag:error-log:reindex:force
```

## Verifiering

```powershell
npm run typecheck
npx vitest run src/lib/logging src/lib/config
npm run backoffice:test
npm run canvas:build
npm run hygiene
```

`npm run hygiene` fångar döda docs-länkar. Det som **inte** fångas automatiskt:

- **De fem `domain-map.json`-raderna.** Parity-testet undantar `logs/**`
  (`dashboard-domain-map.parity.test.ts:76`), så CI blir grönt även om du missar
  en. Kontrollera manuellt.
- **Python-sökvägarna.** Pyright kör `basic` och ser inte en felaktig sträng.

Sista kontrollen är ett grep som ska ge **noll** träffar utanför arkivet:

```powershell
Select-String -Path (git ls-files) -Pattern 'llm-segmentts-and-index'
```

Öppna sedan backoffice (`npm run backoffice`) och verifiera att
**LLM-konfiguration** hittar sin readme och att **Error-log RAG** visar samma
radantal som före migreringen — det är beviset på att historiken följde med.

## Rollback

Koden återställs med en revert. Data återställs genom att flytta mappen
tillbaka; inget raderas i något steg, så en felaktig migrering kostar bara en
extra `Move-Item`.
