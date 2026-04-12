# Scaffold-omstrukturering — Överlämning

Skapad: 2026-04-12. Kontext: hela sessionen som gjort commit 1/X–3/X + fixar.

---

## Vad som genomförts (4 commits på master)

| Commit | Beskrivning |
|--------|-------------|
| `db62ebbd1` | ScaffoldFamily→ScaffoldId, döda kodrensad, backoffice-dashboard skapad |
| `8fe32798a` | shadcn import-validator `.has()` bug fixad + dashboard deprecation |
| `7be014a1f` | scaffold-traits.ts borttagen, traits inlinade i manifests |
| `f66be527e` | recommendedScaffoldFamilies→recommendedScaffoldIds |
| `16a94057a` | suggestedScaffoldFamily→suggestedScaffoldId, ScaffoldFamily-export borttagen, duplikat fixade |

## Detaljerat: vad som ändrats

### Typer och fält
- `ScaffoldFamily` union → `ScaffoldId` (deprecated alias finns kvar i `types.ts` rad 13–14 men INTE exporterad)
- `family`-fält borttaget från `ScaffoldManifest` — `id` (typat som `ScaffoldId`) är ensam primärnyckel
- `ScaffoldManifest.id` typat som `ScaffoldId` istället för `string`

### Borttagna funktioner
- `getScaffoldByFamily()` — alla ~14 anrop i matcher.ts bytta till `getScaffoldById()`
- `getScaffoldFamilies()` — omdöpt till `getScaffoldIds()`
- `detectScaffoldMode()` — borttagen (var död kod, aldrig anropad i production)
- `applyScaffoldTraits()` — borttagen, traits definieras direkt i varje manifest

### Borttagna filer
- `src/lib/gen/scaffolds/scaffold-traits.ts` (100 rader)
- `scripts/dev/db-debug.mjs` (117 rader, stale)

### Omdöpta fält
- `recommendedScaffoldFamilies` → `recommendedScaffoldIds` i alla TS-filer
- `suggestedScaffoldFamily` → `suggestedScaffoldId` i retry/diagnostics-typer
- `scaffoldFamily` → `scaffoldId` i `BuildSpec`, `OrchestrationContract`

### Nytt
- `sajtmaskin_backoffice.py` — Streamlit dashboard med 5 sidor (Scaffolds, Research, Pipeline, Eval, Mental modell)
- `requirements.backoffice.txt` — `streamlit>=1.31`
- `npm run backoffice` — startar dashboarden
- `struktur_scarf/schema.md` — komplett dokumentation av scaffold-systemet

---

## Kvarvarande arbete

### PRIORITET HÖG

~~**1. `scaffoldFamily` i SSE/logg-metadata (~20 filer)**~~
**GENOMFÖRT** (`638b4df1b`). Alla `scaffoldFamily` runtime-fält migrerade till `scaffoldId`. CSV-kolumnen `scaffold_family` borttagen från fault-fix-loggen. DB-kolumnen `scaffold_family` i `engine_versions` behålls tills vidare (bakåtkompatibilitet). `ScaffoldFamily` type-alias borttaget.

**2. Verifiera `scaffold_cli.py` output-format**
Bekräfta att pipeline:n (`npm run template-library:build`) genererar `recommendedScaffoldIds` (inte `recommendedScaffoldFamilies`) i output-JSON. Legacy-shim finns i `src/lib/gen/template-library/catalog.ts` som mappar gamla nyckelnamn.

Kör: `npm run template-library:build` och inspektera `src/lib/gen/template-library/template-library.generated.json`

### PRIORITET MEDEL

~~**3. Flytta inline TSX/CSS till riktiga filer**~~
**GENOMFÖRT** (`03bdb493f`). 65 filer extraherade till `scaffolds/<id>/files/`. Loader i `load-scaffold-files.ts`. Manifests krympta till ~40-55 rader.

~~**4. CRUD-redigering i backoffice**~~
**GENOMFÖRT** (`84432d8f7`). `sajtmaskin_backoffice.py` har nu redigering av tags, promptHints, qualityChecklist, allowedBuildIntents.

### PRIORITET LÅG

~~**5. Ta bort `struktur_scarf/exempel/`**~~
**GENOMFÖRT.** Mappen borttagen.

~~**6. Ta bort deprecated `ScaffoldFamily` alias**~~
**GENOMFÖRT**. `src/lib/gen/scaffolds/types.ts` — aliaset borttaget.

**7. Skapa cursor-regel för subagent-verifiering**
Billiga subagenter (fast model) introducerade duplikat-fält. Lägg till regel i `.cursor/rules/` som kräver typecheck efter subagent-ändringar.

---

## Viktiga filer (referens)

| Fil | Roll |
|-----|------|
| `src/lib/gen/scaffolds/types.ts` | `ScaffoldId`, `ScaffoldManifest` (primary types) |
| `src/lib/gen/scaffolds/registry.ts` | Registry + merge-pipeline (research → SEO) |
| `src/lib/gen/scaffolds/matcher.ts` | Scaffold-matchning (keyword + embedding) |
| `src/lib/gen/scaffolds/serialize.ts` | Prompt-serialisering (structural/inspirational) |
| `src/lib/gen/scaffolds/*/manifest.ts` | 10 scaffold-manifests med alla fält |
| `src/lib/gen/template-library/catalog.ts` | Legacy-shim för recommendedScaffoldIds |
| `src/lib/gen/template-library/types.ts` | TemplateLibraryEntry med recommendedScaffoldIds |
| `sajtmaskin_backoffice.py` | Streamlit backoffice (5 sidor) |
| `scripts/scaffolds/scaffold_cli.py` | Pipeline CLI (status/import/hydrate/build/etc) |
| `struktur_scarf/schema.md` | Mental modell / komplett dokumentation |
| `config/dashboard/app.py` | Config-dashboard (separat, ej scaffold-fokus) |

## Typecheck-status

0 TypeScript-fel (exkl. `struktur_scarf/exempel/` som bör tas bort).
1 pre-existerande testfel i `dep-completer.test.ts` (versionsmismatch, ej relaterat).

## Dossiers och raw-discovery

Dessa är buildtime research-artefakter under `data/external-template-pipeline/`:
- `reference-library/catalog.json` (1.5 MB) — central byggkälla, BEHÖVS
- `raw-discovery/current/` — scrape-data, skapas av pipeline
- Dossiers-mappen (`reference-library/dossiers/`) finns INTE lokalt just nu

Pipeline-flödet: scrape → raw-discovery → catalog.json → scaffold-research.generated.json

Exemplen i `struktur_scarf/exempel/` är KOPIOR/UTDRAG och kan tas bort.

## Tre input-källor (historik, ej i pipeline)

| Mapp | Innehåll | Används av scaffold-kod? |
|------|----------|-------------------------|
| `struktur_scarf/exempel/skrapade_fran_vercel/` | ~20 000 filer, Vercel template-sidor | NEJ |
| `struktur_scarf/exempel/skrapade_fran_v0/` | 3 filer, v0 gallery | NEJ |
| `struktur_scarf/exempel/skrapade_fran_chad/` | 2 klonadeRrepos (embedded git) | NEJ |

Scaffold-systemet bygger ENBART på `data/external-template-pipeline/` via `scripts/scaffolds/scaffold_cli.py`.
