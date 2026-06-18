---
id: gm-omrade-02-stabilitetstester
status: scope
created: 2026-06-18
linear: null
parent: gm-00-master-plan
supersedes: null
---

# Område 2 — Stabilitetstester (Nivå 2)

**Nivå 1:** [`00-master-plan.md`](00-master-plan.md) · **Wave 1** · **Beroende:** —

## Syfte
Kuraterad `test:stability`-lane som låser större buggar + UX-invarianter. Tre körlägen
(lokalt, PR, push). Delivery-bias-doc mot testsvall. **LLM-evals parkerade.**

## Yta (owner-surface)
- `package.json` (script `test:stability`)
- `.github/workflows/ci.yml` (steg på pull_request + push)
- `docs/testing.md` + `docs/delivery-bias.md` (port-light från Sajtbyggaren)
- nya stabilitetstester (tagg/glob — definieras i nivå 3)

## Seed-invarianter (start)
| Invariant | Källa |
|---|---|
| `åäö` i användarprompt renderas i builder-chatten under generering | ditt exempel |
| Follow-up byter inte scaffold/variant, tappar inte route utan signal | spår O/N |
| Placeholder/degraded visas aldrig som "success" | P1 N#1, falskt-grönt |
| Central builder-yta läser inte legacy `resolveEngineVersionDisplayStatus` | N#6 |
| Stale basversion i follow-up/F3 → 409 | spår R |

## Klart när
`npm run test:stability` finns och kör lokalt + PR + push; ≥3 seed-invarianter gröna;
varje test pekar på sin källa.

## Nivå 3 (skapas när området startar)
8–10 aktiviteter, smal `owner_files` var. Ej skapade än.
