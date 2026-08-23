# Agent → PR → master

Det här är den enda operativa beskrivningen av det normala arbetsflödet. Reglerna
i `.cursor/rules/` är korta spärrar och ska länka hit, inte kopiera stegen.

## Det normala flödet

1. Hämta senaste `origin/master` och skapa en egen worktree + kortlivad branch.
2. Gör ändringen. Rör aldrig en annan agents worktree eller orelaterade filer.
3. Kör `npm run change-impact -- --base origin/master`. Den visar risk, ägare,
   skyddade filer och kontroller som diffen kräver.
4. Uppdatera följdytor i samma diff: tester, Backoffice, schema/policy/beslut och
   genererade projektioner. En skyddad yta är hög risk, inte förbjuden.
5. Kör `npm run verify:pr -- --base origin/master`. Detta är den enda lokala
   PR-klar-kommandot; det väljer kontroller från diffen.
6. Gör ett oberoende readonly-reviewpass på aktuell HEAD. Commit, push och öppna
   en draft-PR med impact-resultatet i beskrivningen.
7. Efter varje ny commit börjar verifieringen om. `merge:ready` gäller bara den
   SHA som signerats; det tas bort vid ny SHA eller nytt relevant botfynd.
8. GitHub kör parallella CI-jobb. `merge-gate` blir grönt först när samtliga
   blockerande PR-jobb är gröna. Reviewfönstret räknar sju minuter från senaste
   head-commit, inte från när PR:n först skapades.
9. Före merge: hämta alla reviewtrådar och kommentarer paginerat, triagera varje
   fynd, verifiera aktuell HEAD och lämna SHA-exakt sign-off. Merga bara på
   uttryckligt mandat.
10. Efter merge: kontrollera `master`-CI, radera den kortlivade branchen/worktreen
    och regenerera gemensamma statusfiler från nya master. Återför aldrig en
    gammal backlog-, canvas- eller planfil från en äldre PR.

## När flera agenter arbetar

- En worktree och branch per uppgift.
- Kandidat-PR:er ändrar bara kod och lokala tester. En enda reconciliation-PR
  uppdaterar gemensam backlog/canvas/plan när flera kandidater konkurrerar.
- Rebase/merge från färsk master före ny verifiering. Konflikt i gemensam statusfil
  löses genom regenerering, aldrig genom att välja den äldre sidan.
- Direktpush till master är break-glass: uttrycklig ägarauktorisering, ingen
  force-push, färsk oberoende Sol-review och obligatorisk post-master-CI.

## Vad Jakob behöver göra

Normalt bara beskriva ändringen. Agenten ska själv visa impact, köra rätt lokala
kontroller, skapa PR och vänta in GitHub. För merge behövs fortfarande ett tydligt
mergeuppdrag. Vid ägarbeslut, dataförlust eller säkerhetsrisk pausar agenten.
