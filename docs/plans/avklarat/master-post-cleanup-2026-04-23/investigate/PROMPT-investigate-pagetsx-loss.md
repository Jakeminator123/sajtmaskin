# Du är investigationsagenten — page.tsx-loss root-cause

## Din roll

Du är en READ-ONLY investigations-agent. Du ska INTE ändra någon kod. Du ska producera en **fil med rotsorsak** som plan 11 sedan kan agera på.

Worktree: `plan-investigate-pagetsx-loss` på branchen med samma namn. När du är klar pushar du branchen + öppnar PR med titel `[investigate] page.tsx loss in scaffold-merge` med STATUS-filen som body.

## Bakgrund (din input)

Två init-runs av "skapa landningssida för kaffebutik" / "bygg en landningssida om kaffe" har båda producerat **bruten output**:

| Run | chatId | versionId | scaffoldVariant | preflight files | actual disk files |
|---|---|---|---|---|---|
| A | `1fa58609-a2f5-4b13-8246-d82dd77ca9ba` | `d7f009c9-fc58-4dc1-8cc2-1f55f24cb866` | `editorial-lux` | (saknas i log) | 6 |
| B | `b71dafb3-8c1f-413c-85f9-6ea96c4c21d6` | `2e53374a-af46-4224-96ff-2b841779e776` | `corporate-grid` | **26** | **6** |

Båda saknar `app/page.tsx`. Båda renderar bara header + footer från layout + en evig loading-spinner från `loading.tsx`. Sajten promotas som grön eftersom typecheck/preflight inte fångar att page.tsx fattas.

**Konkret bevis från live VM (Run B):**
- HTML body har `<main>` 1, `<section>` 0, `<h1>` 0, `<h2>` 0
- `loading.tsx` aktiv (Loader-spinner i mitten av sidan)
- `<header>` 1, `<footer>` 1 (renderas korrekt från layout.tsx)

**Diskrepansen:** preflight rapporterade 26 filer, men UI och faktisk disk visar 6. **Var försvinner de 20 filerna?**

## Hypoteser att verifiera (i prio-ordning)

1. **Scaffold-base-files dropped i merge:** Scaffolden `landing-page` (`src/lib/gen/scaffolds/landing-page/files/`) har `app/page.tsx` + `app/layout.tsx` + `components/site-header.tsx` + `components/site-footer.tsx` + `app/globals.css`. LLM:n förväntas behålla dessa eller modifiera dem; merge-pipelinen borde garantera att scaffold-files inte tappas om LLM inte explicit ersätter dem.

2. **`mergeGeneratedProjectFiles` filtrerar bort filer:** `src/lib/gen/stream/finalize-merge.ts` är kärnan. Möjligt att den droppar filer baserat på shape-validation eller sanity-checks.

3. **LLM emitterar bara delta (6 filer):** Möjligen är det LLM:ns CodeProject-output som BARA innehåller 6 filer, och scaffold-base-merge sker INTE på det sättet. Då är "26" antingen scaffold + delta felräkt eller från annat steg.

4. **`finalize-preflight.ts` post-`scaffold-import-checker`:** Plan 09 prunade en dead-branch här. Möjligt att en aktiv kodväg också dropper filer.

5. **Partial-file-repair eller `repairGeneratedFiles` strippar:** Defensiv kod som tar bort "obegripliga" filer.

## Var du börjar leta (filer du ska läsa)

**KÄRN-pipeline (måste läsas):**
- `src/lib/gen/stream/finalize-merge.ts` — `mergeGeneratedProjectFiles()` är troliga boven
- `src/lib/gen/stream/finalize-version/runner.ts` — orkestrerar finalize
- `src/lib/gen/stream/finalize-version/preflight-phase.ts` — räknar filer
- `src/lib/gen/stream/finalize-preflight.ts` — preflight-validatorn
- `src/lib/gen/scaffolds/load-scaffold-files.ts` — hur scaffold-files lastas
- `src/lib/gen/scaffolds/serialize.ts` (om den finns) — hur scaffold serialiseras till prompt
- `src/lib/gen/parser.ts` — `parseCodeProject` — parsar LLM-output

