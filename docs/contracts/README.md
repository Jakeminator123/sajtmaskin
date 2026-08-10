# Kontraktslager (lätt)

Fyra pelare som låser sanning på olika sätt. Håll lätt: lås format/värden/beslut,
bygg **inte** ett styrningslager (jfr Sajtbyggarens tunga `governance/` — porteras inte).

| Pelare | Låser | Bor i |
|---|---|---|
| **Schemas** | *Struktur/format* på dataartefakter | [`docs/schemas/`](../schemas/) |
| **Policies** | *Värden/mappningar* — tillåtna värden, signal-källor, trösklar | `config/*.json` (+ enstaka prose under denna mapp) |
| **Regler** | *Process/konvention* — hur kod/planer/PR görs | [`.cursor/rules/`](../../.cursor/rules/) |
| **Beslut** | *Varför* — ratificerade ägarbeslut | [`docs/decisions/`](../decisions/README.md) |

> Schema = hur något *ser ut*. Policy = vilka *värden* som gäller. Regel = hur vi
> *arbetar*. Beslut = *varför* vi valde så.

`docs/contracts/beslut/` (ADR-mappen) är **borttagen** 2026-08-10 — den överlappade
`docs/decisions/` och skapade två “beslut”-ytor. Historik via git.

## Handskrivna kontrakt här

| Fil | Äger |
|---|---|
| [`dossier-system.md`](dossier-system.md) | Byggblock / capability-modell |
| [`scaffold-system.md`](scaffold-system.md) | Scaffold-pool och pick |
| [`fixer-registry.md`](fixer-registry.md) | RepairGate-fixare |
| [`env-flow.md`](env-flow.md) | Env-flöde F2/F3 |
| [`data-layer.md`](data-layer.md) | DB/data-kontrakt |
| [`component-library.md`](component-library.md) | Scaffold vs shadcn vs capability-deps |

## Policies (maskinläsbara)

Kanoniskt index: [`config/control-plane/policy-registry.json`](../../config/control-plane/policy-registry.json).
Lägg inte policy-JSON i `docs/` när den redan har en runtime-/config-plats.

| Policy (de-facto) | Fil | Låser |
|---|---|---|
| Domän / site-type | `config/domain-rules.json` | domän-inferens-regler |
| Prompt-heuristik | `config/prompt-heuristic-tokens.json` | heuristik-tokens |
| Namn-ordlista | `config/naming-dictionary.json` | förbjudna alias → canonical (term-check) |

Ägar-/signalmatrisen bor i [`.cursor/rules/terminology.mdc`](../../.cursor/rules/terminology.mdc)
§ Signal-gate — ändra **ägaren**, inte konsumenten.
