# Nivå-3 aktiviteter — batch 1

Just-in-time-aktiviteter (nivå 3) för de första körordnings-områdena. Varje fil är
**byggar-agent-körbar** med smal `owner_files` (parallellt = distinkta filer,
sekventiellt = `blocked_by`). Mall + livscykel: [`plan-lifecycle.mdc`](../../../../.cursor/rules/plan-lifecycle.mdc).

| ID | Aktivitet | Område | blocked_by | Status |
|---|---|---|---|---|
| H0 | Branch-hygien (plan/docs-only PR) | — | — | **Klar** (`4472c5abd`) |
| D1 | `active/README.md` → ren router | 3 | — | **Klar** |
| [S1](S1-test-stability-lane.md) | `test:stability`-lane (warn-only först) | 2 | — | **Klar** (#147) |
| [S2](S2-aao-invariant.md) | åäö-invariant i builder-chat | 2 | S1 | **Klar** (#151) |
| [S3](S3-statusresolver-invariant.md) | statusresolver-invariant | 2 | S1 + **omr 6** | **Öppen** — enda kvar i omr 2, gated på omr 6 |
| [S4](S4-db-health-gate.md) | DB-schema-korrekthet & drift-gate (`db:schema-drift` soft→gate; live = #140) | 2 | S1 | **Klar** (#150) |
| [D2](D2-repo-tree-readme-synk.md) | synka repo-tree + README mot verkligheten | 3 | — | **Klar** (#148) |
| [C1](C1-plan-file-schema-deprecate.md) | markera `plan-file.schema.json` deprecated | 1 | — | **Klar** (#152) |
| [C2](C2-ordlista-check.md) | ordlista/glossary-check (push/PR/merge, warn-först) | 1 | — | **Klar** (#153) |

Körordning (master-plan §6): branch-hygien → **stabilitetstester (S\*)** → docs (D2) → kontrakt (C1/C2) → event-bus UI → FollowUpContract → false-green.

**Städ-pass:** varje nivå-2-område avslutas med en scoped `Z-städ`-aktivitet (radera oanvänt, omorganisera områdets mappyta, konsolidera) — se master-plan §5 + [`plan-lifecycle.mdc`](../../../../.cursor/rules/plan-lifecycle.mdc). Skapas just-in-time per område.
