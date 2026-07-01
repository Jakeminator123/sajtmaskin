---
name: automat-swarm
description: >-
  Runs N sequential read-only audit swarms (default 3), each launching 8 cheap Composer subagents that hunt bugs, dead code, naming overlaps, improvements, optimizations, test gaps and security/drift across rotating repo lanes. The orchestrator distills every round into one separate, gitignored findings list (.cursor/swarms/FINDINGS.md) for the user to triage later. Use when the user runs /automat, says "automat", or wants repeated high-volume read-only audit swarms. Audit mode only — never fixes code, never touches git.
---

# Automat — sequential audit swarms

A **report factory**: the orchestrator (the main agent running `/automat`) launches repeated rounds of cheap read-only subagents, collects their short reports, and curates the most valuable findings into one separate local list. This is **audit mode**, strictly separated from fix mode.

## Trigger & argument parsing

- `/automat` → **3** rounds, **8** agents per round.
- `/automat <N>` → **N** rounds, 8 agents per round.
- Agent override: `/automat <N> agenter=<K>` (or natural language in the same message, e.g. "med 12 agenter").
- Lane override: if the message names areas ("bara backend", "fokus preview/env"), use those instead of rotation. Otherwise **rotate** through the lane table below.
- Rounds run **sequentially**; the 8 (or K) agents **within** a round run in **parallel**.

## Hard rules

1. **Read-only.** Every subagent is `readonly: true`. No subagent and not the orchestrator may change product code.
2. **No git.** No commit/branch/checkout/push. Writing to `.cursor/swarms/` is safe because it is gitignored (no HEAD movement, no worktree needed).
3. **Write only to `.cursor/swarms/`.** Raw reports → `runs/<ts>/`, curated findings → `FINDINGS.md`. Nothing else is written.
4. **Never auto-touch `BUG-SWARM-BACKLOG.md`.** Promotion of a confirmed finding is a separate manual `/buggrapport` step.
5. **Keep volume cheap.** Use `composer-2.5-fast` for subagents (high volume, low cost); `composer-2.5` only if a lane needs more reasoning.

## Per-round workflow

For each round `r` of `N` (sequential):

1. **Pick lanes.** Take the next 8 lanes from the rotation cursor (wrap around the table). Round 1 = lanes 1–8, round 2 = lanes 9–13 then 1–3, etc. If agents `K` ≠ 8, map `K` agents to lanes (split a lane into sub-areas when `K` > lane count). Honor any lane override from the message.
2. **Resolve paths.** For each lane, get exact repo paths from [`repo-router.mdc`](../../rules/repo-router.mdc) so subagents look in the right place.
3. **Launch the swarm.** In **one** assistant turn, fire 8 parallel `Task` calls (`subagent_type: explore`, `readonly: true`, `model: composer-2.5-fast`), one lane each, using the prompt template below.
4. **Persist raw reports.** Write each returned report verbatim to `.cursor/swarms/runs/<YYYY-MM-DD_HHMM>/r<r>-<lane-slug>.md`.
5. **Distill → `FINDINGS.md`.** Append only high-value findings (filter below), dedup by `fil:rad` anchor + similarity, assign `A#<n>` ids.
6. **Round note.** Update `runs/<ts>/index.md` with one line per lane (top pick + confidence).

After the last round, give the user a short summary table: rounds, lanes covered, new `A#` findings count by prio, and a pointer to `FINDINGS.md`.

### Value filter (what gets into FINDINGS.md)

Prioritize, in order: P0/P1 runtime regressions, false-green gates (verify/quality-gate/promote/status), cross-tenant/data-loss, security, broken LLM-pipeline contracts → then dead code, naming overlap/shadowing, optimizations, test gaps, doc/glossary drift. Drop low-value noise (style nits, speculative ideas without an anchor).

## Lane rotation table

The orchestrator rotates through these. Slugs are used in filenames.

| # | Lane | Primärt område |
|---|------|----------------|
| 1 | `frontend/first-page` | landing/start (`src/app/`), hydration, blank screen, imports |
| 2 | `frontend/builder` | builder UI/chat (`src/app/builder/`, `src/components/builder/`, `src/lib/hooks/chat/`) |
| 3 | `frontend/preview` | preview-panel (`src/components/builder/preview-panel/`, `src/lib/gen/preview/`) |
| 4 | `frontend/navigation` | routes, länkar, 404, guards (`src/app/`) |
| 5 | `backend/api-routes` | API-kontrakt, timeouts, auth (`src/app/api/**`) |
| 6 | `backend/db-tenant` | queries, RLS, schema drift (`src/lib/db/**`, `src/lib/tenant.ts`) |
| 7 | `backend/env-config` | env-namn, saknade vars, prod/dev-paritet (`src/lib/env.ts`, `config/env-policy.json`, `docs/ENV.md`) |
| 8 | `ai-flow/init-llm` | init-generering (`src/lib/gen/`, `src/lib/providers/own-engine/`) |
| 9 | `ai-flow/follow-up` | follow-up/repair/edit (`src/lib/gen/stream/`, follow-up-orchestration) |
| 10 | `ai-flow/fidelity2-vs-3` | F2 vs F3 gating (`src/lib/gen/verify/`, finalize-design) |
| 11 | `quality/dead-code` | oanvända exports, orphan-filer, död kod |
| 12 | `quality/naming-overlap` | dubbelnamn, skuggning, drift mot `docs/architecture/glossary.md` |
| 13 | `quality/tests` | testluckor, false-green |
| 14 | `ops/github-vercel-bots` | missade fynd från Codex/Vercel/Bugbot PR-kommentarer + `BUG-SWARM-BACKLOG.md`-luckor |

## Subagent prompt template

Fill `{LANE}`, `{PATHS}`, `{TS}`, `{ROUND}` and pass to each `Task`:

```text
You are a cheap READ-ONLY auditor for the Sajtmaskin repo. Lane: {LANE}.
Look ONLY in: {PATHS}. Code is source of truth.

Hunt for (any that apply): Bug, Dead code, Naming overlap/shadowing, Improvement,
Optimization, Test gap, Security, Drift vs docs/architecture/glossary.md.

Rules: read-only (do NOT edit anything). Be concrete. Cite fil:rad anchors.
No prose, no preamble. Max ~10 lines total. Skip findings you can't anchor.

Return EXACTLY this table (drop the example row), best findings first:

| # | Typ | Fynd (fil:rad) | Impact | Konfidens | Fix |
|---|-----|----------------|--------|-----------|-----|
| 1 | Bug | kort fynd (src/...:rad) | 80% | 70% | S |

Then ONE line: "Nästa: <smalt nästa steg för det viktigaste fyndet>".
```

## Anti-patterns

- Running rounds without parallel `Task` calls within a round (misses the volume point).
- Giving all agents the same lane (duplicate reports — distinct lanes are required).
- `readonly: false` on any audit agent, or any code/git change (this is audit mode).
- Writing findings anywhere but `.cursor/swarms/`, or auto-appending to `BUG-SWARM-BACKLOG.md`.
- Dumping low-value noise into `FINDINGS.md` — only curated, anchored, high-value findings.

## Related

- Command: [`.cursor/commands/automat.md`](../../commands/automat.md)
- Output folder: [`.cursor/swarms/README.md`](../../swarms/README.md)
- Single-question variant: [`818-swarm-decide`](../818-swarm-decide/SKILL.md) — one topic → decision → minimal fix → review.
- Promote a confirmed defect: `/buggrapport` → `BUG-SWARM-BACKLOG.md`.
