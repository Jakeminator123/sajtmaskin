# P02: LLM fixer NOOP på max-profilen

## Problem

`max`-byggprofilen använder `selected_build_model` → `gpt-5.4` som fixer.
gpt-5.4 returnerar NOOP på syntaxfel som gpt-5.3-codex (pro-profilen) klarar.
Resultat: max-tier har sämre autofix-framgång än pro-tier.

## Analys

- `config/ai_models/manifest.json` → `phaseRouting.max.fixer` = `"selected_build_model"`.
- `selected_build_model` resolvas till `gpt-5.4` för max (via `buildProfiles.defaults.max`).
- Pro-tier: `selected_build_model` → `gpt-5.3-codex` — fungerar bra som fixer.
- Verifier och deploy-assistant för max har redan explicit `"gpt-5.3-codex"`.
- Det tyder på att fixer borde följa samma mönster.

## Fix (alternativ A — rekommenderat)

Byt `phaseRouting.max.fixer` till `"gpt-5.3-codex"` explicit i manifest.json (rad ~132).
Samma approach som verifier/deploy-assistant redan har.

```json
"max": {
  "planner": "selected_build_model",
  "generator": "selected_build_model",
  "fixer": "gpt-5.3-codex",
  "verifier": "gpt-5.3-codex",
  "deploy-assistant": "gpt-5.3-codex"
}
```

## Fix (alternativ B — undersök först)

Granska fixer-prompten i `src/lib/gen/autofix/llm-fixer.ts` — kanske behöver gpt-5.4
ett annat prompt-format (t.ex. explicit structured output istället för freeform fix).

## Filer

- `config/ai_models/manifest.json` — phaseRouting.max.fixer
- `src/lib/gen/autofix/llm-fixer.ts` — fixer-prompt (om alternativ B)
- `src/lib/gen/autofix/validate-and-fix.ts` — resolvePhaseModel-anrop

## Verifiering

- Kör generation med max-profilen som triggar syntaxfel.
- Bekräfta att fixer inte returnerar NOOP.
- Kör `manifest-parity.test.ts`.

## Status

**Klar (alternativ A).** `phaseRouting.max.fixer` satt till `"gpt-5.3-codex"` i manifest.json.
Manifest-parity-tester gröna.

## Prioritet

Hög — autofix är bruten för max-tier-användare.
