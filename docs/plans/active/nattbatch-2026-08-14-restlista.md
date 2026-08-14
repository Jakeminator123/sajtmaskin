# Restlista efter nattbatchen 2026-08-14

Koncentrat av vad som återstår ur handoff-spåret och nattens arbete. Defekterna
ägs av [`BUG-SWARM-BACKLOG.md`](../../../BUG-SWARM-BACKLOG.md) — den här filen är
bara översikten över vad som är byggt, vad som väntar och vad som väntar på
ägaren. Kopiera inte kön hit.

Bakgrunden till spår A/B/C ligger i
[`handoff-question-flow-and-scaffold-routes.md`](handoff-question-flow-and-scaffold-routes.md).

## Levererat natten till 2026-08-14

Åtta PR:er, alla mergade till `master` (`f29f8a5`).

| PR | Vad |
|---|---|
| #982 | Ruttkontrakt i `ScaffoldManifest` — scaffoldens rutter bor bredvid dess filer |
| #981 | Readiness exponerar Product Postcheck (stänger `SM-049`) |
| #983 | Döda promptvägar borttagna |
| #984 | `docs/schemas/` städat |
| #985 | Follow-up-mål i plural (`SM-053`) |
| #986 | Ruttplanen filtrerar scaffoldfiler (`SM-048`) |
| #987 | `isNavSourceFile` hittar `components/nav/index.tsx` (`SM-051`) |
| #988 | Ett-sidors-tak vid anafor och apposition (`SM-052`) |

Utöver PR:erna: fyra glossary-gap införda, `SM-054` loggad, vaktregel mot
Directive Cascade i `config/naming-dictionary.json`, `.cursor/commands/pr-herde.md`,
och regelluckan om författarens efterkontroll efter PR.

## Kvar att bygga

| Rad | Läge |
|---|---|
| `SM-055` ecommerce-footerns ruttlänkar | Under arbete |
| `SM-050` sena `preview:client-error` omvärderar ingen status | Under arbete |
| `SM-041` fritextsvar på klargöring tappar ursprungsprompten | Under arbete — nuvarande beteende är testlåst som avsiktligt, så låset måste prövas innan det ändras |
| `SM-044` preview-runtimen byts under öppen session | Under arbete — omergad branch `fix/preview-runtime-restart-race` finns redan |
| Djupmedvetet sidtak (nivå 1+2 räknas, tak 4) | Byggt — se `route-plan-builder.ts` + beslutet 2026-08-14 |
| Coachens glossary-omskrivning (63 rader) | Ej applicerad, ej avfärdad |
| Begreppskarta genererad ur runtime-projektioner | Ej börjad |
| Router: skilja byggförfrågan från fråga | Ej börjad |

## Ägarbeslut fattade 2026-08-14

Alla tre avslogs, och post-MVP-trion omprövades och bekräftades. Motiveringar och
kanoniska källor: [`docs/decisions/README.md`](../../decisions/README.md).

| Fråga | Beslut |
|---|---|
| Constraint-auditor före codegen | **Nej** — deterministiska grindar täcker redan felklassen |
| Delta brief på varje follow-up | **Nej** — inget känt fel den hade förhindrat |
| OpenClaw som reparatör | **Nej** — skulle bli en andra sanning mot RepairGate |
| Post-MVP-trion | **Kvar post-MVP** — ruttkontraktet gjorde dem inte billigare |

Residualen ur beslutsunderlaget ligger som `SM-056` i backloggens skuldsektion:
ruttplanens filfilter gäller scaffolden men inte modellens egna filer.
