# `src/lib/shadcn` — registry client for the builder

**Purpose:** fetch and present [shadcn/ui](https://ui.shadcn.com) **registry JSON** (`/r/styles/...`) for the builder UI and for LLM prompt snippets (block/component code, dependencies). This is **active runtime** code, not a mirror of external repos.

**Not included here**

- **`_template_refs/`**, **`config/shadcn-mirror-audit-policy.json`**, **`scripts/audit/audit-shadcn-mirror-repos.mjs`** — research/audit/mirror hygiene. They do **not** power runtime fetches; keep them separate from this layer.
- **Scaffolds / dossiers** — own-engine starters and retrieval artifacts live under `src/lib/gen/scaffolds/` and committed dossiers under `data/dossiers/`.

**Main modules**

| File | Role |
|------|------|
| `registry-url.ts` | Registry base URL, style resolution (`new-york-v4` canonical default; legacy/incomplete `new-york`/`default`/`radix-vega` coerced to it for ui.shadcn.com), docs URLs (`buildShadcnDocsUrl`), `LEGACY_STYLE_DEFAULT`. |
| `registry-service.ts` | Fetch registry index/items (with in-memory cache keys scoped by **source** `official` \| `legacy`), categories, curated lists. |
| `registry-cache.ts` | Optional DB-backed cache for registry index (server). Uses same `source` + style + base URL as routes. |
| `registry-utils.ts` | Import rewrites, markdown previews, **prompt text** for adding blocks/components (`buildShadcnBlockPrompt`, …). |
| `registry-types.ts` | Types for registry JSON. |
| `describe.ts` | Fas 1 "Beskriv"-discovery: free-text → LLM search queries → search official + community registries (HTTP) → rank REAL hits. Reads registries only; writes nothing. Deterministic heuristic fallback when no provider key. |
| `describe-feature.ts` | Flag helper `isShadcnDescribeEnabled()` for `NEXT_PUBLIC_SAJTMASKIN_SHADCN_DESCRIBE` (default off → route 404). |

**Related (outside this folder)**

- `src/lib/gen/data/shadcn-components.ts` — PascalCase → import slug map for prompts/post-processing.
- `src/lib/builder/shadcn-component-metadata.ts` — UI metadata (categories, preview hints) for the picker.

**API routes:** `src/app/api/shadcn/registry/{index,item,refresh}/` — proxy/cache for browser `fetch` and server refresh. `src/app/api/shadcn/describe/` — flag-gated Fas 1 discovery route (`POST`, default 404).
