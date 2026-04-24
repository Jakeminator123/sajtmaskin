# RUN — Wave 1 (plan 02 + plan 04 parallellt)

## Förkrav (gör innan agenter startas)

1. **Plan 01 är klar.** Du har deployat preview-host-fixen till live (om inte redan ute) och kört de tre smoke-runsen (init, teknisk follow-up, 3D-pizza). `STATUS-01-rollout-and-smoke.md` är skriven.
2. **Lokal master är pushad.** Just nu ligger commit `6bde8aed8 docs(architecture): add world-class target...` lokalt men inte på origin. Pusha först:
   ```powershell
   git push origin master
   ```
3. **Sekventser-paketet ligger i master.** Plan-agenterna behöver läsa STATUS-00 för kontext. Antingen:
   - committa hela `sekventser/` till master, eller
   - flytta planpaketet till `docs/plans/active/master-post-cleanup-2026-04-23/` och committa.
   Orkestratorn (mig) gör detta efter ditt godkännande. Tills dess inlinar prompterna det viktiga.
4. **Ny PowerShell är öppen** med refreshad PATH (så `agent` är på vägen). Verifiera med `agent --version`.

## Modellval per plan

| Plan | Modell | Motivering |
|---|---|---|
| 02 | `claude-opus-4-7-thinking-high` | Runtime/state-machine-resonemang, 1M context för call-path-tracing |
| 04 | `gpt-5.3-codex-high` | Kodscanning + klassificering över 65 filer, snabb och spårsäker |

## Starta plan 02 (PR-flöde — runtime-kritisk)

I en **ny** PowerShell-terminal från `C:\Users\jakem\dev\projects\sajtmaskin`:

```powershell
$prompt = Get-Content -Raw 'sekventser\sekventiella_planer_master_post_cleanup_2026-04-23\wave1\PROMPT-02.md'

agent --print --output-format stream-json --stream-partial-output `
  --trust --force `
  --model claude-opus-4-7-thinking-high `
  --worktree plan-02 --worktree-base master `
  $prompt 2>&1 | Tee-Object -FilePath '.\sekventser\sekventiella_planer_master_post_cleanup_2026-04-23\wave1\plan-02.run.log.jsonl'
```

Worktree skapas automatiskt på `~/.cursor/worktrees/sajtmaskin/plan-02/`. Branchen heter `cursor/...` per default — agenten döper själv om den till `plan-02-runtime-truth` när den committar. (Eller om du föredrar fast namn, lägg till `-w plan-02-runtime-truth` istället för `-w plan-02`.)

## Starta plan 04 (direkt-merge-flöde — analys)

I **en annan** ny PowerShell-terminal:

```powershell
$prompt = Get-Content -Raw 'sekventser\sekventiella_planer_master_post_cleanup_2026-04-23\wave1\PROMPT-04.md'

agent --print --output-format stream-json --stream-partial-output `
  --trust --force `
  --model gpt-5.3-codex-high `
  --worktree plan-04 --worktree-base master `
  $prompt 2>&1 | Tee-Object -FilePath '.\sekventser\sekventiella_planer_master_post_cleanup_2026-04-23\wave1\plan-04.run.log.jsonl'
```

## Babysitta — orkestratorns jobb (mig) medan agenterna kör

1. Polla `wave1/plan-02.run.log.jsonl` och `wave1/plan-04.run.log.jsonl` för progress.
2. Vid större tool-failures eller stuck patterns: avbryt agenten, justera prompten, starta om.
3. När plan 02-agenten öppnar PR: använd babysit-skillen — granska diff mot acceptanskriterierna i prompten, fixa lint/CI-fel som dyker upp, vänta tills mergebart, merga.
4. När plan 04-agenten pushat: cd till `~/.cursor/worktrees/sajtmaskin/plan-04/`, granska `fixer-matrix.md` + `STATUS-04`, kör `git log --stat`, och merga branchen direkt till master om det ser sant ut. Annars be agenten justera (resume sessionen).
5. **Mergeordning:** plan 02 först (sen runtime-truth är basen för plan 03 i wave 2), plan 04 efter.

## Vad du gör medan agenterna kör

- Säkert: jobba i `docs/`, `.cursor/rules/`, planer/specs som inte rör autofix eller builder-UI.
- Säkert: läs koden, dra notes om plan 03 (wave 2).
- **Undvik:** ändringar i `src/components/builder/Version*`, `src/app/builder/useBuilder*`, `src/lib/logging/event-bus*`, `src/lib/gen/autofix/**`, `src/lib/gen/verify/repair-loop.ts` tills wave 1 är mergad.
- Helt skilt arbete: starta egen branch (`git switch -c min-fiddling`) i huvudrepot.

## Efter wave 1 är mergad i master

Säg till orkestratorn — då producerar jag wave 2-prompterna (plan 03 + plan 05) och vi kör samma loop.
