---
status: active
owner: unassigned
topic: Steg 1 — gör LEGACY_INDEX_DIR till enda sökvägskällan i TS och BackofficeContext till enda källan i Python. Ren refaktorering, inga filer flyttas.
created: 2026-08-02
source: Master-planens filkarta. Radnummer grep-verifierade 2026-08-02.
---

# Steg 1: konsolidera sökvägsägaren

Ren refaktorering. **Inga filer flyttas, inget byter namn, inget kan tappas
bort.** Kan levereras även om steg 2 aldrig körs.

Mål: sökvägen `logs/llm-segmentts-and-index` går från **sju** konstruktionsställen
till **fyra**, och alla fyra pekar dokumenterat på samma ägare.

## A — Dela upp konstanten så callers med egen root kan komponera

`src/lib/logging/generation-log-writer/constants.ts:5` ser ut så här idag:

```ts
export const LEGACY_INDEX_DIR = path.join(process.cwd(), "logs", "llm-segmentts-and-index");
```

Bryt ut mappnamnet, behåll den befintliga exporten oförändrad:

```ts
export const LEGACY_INDEX_DIR_NAME = "llm-segmentts-and-index";
export const LEGACY_INDEX_DIR = path.join(process.cwd(), "logs", LEGACY_INDEX_DIR_NAME);
```

Detta är nyckeln till hela steget. `fault-promotion-report-cli.ts` tar en
**`root`-parameter** och får därför inte byta till `LEGACY_INDEX_DIR` — den är
bunden till `process.cwd()` och skulle tyst ignorera anroparens root. Med
namnet utbrutet kan den komponera sin egen sökväg utan att duplicera strängen.

## B — TS-filerna importerar i stället för att bygga själva

**`src/lib/logging/error-log-rag.ts:48-49`** använder `process.cwd()`, precis
som konstanten. Byt rakt av:

```ts
import { LEGACY_INDEX_DIR } from "./generation-log-writer/constants";

const ERROR_LOG_NDJSON = path.join(LEGACY_INDEX_DIR, "error-log.ndjson");
```

Den lokala `ERROR_LOG_DIR` försvinner. `constants.ts` importerar bara
`node:path`, så ingen cirkulär import uppstår.

**`src/lib/observability/fault-promotion-report-cli.ts:50`** behåller sin
root-parameter:

```ts
const ndjsonPath = path.join(root, "logs", LEGACY_INDEX_DIR_NAME, "error-log.ndjson");
```

## C — De två .mjs-scripten får en pekare, inte en import

`scripts/observability/index-error-log-rag.mjs:31` och
`scripts/dev/clean-scratch.mjs:55` körs med `node`, inte `tsx`, och kan därför
inte importera TS-konstanten. De **behåller sina strängar**. Lägg en rad ovanför
varje som pekar ut ägaren, så nästa läsare vet var sanningen bor:

```js
// Sökvägsnamnet ägs av LEGACY_INDEX_DIR_NAME i
// src/lib/logging/generation-log-writer/constants.ts — håll dem i synk.
```

Att bygga en delad JSON-fil bara för den här strängen är överarbete för två
rader; en dokumenterad pekare är rätt nivå här.

## D — Python: låt de två sidorna använda kontexten som redan finns

`BackofficeContext` (frozen dataclass, `backoffice/shared.py:21-38`) har redan
`error_log_csv: Path` (rad 37), satt på rad 177. Två sidor **kringgår** den och
bygger egna sökvägar. Lägg till två fält bredvid det befintliga:

```python
    error_log_csv: Path
    error_log_ndjson: Path
    llm_index_readme: Path
```

och sätt dem i `build_backoffice_context` (efter rad 177):

```python
        error_log_ndjson=root / "logs" / "llm-segmentts-and-index" / "error-log.ndjson",
        llm_index_readme=root / "logs" / "llm-segmentts-and-index" / "readme.txt",
```

Sedan:

- **`backoffice/pages/llm_config.py:33`** → `ctx.llm_index_readme` (sidan har
  redan `ctx` i scope — den använder `ctx.manifest_json` på rad 31).
- **`backoffice/pages/error_log_rag.py:32` och `:45`** → `ctx.error_log_ndjson`.
  Obs: båda funktionerna tar `repo_root: Path` som parameter, inte `ctx`. Byt
  parametern till `ctx: BackofficeContext` och uppdatera anropsställena, eller
  skicka in sökvägen som argument — välj det som ger minst diff.

Efter detta finns sökvägen på **ett** ställe i Python i stället för tre.

## Vad som INTE ska röras i detta steg

- Mappen på disk, dess namn och dess innehåll.
- `config/dashboard/domain-map.json` — sökvägarna är fortfarande korrekta.
- `src/lib/logging/generation-log-writer.test.ts:163` — assertionen är
  fortfarande sann.
- `.gitignore:184`, `docs/canvases/llm-flow.canvas.txt`,
  `docs/plans/avklarat/repair-loop-hardening.md`.

## Verifiering

```powershell
npm run typecheck
npx vitest run src/lib/logging src/lib/observability
npm run backoffice:test
node scripts/observability/index-error-log-rag.mjs --force
npm run clean:orphans:dry
```

Sedan ett grep-svep som ska visa **exakt fyra** kodträffar (constants.ts,
de två .mjs-scripten, shared.py) plus text/docs-träffarna:

```powershell
Select-String -Path (git ls-files) -Pattern 'llm-segmentts-and-index' | Select-Object Filename, LineNumber
```

Kör `npm run backoffice` och öppna sidorna **LLM-konfiguration** och
**Error-log RAG** — de läser filer som inte finns på en ren checkout, så deras
"saknas"-fallback ska se likadan ut som före ändringen.

## Definition of done

- Grep visar fyra kodställen, inte sju.
- `LEGACY_INDEX_DIR` och `LEGACY_INDEX_DIR_NAME` är de enda TS-strängarna.
- Ingen sida i backoffice bygger sökvägen själv.
- Inga filer flyttade, inga beteendeändringar.
