---
name: automat-swarm
description: Use for /automat or repeated high-volume read-only audit swarms. Writes only gitignored findings; never fixes code or touches git.
---

# Automat — sequential audit swarms

A report factory: the orchestrator (main agent) runs repeated rounds of cheap
read-only subagents and curates the most valuable findings into one local list.
Audit mode, strictly separated from fix mode.

## Arguments

- `/automat` → 3 rounds (scan → falsify → scan), 8 agents per scan round.
- `/automat <N>` → N alternating rounds. `agenter=<K>` (or "med 12 agenter")
  overrides scan-round size; falsification is sized by unverified findings, max 8.
- Named areas ("bara backend", "fokus preview/env") replace lane rotation.
- Rounds run sequentially; agents within a round run in parallel (one assistant
  turn with all `Task` calls).

## Hard rules

1. **Read-only.** Every subagent is `readonly: true`; nobody changes product code.
2. **No git.** Writing to gitignored `.cursor/swarms/` needs no branch or worktree.
3. **Write only** raw reports to `.cursor/swarms/runs/<YYYY-MM-DD_HHMM>/` and
   curated findings to `.cursor/swarms/FINDINGS.md`.
4. **Never touch `BUG-SWARM-BACKLOG.md`.** Promotion is a separate manual
   `/buggrapport` step.
5. **Models** per [`subagent-models.mdc`](../../../.cursor/rules/subagent-models.mdc):
   `<luna>` for scan lanes, `<sol>` for distill and falsification; an invalid
   slug never inherits the parent model.
6. **Short reports:** max 6 table rows per agent, no prose — every returned line
   is re-sent on later turns.

## Rounds

| Round | Type | Agents | Model | Job |
|---|---|---|---|---|
| 1, 3, 5 … | **Scan** | 8, one lane each | `<luna>` | new candidates in rotating lanes |
| 2, 4, 6 … | **Falsification** | one per unverified finding, max 8 | `<sol>` | try to prove the finding is **not** a bug |

No unverified findings left → scan instead. Each finding is falsified at most
once. Status lives in the id: `A#12` unverified, `A#12✔` survived; falsified
rows are deleted from `FINDINGS.md` and their reason recorded in the round's
`index.md`.

**Scan round**

1. Take the next 8 lanes from the rotation (wrap around); split lanes when K > 8.
   Resolve exact paths with the router in `AGENTS.md`.
2. Fire the parallel `Task` calls (`subagent_type: explore`, `readonly: true`,
   `<luna>`) with the scan prompt.
3. Write each report verbatim to `runs/<ts>/r<r>-<lane-slug>.md`, then prune only
   this surface: `node scripts/dev/clean-scratch.mjs --apply --only .cursor/swarms/runs`
   (never the global `clean:scratch:apply`; use `node`, npm eats the flag).
4. One readonly `<sol>` distill task reads `runs/<ts>/r<r>-*.md` and
   `FINDINGS.md` and returns at most 5 new rows; do not dedup old rounds yourself.
5. Add one line per lane (top pick + confidence) to `runs/<ts>/index.md`.

**Falsification round**

1. Unverified `A#` findings, highest impact first, max 8, one agent each.
2. Parallel `Task` calls (`explore`, `readonly: true`, `<sol>`) with the
   falsification prompt.
3. `falsk` → delete the row; `bekräftad` → append `✔`; `oklar` → leave it, now spent.
4. One line per finding in `index.md`: id, verdict, one-line reason.

Finish with a short table: rounds by type, lanes covered, new `A#` findings by
prio, how many were falsified, pointer to `FINDINGS.md`.

**Value order:** P0/P1 runtime regressions, false-green gates
(verify/quality-gate/promote/status), cross-tenant/data-loss, security, broken
LLM-pipeline contracts → dead code, naming overlap, optimizations, test gaps,
doc/glossary drift. Drop unanchored or stylistic noise.

## Lanes

1 `frontend/first-page` (landing, hydration, blank screen) · 2 `frontend/builder`
(`src/app/builder/`, `src/components/builder/`, `src/lib/hooks/chat/`) · 3
`frontend/preview` (`preview-panel/`, `src/lib/gen/preview/`) · 4
`frontend/navigation` (routes, 404, guards) · 5 `backend/api-routes`
(`src/app/api/**`) · 6 `backend/db-tenant` (`src/lib/db/**`, `src/lib/tenant.ts`)
· 7 `backend/env-config` (`src/lib/env.ts`, `config/env-policy.json`) · 8
`ai-flow/init-llm` (`src/lib/gen/`, `src/lib/providers/own-engine/`) · 9
`ai-flow/follow-up` (`src/lib/gen/stream/`) · 10 `ai-flow/fidelity2-vs-3`
(`src/lib/gen/verify/`, finalize-design) · 11 `quality/dead-code` · 12
`quality/naming-overlap` (vs glossary) · 13 `quality/tests` (gaps, false-green) ·
14 `ops/github-vercel-bots` (missed PR-bot comments, backlog gaps).

## Prompts

Scan agent (fill `{LANE}`, `{PATHS}`):

```text
You are a cheap READ-ONLY auditor for the Sajtmaskin repo. Lane: {LANE}.
Look ONLY in: {PATHS}. Code is source of truth.

Hunt for (any that apply): Bug, Dead code, Naming overlap/shadowing, Improvement,
Optimization, Test gap, Security, Drift vs docs/architecture/glossary.md.

Rules: read-only (do NOT edit anything). Be concrete. Cite fil:rad anchors.
No prose, no preamble, no closing line. Skip findings you can't anchor.
Hard cap: 6 table rows. Fewer good rows beats six weak ones.

Return EXACTLY this table (drop the example row), best findings first:

| # | Typ | Fynd (fil:rad) | Impact | Konfidens | Fix |
|---|-----|----------------|--------|-----------|-----|
| 1 | Bug | kort fynd (src/...:rad) | 80% | 70% | S |
```

Falsification agent (fill `{ID}`, `{FYND}`, `{ANKARE}`):

```text
READ-ONLY. Your job is to DISPROVE a reported finding in the Sajtmaskin repo,
not to confirm it. Assume it is wrong until the code says otherwise.

Finding {ID}: {FYND}
Anchor: {ANKARE}

Read the actual file(s) around the anchor and the call sites. Look specifically
for: a guard/early return that already handles it, a caller that never hits the
path, a type that makes it impossible, a test that already covers it, or an
anchor that points at the wrong line entirely.

Return EXACTLY three lines, nothing else:
Verdikt: falsk | bekräftad | oklar
Bevis: <fil:rad + one sentence>
Ändrad bild: <one sentence, or "-">
```

`falsk` requires evidence, not absence of proof; no evidence either way is `oklar`.

Distill agent (one per scan round):

```text
READ-ONLY. Read these raw audit reports: {RUN_PATHS}
Then read the existing curated list: .cursor/swarms/FINDINGS.md

Return AT MOST 5 findings that are (a) not already in FINDINGS.md by fil:rad
anchor or by meaning, and (b) high value per this order: P0/P1 runtime
regressions, false-green gates, cross-tenant/data-loss, security, broken
LLM-pipeline contracts, then dead code, naming overlap, optimizations, test
gaps, doc drift.

Output only finished table rows in FINDINGS.md's existing column format —
no ids, no preamble, no explanation of what you skipped.
```

Single-question variant: [`818-swarm-decide`](../818-swarm-decide/SKILL.md).
