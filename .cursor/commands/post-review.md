# Post-review

Riktad eftergranskning före commit/push. Parent-agenten äger bedömningen;
subagenter ger korta risksignaler.

1. Avgränsa reviewn till aktuell diff och lämna orelaterade filer orörda.
2. Välj högst två relevanta read-only-spår:
   - runtime/API/pipeline: verkliga buggar, false-green och kontraktsbrott;
   - docs/schema/config/dossier/backoffice: drift mellan canonical owner och
     konsumenter;
   - städspår bara vid bred rename, flytt eller tydlig duplication.
3. Använd Luna för mekanisk scan och Sol för kodomdöme enligt
   [`subagent-models.mdc`](../rules/subagent-models.mdc). Kräv filbevis,
   sannolikhet, impact och minimal åtgärd.
4. Verifiera varje bärande påstående själv. Fixa bara bekräftade fynd inom
   scope; rapportera större beslut utan att bredda diffen.
5. Om ett nytt fynd måste in i backloggen: följ `/buggrapport`. Om diffen fixar
   ett befintligt `SM-###`: flytta raden från `Aktiv kö` till `Arkiv` i samma
   fix-PR med PR-/masterbevis. Kör `check:bug-backlog`; läs inte hela filen.
6. Kör minsta relevanta verifiering i
   [`workflow.mdc`](../rules/workflow.mdc) och rapportera fynd, avfärdanden och
   medvetet exkluderade filer.

Ett fullgott oberoende Sol-pass på aktuell diff kan uppfylla `git.mdc`:s
lokala reviewkrav; kör inte ett identiskt extra pass. Protected paths eller ny
head-SHA kräver däremot färsk review. Ingen commit/push utan användarens mandat.
