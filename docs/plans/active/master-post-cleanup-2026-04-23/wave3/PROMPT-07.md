# Du är plan-07-agenten — 3D capability-injection + three-fiber hardening

## Din roll och kontext

Du är en autonom kodagent i en isolerad git worktree på branchen `plan-07-3d-capability` i Sajtmaskin-repot. Du arbetar **parallellt** med plan-06-agenten i wave 3. Ni rör inte varandras filer (se hårda begränsningar nedan). När du är klar öppnar du PR mot `master`.

## Repo-state du ärver

- HEAD: `master @ <senaste wave-2-merge>` + (eventuellt) plan-06-merge om den landade först
- Plan 02 (modal-truth + cross-file-stub-warning) är mergad. Cross-file-stubs ytas i versionsmodalen som "Varningar".
- Plan 03 (auto-repair labeling) är mergad.
- Plan 04 (fixer-matrix) + plan 05 (single fixer entrypoint) är mergade.
- Plan 06 (capability-detection på follow-ups) är **antingen mergad eller pågående** — koordinera med plan-06-agentens territorium (se hårda begränsningar).
- **Läs `STATUS-DOSSIER-CONFUSION-AUDIT.md`** för dossier-system-kontexten.

## Den centrala buggen (din input)

Plan 01 smoke run 2: användaren skrev "Skapa en 3d-kaffekopp som hoovrar och flyger ovanför". Resultatet:
- LLM:n skapade `components/coffee-cup-3d.tsx` med ett namn som låter 3D
- Importerade från `./coffee-cup-scene` — **filen skapades aldrig**
- `cross-file-import-checker` auto-stubbade missing scene-filen så bygget gick igenom
- **Inget** `three`/`@react-three/fiber` i package.json
- **Ingen** `capability_refresh: visual-3d` i timeline
- Ingen dossier-injection
- Sajten "promotades" trots tomt 3D-skal

**Resultat:** användaren tror den fick 3D men fick placebo. Plan 02 ytar nu varningen i UI ("1 fil saknades och stubbades") men det löser bara signalering — det löser inte att 3D faktiskt inte byggdes.

## Användarens spectrum-modell (viktig design-input)

Capability handling är inte binär — det är **3 tiers** som plan 06 ska detektera + flagga:

| Tier | Hantering | Exempel |
|---|---|---|
| **`generic`** | Använd `three-fiber-canvas`-dossier verbatim. LLM får inte skriva egen scen-fil. | "lägg till en 3D-grej" |
| **`specific`** | Dossier-shell + LLM-genererad scen-fil ovanpå. Shell skyddar mount/SSR/error-boundary; LLM gör scen-innehållet. | "Skapa en 3d-kaffekopp som hoovrar" |
| **`beyond-dossier`** | Dossier som referens + custom scen-fil + custom hooks/utils. Tydlig signal till LLM "du är på egen hand med scenens uppbyggnad". | "physics-simulation av studsande tomater" |

Plan 07 ska **honorera** dessa tiers när 3D-capability triggas.

## Planens mål

1. **Säkerställ `three-fiber-canvas`-dossierns injection-väg** för follow-ups med `visual-3d` capability:
   - Manifest-injection i system-prompt
   - `package.json` får `three`, `@react-three/fiber`, `@react-three/drei` i `dependencies`
   - `instructions.md` ytas i prompten under `## Selected Dossier Instructions`
   - `three-canvas-shell.tsx` injiceras (rewritable mode — LLM får adaptera) ELLER lämnas som referens beroende på tier

2. **Tier-aware injection:**
   - **`generic`:** Bara dossier-shell + standard scen (ingen LLM-customisering). Snabb, robust.
   - **`specific`:** Dossier-shell injiceras + LLM får generera scen-filen som monteras i shell.
   - **`beyond-dossier`:** Dossier-shell som referens i system-prompt (inte injection); LLM bygger eget.

3. **Capability-add follow-up som verklig delta:**
   - Bevara `baseVersionId` (Deep Brief funkar redan, plan 06 förstärker)
   - Lägg till nya filer för 3D-capability (component + import-mount)
   - Mutera `package.json` deterministiskt (inte LLM-driven)
   - Ändra mount-point i hero/page enligt user's prompt

4. **Smoke for canvas/webgl-mount:**
   - Lägg en preview-host smoke-check som verifierar att en `<canvas>`-element bootar utan WebGL context lost-error.
   - Om context lost detekteras: emit warning event (utan att flippa modal röd — använd plan 02:s pattern).

