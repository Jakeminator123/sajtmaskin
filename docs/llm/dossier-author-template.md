# Dossier Author Template (for AI agents)

This document is the **strict, single-pass authoring contract** for creating
new dossiers from a reference website or app. Another AI agent can read this
file plus a reference URL/repo and output a complete dossier directory.

## What a dossier IS

A dossier is a small, reusable building block injected into the codegen LLM's
prompt when a brief asks for the matching capability. One dossier maps to
**one capability** (an abstract intent like `payments`, `map-display`,
`site-search`, `visual-3d`). A dossier earns its place only when it carries an
external key/service OR a technical pattern the codegen LLM repeatedly gets
wrong freehand — plain content sections (FAQ, pricing, testimonials, CTA)
are freehand page content, not dossiers (taxonomy decision 2026-07-22).

Source-of-truth files:

- Schema: [`docs/schemas/strict/dossier.schema.json`](../schemas/strict/dossier.schema.json)
- Architecture: [`docs/contracts/dossier-system.md`](../contracts/dossier-system.md)
- Existing examples: [`data/dossiers/soft/three-fiber-canvas/`](../../data/dossiers/soft/three-fiber-canvas/), [`data/dossiers/soft/maplibre-map/`](../../data/dossiers/soft/maplibre-map/), [`data/dossiers/hard/stripe-checkout/`](../../data/dossiers/hard/stripe-checkout/)

## Class decision (`hard` vs `soft`)

Encoded in the folder path. Pick exactly one:

| Class | Folder | Use when |
|---|---|---|
| `hard` | `data/dossiers/hard/<id>/` | The dossier is coupled to an **external provider, service, or runtime contract**. It usually declares `envVars`, but keyless provider SDKs such as Vercel Analytics are still hard. Examples: Stripe, Clerk, OpenAI, Resend. |
| `soft` | `data/dossiers/soft/<id>/` | The dossier is **self-contained** (interaction patterns, R3F shells, key-free features). No envVars. Examples: three-fiber-canvas, maplibre-map, local-site-search, gallery-lightbox. |

If the reference implements an external provider/runtime contract → `hard`.
If it is a self-contained React/CSS/npm pattern → `soft`.

Every hard manifest must declare a non-empty `providers` array containing the
canonical provider identities its shipped code implements. Soft manifests must
omit `providers`. This field is the only provider→dossier ownership source;
the integration registry supplies generic/dossierless fallbacks, and agent
provider choices are derived from both catalogs.

## Capability naming

Capability ids are kebab-case, free-form, but follow these conventions:

- One word: `payments`, `analytics`.
- `<domain>-<noun>` for compound intents: `contact-form`, `site-search`,
  `map-display`.
- `<family>-<variant>` for related dossiers in a namespace: `visual-3d`,
  `physics-3d`.
- New capabilities are allowed — but check
  [`data/dossiers/_index/capability-map.json`](../../data/dossiers/_index/capability-map.json)
  first to avoid synonyms (`carousel-slider` and `image-slider` should be one
  capability, not two).

When introducing a new capability also add it to the capability map for
backoffice listings (read-only at runtime; the registry walks the manifest
folders directly).

## Required directory layout

```
data/dossiers/<class>/<id>/
  manifest.json        # required, validates against dossier.schema.json
  instructions.md      # required; prompt projection follows promptInstructionMode
  components/<file>    # optional, source files exposed via `files[]`
```

The `<id>` MUST equal the directory name and match the regex
`^[a-z0-9]+(-[a-z0-9]+)*$`.

## Strict hard-manifest skeleton (copy this and fill in)

For a soft dossier, remove `providers`, `mock`, and `envVars` entirely.

```json
{
  "$schema": "../../../../docs/schemas/strict/dossier.schema.json",
  "id": "<kebab-case-id>",
  "label": "<Human-readable Title>",
  "capability": "<capability-id>",
  "providers": ["<canonical-provider-id>"],
  "codeFidelity": "rewritable",
  "complexity": "simple",
  "defaultForCapability": true,
  "mock": "seed",
  "summary": "<30-600 chars: what it does, when to use, configuration/safety contract>",
  "envVars": [],
  "dependencies": [],
  "files": [
    { "path": "components/<file>.tsx", "role": "client" }
  ],
  "exposes": [
    { "name": "<Symbol>", "type": "component", "import": "@/components/<file>" }
  ],
  "lastVerified": "YYYY-MM-DD",
  "verificationStatus": "unverified",
  "sourceRepoUrl": "https://github.com/<org>/<repo>",
  "notes": "<curator-only context, not surfaced to the LLM>"
}
```

### Field-by-field requirements

