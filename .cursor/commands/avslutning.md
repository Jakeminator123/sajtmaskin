# Avslutning

Stäng arbetsspåret enligt `.agents/skills/pr-workflow/SKILL.md`. `/avslutning`
ger mandat för commit + push av uppgiftens filer, inte för PR eller merge.

1. Kontrollera status/diff och identifiera exakt uppgiftens filer. Stage aldrig
   andras ändringar och använd inte `git add -A`.
2. Kör `npm run verify:pr -- --plan`, relevanta riktade kontroller och en färsk
   oberoende read-only bugggranskning. Fixa eller verifierbart avfärda fynd.
3. Fetch:a och kör `git rev-list --left-right --count HEAD...origin/<branch>`:
   `0 0` synkat; `A 0` normal push är säker; `0 B` eller `A B` stoppa, visa
   remote-commits och fråga (ingen tyst rebase/merge). Saknas `origin/<branch>`
   efter fetch: verifiera det och gör en initial `git push -u origin HEAD`.
4. Commit:a explicita paths i repots commit-stil och pusha utan force.
5. Fetch:a och verifiera `0 0`.

Rapportera kort: fixade risker, berörda Backoffice-ytor, medvetet orörda filer,
verifiering, commit-SHA och branch. Behåll worktreet för PR-fixrundor.
