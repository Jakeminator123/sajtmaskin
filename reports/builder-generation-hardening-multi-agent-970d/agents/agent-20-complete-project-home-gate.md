## Agent 20 — Post-merge assembly vs home char gate

### Code path

`repairGeneratedFiles` → … → `completeProjectFiles = repairGeneratedFiles(buildCompleteProject(..., collectRequiredUiComponents(...)))` → `buildMissingHomeRouteIssue(findHomePageFile(completeProjectFiles))`.

### Could UI injection reduce measured chars?

- `collectRequiredUiComponents` muterar inte `page`.  
- `buildCompleteProject` ändrar inte `app/page.tsx` innehåll (annat än edge package/tsconfig).  
- `repairGeneratedFiles` *kan* sällan minska kropp — **~70%** möjligt, **~85%** sällan primär orsak till <200.

### Confidence (%)

**~92%** att UI-injection inte förkortar home avsiktligt.

### Improvements

- Logga `measureRenderedContentLength` före/efter assembly vid debug.

**Model:** composer-2-fast (subagent)
