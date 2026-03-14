# gen/ — Code Generation Module

Sajtmaskin's own code generation engine. Uses OpenAI models (gpt-5.3-codex default, gpt-5.4 max) via AI SDK to generate Next.js/React sites from prompts. Replaces v0 Platform API as the default path.

## Architecture

```
createGenerationPipeline()  (fallback.ts)
    │
    ├─ V0_FALLBACK_BUILDER=y  →  v0-generator (v0 Platform API)
    │
    └─ default                →  engine.ts (streamText + createCodeGenSSEStream)
                                       │
                                       ├─ system-prompt.ts (buildSystemPrompt)
                                       ├─ url-compress.ts (compress before LLM, expand after)
                                       ├─ stream-format.ts (SSE events)
                                       └─ suspense/ (TransformStream post-processing)
```

## Key Files

| File | Role |
|------|------|
| `fallback.ts` | Entry point. `createGenerationPipeline()` switches between gen engine and v0 fallback based on `V0_FALLBACK_BUILDER`. |
| `engine.ts` | Core generation via `streamText()` + `createCodeGenSSEStream()`. |
| `system-prompt.ts` | Builds the system prompt (static core + dynamic context). |
| `stream-format.ts` | Converts AI SDK stream to SSE events (`meta`, `thinking`, `content`, `done`, `error`). |
| `url-compress.ts` | Compresses long URLs to aliases before LLM (saves tokens), expands after. |
| `suspense/` | TransformStream rules that fix code during streaming (shadcn imports, Lucide icons, URL expansion). |
| `autofix/` | Post-generation fixers: import validation, JSX check, dep completer. |
| `parser.ts` | Parses fenced code blocks from streamed content. |
| `preview/` | Preview runtime modules. `preview/index.ts` exposes `buildPreviewHtml()` and `buildPreviewUrl()`, while sibling files split resolution, CSS, transpilation, script assembly, and shims. |
| `version-manager.ts` | Creates versions from content, parses files. |

## Fallback

When `V0_FALLBACK_BUILDER=y`:

1. `createGenerationPipeline()` returns `createV0FallbackStream()` instead of calling the engine.
2. The fallback dynamically imports `@/lib/v0/v0-generator` and calls `generateCode()`.
3. The result is wrapped in an SSE stream that matches the gen engine's event format.
4. The client sees the same SSE shape either way.

v0 is still used for: templates (`generateFromTemplate`), registry init (`initFromRegistry`), and download (`downloadVersionAsZip`), regardless of fallback.

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

- Treat these files as runtime-critical artifacts, not disposable local output.
- Do not hand-edit them as a normal workflow. Prefer regenerating them from the
  scripts documented in `scripts/README.md`.
- Keeping them in `.cursorignore` is about search/indexing cost, not about
  forbidding access. Read them directly when a task actually depends on their
  structure or contents.
- When you only need orientation, prefer this README plus
  `docs/architecture/repo-hygiene.md` over opening the full JSON artifacts.

Common regeneration entry points:

```bash
npm run template-library:build
npm run template-library:embeddings
npm run scaffolds:embeddings
npm run scaffolds:curate
```

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
