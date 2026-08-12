# Control plane

This folder is the **control-plane surface**: a machine-readable inventory of
registered schemas, policies, rules and runtime authorities that govern
Sajtmaskin. It is exhaustive for `docs/schemas/strict/*.schema.json` and for the
known-authority sets enforced by `control-plane:check`; other in-code policies
are added as individual entries when they become maintained control-plane
surfaces. It exists so a future Backoffice v2 (and any agent) can answer "where
does registered authority X live, who enforces it, and is it safe to move?"
without treating a representative file or a catch-all glob as ownership proof.

The control plane does **not** add new enforcement. It is a registry/index that
points at the authority selected per fact type: executable behavior is owned by
code, while declarative decisions may be owned by a manifest, policy, registry
or schema. The precedence contract lives in
[`docs/documentation-lifecycle.md`](../../docs/documentation-lifecycle.md); the
generated registry view is never a second owner. A small validator
(`npm run control-plane:check`) keeps the index honest.

## Files

| File                                                     | Purpose                                                                                      |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `schema-registry.json`                                   | Schemas + runtime-authority contracts (Zod/Drizzle/JSON Schema).                             |
| `policy-registry.json`                                   | Policy / rule / config authorities (manifest fragments, config JSON, code policy modules).   |
| `docs/schemas/strict/control-plane-registry.schema.json` | JSON Schema (draft 2020-12) describing the entry shape; both registries validate against it. |

Each registry is an object: `{ "schemaVersion": 1, "entries": [ ... ] }`.

## Entry shape

Every entry has exactly these fields:

| Field             | Type                                                  | Meaning                                                                                                                                                                                                                                                                                               |
| ----------------- | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`              | string (kebab-case, unique across both registries)    | Stable identifier.                                                                                                                                                                                                                                                                                    |
| `sourceOfTruth`   | string (repo-relative path)                           | The authoritative file. May be a glob (`src/lib/gen/scaffolds/*/manifest.ts`) or a `file#fragment` (`config/ai_models/manifest.json#repairPolicies`).                                                                                                                                                 |
| `type`            | `schema` \| `policy` \| `rule` \| `runtime-authority` | What kind of authority this is.                                                                                                                                                                                                                                                                       |
| `validator`       | string \| null                                        | npm script that validates it (e.g. `db:schema-drift`), or `null` if none.                                                                                                                                                                                                                             |
| `validatorWaiver` | string (optional)                                     | Explicit justification allowing `runtimeEnforced: true` with a `null` `validator` (e.g. "validated structurally by a strict schema + test", or "hand-parsed, no standalone validator yet — tracked follow-up"). Required by the validator when `runtimeEnforced` is `true` and `validator` is `null`. |
| `ciStatus`        | `hard` \| `warn` \| `manual` \| `none`                | How CI treats it. `hard` = blocks, `warn` = non-blocking, `manual` = run by hand, `none` = no CI.                                                                                                                                                                                                     |
| `runtimeEnforced` | boolean                                               | **Is this actually read/enforced by the app at runtime?**                                                                                                                                                                                                                                             |
| `runtimeStatus`   | `wired` \| `declared-only` \| `n/a`                   | `wired` = a runtime read-path consumes it. `declared-only` = present + maybe validated but **NOT wired to runtime** (nothing in the app consumes it yet). `n/a` = not a runtime concern (editor/CI/tooling).                                                                                          |
| `backoffice`      | object                                                | `{ surface, editable, writePath, danger }` — where/if Backoffice exposes it.                                                                                                                                                                                                                          |
| `mobility`        | `safe` \| `risky` \| `leave`                          | Can this file be physically moved? `leave` = do not move (tooling/Cursor/runtime expects the path).                                                                                                                                                                                                   |
| `notes`           | string                                                | Free-form. **Required (non-empty) when `runtimeEnforced` is false** — explain why it is not a runtime read-path.                                                                                                                                                                                      |

### `runtimeEnforced` vs `runtimeStatus` (read this twice)

These two fields are the whole point of the map:

- `runtimeEnforced: true` + `runtimeStatus: wired` — the app genuinely reads and
  enforces this. Changing it changes behavior.
- `runtimeEnforced: false` + `runtimeStatus: declared-only` — the value exists
  (and may be schema-validated) but **no runtime code consumes it**. It is a
  declaration only. Such entries need an explicit reason and should be removed
  when they are speculative configuration rather than a maintained contract.
- `runtimeStatus: n/a` — not a runtime concern at all (editor `$schema` mirrors,
  CI-only term checks, the registry schema itself).

Never read `declared-only` as "wired". If you wire a `declared-only` authority
into runtime later, flip both fields and update the notes. Conversely, do not
keep speculative settings as false configuration surfaces: reintroduction
requires a real runtime owner and a focused test.

### `backoffice` object

```json
{
  "surface": "ai_models",
  "editable": true,
  "writePath": "config/ai_models/manifest.json",
  "danger": "low"
}
```

- `surface` — Backoffice page/section name, or `null` if not surfaced.
- `editable` — does Backoffice let a human edit it?
- `writePath` — the file Backoffice writes to (usually `sourceOfTruth` without the `#fragment`), or `null`.
- `danger` — `low` \| `medium` \| `high`: blast radius of a bad edit.

## How to add an entry

1. Pick the registry: schema/runtime-authority contracts → `schema-registry.json`;
   policy/rule/config authorities → `policy-registry.json`.
2. Add an object with **all** fields above. Use a unique kebab-case `id`.
3. Make `sourceOfTruth` a real repo-relative path (the validator asserts the base
   path exists on disk — globs must match ≥1 file, `#fragment` is stripped first).
4. If `runtimeEnforced` is `false`, write a `notes` string saying why.
5. If `ciStatus` is `hard`, `validator` must be non-null.
6. If `runtimeEnforced` is `true`, `validator` must be non-null **or** carry an
   explicit `validatorWaiver` explaining the structural guarantee (and ideally a
   tracked follow-up to add a real validator).
7. Run `npm run control-plane:check` until green.

## Validation

`npm run control-plane:check` (also run in CI) validates both registries against
the JSON Schema and enforces the cross-cutting rules above (existence of
`sourceOfTruth`, ids unique across both registries, exact one-row ownership for
every `docs/schemas/strict/*.schema.json`, hard-gate-needs-validator,
`runtimeEnforced` iff `runtimeStatus: wired`, runtime-wired-needs-validator-or-waiver,
declared-only-needs-notes, exact `backoffice.surface` parity with `PAGE_SPECS`,
expanded known-authority allowlists). A lightweight vitest
(`src/lib/control-plane/registry.test.ts`) covers the same invariants so
`npm run test:ci` catches drift too.

The matching-config policies `domain-rules` and `prompt-heuristic-tokens` name
`backoffice:test` as their validator: `npm run backoffice:test` runs the
backoffice Python suite (incl. `backoffice/test_validate_matching_config.py`,
which asserts the committed config stays valid against its strict schema), and a
dedicated **blocking** `backoffice-tests` CI job runs it on every push/PR.
The same blocking job validates every committed scaffold variant against
`docs/schemas/strict/scaffold-variant.schema.json`.
