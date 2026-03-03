# Bug Review Report: Plans 3, 4, 5

## Plan 3: v0 Env Vars Proper SDK

### `src/lib/v0/v0-env-vars.ts`

| Check | Result |
|-------|--------|
| Missing imports | ✅ None |
| Type mismatches | ⚠️ **Minor**: `decrypted: "true"` is passed as string; the v0 SDK may expect `boolean`. The plans doc specifies string. The env-vars route (`[projectId]/env-vars/route.ts`) does not pass `decrypted` at all—inconsistency is acceptable if deploy needs decrypted values. |
| Logic errors | ✅ None found |
| Error handling | ✅ Returns `{}` on missing client, synthetic project IDs, and normalizes various response shapes. |

### `src/app/api/v0/deployments/route.ts`

| Check | Result |
|-------|--------|
| Missing imports | ✅ `fetchV0ProjectEnvVars` imported from `@/lib/v0/v0-env-vars` |
| Logic / usage | ✅ Env vars fetched only when `chat.v0ProjectId` exists, wrapped in try/catch (non-fatal). |
| Await usage | ✅ `await fetchV0ProjectEnvVars(chat!.v0ProjectId)` |

**Plan 3 verdict**: Clean, no critical bugs.

---

## Plan 4: Deploy SSE via Webhooks

### `src/lib/redis-pubsub.ts`

| Check | Result |
|-------|--------|
| `lazyConnect: true` | ✅ Uses `lazyConnect: true` |
| `connect()` before publish/subscribe? | ✅ **No explicit call needed**: ioredis connects on first command. |
| Connection cleanup | N/A — factory returns new instances; callers responsible for disconnect. |

### `src/app/api/v0/deployments/[deploymentId]/events/route.ts` (SSE)

| Check | Result |
|-------|--------|
| Client disconnect handling | ✅ `req.signal.addEventListener("abort", ...)` calls `close()`, `sub.unsubscribe()`, `sub.disconnect()`. |
| Redis subscriber cleanup | ✅ On abort and on terminal status: `unsubscribe`, `disconnect`, `close`. |
| **BUG #1** | 🐛 **On Redis `subscribe()` failure**: `.catch(() => { sub.disconnect(); })` disconnects Redis but never calls `close()`. The stream stays open and the client waits indefinitely. **Fix**: call `close()` inside the catch. |
| Duplicate abort listeners | ⚠️ Lines 75–77 and 103–106 both add abort listeners. Redundant but not incorrect. |
| Poll fallback | ✅ `closed` checked each iteration; abort triggers `close()`. No leak. |

### `src/lib/hooks/useDeploymentStatus.ts`

| Check | Result |
|-------|--------|
| EventSource closed on unmount | ✅ Cleanup returns `() => { es.close(); esRef.current = null; }`. |
| `deploymentId` null handling | ✅ Early return; no EventSource created. Previous ES closed when deps change. |
| Terminal status handling | ✅ Closes EventSource on `ready`, `error`, `cancelled`. |

### `src/app/api/webhooks/vercel/route.ts`

| Check | Result |
|-------|--------|
| Publisher connect/disconnect | ⚠️ **BUG #2**: If `pub.publish()` throws, `pub.disconnect()` is never called. Connection can leak. **Fix**: use `try/finally { pub?.disconnect(); }`. |

### `src/app/builder/useBuilderState.ts`

| Check | Result |
|-------|--------|
| `activeDeploymentId` state | ✅ `useState<string \| null>(null)` and setter exposed. |

### `src/app/builder/useBuilderDeployActions.ts`

| Check | Result |
|-------|--------|
| Capturing deployment ID | ✅ `returnedDeploymentId = data?.id` (internal ID); `setActiveDeploymentId(returnedDeploymentId)`. Correct. |

### `src/app/builder/useBuilderPageController.ts`

| Check | Result |
|-------|--------|
| Wiring useDeploymentStatus | ✅ `useDeploymentStatus(state.activeDeploymentId)`; status/url/inspectorUrl passed through. |

**Plan 4 verdict**: 2 bugs found (SSE subscribe failure, webhook disconnect).

---

## Plan 5: Template Search UI

### `src/lib/templates/template-search.ts`

| Check | Result |
|-------|--------|
| `TemplateSearchResult` type | ✅ `{ template: TemplateCatalogItem; score: number }`. Compatible with client. |
| Imports / logic | ✅ No issues. |

### `src/components/builder/UnifiedElementPicker.tsx`

| Check | Result |
|-------|--------|
| Debounce cancel on cleanup | ✅ `clearTimeout(timer)` in cleanup; `cancelled` flag prevents setState after unmount. |
| Component unmount | ✅ `cancelled = true` in cleanup; fetch handler checks `cancelled` before setState. |
| Race conditions | ✅ Each effect has its own `cancelled`. Stale fetches do not update state. |
| AbortController | ⚠️ **Minor**: Fetch is not aborted; in-flight requests complete but are ignored via `cancelled`. No leak; slightly wasteful. |
| Result rendering | ✅ Uses `result.template.id`, `result.template.title`, `result.template.category`, `result.template.previewImageUrl` — all on `TemplateCatalogItem`. |
| `handleSearchResultSelect` | ✅ `getTemplateById(item.template.id)` — ids align between catalog and template-data. |

### `src/app/api/templates/search/route.ts`

| Check | Result |
|-------|--------|
| Logic / validation | ✅ Validates query, trims, limits; returns `{ success: true, results }`. |
| Await usage | ✅ `await searchTemplates(query, topK)`. |

**Plan 5 verdict**: Clean, no critical bugs.

---

## Summary

| Severity | Count | Items |
|----------|-------|-------|
| **Bugs** | 2 | SSE subscribe failure not closing stream; webhook publisher disconnect on error |
| **Minor** | 3 | decrypted type, duplicate abort listeners, no AbortController for template search |

---

## Recommended Fixes

### Fix 1: SSE route — close stream when Redis subscribe fails

```ts
// events/route.ts
sub.subscribe(channel).catch(() => {
  sub.disconnect();
  close();  // ADD: terminate the stream
});
```

### Fix 2: Webhook — ensure Redis publisher always disconnects

```ts
// webhooks/vercel/route.ts
let pub: Redis | null = null;
try {
  pub = createRedisPublisher();
  if (pub) {
    await pub.publish(
      deployStatusChannel(deploymentId),
      JSON.stringify({ status, url, inspectorUrl, projectId }),
    );
  }
} catch (pubErr) {
  console.warn("[webhook] Redis publish failed (non-fatal):", pubErr);
} finally {
  pub?.disconnect();
}
```
