# Restlista efter nattbatchen 2026-08-14

Koncentrat av vad som återstår ur handoff-spåret och nattens arbete. Defekterna
ägs av [`BUG-SWARM-BACKLOG.md`](../../../BUG-SWARM-BACKLOG.md) — den här filen är
bara översikten över vad som är byggt, vad som väntar och vad som väntar på
ägaren. Kopiera inte kön hit.

Bakgrunden till spår A/B/C ligger i
[`handoff-question-flow-and-scaffold-routes.md`](handoff-question-flow-and-scaffold-routes.md).

## Levererat natten till 2026-08-14

Elva PR:er i spåret, alla mergade till `master`.

| PR | Vad |
|---|---|
| #982 | Ruttkontrakt i `ScaffoldManifest` — scaffoldens rutter bor bredvid dess filer |
| #981 | Readiness exponerar Product Postcheck (`SM-049`) |
| #983 | Döda promptvägar borttagna |
| #984 | `docs/schemas/` städat |
| #985 | Follow-up-mål i plural (`SM-053`) |
| #986 | Ruttplanen filtrerar scaffoldfiler (`SM-048`) |
| #987 | `isNavSourceFile` hittar `components/nav/index.tsx` (`SM-051`) |
| #988 | Ett-sidors-tak vid anafor och apposition (`SM-052`) |
| #990 | Sen `preview:client-error` blir advisory-warning efter promotion (`SM-050`) |
| #993 | Kort parafras av ett sparat svarsalternativ återställer originalprompten (`SM-041`) |
| #989 | Ecommerce-footern speglas mot ruttplanen (`SM-055`, och därmed `SM-042`:s residual) |
| #991 | Preview håller HTTP tills `waitForReady` efter runtime-byte (`SM-044`) |

Utöver PR:erna: fyra glossary-gap införda, `SM-054` och `SM-056` loggade, vaktregel
mot Directive Cascade i `config/naming-dictionary.json`, `.cursor/commands/pr-herde.md`,
regelluckan om författarens efterkontroll efter PR, och ett färskhetssvep som
arkiverade åtta backlograder och skrev om tre vars radankare pekade fel.

Backlogkön gick från 42 till 31 öppna rader under natten.

## Kvar att bygga

| Rad | Läge |
|---|---|
| Djupmedvetet sidtak (nivå 1+2 räknas, tak 4) | Byggt — `route-plan-builder.ts` + beslutet 2026-08-14 |
| `SM-040` kolonlistans `och`/`and` | Byggt — kända titlar hålls ihop, övriga `och`/`and` splittras |
| Coachens glossary-omskrivning (63 rader) | Ej applicerad, ej avfärdad |
| Begreppskarta genererad ur runtime-projektioner | Ej börjad |
| Router: skilja byggförfrågan från fråga | Ej börjad |
| `SM-056` filfiltret gäller inte modellens egna filer | Loggad som skuld; ingen prodförekomst bekräftad |

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
