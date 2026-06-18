---
id: gm-akt-D2
status: done
implemented_by: "PR #148 (repo-tree + README-synk), mergad till master"
parent: gm-omrade-03-dokumentation-och-kartor
blocked_by: []
owner_files:
  - README.md
  - docs/architecture/repo-tree.md
risk: låg
---

# D2 — synka repo-tree + README mot verkligheten

## Mål
`repo-tree.md` och `README.md` ska beskriva **faktisk** master. Ersätt gammal text,
lägg inte lager.

## Konkret
- `repo-tree.md` listar verkliga mappar (`preview-host/`, `backoffice/`, `evals/`, `drizzle/` osv.)
  och tar bort fantommappar (`research/`, `templates_v0/`, `isolated_tests/` om de ej finns).
- `README.md` slutar peka på `templates_v0/` som produktbana (legacy enligt repo-router).

## Inte scope
- Flytta/radera kod eller mappar (det är område 8).
- Terminologi-omskrivning utöver fantommapp-/legacy-länkar (område 1/Q).

## Verifiering
- Diff `repo-tree.md` mot faktisk mappstruktur (Glob).
- Alla länkar i README/repo-tree resolvar.

## Risk
Låg. Docs-only synk.
