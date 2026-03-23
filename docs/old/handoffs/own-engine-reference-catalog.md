# Own Engine Reference Catalog Handoff

Status: Active (2026-03-21)

## Purpose

The project has two parallel "template" worlds that must not be mixed:

1. **v0 template gallery** -- product UI (browse, categories, `templates.json`). Used for inspiration and initial prompt, not as runtime starter code.
2. **Template reference catalog** -- curated external reference rows (Vercel-style) that feed the own-engine system prompt with semantic matching and optional code snippets.

## Where everything lives

### Reference catalog (own engine -- prompt augmentation)

| What | Path |
|------|------|
| Generated catalog | `src/lib/gen/template-library/template-library.generated.json` |
| Pregenerated embeddings | `src/lib/gen/template-library/template-library-embeddings.json` |
| Runtime search + fallback | `src/lib/gen/template-library/search.ts` |
| Catalog API | `src/lib/gen/template-library/catalog.ts`, `types.ts` |
| Build helpers (offline) | `src/lib/gen/template-library/embeddings-core.ts` |
| Injection in system prompt | `src/lib/gen/system-prompt.ts` (`rankTemplateReferences`, sections "Relevant Template References" / "Reference Code Snippets") |
| README | `src/lib/gen/template-library/README.md` |
| Path hygiene | `src/lib/gen/template-library/verify-generated-paths.mjs`, `normalize-generated-paths.mjs` |

Zone 2 entry (normalized intermediate outside raw scrape): `research/normalized-catalog.json` (built via `research:normalize` from local scrape folder -- typically outside repo root).

### v0 gallery (browse -- separate)

| What | Path |
|------|------|
| Template list | `src/lib/templates/templates.json` |
| Gallery embeddings | `src/lib/templates/template-embeddings.json` |
| Gallery search | `src/lib/templates/template-search.ts` |
| README | `src/lib/templates/README.md` |

### Build scripts (offline, config/scripts/)

| Script | Role |
|--------|------|
| `config/scripts/normalize-raw-catalog.ts` | Zone 1 raw scrape to `research/normalized-catalog.json` |
| `config/scripts/generate-dossiers-from-catalog.ts` | Normalized catalog to `research/dossiers/<slug>/manifest.json` |
| `config/scripts/build-template-library.ts` | Zone 2 to `template-library.generated.json` |
| `config/scripts/generate-template-library-embeddings.ts` | OPENAI_API_KEY to `template-library-embeddings.json` |
| `config/scripts/generate-template-embeddings.ts` | v0 gallery to `template-embeddings.json` |
| `config/scripts/smoke-template-library-search.ts` | Local test of `searchTemplateLibrary` (reference catalog only) |

### npm commands (root package.json)

- `research:normalize` -- Zone 1 to Zone 2
- `research:generate-dossiers` -- Zone 2 to dossiers
- `template-library:rebuild` -- builds reference catalog + embeddings (does not touch v0 gallery)
- `template-library:rebuild:with-v0-gallery` -- same plus `templates:embeddings`
- `template-library:smoke-search` -- smoke test for `searchTemplateLibrary` (needs OPENAI_API_KEY)
- `templates:embeddings` -- v0 gallery embeddings only
- `scaffolds:build` -- `scaffolds:research` + `scaffolds:embeddings` + `scaffolds:validate`
- `verify:generated-paths` / `normalize:generated-paths` -- hygiene for committed JSON

## Own engine -- the full chain

| Step | Where |
|------|-------|
| Orchestration, scaffold, contracts | `src/lib/gen/orchestrate.ts` |
| System prompt (STATIC + dynamic) | `src/lib/gen/system-prompt.ts` |
| Generation / stream / finalize | `src/lib/gen/stream/finalize-version.ts`, `finalize-preflight.ts` |
| Quick preview (iframe) | `src/app/api/preview-render/route.ts`, `src/lib/gen/preview/index.ts` |
| MCP "generate site" | `src/lib/mcp/generate-site.ts` (default runtimeMode: "preview") |
| Sandbox (isolation, requires Vercel env) | `src/lib/mcp/runtime-url.ts` |
| Quality gate (sandbox) | `src/app/api/v0/chats/[chatId]/quality-gate/route.ts` |

## Material flow

1. Raw data (outside repo) -> `research:normalize` -> `research/normalized-catalog.json`
2. `research:generate-dossiers` -> `research/dossiers/<slug>/manifest.json`
3. `template-library:build` -> `template-library.generated.json`
4. `template-library:embeddings` -> `template-library-embeddings.json`
5. `scaffolds:build` -> `scaffold-research.generated.json` + `scaffold-embeddings.json`
6. At runtime: query embedding (OpenAI) + cosine vs pregenerated vectors; fallback to keyword when key or embeddings are missing.

## Checklist before integration

- `npm run verify:generated-paths` green after changes in gen JSON
- For semantic search in prod: `OPENAI_API_KEY` + committed `template-library-embeddings.json` in sync with catalog
- Do not confuse `template-embeddings.json` (gallery) with `template-library-embeddings.json` (own-engine references)
