# PR-granskning: en aktiv väg, inga automatiska API-omtag

Den separata API-granskaren är pensionerad. `pr-ai-review.yml` tas bort;
workflowen var redan `disabled_manually` på GitHub vid kontroll 2026-10-02.
Den ska inte startas igen som en parallell, betald review av varje PR-event.
`workflow:contract` avvisar även en omdöpt workflow som anropar dess runner.

## Aktivt arbetssätt

1. Författaren kör plan och riktade tester, pushar och öppnar PR mot preview.
2. En oberoende agent granskar exakt aktuell head mot basen. Konkreta fynd
   åtgärdas eller triageras; aktuell GitHub-CI och externa botytor läses också.
3. Merge följer [PR-skillen](../../.agents/skills/pr-workflow/SKILL.md) och
   [merge-regeln](../../.cursor/rules/pr-merge.mdc), bara efter Jakobs mandat.

Vanligt PR-arbete kräver ingen extra `OPENAI_API_KEY`, ingen kontofallback
och inget coach-/Codex-ping. Befintlig Cursor Bugbot är extern review, inte
en andra mergecontroller. Cursor-cloudautomationers inställningar ägs i
Cursor; ett checknamn på GitHub är inte bevis att deras prompt är rätt.

`review-window` kör ingen modell och är inte ett kvitto på oberoende review.
Den validerar tester, deployment, säkerhet och aktuell head/base. Ett saknat
modellkvitto är inte en blockerande bugg och ger heller ingen review eller
mergebehörighet. Författaren och den som godkänner merge måste verifiera
oberoende review separat, innan det mänskliga SHA-bundna mandatet postas.

## Historiska kvitton

`scripts/pr-review/` innehåller även en körbar API-runner och dess tester;
den är inte bara en parserkatalog. Runnern har ingen automatisk eventväg.
Kvitto-/state-kompatibiliteten behålls för redan publicerad review-data.
Mergecontrollern läser gamla kvitton som data och binder dem
till verklig GitHub-identitet, review-ID och exakt head. Inget workflow
anropar API-runnern eller kvittopubliceraren automatiskt.

Gamla kontoöverlämningar är historik, inte instruktion att skapa nya.
Radera inte GitHub-reviewer eller state-kommentarer som städning.

Återinförande av automatisk API-review kräver ett nytt uttryckligt ägarbeslut,
synlig kontrakts-/teständring och kostnads- samt säkerhetsgranskning.
