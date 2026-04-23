---
id: omtag-04-env-flag-collapse
title: Env-flag-collapse — ~35 → ~10 SAJTMASKIN_*-flaggor
phase: 0
priority: P2
parallell_med: [01-embedding-diagnos, 02-eval-baseline, 07-static-core-type-imports]
blockerad_av: []
estimat: "2–3 h"
owner_files:
  - src/lib/env.ts
  - config/env-policy.json
  - docs/ENV.md
  - .env.example
---

# 04 — Env-flag-collapse

## Mål

Minska antalet `SAJTMASKIN_*`-flaggor i `src/lib/env.ts` från ~35 till ~10. Allt som är "on by default i dev" och aldrig overridas i prod → hårdkoda konstanten. Allt som är legacy → ta bort.

## Varför det här

Varje flagga = ett lager som kan stå i fel läge och orsaka tyst kvalitetsdrift. Fatigue-agentens P4-A pekar på detta; den här körningen gör det på allvar: **reduktion, inte omdöpning**.

## Scope

| In | Ut |
|---|---|
| Ta bort flaggor vars standard aldrig ändras | Införa nya flaggor |
| Hårdkoda de 4–6 "repair-loop-hardening"-flaggorna som är on-by-default sedan SAJ-25 | Röra modellregister / catalog |
| Uppdatera `config/env-policy.json` + `docs/ENV.md` | Ändra `SAJTMASKIN_MODEL_*`-overridesen (användarnas tier-overrides) |
| Uppdatera alla `process.env.SAJTMASKIN_*`-callsites | Röra OpenClaw-/Vercel-/DB-miljövariabler |

## Kandidater för borttagning (prel. lista — verifiera innan du rör)

| Flagga | Varför bort |
|---|---|
| `SAJTMASKIN_SHOW_THINKING` | Legacy-alias — bort nu när migrationen är klar |
| `SAJTMASKIN_CONSISTENT_REPAIR_PASS_INDEX` | On-by-default sedan SAJ-25 — hårdkoda |
| `SAJTMASKIN_VERIFIER_RERUN_AFTER_FIX` | On-by-default i dev, ej överridat i prod — hårdkoda |
| `SAJTMASKIN_SKIP_DOUBLE_VALIDATE_AND_FIX_ON_MERGE` | Dito — hårdkoda |
| `SAJTMASKIN_RECURRING_PATTERNS_IN_MAIN_PROMPT` | Om det landat rent i system-prompten → hårdkoda |
| `SAJTMASKIN_USE_ERROR_LOG_RAG` | Om auto-ingest körs → hårdkoda; annars ta bort hela pathen |
| `SAJTMASKIN_DEFER_EXTRA_ROUTES_ON_INIT` | Verifiera om den läses i prod — troligen hårdkoda |
| `SAJTMASKIN_FOLLOWUP_LIGHT_*` (3 st) | Om de aldrig ändras från default i prod → hårdkoda i en konst |
| `SAJTMASKIN_DEV_LOG_DOC_MAX_WORDS` | Konstant-kandidat |

**Behåll (tier-/miljöspecifika):**
- `SAJTMASKIN_MODEL_FAST/PRO/MAX/CODEX/ANTHROPIC` — legitima model-overrides
- `SAJTMASKIN_ASSIST_MODEL`, `SAJTMASKIN_POLISH_MODEL`, `SAJTMASKIN_VERIFIER_PASS`, `SAJTMASKIN_BRIEF_MODEL`
- `SAJTMASKIN_PREVIEW_HOST_BASE_URL`, `SAJTMASKIN_PREVIEW_HOST_API_KEY`
- `SAJTMASKIN_STRICT_GENERATED_ARTIFACTS` (CI-gate)
- `SAJTMASKIN_DEV_LOG` (on/off-toggle för nytta)
- `SAJTMASKIN_BUILDER_INSPECTOR` (legitim dev-toggle)
- `SAJTMASKIN_DOSSIER_PIPELINE` — granska: om dossier-v2 är default on överallt → kandidat

## Inputs

1. `src/lib/env.ts` — hela filen
2. `config/env-policy.json` — policy-källa
3. `docs/ENV.md` — människo-docs
4. `rg "SAJTMASKIN_[A-Z_]+" src backoffice` — callsites per flagga
5. `.env.example` + `.env.local` — default-värden i dev

## Exekveringssteg

1. **Inventera**: kör `rg "process\.env\.SAJTMASKIN_|getServerEnv\(\)\.SAJTMASKIN_" -n src backoffice` och spara output i `OMTAG/04-inventory.md` (kommitteras inte).
2. **Per flagga** i kandidatlistan:
   - Verifiera dev-/prod-default + alla callsites
   - Om det aldrig varierar → ta bort flaggan ur zod-schemat, ersätt callsites med hårdkodad konstant (lägg i `src/lib/config/` eller närmast konsumenten)
3. **Uppdatera** `config/env-policy.json` så den matchar zod-schemat.
4. **Uppdatera** `docs/ENV.md` med nytt tabellformat: endast de behållna flaggorna.
5. **Uppdatera** `.env.example` (ta bort borttagna flaggor, lämna legitima tier-overrides med kommentarer).
6. **Kör parity-test** om det finns (`npm run typography:validate-pairings` el.dy.).
7. **Commit per logisk grupp** (repair-loop-flaggor, followup-flaggor, etc.).

## Får INTE göras

- Ingen omdöpning utan borttagning — reduktion är målet.
- Rör inte model-register (`config/ai_models/manifest.json`).
- Ingen ändring i backoffice-sidor mer än att uppdatera flag-listor som exponeras där.
- Rör inte `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, DB-/Redis-/Vercel-vars.

## Acceptance criteria

- [ ] Antal `SAJTMASKIN_*`-rader i `src/lib/env.ts` ≤ 15 (från 30+).
- [ ] `config/env-policy.json` ↔ `src/lib/env.ts` stämmer (ingen flagga utan policy-rad och vice versa).
- [ ] `docs/ENV.md` uppdaterad med den nya mindre listan + motivering per kvarhållen flagga.
- [ ] `npm run typecheck` + `npm run lint` grönt.
- [ ] `npx vitest run` — inga nya fails.
- [ ] Eval-baseline (02) kör rent — inga regressions.
- [ ] Backoffice-sidor som tidigare läste borttagna flaggor uppdaterade eller verifierade.

## Branch

`omtag/04-env-flag-collapse`
