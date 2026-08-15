# B2 — En F3-promptauktoritet (SM-005)

Styrdokument: [`../00-master-plan.md`](../00-master-plan.md)

## Problemet

F3-systemprompten kan innehålla två block som båda gör anspråk på att vara
integrationssanningen:

- `renderTier3IntegrationBlock` (approval-plan) renderas i F3.
- `renderPreGenerationContractsBlock` (`## Pre-Generation Contracts`)
  suppressas bara när den **filhärledda** `Tier3BuildSpec` har requirements
  (`src/lib/gen/system-prompt/build-dynamic-context.ts` ~308–323).

I en **approval-only-runda** (godkända providers men ännu inget filbevis från
parent-versionen) är filspecen tom → båda blocken renderas. Modellen ser två
auktoriteter; spekulativa providers kan återinföras. Detta är `SM-005`.

## Uppgift

- Slå ihop till **ett** integrationsblock per F3-runda: filhärledd spec som
  bas, aktuell approval unioneras in, kontraktsblocket suppressas så fort en
  starkare auktoritet (filspec **eller** approval) finns.
- `renderTier3IntegrationBlock`-mixen i `session-contracts.ts` (~282–346, där
  `approvedCandidates` blandar approval-spec och contract-spec) ska följa samma
  regel: en källa åt gången, tydlig prioritet.

## Vad som INTE ingår

- Ingen ändring av F3-scope-reglerna (`scopeF3DossierCapabilities`) eller
  godkännandeflödet i sig.
- Ingen ny prompt-yta — färre block, inte fler.

## Verifiering

- Nytt test: approval-only-runda → exakt ett integrationsblock i Dynamic
  Context; inga providers utanför approval.
- Befintliga golden-/system-prompttester gröna.
- `npm run typecheck` + riktad vitest.

## Klart när

Ingen F3-prompt kan innehålla både approval-plan och Pre-Generation Contracts;
`SM-005` avbockad i `BUG-SWARM-BACKLOG.md`.
