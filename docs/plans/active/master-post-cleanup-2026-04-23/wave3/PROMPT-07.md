# Du är plan-07-agenten — 3D capability-injection + three-fiber hardening (REVISED, conservative)

## Din roll och kontext

Du är en autonom kodagent i en isolerad git worktree på branchen `plan-07-3d-capability` i Sajtmaskin-repot. Du arbetar **parallellt** med plan-06-agenten i wave 3. Ni rör inte varandras filer (se hårda begränsningar nedan). När du är klar öppnar du PR mot `master`.

**Viktigt — scope minskat efter användar-feedback:** Plan 07 ska INTE bygga någon "tier-aware"-logik eller question-classification. Det är ett bredare designarbete (specifika prompter med exakta parametrar vs generiska, multi-question, page-add, pure-chat) som tillhör en framtida plan, inte denna. Plan 07 är **rent mekanisk** — gör det vi VET förbättrar, rör inget vi är osäkra på.

## Repo-state du ärver

- HEAD: `master @ <senaste wave-2-merge>` (efter plan 03 + plan 05) + eventuellt plan 06 om den landade först.
- Plan 02 (modal-truth + cross-file-stub-warning) är mergad. Cross-file-stubs ytas i versionsmodalen som "Varningar".
- Plan 06 (capability-detection på follow-ups) är **antingen mergad eller pågående** — du litar på att den fyller `requestedCapabilities` korrekt. Du ändrar INTE detection-logiken.
- **Läs `STATUS-DOSSIER-CONFUSION-AUDIT.md`** för dossier-system-kontexten.

## Den centrala buggen (din input)

Plan 01 smoke run 2: användaren skrev "Skapa en 3d-kaffekopp som hoovrar och flyger ovanför". Resultatet:
- LLM:n skapade `components/coffee-cup-3d.tsx` med ett namn som låter 3D
- Importerade från `./coffee-cup-scene` — **filen skapades aldrig**
- `cross-file-import-checker` auto-stubbade missing scene-filen så bygget gick igenom
- **Inget** `three`/`@react-three/fiber` i package.json
- **Ingen** `capability_refresh: visual-3d` i timeline (det fixar plan 06)
- Sajten "promotades" trots tomt 3D-skal

Plan 07 fokuserar på de **mekaniska** delarna som följer EFTER plan 06 markerat capability korrekt.

## Planens minimala mål (revised)

1. **Deterministisk dependency-injection** för `visual-3d` capability:
   - När `requestedCapabilities` innehåller `visual-3d` (plan 06 fyller det), säkerställ att `three`, `@react-three/fiber`, `@react-three/drei` läggs till `package.json` `dependencies` **utan** att lita på LLM:n att göra det.
   - Använd existerande `dep-completer.ts`-mönster, inte ett nytt system.

2. **Cross-file-stub-extra-warning för 3D-namnade filer utan capability:**
   - När `cross-file-import-checker` stubbar en fil vars namn matchar `/3d|three|webgl|canvas-?scene/i` OCH `requestedCapabilities` INTE innehåller `visual-3d`:
     - Lägg till en extra `warning`-rad utöver standard cross-file-stub-warningen (plan 02 introducerade den)
     - Reason-text: "3D-fil stubbed utan visual-3d capability — överväg att be med 'capability-add' explicit"
   - Det signalerar till användaren att de ska säga "3D-grej" mer explicit nästa gång.

3. **Sanity-test för dossier-injection-vägen:**
   - En end-to-end test (kan vara mockad) som verifierar: `requestedCapabilities: ["visual-3d"]` på follow-up → `selectDossiersForRequest` returnerar `three-fiber-canvas` → `package.json`-mutation triggas → `dependencies` har three-stacken.
   - INGEN test för olika "tiers" — det är inte plan 07:s scope.

## Vad du EXPLICIT INTE gör

- **Ingen tier-aware logic.** Generic vs specific vs beyond-dossier är användarens framtida designarbete, inte din kod.
- **Ingen question-classification.** Splitting av multi-question, identifiering av page-add vs capability-add vs pure-chat — ALLT det är framtida arbete.
- **Ingen ändring av how `selectDossiersForRequest` väljer dossier.** Du litar på den befintliga selektionen.
- **Inga ändringar till dossier-shell-koden** (`data/dossiers/soft/three-fiber-canvas/components/three-canvas-shell.tsx`) om du inte hittar en bekräftad bugg där.
- **Ingen LLM-prompt-redesign för 3D-scen-generering.** Lämna det åt LLM:n.
- **Inga "smarta" defaults** baserat på prompt-text-pattern. Allt ska gå via plan 06:s `requestedCapabilities`.

