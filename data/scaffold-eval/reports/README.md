# Scaffold-eval reports

Lokala JSON-rapporter från scaffold-/variant-eval. **Inte i git** (gitignorerade).

| Körning | Output |
|---|---|
| `npm run scaffolds:eval` | `scaffold-selection-latest.json` (+ timestampad kopia) |
| `npx tsx scripts/scaffolds/eval-landing-variants.ts` | `landing-page-variant-latest.json` (+ timestampad kopia) |

Prompt-fixtures som **är** spårade ligger en nivå upp: `../prompts.json`, `../landing-variant-prompts.json`.

Backoffice → Eval läser `*-latest.json` om den finns lokalt. Saknas filen är det förväntat på en ren checkout.
