# Scaffold-eval reports

Lokala JSON-rapporter från scaffold-/variant-eval. **Inte i git** (gitignorerade).

Rapporterna är eval-evidens, inte runtime-policy. Variantmatchern läser aldrig
den här mappen; kandidatpoolen kommer alltid från det committade variantregistret.

| Körning | Output |
|---|---|
| `npm run eval` (scaffold-lane) | `scaffold-selection-latest.json` (+ timestampad kopia) |

Prompt-fixturen som **är** spårad ligger en nivå upp: `../prompts.json`.

Backoffice → Eval läser `*-latest.json` om den finns lokalt. Saknas filen är det förväntat på en ren checkout.
