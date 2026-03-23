# Known Issues and Fixes

Documented during the 2026-03-18 session. These are recurring patterns
where the LLM generation or platform pipeline produces known errors.
Autofix rules and scaffold improvements now handle most of them automatically.

## Autofix Pipeline Rules

The autofix pipeline (`src/lib/gen/autofix/pipeline.ts`) runs automatically
during generation, before the version is saved. Current rules:

| Step | Rule | What it fixes |
|------|------|--------------|
| 3a | use-client-fixer | Missing "use client" in client components |
| 3b | import-validator | Incorrect shadcn import paths |
| 3b2 | react-import-fixer | Missing `import React` |
| 3b3 | font-import-fixer | Incorrect font imports in layout |
| 3c | metadata-import-fixer | Missing `Metadata` type import from next |
| 3c2 | metadata-route-import-fixer | Missing `MetadataRoute` in robots/sitemap |
| 3c3 | cn-import-fixer | Missing `cn` import from `@/lib/utils` |
| 3d | lucide-image-fixer | `Image` from lucide-react instead of next/image |
| 4 | syntax-validator | esbuild syntax check |
| 5 | jsx-checker | JSX tag matching |
| 6 | dep-completer | Collects third-party dependencies |

## Download Scaffold Fixes

The download scaffold (`src/lib/gen/project-scaffold.ts`) fills in missing
project files when exporting. Key improvements:

- **Auto-detect dependencies**: `buildCompleteProject()` scans all generated
  code with `runDepCompleter` and merges detected dependencies into
  `package.json` automatically.
- **Image domains**: `next.config.ts` includes `remotePatterns` for Unsplash,
  Pexels, Vercel Blob, Dicebear, Picsum, and placeholder.
- **Port**: Dev server runs on port 1555 by default.

### Turbopack: “Overly broad patterns” on `project-scaffold.ts`

Production build may log a Turbopack warning on `fs.readFileSync` / `path.join` inside
[`project-scaffold.ts`](../../src/lib/gen/project-scaffold.ts) (import trace often includes
`src/app/api/v0/chats/[chatId]/quality-gate/route.ts`). The bundler
conservatively assumes **many** `.tsx` paths could be read; at **runtime** only existing files under
`src/components/ui/` and `components/ui/` are loaded, by **name** from `@/components/ui/...` imports
in the generated code. The build still completes successfully — this is a trace heuristic, not proof
that the whole repo is being bundled into the route.

## Image Materialization

The image materializer (`src/lib/gen/post-process/image-materializer.ts`)
replaces `/placeholder.svg?text=...` with real Unsplash photos. Known behavior:

- Uses progressive query simplification (10+ search variants)
- Translates Swedish search terms to English
- Falls back to generic concept keywords (model->fashion model, studio->photo studio)
- Some niche queries still fail -- placeholder.svg remains as fallback

## Common Model Mistakes (handled by autofix)

1. **`import { Image } from "lucide-react"`** when `next/image` is intended.
   The model confuses the lucide icon with the Next.js image component.
   Fixed by `lucide-image-fixer`.

2. **`export const metadata: Metadata`** without importing the type.
   The model uses `Metadata` in page/layout files without the import.
   Fixed by `metadata-import-fixer`.

3. **`MetadataRoute.Robots`** without importing `MetadataRoute`.
   Same pattern in robots.ts and sitemap.ts.
   Fixed by `metadata-route-import-fixer`.

4. **`cn()` without importing from `@/lib/utils`**.
   The model copies cn patterns but forgets the import.
   Fixed by `cn-import-fixer`.

## Platform Issues (resolved)

### Client-bundle crash from server-only imports
Server-only modules (pg, database access) must never be imported from
barrel exports that reach client components. Scaffold-scoring was moved
from `matcher.ts` (client-reachable) to `orchestrate.ts` (server-only).

### Vercel AI Gateway token limits
The gateway has its own `maxOutputTokens` cap (e.g. 18192 for gpt-5.2)
separate from the model's native limit (128K). Do not hardcode model
limits -- let the gateway decide by omitting `maxOutputTokens` when
the client does not explicitly request a value.

### Auto-fix can create worse versions
The automatic post-check follow-up (`useAutoFix`) sometimes generates
code with more errors than the original. Disabled by default. Enable
via `localStorage.setItem("sajtmaskin:autofix-enabled", "true")`.

### CSP for Sandbox iframe
`frame-src` in `proxy.ts` must include `*.vercel.run` and `*.vercel.app`
for Sandbox preview to render in the builder iframe.

### Follow-up merge requires explicit previousFiles
`previousFiles` must flow through `GenerationStreamParams` ->
`buildFinalizeParams` -> `finalizeAndSaveVersion` for follow-up
generations to merge with previous version files instead of
regenerating from scratch.
