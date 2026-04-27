---
id: 2026-04-27-required-home-route-recovery
status: done
created: 2026-04-27
completed: 2026-04-27
linear: null
---

# P2 — Required home route recovery

## Scope

Fixa när init-generering saknar `app/page.tsx` trots att home route är `LLM_ONLY_PATHS`. `app/page.tsx` ska fortsatt inte fyllas av scaffold-default. Ingen ny scaffold, dossier, prompt-omskrivning, import-/dependency-fix eller full eval i detta spår.

## Resultat

| Issue | Fix |
|---|---|
| `app/page.tsx` saknas | `runFinalizePreflight` kör targeted recovery för enbart `app/page.tsx` innan preview/complete-project-gate. |
| Scaffold-default får inte persisteras som home | `LLM_ONLY_PATHS` i `finalize-merge.ts` är oförändrad; recovery skapar ny home route via repair-gate i stället för scaffold-fallback. |
| Trivial/empty home | Befintlig hard gate är kvar; P2 recovery körs bara när home route saknas, inte när befintlig page är trivial. |

## Verifiering

| Check | Resultat |
|---|---|
| `npx tsc --noEmit` | 0 errors |
| Riktade vitest | 31/31 passerar |
| Smal P2-eval | 5/5 PASS, gate `WARNING`, 0 blocking failures |

Smal P2-eval: `npm run eval:gate -- --prompts ecommerce,settings,auth,pricing,portfolio`.

## Ej gjort här

- Ingen full eval.
- Ingen scaffold-/dossier-/prompt-omskrivning.
- Ingen import-/dependency-fix.
