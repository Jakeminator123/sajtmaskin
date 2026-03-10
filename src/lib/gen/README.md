# gen/ — Code Generation Module

Sajtmaskin's own code generation engine. Uses OpenAI GPT 5.2 + Vercel AI SDK to generate Next.js/React sites from prompts. Replaces v0 Platform API as the default path.

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
| `preview.ts` | Builds preview HTML/URL via @vercel/sandbox. |
| `version-manager.ts` | Creates versions from content, parses files. |

## Fallback

When `V0_FALLBACK_BUILDER=y`:

1. `createGenerationPipeline()` returns `createV0FallbackStream()` instead of calling the engine.
2. The fallback dynamically imports `@/lib/v0/v0-generator` and calls `generateCode()`.
3. The result is wrapped in an SSE stream that matches the gen engine's event format.
4. The client sees the same SSE shape either way.

v0 is still used for: templates (`generateFromTemplate`), registry init (`initFromRegistry`), and download (`downloadVersionAsZip`), regardless of fallback.

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
