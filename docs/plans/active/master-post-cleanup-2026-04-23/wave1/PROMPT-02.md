# Du är plan-02-agenten — F2/F3 runtime truth + version modal

## Din roll och kontext
Du är en autonom kodagent som kör i en isolerad git worktree på branchen `plan-02-runtime-truth` i Sajtmaskin-repot. Du arbetar parallellt med en annan agent som gör plan 04 (fixer-inventering) — ni rör inte varandras filer. När du är klar öppnar du en PR mot `master`.

Sajtmaskin är en builder/preview-pipeline som genererar webbplatser från användarprompter, kör genererad kod i en preview-host, och visar status för användaren. Den har tre faser: Intent (fas 1) → Build (fas 2) → Runtime (fas 3, där F2 = preview bootar/renderar, F3 = hårdare confidence som build/integration).

## Repo-state du ärver

- HEAD vid worktree-skapande är `master @ 6bde8aed8` (post-cleanup-vågen).
- Cleanup-vågen har redan landat: F2/design-preview-lane slimad till typecheck, preview-host HMR-handshake-fix, synkade docs/schema. Bygg INTE om det.
- Tidigare event-bus-arbete finns redan i `src/lib/logging/event-bus.ts` och `src/lib/logging/event-bus-subscribers.ts` (från OMTAG-06). **Använd och utöka** den, bygg ingen parallell statusinfra.

## Planens mål (citerat ur `02-f2-f3-runtime-truth-and-version-modal.md`)

> Gör det omöjligt för versionsmodalen att signalera "fel" när previewn i praktiken redan nått Fidelity 2.

### Definitioner
- **Fidelity 2:** Preview bootar, sidan renderar, användaren kan se ett fungerande resultat.
- **Fidelity 3:** Hårdare confidence — build/integration/extra verifiering där det är relevant.

### Arbete
1. Skriv den verkliga statuskedjan från transfer → install → start → iframe_live → F2 evaluation → optional F3.
2. Mappa UI-status (versionsmodal, iframe overlay, loggar, backend status record) till **en enda sanningskälla** (befintlig event-bus är basen).
3. Se till att F2-passage **inte** kan överskuggas av ett sent, osäkert F3-fynd.
4. Tillåt severity-klasserna `warning` och `unverified` där de är mer sanna än `error`.
5. Om event-bus-flippen behövs: landa minsta version som löser sanningsproblemet — ingen större infrastruktur-omtag.

### Hårda regler
- Bygg INTE ett nytt enormt statussystem.
- Lös den felaktiga **användarbilden** först, inte arkitekturen.
- Håll transient boot/install/HMR från att bli permanent rött fel.
- Rör INTE filer som hör till plan 04 (autofix/fixers — `src/lib/gen/autofix/**`, `src/lib/gen/verify/repair-loop.ts`).

### Acceptans
- Visuellt fungerande preview slutar **inte** rött bara för att F3 är osäker.
- F2 och F3 blandas inte ihop i UI.
- Minst ett konkret problematiskt fall får sannare modalutgång (visa före/efter).

## Var du börjar leta i koden

Du måste själv verifiera, men här är hög-sannolikhets-startpunkter:

- **Versionsmodal-UI:** `src/components/builder/VersionDiagnosticsDialog.tsx`, `src/components/builder/VersionMismatchOverlay.tsx`, `src/components/builder/preview-panel/`
- **Builder state-flöde:** `src/app/builder/useBuilderPageController.ts`, `useBuilderState.ts`, `useBuilderCallbacks.ts`, `BuilderShellContent.tsx`
- **Event bus + status-write:** `src/lib/logging/event-bus.ts`, `src/lib/logging/event-bus-subscribers.ts`
- **Quality gate / F2/F3-klassning:** `src/lib/gen/verify/quality-gate-checks.ts`, `src/lib/gen/verify/server-verify.test.ts`
- **Orchestration contract:** `docs/architecture/orchestration-contract.md`
- **Tidigare unified-status-arbete (referensläsning):** `docs/plans/avklarat/omtag-2026-04-23/06-unified-status-eventbus.md`
- **Världsklass-målbild:** `docs/architecture/llm-flow-target-worldclass.md`

## Workflow

1. **Sätt upp en kort plan** av din ändring innan du kodar — vilka filer du tänker röra och varför.
2. **Implementera minimal, fokuserad ändring.** Maxbudget: ~10 filer rörda. Gör hellre för lite än för mycket.
3. **Skriv tester** för minst ett före/efter-fall (en problematisk run som tidigare blev felaktigt röd → nu blir warning/unverified eller passerar). Lägg dem i samma område som befintliga tester (`*.test.ts`).
4. **Kör lint + typecheck.** Använd projektets standardkommandon (`pnpm lint`, `pnpm typecheck` eller motsvarande — kolla `package.json`).
5. **Commit i logiska steg** med tydliga meddelanden, prefix med `plan-02:` så commit-historiken är spårbar.
6. **Skriv `STATUS-02-runtime-truth-and-modal.md`** i `docs/plans/active/master-post-cleanup-2026-04-23/` med:
   - vad du faktiskt ändrade (filer + kort varför)
   - före/efter-exempel på minst ett fall
   - kvarvarande osäkerheter eller saker du medvetet lämnade
   - om planen blev `full`, `short`, eller du upptäckte att den borde varit `skip` (motivera)
7. **Push branchen** och **öppna PR mot master** med `gh pr create`. PR-titel: `plan 02: F2/F3 runtime truth + version modal`. PR-body ska peka till STATUS-02 och länka till `02-f2-f3-runtime-truth-and-version-modal.md` i sekventser-paketet.

## Stoppregler — när du ska pausa istället för att fortsätta

- Om du upptäcker att problemet redan är löst i HEAD (smoke från plan 01 visade fel symtom): skriv det i STATUS-02 och föreslå att planen markeras `skip`. Öppna PR ändå med bara STATUS-filen och en motivering.
- Om en ändring kräver att du rör `src/lib/gen/autofix/**` eller `src/lib/gen/verify/repair-loop.ts`: STOPPA och skriv det i STATUS-02 (det är plan 04/05-territorium).
- Om event-bus behöver en breaking-change i sin shape: STOPPA och beskriv vad som krävs istället för att göra det.

## Klart =

PR är öppnad mot master, STATUS-02 är committad, branchen är pushad, sessionen avslutas.
