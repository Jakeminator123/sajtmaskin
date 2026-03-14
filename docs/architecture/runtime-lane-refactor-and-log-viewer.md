# Runtime Lane Refactor And Log Viewer

This document summarizes the runtime-lane refactors completed on `Refactor`
after the original preview split, plus the lightweight local `/logg` viewer
that makes the prompt/runtime flow easier to inspect during `npm run dev`.

## What changed

### 1. Preview modularization

The previous `src/lib/gen/preview.ts` monolith was split into a dedicated
`src/lib/gen/preview/` directory with focused modules for:

- constants and shared types
- path and route utilities
- import parsing
- file resolution
- transpilation
- CSS handling
- shims
- script building
- public preview exports

This reduced the amount of mixed responsibility inside one file and made the
preview layer more testable.

### 2. Finalizer atomization

`src/lib/gen/stream/finalize-version.ts` was reduced into a thinner public
coordinator while keeping `finalizeAndSaveVersion()` as the only public
entrypoint.

Internal phase helpers now own the main private stages:

- `src/lib/gen/stream/finalize-merge.ts`
- `src/lib/gen/stream/finalize-preflight.ts`
- `src/lib/gen/stream/finalize-preflight-logs.ts`

The purpose of this split was not to change behavior, but to separate:

- merge behavior for first generation vs follow-up generation
- post-merge preflight and sanity checks
- preflight log bundle construction

### 3. Shared own-engine stream helpers

The two own-engine stream routes still keep their route-specific control flow,
but they now share a narrow helper layer in:

- `src/lib/gen/stream/shared-own-engine-helpers.ts`

The extracted helpers cover the duplicated low-risk pieces:

- preview text buffering
- incomplete JSON detection
- tool name extraction
- unsignaled integration detection
- finalize-or-empty-output handling

This intentionally avoids a broad opaque shared runner until route-level test
coverage improves.

### 4. Local `/logg` viewer

A lightweight local viewer was added for development:

- page routes:
  - `src/app/log/page.tsx`
  - `src/app/logg/page.tsx`
- viewer UI:
  - `src/app/log/log-viewer.tsx`
- local dev-log API:
  - `src/app/api/dev-log/route.ts`
- file reader:
  - `src/lib/logging/dev-log-reader.ts`

This viewer reads:

- `logs/sajtmaskin-local.log`
- `logs/sajtmaskin-local-document.txt`

It gives a simple dev-time timeline of the runtime flow, slug filtering, and a
best-effort view of prompt logs when the admin prompt-log API is available.

## Why the system is better now

### Thinner coordinators

The runtime lane now has clearer coordinator boundaries. The public
entrypoints still exist where callers expect them, but private phases are easier
to inspect and change safely.

### Less duplicated logic

Shared own-engine stream behavior now lives in one helper module instead of
being hand-copied in two large routes.

### Better test protection

The refactors were paired with stronger characterization and helper tests, so
future refactors are less likely to change semantics by accident.

### Better local observability

The `/logg` route makes the prompt/runtime flow visible during local
development, reducing the need to inspect raw files manually.

## Intentional defer

`src/lib/gen/preview/shims.ts` remains large. It was explicitly deferred
instead of being split in the same run, because:

- preview behavior was already stabilized by the earlier preview split
- finalizer and stream boundaries had higher runtime payoff
- route test protection is still thinner than ideal

## Recommended next steps

If runtime-lane work continues, the next reasonable steps are:

1. Add stronger direct tests around the two own-engine stream routes.
2. Continue helper-first extraction in the stream routes before attempting a
   larger shared runner.
3. Revisit `src/lib/gen/preview/shims.ts` only after the stream lane has
   stronger safety rails.
