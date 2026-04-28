# R2-20 — triage scoring rubric

## Verdict

Use score = `severity × confidence × corroboration`.

| Component | Scale |
|-----------|-------|
| Severity | P1 = 4, P2 = 3, P3 = 2, info = 1 |
| Confidence | `confidence% / 100`, clamped to 0.35-0.98 |
| Corroboration | `1 + 0.25 × (n - 1)`, cap 1.75 |

## Downrank / uprank rules

- Singleton under 70% confidence: multiply final score by 0.85.
- Count only independent agents that cite the same mechanism, not just the same symptom.
- Repeated P1 findings become `blocker-candidate` tags, not automatic code blockers.

## Example clusters

| Cluster | Example score |
|---------|---------------|
| Mode split-brain | 5.40 |
| Snapshot briefSummary null | 4.60 |
| Repair index stale error rows | 4.40 |
| Status projection unused | 4.65 |
| Lineage/dump prompt-shaping omissions | 3.45 |

## Triage tags

`mode-split-brain`, `snapshot-integrity`, `repair-semantics`, `status-truth`, `variant-planner-drift`, `route-freeze-delta`, `merge-regression`, `prompt-budget`, `observability-gap`, `ui-lifecycle`, `policy-fast-path`.

**Model:** composer-2-fast (subagent)
