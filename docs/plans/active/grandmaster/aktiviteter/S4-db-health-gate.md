---
id: gm-akt-S4
status: ready
parent: gm-omrade-02-stabilitetstester
blocked_by: [gm-akt-S1]
owner_files:
  - package.json (db:schema-drift in i stability-lane)
  - .github/workflows/ci.yml (gate-steg, samordnas i S1)
extern_layer: "pydatabastest.py + db-blob-sync-check.yml (PR #140, annan agent)"
risk: medel
---

# S4 — DB-schema-korrekthet & drift-gate

## Klargörande (Jakes intention)
DB-stabilitetstestet är **schema-korrekthet/drift**, inte wipe. Tre olika saker:

| Sak | Vad | Roll |
|---|---|---|
| `db:init` | applicerar/uppdaterar senaste schemat | auto i `predev` — inte ett test |
| **`db:schema-drift`** | avsett schema (`src/lib/db/schema.ts`) == applicerat (`db-init.mjs` / `add-performance-indexes.mjs` / `migrations/*.sql`) | **regressionstestet** vi vill ha |
| `wipe-generated-sites.mjs` | raderar genererade sajter | sällan/destruktivt, egen branch — **inte** ett test |

## Mål — höj schema-drift från soft till gate
`src/lib/db/schema-drift.test.ts` **finns redan** men körs bara `db:schema-drift:soft`
(warn i predev). Det är deterministiskt, nyckelfritt och billigt → **perfekt gate**:
- Ta in `db:schema-drift` i `test:stability`-lanen (S1).
- Kör det som hard check vid **push/PR/merge**. Fångar t.ex. tabell/index som finns i
  `schema.ts` men saknas i `db-init.mjs` → skapas aldrig på nya miljöer (tyst drift).

## Live-lager (komplement, PR #140)
`pydatabastest.py` (#140) täcker det **levande** lagret: dev/prod-paritet, 31 tabeller
finns, restart-state, blob. Read-only. Behöver GitHub-secrets (annars SKIP). Egen PR/branch.
Statiska `db:schema-drift` behöver inga creds — sätt secrets när live-gaten ska bita.

## Inte scope
- Wipe-logik (egen branch `chore/wipe-generated-sites-tool`).
- Skriva om `schema.ts`/migrations — bara låsa att de matchar.

## Verifiering
- `npm run db:schema-drift` grön; ingår i `npm run test:stability`; kör på push/PR/merge.
- `npm run typecheck` 0 fel.

## Risk
Medel — statiska delen låg (deterministisk); live-delen (#140) rör CI-secrets, annan ägare.
