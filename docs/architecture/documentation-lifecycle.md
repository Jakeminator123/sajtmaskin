# Dokumentationslivscykel

**Varför den här filen ligger i `docs/architecture/` (inte i `.cursor/rules/`):** Den beskriver **vad som får ligga var i `docs/`** och hur planfiler åldras. Det är **innehållspolicy** för dokumentationen. Projektregler i `.cursor/rules/` ska **länka hit** — inte duplicera samma policy ordagrant (en sanning, ett ställe).

**Översikt över hur hela projektet hänger ihop (hög nivå):** [`docs/architecture/README.md`](./README.md) och [`system-overview.md`](./system-overview.md). Uppdatera dem vid **strukturella eller stora beteendeändringar** — inte för varje liten bugfix. Små ändringar hör hemma i commit/PR och kod; skapa inte nya översiktsfiler för kosmetik.

**Nav:** [`docs/README.md`](../README.md) · planer: [`docs/plans/README.md`](../plans/README.md) · backlog: [`docs/plans/active/PROJECT-STATE-AND-DIRECTION.md`](../plans/active/PROJECT-STATE-AND-DIRECTION.md) · rot-träd: [`repo-tree.md`](./repo-tree.md).

## Status för planfiler

| Status | Betydelse | Var |
|--------|-----------|-----|
| `active` | Styr arbete nu | `docs/plans/active/` |
| `avklarat` | Avklarat / historik (ofta bara i git) | `docs/plans/avklarat/` |

Osäkra utkast: ligga som `*.md` under `active/` tills de flyttas eller ersätts.

## Regler (kort)

| Område | Här hör | Hit hör inte |
|--------|---------|--------------|
| `docs/architecture/` | Kanoniska översikter (fyra huvuddokument + denna fil) | Tillfälliga scratch |
| `docs/schemas/` | Stabila schema-beskrivningar (sanning i kod) | Osäkra utkast |
| `docs/plans/active/` | Planer som driver implementation | Färdiga planer → `avklarat/` eller git-historik |
| `docs/handoffs/` | Tidsbundna arbetsström-briefer — sekundära till arkitektur och backlog | Kanonisk arkitektur eller policy |
| `docs/notes/` | Scratch / sessionsloggar — rensa periodiskt | Stabil referens |
| `docs/FINDINGS.txt` | Sessionslogg, inte sanningskälla — flytta viktigt till backlog/arkitektur | Kanonisk information som inte finns på bättre ställe |
| `docs/old/` | Stub / pekare | Nytt material |

**Navigering:** `docs/README.md` är enda fulla navtabellen. `AGENTS.md` och `.cursor/README.md` ska vara tunna pekare — inga duplicerade orienteringstabeller.

**Plan-flöde:** nya planer i `active/` → när klart eller ersatt, flytta till `avklarat/` eller lita på git-historik. Uppdatera [`docs/plans/README.md`](../plans/README.md) vid större ändring.

**Rensa:** när du uppdaterar en kanonisk fil, ta bort **föråldrat** innehåll i samma fil i stället för att lägga parallella «nya sanningar».

## Schema

Utforskande schema-anteckningar: håll i `active/` tills de kan flyttas till `schemas/` eller `avklarat/`.

## Större strukturändringar

1. Uppdatera **kanonisk** fil under `docs/architecture/`, inte parallella kopior.  
2. Uppdatera relevant README i samma veva.  
3. Markera planstatus tydligt.

## Historik

Hela `docs/architecture/archive/` (inkl. tidigare `pre-2026-03-consolidation/`) finns **inte** i trädet längre. Återställ vid behov med `git log` / `git show` på historiska sökvägar under `docs/architecture/archive/`.
