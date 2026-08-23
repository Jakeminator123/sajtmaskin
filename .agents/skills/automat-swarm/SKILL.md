---
name: automat-swarm
description: Use for /automat or repeated high-volume read-only audit swarms. Writes only gitignored findings; never fixes code or touches git.
---

# Automat — sequential audit swarms

A **report factory**: the orchestrator (the main agent running `/automat`) launches repeated rounds of cheap read-only subagents, collects their short reports, and curates the most valuable findings into one separate local list. This is **audit mode**, strictly separated from fix mode.

## Trigger & argument parsing

- `/automat` → **3** rounds (scan → falsify → scan), **8** agents per scan round.
- `/automat <N>` → **N** alternating rounds, 8 agents per scan round.
- Agent override: `/automat <N> agenter=<K>` (or natural language in the same message, e.g. "med 12 agenter"). Applies to scan rounds; a falsification round is sized by the number of unverified findings, capped at 8.
- Lane override: if the message names areas ("bara backend", "fokus preview/env"), use those instead of rotation. Otherwise **rotate** through the lane table below.
- Rounds run **sequentially**; the agents **within** a round run in **parallel**.

## Hard rules

1. **Read-only.** Every subagent is `readonly: true`. No subagent and not the orchestrator may change product code.
2. **No git.** No commit/branch/checkout/push. Writing to `.cursor/swarms/` is safe because it is gitignored (no HEAD movement, no worktree needed).
3. **Write only to `.cursor/swarms/`.** Raw reports → `runs/<ts>/`, curated findings → `FINDINGS.md`. Nothing else is written.
4. **Never auto-touch `BUG-SWARM-BACKLOG.md`.** Promotion of a confirmed finding is a separate manual `/buggrapport` step.
5. **Keep volume cheap.** Use the current `<luna>` slug from [`subagent-models.mdc`](../../../.cursor/rules/subagent-models.mdc) for scan, distill and falsification. Never let an invalid slug inherit the parent model.
6. **Keep reports short.** Max **6** table rows per agent and no closing prose. Every returned line lands in the orchestrator's context and is re-sent on every later turn — brevity in the subagent prompt is the main cost lever in this skill.

## Round types — rounds alternate

More breadth on top of unverified findings just grows the pile. Odd rounds widen, even rounds prune.

| Round     | Type              | Agents                            | Model        | Job                                       |
| --------- | ----------------- | --------------------------------- | ------------ | ----------------------------------------- |
| 1, 3, 5 … | **Scan**          | 8, one lane each                  | `<luna>` | find new candidates in rotating lanes     |
| 2, 4, 6 … | **Falsification** | one per unverified finding, max 8 | `<luna>` | try to prove the finding is **not** a bug |

`/automat 3` is therefore scan → falsify → scan. If a falsification round has no unverified findings left, run a scan round instead. A finding is falsified **at most once** — an `oklar` verdict stays unverified and is never re-swarmed.

Status lives in the `A#` id itself, so `FINDINGS.md` needs no new column: `A#12` = unverified, `A#12✔` = survived falsification. Falsified findings are **removed** from `FINDINGS.md` and recorded in that round's `index.md`.

### Scan round

1. **Pick lanes.** Take the next 8 lanes from the rotation cursor (wrap around the table). Round 1 = lanes 1–8, round 3 = lanes 9–13 then 1–3, etc. If agents `K` ≠ 8, map `K` agents to lanes (split a lane into sub-areas when `K` > lane count). Honor any lane override from the message.
2. **Resolve paths.** For each lane, get exact repo paths from [`repo-router.mdc`](../../../.cursor/rules/repo-router.mdc) so subagents look in the right place.
3. **Launch the swarm.** In **one** assistant turn, fire 8 parallel `Task` calls (`subagent_type: explore`, `readonly: true`, `model: <luna>`), one lane each, using the scan prompt below.
4. **Persist raw reports.** Write each returned report verbatim to `.cursor/swarms/runs/<YYYY-MM-DD_HHMM>/r<r>-<lane-slug>.md`. Then `npm run clean:scratch:apply` so `runs/` stays at the 3 newest / ≤14 days.
5. **Distill via one subagent, not yourself.** Fire a single readonly `<luna>` task pointed at `runs/<ts>/r<r>-*.md` **and** `.cursor/swarms/FINDINGS.md`, asking for **at most 5** new high-value rows. This keeps older rounds out of the parent context.
6. **Round note.** Update `runs/<ts>/index.md` with one line per lane (top pick + confidence).

### Falsification round

