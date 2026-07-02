# Policies

Låsta *värden/mappningar* (inte struktur — det är schemas). I Sajtmaskin finns de
redan, mest under `config/`. Sajtbyggaren kallar dem "policies"; vi ger dem bara ett
gemensamt namn och ett index.

Kanoniskt maskinläsbart policy-index är
[`config/control-plane/policy-registry.json`](../../../config/control-plane/policy-registry.json).
Den här mappen är bara ett lätt mänskligt nav; lägg inte policy-JSON här om den
redan har en tydlig runtime-/config-plats.

| Policy (de-facto) | Fil | Låser |
|---|---|---|
| Domän / site-type | `config/domain-rules.json` | domän-inferens-regler |
| Prompt-heuristik | `config/prompt-heuristic-tokens.json` | heuristik-tokens |
| Namn-ordlista | `config/naming-dictionary.json` | förbjudna alias → canonical (term-check) |

Lägg en policy bara när ett värde/mappning faktiskt återanvänds på flera ställen.
Ägar-/signalmatrisen bor i [`.cursor/rules/terminology.mdc`](../../../.cursor/rules/terminology.mdc)
§ Signal-gate — ändra **ägaren**, inte konsumenten.
