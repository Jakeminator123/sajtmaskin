# `src/lib/sajtmaskin-registry` — internal @sajtmaskin registry

**Purpose:** Sajtmaskin's own shadcn-compatible registry (Fas 6 of plan
`2026-07-22-shadcn-registry-beskriv-komposition.md`). Curated, proven blocks
from the scaffold library, served as shadcn registry items so the shadcn
CLI/MCP, the resolver, and the Beskriv/insert lane can consume them as
`@sajtmaskin/<name>`.

**Endpoints** (served by `src/app/r/[name]/route.ts` — static JSON from
committed files, no DB):

| URL | Payload |
|---|---|
| `GET /r/registry.json` | Registry index (required by the shadcn CLI/MCP) — items without file content |
| `GET /r/{name}.json` | One registry item with inlined file content |

Registered in `components.json` under `registries` as
`"@sajtmaskin": "https://sajtmaskin.vercel.app/r/{name}.json"` (guarded by
`src/lib/shadcn/components-json.test.ts`).

**Layout**

| Path | Role |
|---|---|
| `registry.ts` | Item metadata (canonical owner) + index/item builders. Reads block files via fs at request time (same pattern as `loadScaffoldFiles`; traced via `outputFileTracingIncludes` in `next.config.ts`). |
| `blocks/*.tsx` | The actual block source files — real, typechecked TSX in this repo (`npm run typecheck` covers them). Ignored by knip (fs-read, not imported). |
| `schema/` | Vendored shadcn JSON schemas used by the validation test (see `schema/README.md` for provenance). |
| `registry.test.ts` | Schema validation (ajv against vendored schemas) + self-containment guard (every import covered by `dependencies`/`registryDependencies`/own files). |

**Invariant (the plan's kärnprincip):** every item must be self-contained — an
inserted item must compile and render in the generated user site. All imports
must be covered by `dependencies`, `registryDependencies`, or files included
in the item. Tailwind theme tokens (`bg-primary`, `text-foreground`, …) that
the scaffolds already use are OK.

**Adding an item:** add the block file under `blocks/`, add its definition in
`registry.ts` (`ITEM_DEFINITIONS`), keep `registryDependencies` in sync with
the file's `@/components/ui/*` imports, and run
`npx vitest run src/lib/sajtmaskin-registry src/app/r`.
