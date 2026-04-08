# Master closeout

Datum: 2026-04-08  
Bas: `master` (i sync med `origin/master` vid closeout-korning)

## Nulage

Integrationslinjen for 01/02/03/05/06 ligger pa `master`, och closeout har verifierats utan att blanda in Fly.io-sparet.

Genomford verifiering:

- `npm run typecheck` (gron)
- `npx vitest run src/lib/gen/route-plan.test.ts src/lib/builder/preview-lifecycle.test.ts src/app/api/v0/chats/[chatId]/versions/route.test.ts` (gron, 22/22 tester)

Notering: En befintlig testtyp i `project-scaffold.test.ts` blockerade typecheck och justerades sa att testets type-assertion matchar faktisk `package.json`-shape (`devDependencies`).

## Problem/risker (sannolikhet + paverkan)

1. **Ateranvandning av gamla 04/07-commits**  
   - Sannolikhet: medel  
   - Paverkan: hog (risk for overtramp, overlap och regressions vid bred cherry-pick)
2. **Blandning av Fly.io/dashboard-sparet med closeout**  
   - Sannolikhet: medel  
   - Paverkan: medel-hog (oklar ansvarslinje och smutsig integrationshistorik)
3. **Felaktig bild av "klart nu" vs "senare backlog"**  
   - Sannolikhet: medel  
   - Paverkan: medel (onodiga mergeforsok pa stangda referensspar)

## Berorda filer

- `src/lib/gen/project-scaffold.test.ts` (type-fix for verifieringsblockerare)
- `docs/agent-reports/master-closeout.md` (denna closeout-rapport)

## Beslut som fasts i closeout

- **04/07 fryses som referensspar**, inte direkta mergekandidater.
- **Fly.io-/dashboard-sparet halls separat** och blockerar inte master-closeout.
- **Kvarvarande arbete uttrycks som nya smala pass fran aktuell `master`**, inte som efterslapande worktree-raddning.

## Rekommenderat nasta smala steg

1. Nytt smalt `04`-pass endast om ni explicit vill minska kvarvarande interna `sandbox*`-ytor ytterligare.
2. Nytt Fly.io/dashboard-pass for `scripts/fly_vm/dashboard.py` och narliggande filer (separat agare/spor).
3. Nytt follow-up-pass endast om route-eskalering eller preview-edge-case kan reproduceras pa dagens `master`.

## Tydligt gjort / inte gjort

### Gjort nu

- Fly.io-sparet har hallits separat i closeout.
- Slutlig verifiering av landade integrationsandringar ar kord och gron.
- 04/07 ar formaliserat som referensspar i closeout.
- "Klart nu" och "senare backlog" ar tydligt separerade i denna rapport.

### Inte gjort nu

- Ingen bred strukturell migrering av alla `sandbox`-namn.
- Ingen merge/cherry-pick av gamla 04/07-commits.
- Ingen manuell builder-smoke-korning i UI (valfri operativ kontroll om ni vill).
