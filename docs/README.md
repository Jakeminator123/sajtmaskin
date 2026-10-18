# Dokumentation

Börja med uppgiften. Läs den relevanta modellen eller runbooken; ingen fast
dokumentstack krävs. Kod, manifest och policies äger exekverbart beteende —
handskrivna guider förklarar ansvar och stabila kontrakt.

## Hitta rätt

| Behov | Ingång |
| --- | --- |
| Produktens riktning | [Vision och mål](övergripande-vision-och-mål.md) |
| Huvudflöde och kodens placering | [Systemöversikt](architecture/system-overview.md) · [Kodkarta](architecture/code-map.md) |
| Begrepp och arbetsmodell | [Mental modell](concepts/mental-model.md) · [Ordlista](architecture/glossary.md) |
| Init, follow-up, design och integration | [Init/follow-up](concepts/init-and-follow-up.md) · [F2/F3](concepts/f2-and-f3.md) |
| Byggblock och dossiers | [Kortguide](llm/dossier-cheatsheet.md) · [Dossierkontrakt](contracts/dossier-system.md) |
| Generering och AI-debitering | [LLM-pipeline](architecture/llm-pipeline.md) |
| Invariants och kvalitetsgrindar | [Runtime-kontrakt](architecture/runtime-contracts.md) · [Quality gate](architecture/quality-gate-flow.md) |
| Schema och maskinägda referenser | [Schemaindex](schemas/README.md) · [Genererat index](generated/README.md) |
| Utveckling, Buggpass, preview, PR och drift | [Runbook-index](runbooks/README.md) |
| Miljövariabler och DB-identitet | [ENV](ENV.md) |
| Beroendeuppdateringar | [Dependency-policy](dependency-policy.md) |
| Pågående arbete | [Aktiva planer](plans/active/README.md) · [Buggbaklog](../BUG-SWARM-BACKLOG.md) |
| Gällande ägarbeslut | [Beslutsindex](decisions/README.md) |

## Dokumentens ansvar

[Dokumentationslivscykeln](documentation-lifecycle.md) äger placering,
canonical-owner-ordning och regler för genererade filer. Runbooks beskriver
hur en uppgift utförs, planer beskriver ännu återstående arbete och Git/GitHub
bevarar leveranshistoriken. Kopiera inte körningsstatus till nya permanenta
handoff-filer och behåll inte en gammal instruktion bredvid dess ersättare.