## Hårda begränsningar

- Rör INTE plan-06-filer: `src/lib/builder/promptOrchestration.ts` capability-detection-tillägg, `src/lib/builder/server-auto-brief-policy.ts`. Du **får läsa** plan 06:s output men inte modifiera detection-logiken.
- Rör INTE plan 02/03/04/05-filer som de just landat i.
- **Rör INTE andra dossier-mappar** än `data/dossiers/soft/three-fiber-canvas/` — och bara om du upptäcker en bekräftad bugg där.
- Maxbudget: ~8 filer rörda (revised lower since scope shrunk).

## Acceptans

- 3D-capability follow-up resulterar i `three`/`@react-three/fiber` i package.json (deterministisk mutation).
- Cross-file-stub av 3D-mönster utan capability → tydlig varning till användaren.
- Minst 2 regressionstester passerar.
- Smoke-scenariot från plan 01 ("Skapa en 3d-kaffekopp...") når Fidelity 2 med faktiska three-deps i package.json (LLM:n får sen göra vad den vill med scen-koden — det är inte din kontroll).

## Var du börjar leta

- `data/dossiers/soft/three-fiber-canvas/manifest.json` — `dependencies`-fältet
- `src/lib/gen/dossiers/select.ts` — hur dependencies propageras från dossier
- `src/lib/gen/autofix/dep-completer.ts` — där deps läggs till i package.json
- `src/lib/gen/stream/finalize-merge.ts` — `crossFileStubs`-logiken (plan 02 lade till `crossFileStubs`-fältet, du läser det och adderar 3D-specifik warning)
- `src/lib/providers/own-engine/generation-stream-post-finalize.ts` — där cross-file-stubs konsumeras (plan 02-territory; lägg din extra warning vid sidan av befintlig)

## Workflow

1. **Sätt en kort plan** (max 8 filer, vilken ändring i varje).
2. **Implementera deterministisk dep-injection** först.
3. **Lägg till 3D-namnet-utan-capability-extra-warning** i `generation-stream-post-finalize.ts` (samma callsite som plan 02:s warning, inte ny).
4. **Skriv 2 regressionstester.**
5. **Kör `npm run lint && npm run typecheck && npm run test:ci`** lokalt.
6. **Commit** i logiska steg med prefix `plan-07:`.
7. **Skriv `STATUS-07-3d-capability.md`** med:
   - vad du faktiskt ändrade
   - vad du EXPLICIT inte gjorde + varför (defer till framtida plan)
   - bekräftelse att planen blev `short` (revised från `full`), inte `full`
8. **Push branchen** och **öppna PR mot master** med `gh pr create`. PR-titel: `plan 07 (short, revised): deterministic three-deps + 3D-stub-warning`.

## Stoppregler

- Om plan 06 inte landat när du startar och du behöver `requestedCapabilities` på follow-ups: **VÄNTA**. Skriv en kort STATUS-07-WAITING.md och avsluta. Orkestratorn startar dig om.
- Om du hittar en "tier"-relaterad sak du tror behövs: STOPPA. Lägg det i STATUS-07 som "framtida-plan-kandidat" istället för att implementera.
- Om dossier-shell behöver ändras: STOPPA, beskriv, lämna till framtida plan.

## Klart =

PR är öppnad mot master, STATUS-07 är committad, branchen är pushad.

## För framtida plan (NOT YOUR JOB)

Användarens design för bredare frågeklassificering har följande kategorier:

| Kategori | Exempel | Hantering |
|---|---|---|
| Specifik mod (parametrar) | "rosa pizza, 13° rotation" | Manuell, inte dossier-automatik |
| Generisk capability-add | "3D-pryl Latcholiban" | Dossier verbatim |
| Multi-question i en prompt | "klocka + flodhäst på bild + klocka i video" | Splitta först, route varje |
| Page-add (inte edit) | "skapa en till sida" | Scaffold-add, inte capability-add |
| Pure chat-svar | "vad är klockan?" | Inte generation alls |

Detta blir en **framtida plan efter wave 5**. Inte din scope.
