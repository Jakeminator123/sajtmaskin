# Dossier Author Template (for AI agents)

This document is the **strict, single-pass authoring contract** for creating
new dossiers from a reference website or app. Another AI agent can read this
file plus a reference URL/repo and output a complete dossier directory.

## What a dossier IS

A dossier is a small, reusable building block injected into the codegen LLM's
prompt when a brief asks for the matching capability. One dossier maps to
**one capability** (an abstract intent like `payments`, `parallax-scroll`,
`testimonials-section`, `visual-3d`).

Source-of-truth files:

- Schema: [`docs/schemas/strict/dossier.schema.json`](../schemas/strict/dossier.schema.json)
- Architecture: [`docs/architecture/dossier-system.md`](../architecture/dossier-system.md)
- Existing examples: [`data/dossiers/soft/three-fiber-canvas/`](../../data/dossiers/soft/three-fiber-canvas/), [`data/dossiers/soft/scroll-parallax/`](../../data/dossiers/soft/scroll-parallax/), [`data/dossiers/hard/stripe-checkout/`](../../data/dossiers/hard/stripe-checkout/)

## Class decision (`hard` vs `soft`)

Encoded in the folder path. Pick exactly one:

| Class | Folder | Use when |
|---|---|---|
| `hard` | `data/dossiers/hard/<id>/` | The dossier needs **external secrets** (API keys, OAuth client IDs, webhook signing secrets) declared in `envVars`. Preflight checks env. Examples: Stripe, Auth.js, OpenAI, Resend. |
| `soft` | `data/dossiers/soft/<id>/` | The dossier is **self-contained** (UI sections, animation patterns, R3F shells, layout primitives). No envVars. Examples: pricing-tier-table, three-fiber-canvas, scroll-parallax, faq-accordion. |

If the reference uses a third-party SDK that needs an API key → `hard`. If it
is a pure React/CSS pattern → `soft`.

## Capability naming

Capability ids are kebab-case, free-form, but follow these conventions:

- One word: `payments`, `analytics`.
- `<domain>-<noun>` for vertical sections: `pricing-section`, `faq-section`,
  `testimonials-section`, `contact-form`.
- `<family>-<variant>` for related dossiers in a namespace: `parallax-scroll`,
  `parallax-pointer`, `visual-3d`.
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
  instructions.md      # required, prose injected into the codegen prompt
  components/<file>    # optional, source files exposed via `files[]`
```

The `<id>` MUST equal the directory name and match the regex
`^[a-z0-9]+(-[a-z0-9]+)*$`.

## Strict manifest skeleton (copy this and fill in)

```json
{
  "$schema": "../../../../docs/schemas/strict/dossier.schema.json",
  "id": "<kebab-case-id>",
  "label": "<Human-readable Title>",
  "capability": "<capability-id>",
  "codeFidelity": "rewritable",
  "complexity": "simple",
  "defaultForCapability": true,
  "summary": "<30-600 chars: what it does, when to use, key safety contract>",
  "envVars": [],
  "dependencies": [],
  "files": [
    { "path": "components/<file>.tsx", "role": "client" }
  ],
  "exposes": [
    { "name": "<Symbol>", "type": "component", "import": "@/components/<file>" }
  ],
  "lastVerified": "YYYY-MM-DD",
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
| `codeFidelity` | enum | yes | `verbatim` for SDK glue/webhooks/auth that must not be paraphrased. `rewritable` for UI components the LLM may adapt. |
| `complexity` | enum | yes | `simple` = 1-2 files, no env. `medium` = 3-5 files OR env required. `advanced` = >5 files or multi-step setup. |
| `defaultForCapability` | bool | no (default false) | Set `true` for the canonical implementation. When two dossiers share a capability the default wins selection. |
| `summary` | string (30-600) | yes | 1-3 sentences: what it does, when to use, key safety contract. Written for the codegen LLM, not for humans. Verbs in present tense. |
| `envVars` | array | no | Only for `hard` dossiers. Each entry needs `key` (UPPER_SNAKE_CASE), `required` (bool), `purpose` (10-240 chars), and optional `enforcement` (see below). |
| `envVars[].enforcement` | enum | no | Defaults to `"build"`. One of: `"build"` (real value required at F3 build time — secret keys, server-side database URLs, anything where a placeholder crashes deploy); `"feature-runtime"` (the SDK is imported but the dossier's UI shows a configuration banner / popup at runtime when the value is missing — the "Klarna-popup" pattern; F3 surfaces as warning, not blocker); `"warn-only"` (component self-disables on empty value, e.g. `if (!domain) return null` — surfaced only as info). The F3 readiness gate filters `requiredRealEnvKeys` to `build`-enforcement only, so getting this wrong either blocks deploy unnecessarily or lets a deploy succeed with broken integrations. Be honest about whether the dossier's runtime actually has graceful fallback before tagging `feature-runtime`. |
| `dependencies` | string[] | no | npm package names. Use `name@^x.y.z` only when a precise pin is required; bare names let the codegen pick the latest. Add ONLY packages this dossier itself imports. |
| `files` | array | no | Source files shipped under the dossier folder. `path` is relative to the dossier dir (e.g. `components/foo.tsx`). `role` is `client` / `server` / `shared`. Optional `injectionMode` overrides `codeFidelity` per file. |
| `exposes` | array | no | Symbols the codegen LLM may import. `import` is the **target site's** import path (typically `@/components/<file>`). |
| `lastVerified` | date | yes | YYYY-MM-DD when a human (or you) last validated the dossier against a real preview build. |
| `sourceRepoUrl` | URI | no | Optional pointer to the upstream reference. |
| `notes` | string (≤600) | no | Curator-only. NOT surfaced to the LLM. |

`additionalProperties: false` — no other fields are allowed. The schema will
reject manifests with stray keys.

## `instructions.md` structure (required sections)

The instructions are concatenated into the codegen LLM's system prompt when
the dossier is selected. Keep total length ≤ ~3000 tokens. Mirror this
structure:

```markdown
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

# API contract

```tsx
// Type signature(s) of the exposed symbols.
```

# Composition rules (the LLM should follow these without being asked)

- <invariant 1>
- <invariant 2>

# Reduced-motion / accessibility / safety contract (optional but recommended)

<3-6 bullets of what NOT to do, with reasoning>
```

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
- Prefer libraries already in the project (search [`package.json` of any
  recent generated version](../../scripts/debug/dump-version-file.ts) before
  adding a new one).
- Use bare names for paraphrasable deps; pin with `^x.y.z` only when API
  surface is sensitive (e.g. `stripe@^14.0.0`).

## Validation checklist (run before opening a PR)

1. `manifest.json` validates against the strict schema (load it in any
   JSON-Schema validator or run the registry test suite).
2. `id` matches the directory name and the schema regex.
3. `capability` is documented in
   `data/dossiers/_index/capability-map.json` (or the change adds it).
4. `instructions.md` has the five recommended sections and ≤ ~3000 tokens.
5. Every file in `files[]` exists, type-checks against the target's tsconfig,
   and is importable via the path declared in `exposes[].import`.
6. `lastVerified` is today's date and the dossier was visually verified on a
   preview build of a sample brief.
7. If a new capability is introduced, register it in the capability-map AND
   add a matching `RULE` in
   [`src/lib/gen/capability-inference.ts`](../../src/lib/gen/capability-inference.ts)
   so prompts actually trigger it. Add a corresponding hint in
   `buildCapabilityHints` so the codegen LLM gets pointed at the dossier's
   exposed symbols.

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
