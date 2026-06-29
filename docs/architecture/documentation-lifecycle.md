# Dokumentationslivscykel

**Varför den här filen ligger i `docs/architecture/` (inte i `.cursor/rules/`):** Den beskriver **vad som får ligga var i `docs/`** och hur planfiler åldras. Det är **innehållspolicy** för dokumentationen. Projektregler i `.cursor/rules/` ska **länka hit** — inte duplicera samma policy ordagrant (en sanning, ett ställe).

**Översikt över hur hela projektet hänger ihop (hög nivå):** [`docs/architecture/README.md`](./README.md) och [`system-overview.md`](./system-overview.md). Uppdatera dem vid **strukturella eller stora beteendeändringar** — inte för varje liten bugfix. Små ändringar hör hemma i commit/PR och kod; skapa inte nya översiktsfiler för kosmetik.

**Nav:** [`docs/README.md`](../README.md) · planer: [`docs/plans/README.md`](../plans/README.md) · rot-träd: [`repo-tree.md`](./repo-tree.md).

## Status för planfiler

| Status | Betydelse | Var |
|--------|-----------|-----|
| `active` | Styr arbete nu | `docs/plans/active/` |
| `avklarat` | Avklarat / historik (ofta bara i git) | `docs/plans/avklarat/` |

Osäkra utkast: ligga som `*.md` under `active/` tills de flyttas eller ersätts.

## Regler (kort)

| Område | Här hör | Hit hör inte |
|--------|---------|--------------|
| `docs/architecture/` | Kanoniska översikter + glossary + denna fil | Tillfälliga scratch |
| `docs/schemas/` | Stabila schema-beskrivningar för människor + `strict/` för maskinorienterade kontrakt (kod är sanning) | Osäkra utkast |
| `docs/plans/active/` | Planer som driver implementation | Färdiga planer → `avklarat/` eller git-historik |
| `docs/plans/archived/` | Reverterade eller inaktuella planer som behålls som referens | Aktiva planer |
| `docs/archive/` | Avslutad **icke-plan**-historik (t.ex. `status/` ögonblicksbilder) — se [`README.md`](../archive/README.md) | Aktivt arbete; genererade CI-artefakter (`docs/canvases/`) |
| `docs/operating/` | Operativa driftdokument: cheatsheets + `incidents/` (postmortems) | Planarbete |
| `docs/old/` | [`README.md`](../old/README.md) — pekare; tidigare innehåll i git-historik | Nytt arbetsmaterial |

**Navigering:** `docs/README.md` är enda fulla navtabellen. `AGENTS.md` och `.cursor/README.md` ska vara tunna pekare — inga duplicerade orienteringstabeller.

**Plan-flöde:** nya planer i `active/` → när klart eller ersatt, flytta till `avklarat/` eller lita på git-historik. Uppdatera [`docs/plans/README.md`](../plans/README.md) vid större ändring.

**Rensa:** när du uppdaterar en kanonisk fil, ta bort **föråldrat** innehåll i samma fil i stället för att lägga parallella «nya sanningar».

## Schema

Utforskande schema-anteckningar: håll i `active/` tills de kan flyttas till
`schemas/` eller `avklarat/`.

Konservativ lagerregel:

- `docs/schemas/*.md` = mänskligt läsbara, stabila kontraktsdokument
- `docs/schemas/strict/*` = maskinorienterade kontrakt för dashboard/parity/tests
- flytta inte brett till en separat `human/`-mapp utan tydligt behov; håll path-churn låg

## Större strukturändringar

1. Uppdatera **kanonisk** fil under `docs/architecture/`, inte parallella kopior.  
2. Uppdatera relevant README i samma veva.  
3. Markera planstatus tydligt.

## Historik

Äldre arkitekturmaterial finns **inte** kvar i trädet (tidigare `docs/architecture/_archived/` samt `docs/architecture/archive/`, inkl. `pre-2026-03-consolidation/`, är borttagna). Återställ vid behov med `git log` / `git show`.
