# Du är plan-05-agenten — single fixer entrypoint + tre lanes (REVISED)

## Din roll och kontext

Du är en autonom kodagent i en isolerad git worktree på branchen `plan-05-fixer-entrypoint` i Sajtmaskin-repot. Du arbetar **parallellt** med plan-03-agenten i wave 2. Ni rör inte varandras filer (se hårda begränsningar nedan). När du är klar pushar du branchen — orkestratorn mergar direkt utan PR efter granskning.

## Repo-state du ärver

- HEAD: `master @ <senaste plan-02-merge>` (du startas efter plan 02 är mergad och eventuellt parallellt med plan 03)
- **Plan 04 är mergad** — läs `docs/plans/active/master-post-cleanup-2026-04-23/fixer-matrix.md` för 59-rads inventering.
- **Läs OCKSÅ `STATUS-04-AUDIT.md`** — den dokumenterar 14 rader plan-04-agenten missade, inklusive en hel parallell `src/lib/gen/suspense/rules/` (13 stream-time line-rules) och 4 security-checks. Verklig fixer-yta är ~77 rader, inte 59.

## Den centrala insikten från auditen

Det finns **två separata lanes** i fixer-systemet, inte en:

1. **Autofix-lanen** — sekventiell pass över hela code-projektet, kallad från `runAutoFix()` i `src/lib/gen/autofix/pipeline.ts`. Det här är vad plan-04-matrisen primärt täcker.
2. **Suspense-lanen** — per-line stream-time transformer, kallad från `createDefaultRules()` i `src/lib/gen/suspense/default-rules.ts` (13 regler i `src/lib/gen/suspense/rules/`).

Plus två sidospår:
- **Cross-file post-merge** (`src/lib/gen/stream/finalize-merge.ts`) — checkScaffoldImports, type-only-module-default-import-fixer, etc.
- **Server-repair-lanen** (`src/lib/gen/verify/repair-loop.ts`) — LLM-anrop när validators failar.

Plan 05 ska **inte** slå ihop alla dessa till en monolit. Det ska skapa **en tydlig entrypoint per lane** och tydliga kontrakt mellan dem.

## Planens mål (vässat efter audit)

1. **Lane-kontrakt:** Producera en kort, klar definition av varje lane (input/output, när den körs, vad den får ändra). Skriv den som `docs/architecture/fixer-lanes.md` ELLER som JSDoc-block i en ny fil `src/lib/gen/autofix/lanes.ts`.

2. **Autofix-lanen — single entrypoint:** Tydliggör/styrk `runAutoFix()` som **enda** entrypoint för mekanisk + LLM-syntax + LLM-verifier-fix på en candidate version. Identifiera och tombstone-flagga sidospår som dubblerar (t.ex. `repair-generated-files.ts` har redan `TODO(plan-09)` från plan 04 — verifiera att det är tryggt att fasa ut efter denna konsolidering).

3. **Suspense-lanen — befäst:** Verifiera att `createDefaultRules()` i `default-rules.ts` är enda väg till stream-rules. Ingen ad-hoc transform-funktion utanför den.

4. **Three lane-tag på FixEntry:** Lägg till ett `lane: "mechanical" | "static_gate" | "llm_repair" | "stream_suspense" | "post_merge" | "server_repair"`-fält på `FixEntry`-typen i `src/lib/gen/autofix/types.ts` så telemetry/logg kan filtrera per lane. Wire upp det överallt där `FixEntry` skapas.

5. **Merge-kandidaterna från plan 04 + audit (HÖG-PRIO):**
   - **react-import-trio** (`react-import-fixer` + `react-hook-import-fixer` + `nextjs-navigation-import-fixer`): de delar redan implementation i `rules/react-import-consolidated.ts`. Konsolidera registry-entries om det går utan att bryta telemetri (de tre har separata IDs för dashboard-rendering).
   - **Tre `runLlmFixer`-gates** (`llm-syntax-fixer`, `llm-verifier-fixer`, `llm-server-repair`): **rör inte server-repair** (plan-03-territorium). Konsolidera bara syntax+verifier-gates i `runAutoFix`-flödet.
   - **Preflight-validatorer** (`runProjectSanityChecks`, `runSeoPreflightChecks`, `crossCheckHrefsAgainstRoutes`, `collectTier2HygieneIssues`): slå ihop till en `runFinalizePreflightAll()` med en gemensam result-shape.
   - **Cross-lane lucide-fixers** (audit-rad): suspense `lucide-icon-fix` vs autofix `lucide-image-fixer` + `lucide-link-fixer`. Avgör om dom adresserar olika fall eller är redundanta. Tombstone om redundant, dokumentera om olika.

## Hårda begränsningar

- Rör INTE plan-03-filer: `src/lib/builder/promptOrchestration.ts`, `src/lib/gen/verify/repair-loop.ts`, `src/lib/hooks/chat/helpers.ts`, `src/lib/hooks/chat/stream-handlers.ts`, `src/lib/api/engine/chats/chat-message-stream-post.ts`, `src/lib/providers/own-engine/generation-stream-post-finalize.ts`, `src/lib/gen/verify/server-verify.ts`, `src/lib/components/builder/MessageList.tsx`, `src/lib/logging/generation-log-writer.ts`.
- Rör INTE plan-02-filer: `src/components/builder/ThinkingOverlay.tsx`, `src/components/builder/preview-panel/**`, `src/lib/gen/stream/finalize-merge.ts` (cross-file-stub-warning-delen — du **får** referera till den men inte ändra signaturen).
- **Inga policyändringar.** Beteende ska vara identiskt efter konsolideringen, bara strukturen blir renare.
- Maxbudget: ~15 filer rörda. Konsolidering > deletion.

## Acceptans

- En läsare kan från `runAutoFix()` följa fixer-flödet utan att hoppa mellan 5 olika filer.
- `lane`-tag finns på FixEntry och syns i telemetry.
- Lane-kontrakt-doc finns och beskriver varje lane på 1 sida.
- Minst 2 av 4 merge-kandidaterna är genomförda (övriga med STATUS-noter om varför inte).
- Alla existerande tester passerar oförändrat (eller justerade i samma commit för shape-ändringar).

## Workflow

1. **Sätt en kort plan** (vilka filer + lane-mappning + merge-kandidat-prioriteringar) innan du kodar.
2. **Inför `lane`-fält** först — det är fundamentet. Allt annat hänger på det.
3. **Konsolidera merge-kandidater** stegvis. En per commit.
4. **Kör tester ofta** (`npm run test:ci`) — konsolidering är notoriskt regressions-känsligt.
5. **Commit** i logiska steg med prefix `plan-05:`.
6. **Skriv `STATUS-05-fixer-entrypoint.md`** i `docs/plans/active/master-post-cleanup-2026-04-23/` med:
   - lane-mappningen
   - vilka merge-kandidater du gjorde
   - vilka du sparade till plan 09 + varför
   - bekräftelse att inga beteenderegressioner introducerats
7. **Push branchen.** **Ingen PR** — direkt-merge efter granskning.

## Stoppregler

- Om en konsolidering bryter > 5 tester på sätt som inte är en mekanisk shape-justering: ROLLA TILLBAKA den specifika ändringen och dokumentera i STATUS-05.
- Om en merge-kandidat visar sig adressera olika fall (inte redundant): dokumentera och hoppa över den.
- Om du upptäcker en lane som auditen och matrisen båda missade: dokumentera och låt den vara. Plan 09 kan ta tag i det senare.

## Klart =

`STATUS-05-fixer-entrypoint.md` finns, `docs/architecture/fixer-lanes.md` (eller motsvarande) finns, branchen är pushad.
