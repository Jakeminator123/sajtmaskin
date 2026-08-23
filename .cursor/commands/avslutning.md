# Avslutning

Stäng det aktuella arbetsspåret: granska, verifiera, commit:a och pusha. Att
användaren kör `/avslutning` ger mandat för commit + push av uppgiftens filer,
men inte automatiskt för PR eller merge.

1. Kontrollera status/diff och identifiera exakt vilka filer som tillhör
   uppgiften. Stage aldrig andras ändringar och använd inte `git add -A`.
2. Kör `/post-review` för riskdiff; för liten diff räcker egen review. Välj
   tester via [`workflow.mdc`](../rules/workflow.mdc).
3. Fetch:a origin och kontrollera
   `git rev-list --left-right --count HEAD...origin/<branch>`:
   - `0 0`: synkat;
   - `A 0`: bara lokala commits, normal push är säker;
   - `0 B` eller `A B`: stoppa, visa remote-commits och fråga. Ingen tyst
     rebase/merge.
   Saknas `origin/<branch>` efter fetch: verifiera att refen verkligen saknas
   och markera att leveransen behöver en initial push.
4. Commit:a bara explicita paths med repoets commit-stil. Pusha utan force;
   använd `git push -u origin HEAD` endast för den verifierade initiala pushen.
5. Fetch:a och verifiera `0 0` efter push.

Rapportera kort: fixade risker, medvetet orörda filer, verifiering, commit-SHA
och branch. PR och merge följer separat mandat i `git.mdc`/`pr-merge.mdc`.
