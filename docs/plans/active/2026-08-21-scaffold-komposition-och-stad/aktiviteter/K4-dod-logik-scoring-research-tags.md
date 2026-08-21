# K4 — död logik: scoring, research-merge, tags

Styrdokument: [`../00-master-plan.md`](../00-master-plan.md)
Status: redo efter #1087-merge (#1087 tar bort `referenceTemplates`/
`templateRecommendations` — duplicera inte det arbetet, verifiera i stället
att inget blev kvar). Parallell med K2/K3.

## Problemet

Kedjan bär ytor som ser aktiva ut men saknar anropare eller ägs dubbelt:

| Yta | Belagt 2026-08-21 |
|---|---|
| `src/lib/gen/scaffolds/scaffold-scoring.ts` (`getScaffoldBoost`, `computeScaffoldScores`) | **Noll anropare** i `src/`. Skyddas från dead-code-checken via `knip.json`-post. Backoffice-sidan Scaffold Performance läser CLI-spegeln `scripts/db/scaffold-scores.mjs`, inte TS-modulen |
| Research-merge i `src/lib/gen/scaffolds/registry.ts:82–98` | Mergar `scaffold-research.generated.json`-overrides (legacy `source: template-library`) in i varje manifest |
| Manifest-`tags` | Konsumeras bara av `scaffold-embeddings-core.ts:37`; matchern använder egna hårdkodade keyword-banks (`matcher.ts:130–160`) — två sanningar |
| Dubbel variant-pick | Sync `pickScaffoldVariant` (pre-match/fallback) vs async-vägen i orchestrate + style-pin (`style-choice-variants.ts`) — tre ingångar till samma val |

## Uppgift

1. **Radera `scaffold-scoring.ts`** + dess `knip.json`-post + ev. döda
   importer/typer. Verifiera först med färsk grep att inget tillkommit sedan
   2026-08-21. `scripts/db/scaffold-scores.mjs` och Backoffice-sidan behålls
   (de är den levande ytan).
2. **Research-merge:** kontrollera vad #1087 lämnade kvar av
   `research`-fälten. Läses `qualityChecklist`/`upgradeTargets` fortfarande i
   prompten (`scaffold-stack.ts` research-block)? Behåll då merge-vägen men ta
   bort fält som ingen läser. Läses inget: ta bort merge-anropet och den
   genererade filen ur kedjan (registret, ev. genereringsskript, tester).
   Sök konsumenter innan radering — deklaration räcker inte som bevis.
3. **`tags`:** välj den minsta lösningen — behåll fältet som embeddings-signal
   och dokumentera det i `types.ts`-kommentaren (+ glossary-rad vid behov),
   ELLER ta bort fältet om embeddings klarar sig utan (kräver
   embeddings-regenerering + parity-test). Rekommendation: behåll +
   dokumentera; ingen rename-svep.
4. **Dubbel variant-pick:** utred och **dokumentera** de tre ingångarna (vem
   äger valet när). Slå ihop bara om det är trivialt och beteendebevarande —
   annars lämna en tydlig kodkommentar + rad i denna fil för framtida beslut.

## Vad som INTE ingår

- `referenceTemplates`/`templateRecommendations` (ägs av #1087).
- Ändringar i matchningens beteende — detta är städ, inte tuning.
- Scaffold-filer (K2), prompt-renderaren (K3), registerdata (K1).

## Verifiering

- `npm run typecheck` + `npm run test:ci`-relevanta sviter (dead-code-checken
  ska vara grön **utan** knip-undantaget)
- `npm run scaffolds:validate`
- Grep-bevis i PR-beskrivningen: noll kvarvarande referenser till raderade
  symboler
- Backoffice: `python -m pytest backoffice/` riktat på scaffold-performance om
  tester finns

## Klart när

Ingen modul i scaffold-kedjan saknar anropare, knip-undantaget är borta,
research-vägen har en dokumenterad ägare eller är borttagen, och `tags` har en
uttalad roll.
