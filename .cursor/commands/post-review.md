# Post-review

Riktad eftergranskning före commit/push. Parent-agenten äger bedömningen;
subagenter ger korta risksignaler. Körordning:
`.agents/skills/pr-workflow/SKILL.md`.

1. Kör `npm run verify:pr -- --plan`. Använd dess protected-, control-plane- och
   Backoffice-träffar; skapa ingen egen pathlista.
2. Avgränsa reviewn till aktuell diff och lämna orelaterade filer orörda.
3. Välj högst två relevanta read-only-spår:
   - runtime/API/pipeline: verkliga buggar, false-green och kontraktsbrott;
   - docs/schema/config/dossier/backoffice: drift mellan canonical owner och
     konsumenter;
   - städspår bara vid bred rename, flytt eller tydlig duplication.
4. Använd Luna för mekanisk scan och Sol för kodomdöme enligt
   [`subagent-models.mdc`](../rules/subagent-models.mdc). Kräv filbevis,
   sannolikhet, impact och minimal åtgärd.
5. Verifiera varje bärande påstående själv. Fixa bara bekräftade fynd inom
   scope; rapportera större beslut utan att bredda diffen.
6. Om backlogg faktiskt måste ändras: följ `/buggrapport`, sök exakt ID/rubrik
   och kör `check:bug-backlog`; läs inte hela filen som rutin. Om diffen fixar
   ett befintligt `SM-###`, flytta raden till `Arkiv` i samma fix-PR med
   PR-/masterbevis.
7. Kör planens relevanta riktade kontroller och rapportera fynd, avfärdanden,
   Backoffice-impact och medvetet exkluderade filer. Fullprofilen körs av
   GitHub Actions efter push.

Ett fullgott oberoende Sol-pass på aktuell diff kan uppfylla `git.mdc`:s
lokala reviewkrav; kör inte ett identiskt extra pass. Protected paths eller ny
head-SHA kräver färsk Sol-review. Ingen commit/push utan användarens mandat.
