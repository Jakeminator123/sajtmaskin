# Cloud-review master — 8 audit-perspektiv på wave 5

Detta dokument är **paraply** för 8 separata cloud-agent-prompter. Användaren startar 8 Cursor Cloud Agents (en per topic) som var och en producerar en focused audit-rapport.

## Varför 8 perspektiv

Wave 5 (plan 10 + plan 11) levererade **+2223/-662 rader över 41 filer** — för stort för en enda agent att granska komplett inom rimlig wall-time. Genom att splittra audit-arbetet på 8 specialiserade agenter får vi:

- **Parallel throughput** (alla 8 kör samtidigt = 30 min total wall-time)
- **Mindre context-burn per agent** (varje agent fokuserar på 1 sektion av wave-5-leveransen)
- **Triangulation** — om 3+ agenter rapporterar samma fynd så är det troligen riktigt
- **Lägre fail-rate** — om en agent kraschar tappar vi bara 1/8 av audit-täckningen

## De 8 prompterna

| # | Topic | Modell-rekommendation | Förväntad wall-time |
|---|---|---|---|
| 01 | Spec-coherence plan-10 (10 acceptance-criteria mot landed kod) | Codex 5.3 high | 15-20 min |
| 02 | Spec-coherence plan-11 (3 buggar, alla med spec från investigation) | Opus 4.7 thinking high | 20-30 min |
| 03 | Test-coverage audit (alla wave-5-test-filer + saknade tester) | Codex 5.3 high | 15-20 min |
| 04 | Scope-creep koll (rörde agenten plan-02–09-territorium oavsiktligt?) | GPT-5.4 high | 10-15 min |
| 05 | Code-quality scan (TODO/FIXME/console/any-types/magic-numbers) | Codex 5.3 high | 15-20 min |
| 06 | Scenario A code-walk: page.tsx-loss prevention från finalize-preflight | Opus 4.7 thinking high | 20-25 min |
| 07 | Scenario B code-walk: variant-lock end-to-end (init → DB → follow-up retrieve) | Opus 4.7 thinking high | 20-25 min |
| 08 | Scenario C + open-questions cross-check (capability-modify + 17 open-questions) | Opus 4.7 thinking high | 25-30 min |

## Hur starta cloud-agenter

I Cursor IDE:
1. Open command palette (`Ctrl+K Ctrl+B`) → "Start Cloud Agent"
2. Välj branch: `master` (eller `audit-wave5-<topic>` om du vill ha en fresh worktree)
3. Klistra in innehållet från `CLOUD-REVIEW-XX.md` (XX = 01-08)
4. Välj rekommenderad modell per tabellen ovan
5. Cloud agent klonar repot, läser denna mapp, producerar `audit-reports/AUDIT-XX-<topic>-<random>.md`, committar, pushar branch, öppnar PR

## Output-konvention

Varje cloud-agent SKA:
- Skriva sin rapport till `docs/plans/active/master-post-cleanup-2026-04-23/audit-reports/AUDIT-<XX>-<topic>-<agent-id>.md`
- Använda samma rubrik-struktur (för konsolidering):
  ```markdown
  # AUDIT XX — <Topic>
  
  **Datum:** YYYY-MM-DD
  **Agent:** <model> (cloud)
  **Branch:** <branch-name>
  **Mode:** READ-ONLY
  
  ## Sammanfattning
  [GO / NO-GO / NEEDS-FIX för plan 12 baserat på denna sektion]
  
  ## Detaljerade fynd
  ...
  
  ## Rekommendationer
  ...
  ```
- Committa, pusha branch, öppna PR med audit-rapporten som body

## Konsolidering

När alla 8 cloud-agenter är klara (eller efter 30 min, vad som först sker):
- Orkestratorn läser alla 8 `AUDIT-XX-*.md` filer
- Producerar `STATUS-AUDIT-WAVE5-CONSOLIDATED.md` med:
  - Bekräftade buggar (rapporterade av 2+ agenter)
  - Misstänkta buggar (1 agent rapporterar, behöver mer test)
  - Spec-avvikelser
  - GO/NO-GO för plan 12
- Mergar alla audit-PRs (de är read-only, så ingen kod-konflikt)

## Referenser cloud-agenter måste läsa

Alla cloud-agenter SKA läsa följande spec-dokument INNAN de producerar sin rapport:
- `docs/plans/active/master-post-cleanup-2026-04-23/wave5/PROMPT-10.md`
- `docs/plans/active/master-post-cleanup-2026-04-23/wave5/PROMPT-11.md`
- `docs/plans/active/master-post-cleanup-2026-04-23/STATUS-INVESTIGATE-PAGETSX-LOSS.md`
- `docs/plans/active/master-post-cleanup-2026-04-23/STATUS-10-CANDIDATES.md`
- `docs/plans/active/master-post-cleanup-2026-04-23/wave5/STATUS-10-latency-budgets.md` (agent self-report)
- `docs/plans/active/master-post-cleanup-2026-04-23/STATUS-11-unified-repair.md` (om finns, annars i plan-11-worktree)
- `docs/architecture/open-questions.md` (alla 17 frågor)
- `docs/plans/active/master-post-cleanup-2026-04-23/CHECKLIST.md` (status-overview)

## Linear?

Användaren frågade om Linear som tracking-tool. **Inte rekommenderat för detta** — Linear är issue-tracker för långsiktigt arbete. För en 30-min-audit är det overkill att skapa 8 Linear-issues. Filsystem + git PR fungerar bättre för denna engångs-granskning.

Om audit-rapporterna avslöjar buggar som behöver fixas över flera dagar, då kan Linear vara rätt verktyg — men först efter konsolideringen.
