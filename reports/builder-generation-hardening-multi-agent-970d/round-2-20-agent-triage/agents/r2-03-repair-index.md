## R2-03 — repairPassIndex / stale errors

### Verdict

**Confirmed.** In-place repairs use `repairPassIndex: targetVersionId ? 1 : 0`, while pruning only deletes rows with lower index. A second clean repair at index `1` cannot remove first-repair rows also indexed `1`.

### Evidence

| File | Evidence |
|------|----------|
| `src/lib/providers/own-engine/generation-stream.ts` | `repairPassIndex: targetVersionId ? 1 : 0` |
| `src/lib/db/services/version-errors.ts` | prune condition: `meta.repairPassIndex < currentRepairPassIndex` |
| `src/lib/gen/stream/finalize-version/runner.ts` | writes logs, then calls clean-repair prune with same index |

### Severity / confidence

**P1/P2**, **90%**. User-visible stale `Fel` rows after repeated repairs.

### Minimal fix idea

Make repair index monotonic per `versionId`, or prune by current `logPassId` / pass family instead of `< index`.

### Triage tags

`repair`, `status`, `stale-errors`

**Model:** composer-2-fast