| Field | Type | Required | Notes |
|---|---|---|---|
| `$schema` | string | yes | Always the relative path shown above. Enables IDE validation. |
| `id` | string | yes | Kebab-case, equals directory name. Pattern `^[a-z0-9]+(-[a-z0-9]+)*$`. |
| `label` | string (2-80) | yes | Shown in backoffice. Title-case. No emoji. |
| `capability` | string | yes | The capability id. Pattern `^[a-z0-9]+(-[a-z0-9]+)*$`. |
| `providers` | string[] | hard: yes; soft: forbidden | Canonical provider identities implemented by this dossier. Non-empty, unique, kebab-case. Several dossiers may claim one provider; that makes provider-only resolution ambiguous until an exact capability/dossier is chosen. |
| `codeFidelity` | enum | yes | `verbatim` for SDK glue/webhooks/auth that must not be paraphrased. `rewritable` for UI components the LLM may adapt. |
| `complexity` | enum | yes | `simple` = 1-2 files, no env. `medium` = 3-5 files OR env required. `advanced` = >5 files or multi-step setup. |
| `defaultForCapability` | bool | no (default false) | Set `true` for the canonical implementation. When two dossiers share a capability the default wins selection. |
| `mock` | enum | no (omitted = `none`) | How the dossier's VISUAL surface works in F2/preview without live provider configuration: `canned` (fabricated server response), `seed` (shipped seed data + notice), `success` (fake success + demo notice), `visual` (full interactive surface; the ACTION opens an honest demo notice/modal — never fake sessions/charges/transport), `none` (self-disable — analytics/error-tracking only). **EVERY hard dossier must declare `mock ≠ none`** (per-dossier since 2026-07-12) unless the capability is in `MOCKLESS_CAPABILITY_EXCEPTIONS` (only `analytics` + `error-tracking` since 2026-07-22) — enforced by `dossiers:validate-all` (see checklist item 9). Omit for soft dossiers. |
| `summarySv` | string | no | Swedish catalog description for END USERS (builder Byggblock panel + backoffice). Never reaches the codegen prompt; UI falls back to `summary` when omitted. Write for a non-technical site owner. |
| `summary` | string (30-600) | yes | 1-3 sentences: what it does, when to use, and its configuration/safety contract. Written for the codegen LLM, not for humans. Verbs in present tense. |
| `envVars` | array | no | Only for `hard` dossiers. Each entry needs `key` (UPPER_SNAKE_CASE), `required` (bool), `purpose` (10-240 chars), and optional `enforcement` (see below). |
| `envVars[].enforcement` | enum | no | Defaults to `"build"`. One of: `"build"` (F3 needs either a real project value or a catalog-approved placeholder; missing both blocks), `"feature-runtime"` (the SDK is imported but the dossier's UI shows a configuration banner/popup when the value is missing or placeholder; F3 warns), or `"warn-only"` (the component self-disables; info only). The readiness gate derives `requiredRealEnvKeys` from `build`, then applies catalog coverage. Be honest about the shipped runtime fallback before choosing `feature-runtime`; do not treat `env.example` as configuration evidence. |
| `dependencies` | string[] | no | npm package names. Use `name@^x.y.z` only when a precise pin is required; bare names let the codegen pick the latest. Add ONLY packages this dossier itself imports. |
| `files` | array | no | Source files shipped under the dossier folder. `path` is relative to the dossier dir (e.g. `components/foo.tsx`). `role` is `client` / `server` / `shared`. Optional `injectionMode` overrides `codeFidelity` per file. |
| `exposes` | array | no | Symbols the codegen LLM may import. `import` is the **target site's** import path (typically `@/components/<file>`). |
| `lastVerified` | date | yes | YYYY-MM-DD for the latest acceptance evidence, or the imported source date while `verificationStatus` is `unverified`. |
| `verificationStatus` | enum | recommended | New drafts must use `unverified`; change to `accepted` only after the acceptance checklist has real evidence. Omission is backward compatibility for existing accepted manifests, not an authoring default. |
| `sourceRepoUrl` | URI | no | Optional pointer to the upstream reference. |
| `notes` | string (≤600) | no | Curator-only. NOT surfaced to the LLM. |

`additionalProperties: false` — no other fields are allowed. The schema will
reject manifests with stray keys.

## `instructions.md` structure (two required + three recommended sections)

Keep total length ≤ ~3000 tokens. The default `promptInstructionMode` is
`compact`, which injects a manifest-derived summary rather than this prose.
Use `selected-sections` to inject capped **When to use**, **How to integrate**
and **Avoid** sections, or `full` only when the whole file is genuinely needed.
The first two H1 headings below are validation-required; the remaining three
are recommended and produce warnings when absent.

````markdown
# When to use

Use this dossier whenever the brief mentions <triggers>. Triggers (Swedish + English): `<word>`, `<word>`, ...

Best fit:
- <bullet of one good fit>
- <bullet of another good fit>

Do not use for:
- <bullet of a near-miss>
- <bullet of an anti-pattern>

# How to integrate

<3-5 sentence prose explaining what the wrapper / component owns and why>

```tsx
// Minimal usage example, REAL imports, REAL props.
```

# UX rules

- <feedback, validation, mobile or accessibility invariant>
- <composition or mount-point invariant>

# Avoid

<3-6 bullets of what NOT to do, with reasoning>

# Verification

- <manual smoke check>
- <fallback/configuration check>
````

### Writing-style invariants

- Trigger-words must be in **both Swedish and English** when relevant (the
  builder serves a Swedish-speaking audience).
- Every code example must be runnable as-is (no `// ...` placeholders inside
  imports or JSX returns).
- Always document the **safety contract** (reduced-motion, SSR-safety, env
  fallback, pointer-events ownership) — this is the value the dossier adds
  beyond what the LLM would write from scratch.
- Never tell the LLM to "be careful" or "make it look nice". Say exactly
  what the invariant is and why violating it breaks the build.

## Component files

If `files[]` is non-empty, ship the actual source under the dossier folder:

- `client` files: `"use client"` at the top, free use of hooks and
  browser APIs.
- `server` files: no `"use client"`, no browser APIs, may export route
  handlers or async server components.
- `shared` files: pure functions / types, importable from either side.

Files must compile in isolation against the codegen target's tsconfig
(strict mode, `moduleResolution: "bundler"`, React 19, Next.js 16). Run a
local `npx tsc --noEmit` pointing at the file before declaring it ready.

## Dependency hygiene

- Add ONLY packages the dossier source files import. Do not list `react` or
  `next` (they are always present).
- Prefer libraries already in the project (check the `package.json` of a
  recent generated version before adding a new one).
- Use bare names for paraphrasable deps; pin with `^x.y.z` only when API
  surface is sensitive (e.g. `stripe@^14.0.0`).

## Validation checklist (run before opening a PR)

1. `manifest.json` validates against the strict schema (load it in any
   JSON-Schema validator or run the registry test suite).
2. `id` matches the directory name and the schema regex.
3. `capability` is documented in
   `data/dossiers/_index/capability-map.json` (or the change adds it).
4. A hard manifest has a non-empty `providers` array; a soft manifest omits
   the field. Provider ids describe the actual SDK/API in the shipped code.
5. `instructions.md` has the two required headings and preferably all three
   recommended headings; total length is ≤ ~3000 tokens.
6. Every file in `files[]` exists, type-checks against the target's tsconfig,
   and is importable via the path declared in `exposes[].import`.
7. A new draft has `verificationStatus: "unverified"` and `lastVerified` records
   its imported source date. Change the status to `accepted` and update the date
   only after visually verifying a sample brief on a real preview build.
8. If a new capability is introduced, register it in the capability-map AND
   add a matching `RULE` in
   [`src/lib/gen/capability-inference.ts`](../../src/lib/gen/capability-inference.ts)
   so prompts actually trigger it. Add a corresponding hint in
   `buildCapabilityHints` so the codegen LLM gets pointed at the dossier's
   exposed symbols.
9. Run `npm run dossiers:validate-all` — the CI-blocking gate. Beyond the
   schema it enforces exposes/import-closure, default uniqueness, and the
   mock-fallback invariant (per-dossier since 2026-07-12): EVERY hard dossier
   must declare `mock ≠ none` unless the capability is listed in
   `MOCKLESS_CAPABILITY_EXCEPTIONS` (see
   `docs/contracts/dossier-system.md` § CI-invariant).

## Anti-patterns (do not ship a dossier that does these)

- Wraps a single shadcn primitive that the codegen would already render
  correctly (`<Button>` is not a dossier).
- Hardcodes brand-specific copy ("Welcome to Acme Corp") inside an
  ostensibly reusable component.
- Has a `summary` that reads like marketing copy. Write it for the LLM,
  not for the customer.
- Bundles three unrelated capabilities into one dossier. Split into one
  dossier per capability and link them via `notes`.
- Skips the safety contract section because "the LLM will figure it out".
  It will not.
- Uses `verbatim` for a UI component the LLM should be free to adapt.
  Use `rewritable` and lock per-file with `injectionMode` only for the
  pieces that genuinely cannot be paraphrased.

## Hand-off format (for the spawning agent)

When another agent generates a dossier from a reference, return:

```
---
class: hard | soft
id: <kebab-case>
files:
  - path: <relative path under the dossier dir>
    contents: <full file contents, no truncation>
  - path: manifest.json
    contents: <full JSON>
  - path: instructions.md
    contents: <full markdown>
---
```

The receiving system writes each file under
`data/dossiers/<class>/<id>/<path>` and runs the validation checklist
above. No partial dossiers — either the full set lands or none of it.
