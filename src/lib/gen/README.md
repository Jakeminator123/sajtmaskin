# gen/ — Code Generation Module

Sajtmaskin's own code generation engine. Uses OpenAI models (gpt-5.3-codex default, gpt-5.4 max) via AI SDK to generate Next.js/React sites from prompts.

## Architecture

```
createGenerationPipeline()  (pipeline.ts)
    │
    └─ engine.ts (streamText + createCodeGenSSEStream)
            │
            ├─ system-prompt.ts (buildSystemPrompt)
            ├─ url-compress.ts (compress before LLM, expand after)
            ├─ stream-format.ts (SSE events)
            └─ suspense/ (TransformStream post-processing)
```

## Key Files

| File | Role |
|------|------|
| `pipeline.ts` | Entry point. `createGenerationPipeline()` delegates to the own engine. |
| `engine.ts` | Core generation via `streamText()` + `createCodeGenSSEStream()`. |
| `orchestrate.ts` | Pre-generation orchestration: scaffold matching, route planning, brief expansion. |
| `system-prompt.ts` | Builds the system prompt (static core + dynamic context). |
| `stream-format.ts` | Converts AI SDK stream to SSE events (`meta`, `thinking`, `content`, `done`, `error`). |
| `url-compress.ts` | Compresses long URLs to aliases before LLM (saves tokens), expands after. |
| `suspense/` | TransformStream rules that fix code during streaming (shadcn imports, Lucide icons, URL expansion). |
| `autofix/` | Post-generation fixers: import validation, JSX check, dep completer. |
| `parser.ts` | Parses fenced code blocks from streamed content. |
| `preview/` | Preview runtime modules. `preview/index.ts` exposes `buildPreviewHtml()` and `buildPreviewUrl()`, while sibling files split resolution, CSS, transpilation, script assembly, and shims. |
| `version-manager.ts` | Creates versions from content, parses files. |
| `plan-schema.ts` | Structured plan artifact schema, normalization, and serialization for plan mode. |

## v0 Platform API (not used for generation)

The own engine is the sole generation path. v0 Platform API (`v0-sdk`) is still
used for legacy operations: templates (`generateFromTemplate`), registry init
(`initFromRegistry`), and download (`downloadVersionAsZip`).

## Embedding lanes (three separate spurs)

The own engine uses three distinct embedding indexes. They serve different
purposes and must not be confused:

| Lane | Index file | Search module | Purpose |
|------|-----------|---------------|---------|
| **Runtime scaffolds** | `scaffolds/scaffold-embeddings.json` | `scaffolds/scaffold-search.ts` → `matcher.ts` | Selects the internal scaffold for generation. |
| **Reference / template-library** | `template-library/template-library-embeddings.json` | `template-library/search.ts` | Injects curated code references into the system prompt. Not a scaffold choice. |
| **v0 gallery** | `src/lib/templates/` (separate) | `src/lib/templates/template-search.ts` | Powers the product gallery / browse cards. Not used at generation time. |

**Dossiers** (`research/dossiers/`) are no longer part of any runtime path.

For a longer explanation see `docs/architecture/embeddings-and-template-lanes.md`.

## Scaffold lane (10 runtime scaffolds)

Runtime scaffold selection uses **embedding similarity** via
`matchScaffoldWithEmbeddings()` in `scaffolds/matcher.ts`. The prompt is
embedded and compared against pre-computed scaffold vectors in
`scaffold-embeddings.json`. Candidates are filtered by `buildIntent` so a
website-only scaffold cannot win when the user asks for an app. When embeddings
are unavailable, a deterministic fallback selects a default scaffold based on
`buildIntent`.

After changing manifests or registry, run `npm run scaffolds:build`
(`scaffolds:research` + `scaffolds:embeddings` + `scaffolds:validate`).

## Generated Artifacts And Indexing

Large generated files under `src/lib/gen/` are part of the runtime surface, even
when they are excluded from normal Cursor indexing.

| Path | Role | Normal handling |
|------|------|-----------------|
| `data/docs-embeddings.json` | Embeddings derived from documentation snippets used by generation support. | Generated, committed, rarely hand-edited, usually safe to keep in `.cursorignore`. |
| `scaffolds/scaffold-research.generated.json` | Generated scaffold research metadata committed for runtime/build-time use. | Generated, committed, do not hand-edit unless you are deliberately repairing a bad artifact. |
| `scaffolds/scaffold-embeddings.json` | Embeddings for the internal runtime scaffolds. | Generated, committed, direct-read only when debugging scaffold search/matching. |
| `template-library/template-library.generated.json` | Curated template-library artifact used by runtime search and prompt support. | Generated, committed, large enough to keep out of default indexing. |
| `template-library/template-library-embeddings.json` | Embeddings for the curated template-library artifact. | Generated, committed, usually only needed for targeted debugging or rebuild validation. |

Guidelines:

- Treat these files as runtime-critical artifacts. They may be **minimal stubs**
  (empty catalogs / empty embedding lists) while you curate a new reference set.
- Prefer `npm run verify:generated-paths` after edits; use
  `npm run normalize:generated-paths` if paths need normalization.
- Keeping large JSON in `.cursorignore` is about indexing cost; open by path when needed.

Gallery template embeddings (v0 browse cards) use `npm run templates:embeddings` — see `src/lib/templates/README.md`. Reference catalog rebuild (`template-library:rebuild`) does **not** touch that file.

## Adding New Suspense Rules

1. Create a new rule file in `suspense/rules/`, e.g. `my-fix.ts`:

```ts
import type { SuspenseRule, StreamContext } from "../transform";

export const myFix: SuspenseRule = {
  name: "my-fix",
  transform(line: string, context: StreamContext): string {
    // Transform the line. Return unchanged if no match.
    return line.replace(/pattern/g, "replacement");
  },
};
```

2. Export it from `suspense/index.ts`:

```ts
export { myFix } from "./rules/my-fix";
```

3. Add it to `DEFAULT_RULES` in `suspense/index.ts`:

```ts
const DEFAULT_RULES = [shadcnImportFix, lucideIconFix, urlAliasExpand, myFix];
```

Rules run in order. Each rule receives the output of the previous. Do not throw — return the original line on error to avoid corrupting the stream.
