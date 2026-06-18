# Policies

Låsta *värden/mappningar* (inte struktur — det är schemas). I Sajtmaskin finns de
redan, mest under `config/`. Sajtbyggaren kallar dem "policies"; vi ger dem bara ett
gemensamt namn och ett index.

| Policy (de-facto) | Fil | Låser |
|---|---|---|
| Domän / site-type | `config/domain-rules.json` | domän-inferens-regler |
| Prompt-heuristik | `config/prompt-heuristic-tokens.json` | heuristik-tokens |
| Namn-ordlista (ny) | `config/naming-dictionary.json` | förbjudna alias → canonical (term-check, område 1) |

Lägg en policy bara när ett värde/mappning faktiskt återanvänds på flera ställen.
Ägar-/signalmatrisen bor i [`.cursor/rules/terminology.mdc`](../../../.cursor/rules/terminology.mdc)
§ Signal-gate — ändra **ägaren**, inte konsumenten.
