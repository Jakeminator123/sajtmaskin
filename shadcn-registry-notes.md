# Shadcn registry blocks: sajtmaskin vs sajtgen

## Current state in sajtmaskin
- Init modal only supports GitHub and ZIP sources.
- There is no `/api/v0/chats/init-registry` endpoint.
- `src/lib/v0/v0-generator.ts` does not expose an `initFromRegistry()` helper.
- `src/lib/v0/v0-url-parser.ts` already understands registry URLs, but it is unused.

## What sajtgen does
- Adds a "blocks" source in the import modal that builds a registry URL.
- Calls `/api/v0/chats/init-registry` to initialize from a registry item.
- Implements `initFromRegistry()` that calls `v0.chats.init({ type: "registry" })`.

## Impact
Without the registry init flow, sajtmaskin cannot pull shadcn blocks from the registry.
It can only generate from prompt or import a repo/ZIP.

## Minimal additions to match sajtgen
- Add a "blocks" option in the import modal and call `/api/v0/chats/init-registry`.
- Add the `init-registry` API route with validation and DB persistence.
- Add `initFromRegistry()` to `src/lib/v0/v0-generator.ts` and reuse existing URL parsing.
