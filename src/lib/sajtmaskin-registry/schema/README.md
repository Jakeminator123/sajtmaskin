# Vendored shadcn registry schemas

Verbatim copies of the official shadcn JSON schemas, used by
`../registry.test.ts` to validate every served `@sajtmaskin` payload offline
(no network in tests).

| File | Source | Fetched |
|---|---|---|
| `registry.schema.json` | <https://ui.shadcn.com/schema/registry.json> | 2026-07-22 |
| `registry-item.schema.json` | <https://ui.shadcn.com/schema/registry-item.json> | 2026-07-22 |

Both are JSON Schema draft-07. `registry.schema.json` `$ref`s the item schema
by absolute URL; the test registers the vendored copy under that URL so the
ref resolves offline. Re-vendor with:

```sh
curl -fsSL https://ui.shadcn.com/schema/registry.json -o src/lib/sajtmaskin-registry/schema/registry.schema.json
curl -fsSL https://ui.shadcn.com/schema/registry-item.json -o src/lib/sajtmaskin-registry/schema/registry-item.schema.json
```
