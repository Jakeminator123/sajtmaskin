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
| [S3](S3-statusresolver-invariant.md) | statusresolver-invariant (hård import-vakt) | 2 | S1 + omr 6 | **Klar** (#163 mergad `1713d4fdf`) — 6-3 punkt 2, legacy-resolver borttagen |
| [S4](S4-db-health-gate.md) | DB-schema-korrekthet & drift-gate (`db:schema-drift` soft→gate; live = #140) | 2 | S1 | **Klar** (#150) |
| [D2](D2-repo-tree-readme-synk.md) | synka repo-tree + README mot verkligheten | 3 | — | **Klar** (#148) |
| [C1](C1-plan-file-schema-deprecate.md) | markera `plan-file.schema.json` deprecated | 1 | — | **Klar** (#152) |
| [C2](C2-ordlista-check.md) | ordlista/glossary-check (push/PR/merge, warn-först) | 1 | — | **Klar** (#153) |

## Område 5 — Follow-up & preview-kontrakt (batch 2, skapad 2026-06-19)

Yt-karta: [`llm-callsite-matrix.md`](../../../../architecture/llm-callsite-matrix.md) (kluster E + fynd F1/F2). Nivå-2: [`05-followup-och-preview-kontrakt.md`](../05-followup-och-preview-kontrakt.md).

| ID | Aktivitet | blocked_by | Risk | Status |
|---|---|---|---|---|
| [5-1](5-1-followup-contract-type.md) | `FollowUpContract`-typ + builder (additiv konsolidering) | — | Låg–medel | **Klar** (#165) |
| [5-2](5-2-stale-baseversion-409.md) | Stale-`baseVersionId` → 409 i follow-up-strömmen (fynd F2) | 5-1 (mjukt) | Medel | **Klar** (#166) |
| [5-3](5-3-frys-enforcement.md) | Frys-enforcement: lås scaffold/variant/route (stäng `scaffoldMode:"manual"`-kringgång) | 5-1 | Medel | **Klar** (#168) |
| [5-4](5-4-clear-redesign-delta-brief.md) | F1-fix: clear-redesign-delta-brief når orchestrate | 5-1 | Medel | **Klar** (#169) |
| [5-3b](5-3b-route-hard-clamp.md) | Hård route-clamp + explicit route-removal (komplettering av 5-3; frysta routes blir floor) | 5-3 | Medel | **Klar** (#172) |
| [5-5](5-5-capabilities-can-only-grow.md) | Capabilities can-only-grow / aldrig tyst tappa | 5-1, 5-3 | Medel | **Klar** (#174) |
| 5-6 | `previewSessionId` in i kontraktet + validering | 5-1 | Låg–medel | **Parkerad** (tunt/redundant; re-pin-efter-finalize-variant = backlog) |
| 5-7 | Follow-up-kontrakt-invarianter → blockerande CI (lane-promotion) | 5-1..5-5 | Låg | **Klar** (#176) |
| 5-Z | Z-städ: LLM-karta/flowchart-synk + doc-drift F1/F2/F3 + nominerings-drift | 5-1..5-7 | Låg | **Klar** (2026-06-21) |

Körordning (master-plan §6): branch-hygien → **stabilitetstester (S\*)** → docs (D2) → kontrakt (C1/C2) → event-bus UI → FollowUpContract → false-green.

**Städ-pass:** varje nivå-2-område avslutas med en scoped `Z-städ`-aktivitet (radera oanvänt, omorganisera områdets mappyta, konsolidera) — se master-plan §5 + [`plan-lifecycle.mdc`](../../../../.cursor/rules/plan-lifecycle.mdc). Skapas just-in-time per område.
