## Agent 02 — HOME_ROUTE_RECOVERY vs trivial home

### Sources

- `src/lib/gen/stream/finalize-preflight.ts` — `findHomePageFile`, `buildMissingHomeRouteIssue`, `measureRenderedContentLength`, `tryRecoverMissingHomeRoute`, `runFinalizePreflight` (home recovery call site + post-`completeProjectFiles` gate)

### Code behavior

**Does `tryRecoverMissingHomeRoute` run when `app/page.tsx` exists but is trivial (~199 chars)?**  
**No.** Recovery bails out as soon as a home file is present on either canonical path:

```236:237:src/lib/gen/stream/finalize-preflight.ts
  if (findHomePageFile(params.files)) {
    return { files: params.files, recovered: false, attempted: false };
```

`findHomePageFile` only checks membership of `app/page.tsx` / `src/app/page.tsx` in the merged set — not size or quality.

**What happens instead (after `completeProjectFiles`)?**  
A separate hard gate uses `measureRenderedContentLength` vs `HOME_PAGE_MIN_RENDERED_CHARS` (200). Under 200 → blocking `code_structure_failure` error via `buildMissingHomeRouteIssue`; no LLM recovery is triggered from that path in this file.

### Gap analysis

| Aspect | `HOME_ROUTE_RECOVERY` (`tryRecoverMissingHomeRoute`) | Trivial home (`buildMissingHomeRouteIssue`) |
|--------|------------------------------------------------------|---------------------------------------------|
| Trigger | Home file **absent** from canonical paths | Home file **present** but stripped length **< 200** |
| Action | `runLlmRepairGate` to emit `app/page.tsx` | **Block** with error only (no automatic repair in this module) |
| Plan name vs behavior | Name suggests “recover home route” broadly | Implementation is **missing-file** recovery only; trivial home is **gate-only**, not recovery |

So the gap vs a plan item that treats “HOME_ROUTE_RECOVERY” as fixing **all** bad home states: **trivial-but-present** home never enters the recovery LLM path; it only hits the post-assembly gate and fails closed.

### Confidence (%)

**90%** — Logic in-file is explicit. **~10%** uncertainty only if “~199 chars” refers to a different metric than `measureRenderedContentLength`.

### Improvements

1. **Extend recovery** to run when `findHomePageFile` succeeds but `buildMissingHomeRouteIssue` would fire (trivial content), or add a second `runLlmRepairGate` pass keyed off that issue.  
2. **Rename or document** `HOME_ROUTE_RECOVERY` as “missing home file recovery” so it is not read as covering trivial/placeholder pages.  
3. **Optional:** After a successful trivial-home repair, re-run the same length check on `completeProjectFiles` to avoid scaffold/UI injection changing the measured body.

**Model:** composer-2-fast (subagent)
