# Runtime Scaffold Contract

Formyta för `ScaffoldManifest` och hur en scaffold-fil serialiseras till
prompten. Pick, pipeline och variantflöde ägs av
[`../contracts/scaffold-system.md`](../contracts/scaffold-system.md).
Aktuella id:n och inventarier: [`../generated/scaffolds.generated.md`](../generated/scaffolds.generated.md).

Kopiera inte `ScaffoldId`-unionen hit. Den ägs av
`src/lib/gen/scaffolds/types.ts`.

**Ruttkontrakt på manifestet:** `ScaffoldManifest` har inget eget route-fält.
`RoutePlan` är ett separat objekt från `src/lib/gen/route-plan/`. Provenance och
locale-dedupe dokumenteras i
[`orchestration-signal-contract.md`](orchestration-signal-contract.md) (lager
Route plan), inte här.

## Canonical ownership

| Faktatyp | Ägare |
| --- | --- |
| `ScaffoldManifest` / `ScaffoldFile` / `ScaffoldId` | `src/lib/gen/scaffolds/types.ts` |
| Registry | `src/lib/gen/scaffolds/registry.ts` |
| Manifestvalidering | `src/lib/gen/scaffolds/scaffold-manifest-validation.ts` |
| Prompt-serialisering (`role`, `serialization`, `maxPromptChars`) | `src/lib/gen/scaffolds/serialize.ts` |
| Skyddade utility-paths | `src/lib/gen/scaffolds/protected-paths.ts` (`SCAFFOLD_PROTECTED_PATHS`) |
| Klientprojektion | `src/lib/gen/scaffolds/scaffold-client-list.generated.ts` |
| Variants (design-axes, inte manifestfält) | `config/scaffold-variants/` + `docs/schemas/strict/scaffold-variant.schema.json` |

Do not confuse runtime scaffolds with `src/lib/templates/` (v0-mallar) or
external Vercel templates.

## Manifest fields

`ScaffoldManifest` fields (optional marked). Values and current ids live in
code / generated catalog, not here.

| Field | Required | Role |
| --- | --- | --- |
| `id` | yes | Canonical runtime identifier |
| `label` | yes | Human name |
| `description` | yes | Human summary |
| `structureProfile` | no | Baseline file/project shape |
| `contentProfile` | no | Domain/content direction |
| `siteKind` | no | `marketing` / `app` / `commerce` / `editorial` |
| `complexity` | no | `simple` / `medium` / `advanced` |
| `features` | no | Trait tags |
| `allowedBuildIntents` | yes | `website` / `app` / `template` |
| `tags` | yes | Match/search tags |
| `promptHints` | yes | Prompt guidance |
| `files` | yes | Starter files |
| `qualityChecklist` | no | Quality hints for the model |
| `research` | no | `upgradeTargets`, `referenceTemplates` |

Legacy stored plan payloads may still surface `scaffold.family` as an alias of
`scaffold.id`. Runtime `ScaffoldManifest` has no `family` field.

### `ScaffoldFile`

| Field | Required | Role |
| --- | --- | --- |
| `path` | yes | Project-relative path |
| `content` | yes | File body |
| `role` | no | Prompt role. When omitted, `defaultRoleForPath()` in `serialize.ts` |
| `serialization` | no | `full` / `excerpt` / `signature`. Default follows resolved role |
| `maxPromptChars` | no | Ceiling for `representativeLines` on excerpt, or when large `full` falls back to FileContract |

Roles: `root-layout` / `global-styles` / `config` / `route-page` /
`shared-component` / `api-route` / `default`.

### `ScaffoldResearchMetadata` / `ScaffoldReferenceTemplate`

`upgradeTargets`, `referenceTemplates[]` with `id`, `title`, `categorySlug`,
`qualityScore` (0..100), `strengths`. Research may enrich matching; it is not a
second registry.

## Serialization policy (Scaffold Contract V2)

`serialize.ts` renders each selected critical file from resolved
`(role, serialization)`:

| Resolved policy | What reaches the LLM |
| --- | --- |
| `full` | Verbatim content when small enough. Oversized `full` becomes FileContract, not truncated source |
| `excerpt` | A `FileContract` block (path, role, completeness, ownership, mustEmit, size, imports, exports, structure, capped `representativeLines`, rules). Not a source fence |
| `signature` | FileContract with imports/exports/structure only |

`FileContract` blocks are not executable source and must not be copied into
output. `## Critical Scaffold Files` is hard-capped to 6 000 characters
including the FileContract intro.

Default serialization by role: `full` for `root-layout` / `global-styles` /
`config`; `signature` for `shared-component` / `api-route`; `excerpt` otherwise.

## Validation (form)

`validateScaffoldManifest()` checks duplicate paths, required `app/globals.css`
and `app/layout.tsx`, recommended `app/page.tsx`, `qualityScore` in 0..100, and
V2 field enums (`role`, `serialization`, positive `maxPromptChars`). Warnings
exist for missing `@theme inline`, large total `files` content, short
`qualityChecklist` / `promptHints`. Exact thresholds live in the validator.

## Protected paths

`SCAFFOLD_PROTECTED_PATHS` is injected into dynamic context and enforced on
persist: LLM copies of those paths are dropped. Current set is owned by
`protected-paths.ts` (utility defaults such as `app/icon.svg` and
`app/api/placeholder/route.ts`).

## Font pairings

Not a `ScaffoldManifest` field. Variants carry `fontPairings`
(`{ heading, body }[]`) as prompt guidance. The font registry is
`src/lib/gen/data/google-font-registry.ts`. Starter files default to Inter +
`--font-sans`.