5. **Städa stub/fallback-beteenden som ger placebo-3D:**
   - När `cross-file-import-checker` stubbar en `*-3d.tsx`-fil eller en `*scene.tsx`-fil när `visual-3d` capability INTE finns i `requestedCapabilities`: emittera EXTRA varning "3D-fil stubbed utan capability — kör om med 'capability-add' explicit".
   - Det signalerar till användaren att de ska be om "3D-figur" (med capability-keyword) i stället för bara "3d-figur" (mer poetiskt).

6. **Regressionstester:**
   - Test: follow-up med `visual-3d` capability + tier `generic` → `package.json` får three-deps
   - Test: follow-up med `visual-3d` capability + tier `specific` → dossier-shell injicerad + LLM-prompt nämner att scen ska genereras
   - Test: follow-up med `visual-3d` + tier `beyond-dossier` → dossier som referens, LLM full-custom signal
   - Test: cross-file-stub av `*-3d.tsx` UTAN `visual-3d` capability → extra varning emit
   - Optional: webgl-mount-smoke (kan vara svårt utan headless-browser; markera som follow-up om det blir hairy)

## Hårda begränsningar

- Rör INTE plan-06-filer: `src/lib/builder/promptOrchestration.ts` capability-detection-tillägg, `src/lib/builder/server-auto-brief-policy.ts` follow-up-skip-policy. Du **får läsa** plan 06:s output (`requestedCapabilities` + tier-fältet på `DossierSelectionResult`) men inte modifiera detection-logiken.
- Rör INTE plan 02/03/04/05-filer som de just landat i. Speciellt `src/lib/gen/autofix/**` (plan 04/05), `src/components/builder/Version*` (plan 02), `src/lib/gen/verify/repair-loop.ts` (plan 03).
- **Rör INTE andra dossier-mappar** än `data/dossiers/soft/three-fiber-canvas/` om du behöver justera dess shell. Inga ändringar till `hard/`-dossiers — det är capability-paths för andra capabilities, inte din scope.
- Maxbudget: ~15 filer rörda.

## Acceptans

- 3D-capability follow-up resulterar i `three`/`@react-three/fiber` i package.json (deterministisk mutation, inte LLM-improvisation).
- Tier `generic` → standard dossier-output, inget LLM-customscen-anrop.
- Tier `specific` → dossier-shell + LLM-genererad scen som monteras.
- Tier `beyond-dossier` → dossier som referens, LLM full-custom.
- Cross-file-stub av 3D-mönster utan capability → tydlig varning till användaren.
- Minst 4 regressionstester finns och passerar.
- Smoke från användarens originalprompt ("Skapa en 3d-kaffekopp...") når Fidelity 2 med ÄKTA 3D, inte placebo.

## Var du börjar leta

- `data/dossiers/soft/three-fiber-canvas/` — manifest, instructions, components/three-canvas-shell.tsx
- `src/lib/gen/dossiers/select.ts` — selektion (plan 06 förstärker, du honorerar)
- `src/lib/gen/system-prompt/sections/dossiers.ts` — där dossier-block renderas i prompten
- `src/lib/gen/build-spec/references.ts` — capability-graph
- `src/lib/gen/autofix/dep-completer.ts` — där deps läggs till i package.json
- `src/lib/gen/preview/preview-host-client.ts` — preview-host kommunikation (för canvas-smoke)

## Workflow

1. **Sätt en kort plan** (vilka filer + tier-handling-strategi).
2. **Implementera tier-aware dossier-injection** först — det är fundamentet.
3. **Wire upp deterministisk package.json-mutation** för 3D-deps.
4. **Lägg till canvas-mount-smoke** om tiden räcker (kan markeras som follow-up).
5. **Skriv tester** (4 stycken minst).
6. **Kör `npm run lint && npm run typecheck && npm run test:ci`** lokalt.
7. **Commit** i logiska steg med prefix `plan-07:`.
8. **Skriv `STATUS-07-3d-capability.md`** med:
   - tier-handling-design
   - före/efter på pizza/kaffe-scenariot
   - bekräftelse att planen blev `full`
9. **Push branchen** och **öppna PR mot master** med `gh pr create`. PR-titel: `plan 07: tier-aware 3D capability-injection + three-fiber hardening`.

## Stoppregler

- Om plan 06 inte landat när du startar och du behöver tier-fältet: **VÄNTA** — fortsätt inte utan det. Skriv en kort STATUS-07-WAITING.md och avsluta. Orkestratorn startar dig om när plan 06 är inne.
- Om webgl-mount-smoke kräver headless browser-setup som blir > 2h jobb: skippa, dokumentera, lämna som plan 10/11-follow-up.
- Om dossier-shell behöver breaking-change i sin signature: STOPPA och beskriv.

## Klart =

PR är öppnad mot master, STATUS-07 är committad, branchen är pushad.
