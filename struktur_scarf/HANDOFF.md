# Scaffold-omstrukturering — Överlämning

Skapad: 2026-04-12. Uppdaterad: 2026-04-12 (session 2).

---

## Session 2 — Genomfört (8 commits, pushade till master)

| Commit | Beskrivning |
|--------|-------------|
| `638b4df1b` | scaffoldFamily runtime-migration (~21 TS-filer) + scripts-audit |
| `03bdb493f` | Extrahera 65 inline-filer till disk + loadScaffoldFiles loader |
| `84432d8f7` | Backoffice CRUD (tags, hints, checklist, intents) + cursor-regel |
| `e43d34b51` | HANDOFF.md uppdaterad med genomförda punkter |
| `bd51680fc` | Orchestration Map-sida i backoffice |
| `b64217741` | Scaffold-arkitektur cursor-regel + SKILL.md uppdaterad |

### Vad som ändrades

**scaffoldFamily-bort:** Alla `scaffoldFamily` runtime-fält -> `scaffoldId` i SSE, logg, hooks, providers, tester. `ScaffoldFamily` typ-alias borttaget. CSV-kolumn borttagen. DB-kolumn `scaffold_family` behålls (bakåtkompatibilitet).

**Inline-filer extraherade:** 65 filer från 10 manifest.ts -> riktiga filer under `scaffolds/<id>/files/`. Loader `loadScaffoldFiles()` läser från disk. Manifests krympta till ~40-55 rader. `tsconfig.json` exkluderar `scaffolds/*/files` från typecheck.

**Backoffice CRUD:** `sajtmaskin_backoffice.py` har nu redigering av tags, promptHints, qualityChecklist, allowedBuildIntents via regex-parsning + skrivning till manifest.ts.

**Orchestration Map:** Ny sida i backoffice som parsar TS-uniontyper direkt ur källkoden och visar alla beslutspunkter + flödesdiagram + Vercel Use Case-mappning.

**Scripts-audit:** Återställde felaktigt borttagen `sync-v0-templates.mjs`. Döpte om `recommendScaffoldFamilies` -> `recommendScaffoldIds`, `KNOWN_SCAFFOLD_FAMILIES` -> `KNOWN_SCAFFOLD_IDS` i build-script.

**Dokumentation:** `.cursor/rules/scaffold-architecture.mdc` med komplett flödesdiagram, extern research-path, token-budgetering, agent-regler. `.cursor/skills/sajtmaskin-context/SKILL.md` uppdaterad. `.cursor/rules/subagent-verification.mdc` tillagd.

---

## Verifierat vid avslut

- TypeScript: 0 fel
- Scaffold-laddning: alla 10 scaffolds, alla filer har innehåll
- scaffoldFamily/ScaffoldFamily: 0 förekomster i TS/TSX/PY
- Git: rent working tree, pushat till master

---

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

---

## Framtida arbete (ej påbörjat)

| Område | Beskrivning | Komplexitet |
|--------|-------------|-------------|
| Automatisk baseline-uppdatering | CI-jobb eller script som testar senaste next/tailwind/shadcn mot preview-miljön och uppdaterar pinnade versioner | Medel |
| Scaffold-specifik toolkit-lista | `## Your Toolkit` anpassad per scaffold (dashboard -> Table, Chart; landing -> Hero, CTA) | Låg-medel |
| Komponentpool per scaffold | Utöka scaffolds med valfria sektioner/komponenter som LLM:en kan plocka från | Stor |
| Konsolidera dashboards | Slå ihop scripts_dashboard.py + config/dashboard/app.py in i sajtmaskin_backoffice.py | Medel |
| Nya scaffolds | AI-chat, docs-site, realtime-app (Vercels sida har kategorier vi saknar) | Medel per scaffold |
| config/ai_models audit | Verifiera att manifest.json och build profiles är aktuella och optimerade | Låg |

## Viktig kontext för nästa agent

- Läs `.cursor/rules/scaffold-architecture.mdc` FÖRST — komplett flödesdiagram
- Backoffice: `python sajtmaskin_backoffice.py` (Streamlit, 6 sidor)
- Scaffold-filer: redigera direkt under `scaffolds/<id>/files/`
- Manifest-metadata: redigera via backoffice Scaffolds-sida eller direkt i `manifest.ts`
- Typecheck: `npx tsc --noEmit` (0 fel förväntas exkl. `struktur_scarf/`)
- Scaffold-verifiering: `npx tsx -e "import { getAllScaffolds } from './src/lib/gen/scaffolds/registry'; getAllScaffolds().forEach(s => console.log(s.id, s.files.length))"`

