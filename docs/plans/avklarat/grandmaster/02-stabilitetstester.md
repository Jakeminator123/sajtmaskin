---
id: gm-omrade-02-stabilitetstester
status: done
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
| Central builder-yta läser inte legacy `resolveEngineVersionDisplayStatus` — **aktiv hård invariant** (resolvern borttagen 6-3, `status-resolver-single-writer.stability.test.ts`) | N#6 |
| Stale basversion i follow-up/F3 → 409 | spår R |
| DB-schema: avsett (`schema.ts`) == applicerat (`db-init`/migrations) | `db:schema-drift` (höj soft→gate, S4) |

## Klart när
`npm run test:stability` finns och kör lokalt + PR + push; ≥3 seed-invarianter gröna;
varje test pekar på sin källa.

## Nivå 3 (batch 1 skapad)
Detta område är **först i körordningen** → första batchen finns i [`aktiviteter/`](aktiviteter/README.md):
[`S1`](aktiviteter/S1-test-stability-lane.md) lane · [`S2`](aktiviteter/S2-aao-invariant.md) åäö ·
[`S3`](aktiviteter/S3-statusresolver-invariant.md) statusresolver (**klar** — hård invariant 6-3) ·
[`S4`](aktiviteter/S4-db-health-gate.md) DB-health-gate (koordinerar parallell PR).
Fler aktiviteter skapas vid behov.
