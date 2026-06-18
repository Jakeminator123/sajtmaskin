# Nivå-3 aktiviteter — batch 1

Just-in-time-aktiviteter (nivå 3) för de första körordnings-områdena. Varje fil är
**byggar-agent-körbar** med smal `owner_files` (parallellt = distinkta filer,
sekventiellt = `blocked_by`). Mall + livscykel: [`plan-lifecycle.mdc`](../../../../.cursor/rules/plan-lifecycle.mdc).

| ID | Aktivitet | Område | blocked_by | Risk |
|---|---|---|---|---|
| H0 | Branch-hygien (plan/docs-only PR) | — | — | **Klar** (`4472c5abd`) |
| D1 | `active/README.md` → ren router | 3 | — | **Klar** |
| [S1](S1-test-stability-lane.md) | `test:stability`-lane (warn-only först) | 2 | — | Låg |
| [S2](S2-aao-invariant.md) | åäö-invariant i builder-chat | 2 | S1 | Låg |
| [S3](S3-statusresolver-invariant.md) | statusresolver-invariant (todo tills omr 6) | 2 | S1 | Låg |
| [S4](S4-db-health-gate.md) | DB-health/sync-gate (koordinerar parallell PR) | 2 | — | Medel · extern ägare |
| [D2](D2-repo-tree-readme-synk.md) | synka repo-tree + README mot verkligheten | 3 | — | Låg |
| [C1](C1-plan-file-schema-deprecate.md) | markera `plan-file.schema.json` deprecated | 1 | — | Låg |

Körordning (master-plan §6): branch-hygien → **stabilitetstester (S\*)** → docs (D2) → kontrakt (C1) → event-bus UI → FollowUpContract → false-green.
