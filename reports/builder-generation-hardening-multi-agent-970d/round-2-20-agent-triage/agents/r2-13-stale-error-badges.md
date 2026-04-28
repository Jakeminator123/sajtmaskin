# R2-13 — stale error badges

**Verdict:** confirmed duplicate/reinforcement of repair-index finding.

| Field | Value |
|-------|-------|
| Severity | P1/P2 depending UI impact |
| Confidence | 90% |
| Cluster | `repair-index-stale-errors` |
| Tags | `repair`, `status`, `error-log` |

## Evidence

- `generation-stream.ts` uses `repairPassIndex: targetVersionId ? 1 : 0`.
- `version-errors.ts` prunes only rows with `meta.repairPassIndex < currentRepairPassIndex`.
- Error-log API returns all rows for a `versionId`; stale rows can remain if multiple repairs share index `1`.

## Minimal fix

Use monotonic pass index per `versionId` or prune by current `logPassId` / pass family on clean repair.

**Model:** composer-2-fast (subagent)