**Scaffold-source att jämföra med:**
- `src/lib/gen/scaffolds/landing-page/manifest.ts` (vi har redan läst)
- `src/lib/gen/scaffolds/landing-page/files/app/page.tsx` — verifiera att filen FINNS i scaffolden (inte tom, inte korrupt)
- `src/lib/gen/scaffolds/landing-page/files/` (full lista)

**Telemetry du kan läsa:**
- `logs/generationslogg/_unrouted/orchestration-styledirection/timeline.ndjson` — rörig men har data för båda runs
- `logs/site-observability/b71dafb3-*/` om den finns
- För Run A: `logs/site-observability/1fa58609-*/` (lever i `_unrouted/orchestration-styledirection`)

**Logg-rader som hänvisar till de specifika runs:**
- `01:20:36 in-progress version.created | chat=b71dafb3 | version=2e53374a`
- `01:20:36 in-progress preflight.summary | files=26 | issues=1 | errors=0 | warnings=1`
- `01:20:37 [finalize] Finalize pipeline complete { contentLen: 18366, ... }`

`contentLen: 18366` är intressant — om hela CodeProject (alla filer) är 18 KB, hur många filer ryms? Scaffold-files alone är troligen mer än så.

## Vad du MÅSTE producera

En fil: `docs/plans/active/master-post-cleanup-2026-04-23/STATUS-INVESTIGATE-PAGETSX-LOSS.md`

Innehåll:

```markdown
# STATUS — Investigation: page.tsx loss in scaffold-merge

**Datum:** 2026-04-XX  
**Investigator:** [agent identity]  
**Mode:** READ-ONLY — no code changed

## Hypothesis prioritized list (after investigation)

1. [hypothesis] — VERIFIED / FALSIFIED / NEEDS MORE DATA — evidence
2. ...

## Root cause

[1-3 paragrafer med EXAKT plats där bug är, med fil + rad-nummer + kodutdrag]

## Why scaffold's page.tsx never reaches disk

[Stegvis trace genom finalize-pipelinen, från LLM stream end till disk write]

## Why preflight.summary said 26 files

[Förklara diskrepansen 26 vs 6 — counted what?]

## Recommended fix (for plan 11, NOT implemented here)

[Specifika kod-edits eller architekturella ändringar med filnamn + rad-nummer]

## Why no existing test caught this

[Brief — vilka tester finns, vad missar de]

## Run-specific data

| Run | chatId | versionId | scaffoldVariant | files in CodeProject (LLM output) | files after merge | files on disk |
|---|---|---|---|---|---|---|
...

## Open questions for plan 11

1. ...
```

## Hårda begränsningar

- **READ-ONLY.** Du får inte ändra någon `.ts`, `.tsx`, `.json` (utom STATUS-filen). Bara läsa.
- Du får läsa logg-filer, kod-filer, test-filer, scaffold-filer.
- Du får köra `git log`, `git show`, `grep`, etc.
- Du får INTE köra agenten själv eller starta dev-server.
- Maxbudget: 30 minuter wall-clock.

## Workflow

1. **Läs scaffold-page.tsx** först (verifiera att filen är riktig och inte tom).
2. **Läs `mergeGeneratedProjectFiles`** i finalize-merge.ts noggrant.
3. **Läs `parseCodeProject`** för att förstå LLM-output-format.
4. **Trace finalize-pipeline** från stream-end till disk-write.
5. **Korrelera med logg-data** från Run B.
6. **Skriv STATUS-filen.**
7. Commit, push, öppna PR med STATUS-filen som body.

## Klart =

PR är öppnad med STATUS-INVESTIGATE-PAGETSX-LOSS.md, brachen är pushad, sessionen avslutas.
