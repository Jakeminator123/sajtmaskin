# Strict Schemas

This folder contains machine-oriented schema artifacts for Sajtmaskin.

Purpose:

- give dashboard/tooling a cleaner contract surface
- support parity tests and path validation
- stay diff-friendly and conservative
- enable editor autocomplete and inline validation for JSON config files

Rules:

- strict schema files must be backed by real code sources of truth
- strict schema files do **not** replace runtime truth in code
- prefer JSON or similarly machine-readable formats
- keep one concern per file

Conservative rollout:

- human-readable schema docs remain in `docs/schemas/*.md`
- new machine-oriented contract mirrors go here under `strict/`
- do not move the whole human layer into a `human/` subfolder unless the churn
  is justified and all references are updated together

## Available Schemas

| Schema | Validates | Source of truth |
|--------|-----------|-----------------|
| `scaffold-variant.schema.json` | `config/scaffold-variants/<scaffoldId>/*.json` | `src/lib/gen/scaffold-variants/types.ts` |
| `preview-session-contract.schema.json` | Preview session objects | See file |

### scaffold-variant.schema.json

Validates scaffold variant JSON files — the visual expressions (typography,
color palette, motif, prompt hints) that a scaffold can take.

**How to use in a variant file:**

```json
{
  "$schema": "../../../docs/schemas/strict/scaffold-variant.schema.json",
  "id": "my-variant",
  "scaffoldId": "landing-page",
  ...
}
```

Adding `$schema` gives you:

- **Autocomplete** in VS Code / Cursor for all fields
- **Inline validation** (red squiggles) for typos, wrong types, missing required fields
- **Hover docs** showing field descriptions

The schema enforces:

- Required fields: `id`, `scaffoldId`, `label`, `signatureMotif`, `colorMode`, `keywords`, `fontPairings`, `promptHints`
- `id` must be kebab-case
- `scaffoldId` must be one of the 10 known scaffold IDs
- Array length limits on all list fields
- `colorMode` restricted to `light` | `dark` | `either`

The schema does **not** replace runtime validation in `registry.ts` — it mirrors
it for editor tooling.
