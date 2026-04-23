# Du är plan-02-agenten — F2/F3 runtime truth + version modal (REVISED, SHORT scope)

## Din roll och kontext

Du är en autonom kodagent i en isolerad git worktree på branchen `plan-02-runtime-truth-short` i Sajtmaskin-repot. När du är klar öppnar du PR mot `master` med `gh pr create`.

**Viktigt:** Plan 02 är **nedskalad till `short`** efter plan 01-smoke. Modal-truth funkar redan. Du ska INTE göra en stor F2/F3-arkitektur-omtag. Du ska göra **kirurgiska fixes + regressionstester** som låser fast den ärliga signaleringen så den inte glider tillbaka.

## Repo-state du ärver

- HEAD: `master @ 9f9a5a043` (efter plan-04 merge + STATUS-01 + STATUS-04-AUDIT)
- Plan 04 (fixer-surface inventory) är mergad. Läs `docs/plans/active/master-post-cleanup-2026-04-23/fixer-matrix.md` + `STATUS-04-AUDIT.md` för kontext om fixer-ytan.
- Plan 01 (smoke) är klar. Läs `STATUS-01-rollout-and-smoke.md` för **konkreta fynd** från 3 verkliga runs (init kaffe, 3D-coffee-cup via inspector, kontaktform).
- Cleanup-vågen + tidigare OMTAG-06-arbete har redan landat: F2/design-preview-lane slimad, event-bus i `src/lib/logging/event-bus.ts`, `design_preview_skip_verify`-policy är medveten.

## Bekräftade fynd från smoke (din input)

Modal-truth FUNGERAR i HEAD:
- 3 av 3 runs blev `Promoted` med ärlig statuskedja: `verifying` (gul) → `Repairing` (gul) → `Promoted` (grön)
- F2 överskuggades inte av F3 ens när repair körde i bakgrunden ("Preview är tillgänglig under tiden")
- `design_preview_skip_verify` triggades korrekt för follow-ups (server-verify körs inte i designläge)
- Init failade en gång med ButtonProps-typecheck → repair-lanen löste det → grön slut

Tre konkreta buggar som INTE handlar om modalen i sig men hör hemma i din scope:

1. **`ThinkingOverlay` döljer streamad reasoning/agentlog**
   - Fil: `src/components/builder/ThinkingOverlay.tsx`
   - Layout: `absolute inset-x-0 bottom-16 z-10` av chat-panelens container i `src/app/builder/BuilderShellContent.tsx:851-872`
   - Problem: ligger ovanpå nedersta meddelandena i `MessageList` när streaming pågår
   - Fix-förslag: flytta till `top-0` som header-band, ELLER gör inline som sista rad i MessageList (renaste men kräver lite omstrukturering)

2. **`cross-file-import-checker` stubbar tysta**
   - När LLM importerar från en fil som inte existerar (t.ex. `coffee-cup-3d.tsx → ./coffee-cup-scene`) auto-stubbar checkern den missing filen så bygget går igenom. **Ingen UI-signal.**
   - Det är **rätt** att stubba (bygget skulle annars dö), men det är **fel** att tysta det. Användaren tror den fick 3D men fick ett tomt skal.
   - Fix: när cross-file-import-checker stubbar, emit ett `warning`-event i event-bussen som ytar i versionsmodalen som "1 fil saknades och stubbades". Inte error, inte info — `warning`.
   - Filer: `src/lib/gen/autofix/rules/scaffold-import-checker.ts` (har redan TODO(plan-09)), `src/lib/gen/stream/finalize-merge.ts` (mergeGeneratedProjectFiles)

3. **Inspector orsakar scroll-to-top efter aktivering**
   - När användaren trycker på Inspektera-knappen scrollar sidan upp efter ~0.5s, så användaren inte hinner markera element längre ner på sidan.
   - Detta är en builder-UI-bugg i samma område som ThinkingOverlay. Filer att kolla: `src/app/builder/BuilderShellContent.tsx`, `src/app/builder/useBuilder*`, `src/components/builder/preview-panel/` (sök på "inspector" / "Inspektera")

## Planens nya, smala mål

1. **Lås fast modal-truth med tester.** Skriv minst 2 regressionstester som bekräftar:
   - F2-passage överskuggas inte av sent F3-fynd
   - `design_preview_skip_verify` resulterar i grön/promoted, inte gul/varning
   - (frivillig 3:e: warning-severity-class används där det är mer sant än error)

2. **Fix ThinkingOverlay** så den inte döljer streamad text.

3. **Yta cross-file-import-checker stubs i UI** som warning. Använd existerande event-bus.

4. **Fix Inspector scroll-to-top.**

## Hårda begränsningar

- Bygg INTE ett nytt statussystem. Använd existerande `src/lib/logging/event-bus.ts`.
- Rör INTE filer som hör till plan 03 (`src/lib/builder/promptOrchestration.ts`, `src/lib/gen/verify/repair-loop.ts` — där auto-repair labeling fixas).
- Rör INTE filer som hör till plan 04/05 (`src/lib/gen/autofix/**` förutom de specifika cross-file-stubbing callsites jag pekade ut).
- Maxbudget: ~12 filer rörda. Föredra för lite framför för mycket.

## Acceptans

- Visuellt fungerande preview slutar inte rött ens om F3 är osäker (regressionstest finns)
- F2 och F3 blandas inte ihop i UI (regressionstest finns)
- ThinkingOverlay döljer inte streamad chat-text
- Cross-file-import-checker tysta stubs är nu synliga i versionsmodalen som warning
- Inspector scroll-to-top är borta

## Workflow

1. **Sätt en kort plan** (vilka filer du tänker röra och varför) innan du kodar.
2. **Implementera** kirurgiska ändringar.
3. **Skriv tester** (minst 2 regressionstester för modal-truth + 1 för cross-file-stubbing-warning + 1 för inspector-scroll om det är testbart).
4. **Kör `npm run lint && npm run typecheck && npm run test:ci`** (eller motsvarande). Inga regressioner.
5. **Commit** i logiska steg med prefix `plan-02:`.
6. **Skriv `STATUS-02-runtime-truth-and-modal.md`** i `docs/plans/active/master-post-cleanup-2026-04-23/` med:
   - vad du faktiskt ändrade (filer + kort varför)
   - före/efter på de 3 buggarna
   - bekräftelse att planen blev `short`, inte `full`
7. **Push branchen** och **öppna PR mot master** med `gh pr create`. PR-titel: `plan 02 (short): runtime truth tests + ThinkingOverlay/inspector/stub-warning fixes`. PR-body ska peka till STATUS-02 + länka till PROMPT-02 i wave2/.

## Stoppregler

- Om en fix kräver att du rör plan 03/04/05-territorium: STOPPA och beskriv i STATUS-02.
- Om event-bus behöver breaking-change: STOPPA och beskriv istället.
- Om du upptäcker att en bugg är värre än beskriven (kräver `full`-scope): pausa och dokumentera, öppna ändå PR med vad du hann.

## Klart =

PR är öppnad mot master, STATUS-02 är committad, branchen är pushad.
