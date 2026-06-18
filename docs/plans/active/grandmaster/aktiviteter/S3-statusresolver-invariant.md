---
id: gm-akt-S3
status: ready
parent: gm-omrade-02-stabilitetstester
blocked_by: [gm-akt-S1]
owner_files:
  - (ny) stabilitetstest/guard för statusresolver
risk: låg
---

# S3 — statusresolver-invariant (todo tills område 6)

## Mål
Lås att **central builder-yta inte läser legacy `resolveEngineVersionDisplayStatus`**
(N#6). En search-/import-invariant över `VersionHistory.tsx` + `BuilderShellContent.tsx`.

## Viktigt — författas non-blocking nu
Dessa ytor **använder fortfarande** legacy-resolvern (öppen P2). Skriv invarianten i
`todo`/`xfail`-läge (eller warn-only) som dokumenterar nuvarande legacy-användare, med
kommentar: *"flippa till `assert(tom)` när område 6 (event-bus UI-flip) landat."* Lanen
ska **inte** rödfärgas av detta innan omr 6.

## Inte scope
- Själva UI-flippen (det är område 6).
- Ändra statusprojektionen `selectVersionStatus`.

## Verifiering
- `npm run test:stability` grön (invarianten i todo/xfail).
- Grep visar att invarianten listar exakt dagens legacy-importörer.

## Risk
Låg. Dokumenterande invariant; aktiveras som gate i område 6.
