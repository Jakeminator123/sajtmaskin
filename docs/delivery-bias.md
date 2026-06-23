# Delivery-bias (förmåga före dokumentation)

Lättviktigt lån från Sajtbyggaren: **förmåga och kärnflöde går före brett testsvall och
dokumentationsprojekt.** Breda regressionssviter är inte standard här — den kuraterade
[`test:stability`](testing.md)-lanen är det.

## Regel för nya tester

Lägg bara till en test när den gör **minst ett** av:

| Skäl | Innebörd |
|---|---|
| Skyddar nytt kontrakt | Låser ett nytt litet kontrakt (schema/policy/regel) som just införts. |
| Ersätter ett äldre | Tar över för en svagare/överlappande test, som tas bort i samma svep. |
| Låser en konkret fixad bugg | Pekar på en **konkret** bugg: en öppen rad i `BUG-SWARM-BACKLOG.md § Aktiv kö`, eller en avslutad `[x]`-rad i arkivet (`docs/plans/avklarat/bug-swarm/backlog-arkiv-*.md`). |

Varje test ska **peka på sin källa** (kontrakt eller bugg-rad). 

## Inte detta

- Inga **breda allowlists** (jfr Sajtbyggarens 1500-raders listor).
- Inga tester "för säkerhets skull" utan källa.
- Inga LLM-evals som gate (parkerade).
- Inget testsvall som saktar ner kärnflödet **prompt → hemsida → preview → följdprompt → ny version**.
