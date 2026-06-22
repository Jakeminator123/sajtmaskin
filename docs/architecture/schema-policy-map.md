# Schema / policy / rule map

Human-readable companion to the machine-readable **control-plane** registries in
[`config/control-plane/`](../../config/control-plane/). It answers: *where does
authority X live, who enforces it, is it read at runtime, and is it safe to
move?* — without grepping the whole repo.

Code is always source of truth (see `AGENTS.md`). These registries are an
index/map, not a new enforcement layer. The validator
`npm run control-plane:check` keeps the map honest, and it is hard-gated in CI.

> For the **env** layers specifically (Sajtmaskin app env vs generated-site
> preview env, F2 vs F3, harmless vs tier3-stub placeholders, merge order) see
> the companion [`env-flow-map.md`](env-flow-map.md).

## The two registries

| Registry | Holds | File |
|----------|-------|------|
| Schema registry | Schemas + runtime-authority contracts (Zod / Drizzle / JSON Schema) | [`config/control-plane/schema-registry.json`](../../config/control-plane/schema-registry.json) |
| Policy registry | Policy / rule / config authorities (manifest fragments, config JSON, in-code policy modules) | [`config/control-plane/policy-registry.json`](../../config/control-plane/policy-registry.json) |

Both validate against
[`docs/schemas/strict/control-plane-registry.schema.json`](../schemas/strict/control-plane-registry.schema.json).
The entry shape and field meanings are documented in
[`config/control-plane/README.md`](../../config/control-plane/README.md). The two
fields that matter most:

- **`runtimeEnforced`** — does the app actually read/enforce this at runtime?
- **`runtimeStatus`** — `wired` = a runtime read-path consumes it; `declared-only`
  = present/validated but **NOT** wired to runtime; `n/a` = not a runtime concern
  (editor/CI/tooling mirror).

> `declared-only` never means "wired". Example: the `perTier*` fragments in
> `config/ai_models/manifest.json` are validated but unused by the pipeline —
> global `routeTimeouts` / `repairPolicies` / `briefing` apply at runtime.

## Where each kind of authority lives

| Kind (`type`) | Meaning | Lives in (examples) |
|---------------|---------|---------------------|
| `schema` | A contract/shape definition (Zod, JSON Schema, AJV) | `config/ai_models/manifest.schema.json`, `docs/schemas/strict/*.schema.json` |
| `runtime-authority` | Code that the app reads as the canonical truth at runtime | `src/lib/env.ts` (serverSchema), `src/lib/db/schema.ts` (Drizzle), `src/lib/validations/chatSchemas.ts`, scaffold/plan/integration TS |
| `policy` | Tunable rules/governance data (how the system behaves, not its shape) | `config/ai_models/manifest.json#…` fragments, `config/domain-rules.json`, `config/*.json`, in-code policy modules under `src/lib/**/...-policy.ts` |
| `rule` | Agent/tooling governance (not app runtime) | `.cursor/rules` (Cursor `*.mdc`) |

And the broader layers they sit in:

- **schema** — the shape/contract layer. Editor `$schema` mirrors and CI-only
  schemas are `runtimeStatus: n/a`; runtime-validated ones (dossier AJV) are `wired`.
- **policy / config** — `config/*.json` + manifest fragments. Some are `wired`
  (e.g. `repairPolicies`, `domain-rules`), some are `declared-only`
  (e.g. `perTier*`, `naming-dictionary`, `structural-file-priorities`).
- **rule** — `.cursor/rules` governs agents, never the app runtime.
- **runtime-authority** — the canonical code the app trusts: env, DB schema,
  request validation, scaffold/plan/integration manifests.
- **data** — runtime building blocks under `data/` (dossiers). These are *content*,
  validated by the dossier schema; see the layer note below.

## Dossiers vs scaffolds vs scaffold-variants — different layers, not duplicates

These three are easy to confuse but are **distinct layers**. They are not
alternative copies of each other:

| Layer | What it is | Source of truth | Schema/validator |
|-------|------------|-----------------|------------------|
| **Scaffolds** | The structural starting point of a generated app (routes, base files, build skeleton) | `src/lib/gen/scaffolds/<id>/manifest.ts` (TS, runtime-authority) | `npm run scaffolds:validate` |
| **Scaffold variants** | A *visual expression* of a scaffold (typography, palette, motif, prompt hints) — same structure, different look | `config/scaffold-variants/<scaffoldId>/*.json` | `docs/schemas/strict/scaffold-variant.schema.json` (editor mirror; runtime hand-parses in `registry.ts`) |
| **Dossiers** | Reusable *capability* building blocks injected into the codegen prompt (e.g. Stripe checkout, auth glue) | `data/dossiers/{hard,soft}/<id>/manifest.json` | `docs/schemas/strict/dossier.schema.json`, AJV in `src/lib/gen/dossiers/validate-manifest.ts` (`npm run dossiers:validate-all`) |

Mental model: a **scaffold** decides the app's skeleton, a **variant** restyles
that skeleton, and **dossiers** add capabilities on top. Changing one does not
imply changing the others, and none of them is a substitute for another.

## How to use the map

1. Looking for where a contract/policy lives → search the registries by `id` or
   `sourceOfTruth`.
2. Before moving/renaming a file → check `mobility` (`leave` = do not move) and
   `sourceOfTruth` glob/fragment references.
3. Before assuming a config value "does something" → check `runtimeEnforced` /
   `runtimeStatus`. `declared-only` means nothing reads it yet.
4. Adding a new authority → add an entry (all fields) and run
   `npm run control-plane:check` until green. See
   [`config/control-plane/README.md`](../../config/control-plane/README.md).
