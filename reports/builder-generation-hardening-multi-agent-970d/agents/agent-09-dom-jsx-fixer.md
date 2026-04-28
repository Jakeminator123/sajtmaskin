## Agent 09 — DOM types as JSX

### Grep results (files + one line each)

| File | Summary |
|------|---------|
| `src/lib/gen/autofix/rules/dom-builtin-jsx-fixer.ts` | Maps `HTMLFormElement`→`form`, `HTMLInputElement`→`input`, etc. |
| `src/lib/gen/autofix/rules/dom-builtin-jsx-fixer.test.ts` | Tests `<HTMLFormElement>`, `<HTMLInputElement />`, generics untouched |
| `src/lib/gen/autofix/fixer-registry.ts` | Registers `dom-builtin-jsx-fixer` |
| `src/lib/gen/autofix/pipeline.ts` | Step ~5.5 calls `fixDomBuiltinJsxTags` |
| `navigation-placeholder` | Verifier (`verifier-pass.ts`), not autofix rule |

### Gap vs Nordtak plan

Plan nämnde mekanisk fix för `<HTMLInputElement />` — **den finns** (`dom-builtin-jsx-fixer`). Verifier-blocker `navigation-placeholder-actions` är **separat** (prompt/repair).

### Confidence (%)

Mekanisk DOM-fix finns: **92%**. Koppling till specifik Nordtak-körning: **35%** (ingen lokal logg i workspace).

### Improvements

- Följ upp warnings för okända `HTML*Element`.  
- Nav-placeholder: tydligare Core Rules eller begränsad heuristik (riskabel).

**Model:** composer-2-fast (subagent)
