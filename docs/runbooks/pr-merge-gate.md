# PR-merge

Operativ owner är [pr-merge.mdc](../../.cursor/rules/pr-merge.mdc). GitHubs
live rulesets äger mergebarhet; `config/agent-workflow.json` äger bara repots
canonical lokala checknamn och reviewytor.

## Arbetsgång

1. Öppna mot `preview` och behåll draft medan arbete eller fynd återstår.
2. Kör `npm run verify:pr -- --plan` och relevanta riktade lokala kontroller.
3. Gör PR:n ready. GitHub kör full profil; ny head avbryter stale körning och
   strict/up-to-date kräver resultat mot aktuell integrationsbas.
4. Läs required checks, reviews, kommentarer, trådar och deployment på GitHub.
   Säkerhet, betalning, databas och CI-behörigheter kräver riktad oberoende
   review och ownerbeslut registrerat i PR:n.
5. När native villkor och mergemandat är uppfyllda använder en agent
   `gh pr merge --squash --match-head-commit <granskad head>`. Ett uttryckligt
   villkorat mandat kan ges i förväg. Använd aldrig admin-bypass.
6. Bekräfta terminal PR-status och att push-CI samt deployment startade på
   mergecommiten.

Den allowlistade Dependabot-patchvägen får aktivera native auto-merge efter
semantisk innehållsvalidering. GitHub väntar själv på samma ruleset. `master`
är en separat manuell release med extra produktionsbekräftelse. DB-apply och
produktionsdata kräver alltid eget mandat.
