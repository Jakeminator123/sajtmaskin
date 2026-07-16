# Dokumentation

`docs/` beskriver stabila kontrakt, ansvar, policies och mentala modeller.
Canonical owner avgörs per faktatyp; runtimekod, manifest, registries och
policies kan äga olika beslut.

## Börja här

| Fråga                            | Dokument                                                                 |
| -------------------------------- | ------------------------------------------------------------------------ |
| Vad är huvudflödet?              | [`architecture/system-overview.md`](architecture/system-overview.md)     |
| Hur hänger begreppen ihop?       | [`concepts/mental-model.md`](concepts/mental-model.md)                   |
| Var bor koden?                   | [`architecture/code-map.md`](architecture/code-map.md)                   |
| Hur fungerar init och follow-up? | [`concepts/init-and-follow-up.md`](concepts/init-and-follow-up.md)       |
| Hur skiljer sig F2 och F3?       | [`concepts/f2-and-f3.md`](concepts/f2-and-f3.md)                         |
| Vilka invariants gäller?         | [`architecture/runtime-contracts.md`](architecture/runtime-contracts.md) |
| Hur körs generationen?           | [`architecture/llm-pipeline.md`](architecture/llm-pipeline.md)           |
| Vilket schema gäller?            | [`schemas/README.md`](schemas/README.md)                                 |
| Hur felsöker jag preview?        | [`runbooks/preview-white-screen.md`](runbooks/preview-white-screen.md)   |
| Vilka planer är aktiva?          | [`plans/README.md`](plans/README.md)                                     |

[`audits/documentation-audit-2026-07-13.md`](audits/documentation-audit-2026-07-13.md)
är en punktrevision och ett beslutsunderlag för dokumentationskonsolideringen.
Den är historisk analys, inte runtime source of truth.

Full terminologi finns tills vidare i
[`architecture/glossary.md`](architecture/glossary.md). Regler för
dokumentationslivscykeln finns i
[`documentation-lifecycle.md`](documentation-lifecycle.md).

## Canonical owners

För varje faktatyp gäller:

1. canonical executable eller deklarativ owner,
2. runtime-konsument/validator,
3. genererad projektion,
4. handskriven mental modell,
5. historik.

Exempel: modellmanifestet kan äga modellval och gate-lanes;
`config/env-policy.json` äger env-klassificering medan `src/lib/env.ts` äger
runtime-läsning. Strict schemas kan spegla runtime-typer. Docs ska peka på dessa
owners, inte kopiera deras enumlistor eller implementation.

Full policy finns i
[`documentation-lifecycle.md`](documentation-lifecycle.md). När generatorn och
`docs:check` finns på master ska denna router även länka
`generated/README.md`; en tom eller framtida generated-path länkas inte i
förväg.
