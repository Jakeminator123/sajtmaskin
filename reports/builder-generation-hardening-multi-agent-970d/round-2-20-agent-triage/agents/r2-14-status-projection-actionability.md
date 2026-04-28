## R2-14 — status projection actionability

### Verdict

Actionable, not just aspirational: projection exists and is tested, but no client-visible event transport is wired to builder surfaces.

### Evidence

- `event-bus-projection.ts` says it can run on server/client from SSE or polling.
- No production import of `selectVersionStatus` outside tests/docs.
- No API route exposing `event-bus.readAll` / events to the browser was found.
- `VersionHistory` / `BuilderShellContent` use DB lifecycle flags.

### Severity / confidence

Severity **P2**, confidence **high**. Needs API/SSE transport, so larger than a one-line UI swap.

### Minimal fix idea

Expose version events or precomputed projected status; use DB flags as fallback until events hydrate.

### Triage tags

`status-truth`, `ui`, `event-bus`, `transport-needed`

**Model:** composer-2-fast (subagent)
