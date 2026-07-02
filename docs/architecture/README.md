# Arkitektur — Sajtmaskin

Den här mappen är en tunn, kodförankrad översikt över Sajtmaskins runtime. Den ska hjälpa en agent eller utvecklare att snabbt förstå **vilka gränser som gäller** och **var koden som äger sanningen finns**.

## Grundregel

Kod, schema och tester vinner över markdown. Architecture-docs ska inte duplicera enumlistor, filinventarier eller historik som redan finns i kod.

## Läsordning

1. [`system-overview.md`](./system-overview.md) — vad Sajtmaskin är och huvudflödet.
2. [`llm-pipeline.md`](./llm-pipeline.md) — init, follow-up, F2/F3 och generationens körväg.
3. [`runtime-contracts.md`](./runtime-contracts.md) — invariants för BuildSpec, dossiers, quality gate, preview, status och env.
4. [`code-map.md`](./code-map.md) — var du hittar koden.
5. [`glossary.md`](./glossary.md) — korta termer och namnskuggor.

Runbooks ska ligga utanför denna kärna, t.ex. `docs/runbooks/preview-white-screen.md`.

## Arkitekturprinciper

- **Init är inte follow-up.** Init väljer grund; follow-up ändrar en befintlig graph.
- **F2 är inte F3.** F2 är design/preview; F3 är integration/build/deploybarhet.
- **Orkestrering före specialfall.** Lägg nya signaler i rätt ägare i stället för att sprida heuristik i fem konsumenter.
- **Mekanisk fix före LLM-fix.** Deterministiska fixers ska ta det som inte kräver modellbedömning.
- **False-green är värre än blocker.** Om en version är användbar men degraderad ska statusen säga det.
- **Inventarier ska genereras eller läsas från kod.** Handhåll inte counts för scaffolds, dossiers, fixers, env-vars eller modeller i architecture-docs.

## Vad som inte hör hemma här

- Ändringshistorik som redan finns i git.
- Avklarade planer och postmortems.
- Långa fil:rad-matriser.
- Fullständiga schemafält eller manifestfält.
- Modelltabeller som redan finns i `config/ai_models/manifest.json`.