1. **Pick targets.** Unverified `A#` findings in `FINDINGS.md`, highest impact first, max 8. One agent per finding — never two agents on the same finding.
2. **Launch.** Parallel `Task` calls (`subagent_type: explore`, `readonly: true`, `model: <luna>`) with the falsification prompt below.
3. **Apply verdicts.** `falsk` → delete the row from `FINDINGS.md`. `bekräftad` → append `✔` to its id. `oklar` → leave as is; it is now spent and will not be falsified again.
4. **Round note.** One line per finding in `runs/<ts>/index.md`: id, verdict, and the one-line reason (the reason for a deleted row only survives here).

After the last round, give the user a short summary table: rounds by type, lanes covered, new `A#` findings by prio, how many were falsified away, and a pointer to `FINDINGS.md`.

### Value filter (what gets into FINDINGS.md)

Prioritize, in order: P0/P1 runtime regressions, false-green gates (verify/quality-gate/promote/status), cross-tenant/data-loss, security, broken LLM-pipeline contracts → then dead code, naming overlap/shadowing, optimizations, test gaps, doc/glossary drift. Drop low-value noise (style nits, speculative ideas without an anchor).

## Lane rotation table

The orchestrator rotates through these. Slugs are used in filenames.

| #   | Lane                     | Primärt område                                                                                       |
| --- | ------------------------ | ---------------------------------------------------------------------------------------------------- |
| 1   | `frontend/first-page`    | landing/start (`src/app/`), hydration, blank screen, imports                                         |
| 2   | `frontend/builder`       | builder UI/chat (`src/app/builder/`, `src/components/builder/`, `src/lib/hooks/chat/`)               |
| 3   | `frontend/preview`       | preview-panel (`src/components/builder/preview-panel/`, `src/lib/gen/preview/`)                      |
| 4   | `frontend/navigation`    | routes, länkar, 404, guards (`src/app/`)                                                             |
| 5   | `backend/api-routes`     | API-kontrakt, timeouts, auth (`src/app/api/**`)                                                      |
| 6   | `backend/db-tenant`      | queries, RLS, schema drift (`src/lib/db/**`, `src/lib/tenant.ts`)                                    |
| 7   | `backend/env-config`     | env-namn, saknade vars, prod/dev-paritet (`src/lib/env.ts`, `config/env-policy.json`, `docs/ENV.md`) |
| 8   | `ai-flow/init-llm`       | init-generering (`src/lib/gen/`, `src/lib/providers/own-engine/`)                                    |
| 9   | `ai-flow/follow-up`      | follow-up/repair/edit (`src/lib/gen/stream/`, follow-up-orchestration)                               |
| 10  | `ai-flow/fidelity2-vs-3` | F2 vs F3 gating (`src/lib/gen/verify/`, finalize-design)                                             |
| 11  | `quality/dead-code`      | oanvända exports, orphan-filer, död kod                                                              |
| 12  | `quality/naming-overlap` | dubbelnamn, skuggning, drift mot `docs/architecture/glossary.md`                                     |
| 13  | `quality/tests`          | testluckor, false-green                                                                              |
| 14  | `ops/github-vercel-bots` | missade fynd från Codex/Vercel/Bugbot PR-kommentarer + `BUG-SWARM-BACKLOG.md`-luckor                 |

## Prompt templates

### Scan agent

Fill `{LANE}`, `{PATHS}` and pass to each `Task`:

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

### Falsification agent

One per finding. Fill `{ID}`, `{FYND}`, `{ANKARE}`:

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

`falsk` requires evidence, not absence of proof. No evidence either way is `oklar`.

### Distill agent

One per scan round:

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

## Anti-patterns

- Running rounds without parallel `Task` calls within a round (misses the volume point).
- Giving all agents the same lane (duplicate reports — distinct lanes are required).
- `readonly: false` on any audit agent, or any code/git change (this is audit mode).
- Writing findings anywhere but `.cursor/swarms/`, or auto-appending to `BUG-SWARM-BACKLOG.md`.
- Dumping low-value noise into `FINDINGS.md` — only curated, anchored, high-value findings.
- Doing the cross-round dedup yourself by re-reading `FINDINGS.md` and old `runs/` files — that is what the distill agent exists to keep out of your context.
- Re-falsifying an `oklar` finding in a later round, or scanning two rounds in a row while unverified findings pile up.

## Related

- Command: [`.cursor/commands/automat.md`](../../../.cursor/commands/automat.md)
- Output folder: [`.cursor/swarms/README.md`](../../../.cursor/swarms/README.md)
- Single-question variant: [`818-swarm-decide`](../818-swarm-decide/SKILL.md) — one topic → decision → minimal fix → review.
- Promote a confirmed defect: `/buggrapport` → `BUG-SWARM-BACKLOG.md`.
