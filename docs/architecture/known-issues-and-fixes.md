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
| 3b2 | react-import-fixer | Missing `import React` (for `React.*` usage) |
| 3b3 | react-hook-import-fixer | Missing named hook imports (`useState`, `useEffect`, `useRef`, etc.) |
| 3b4 | dom-shadow-fixer | Local imports shadowing DOM globals (`HTMLFormElement`, etc.) |
| 3b5 | font-import-fixer | Incorrect font imports in layout |
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

5. **`useState(...)` without `import { useState } from "react"`**.
   The model uses React hooks as bare identifiers without importing them.
   The old `react-import-fixer` only caught `React.*` usage.
   Fixed by `react-hook-import-fixer` (covers all standard hooks).

6. **Local import shadows a DOM global** (e.g. `import HTMLFormElement from "@/components/html-form-element"`).
   Confuses TypeScript and causes runtime errors when the global type is expected.
   Fixed by `dom-shadow-fixer`.

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

### Auto-fix is now enabled by default (2026-03-21)
Client-side autofix (`useAutoFix`) is now **on by default** as a safety net.
Disable via `localStorage.setItem("sajtmaskin:autofix-enabled", "false")`.
Limits: 2 attempts per reason, 3 per chat, 5-minute dedupe window.

### Shared LLM repair budget (2026-03-21)
A unified server-side repair helper (`shared-repair.ts`) runs the existing
`runLlmFixer` with a broader set of diagnostics (syntax, preview, quality-gate)
and a shared budget of 2 LLM passes (`SAJTMASKIN_BROAD_REPAIR_MAX_PASSES`).
Machine autofix always runs first; LLM only when deterministic fixers leave errors.

### CSP for Sandbox iframe
`frame-src` in `proxy.ts` must include `*.vercel.run` and `*.vercel.app`
for Sandbox preview to render in the builder iframe.

### Follow-up merge requires explicit previousFiles
`previousFiles` must flow through `GenerationStreamParams` ->
`buildFinalizeParams` -> `finalizeAndSaveVersion` for follow-up
generations to merge with previous version files instead of
regenerating from scratch.

### Preview shown even for failed versions (2026-03-23)
`resolveEngineDemoUrlDetails` now returns a legacy `/api/preview-render` URL
for versions with `verification_state === "failed"` using mode
`"verification-failed"`. Previously these returned `demoUrl: null` which
left the iframe completely blank while autofix iterated in the background.

### Placeholder env vars (2026-03-23)
When `SAJTMASKIN_AUTO_PLACEHOLDER_ENV=1`, missing project environment
variables (detected by `resolveEnvRequirements`) are auto-filled with dev
placeholder values so they never block readiness. A warning replaces the
blocker so the user can see which keys still need real configuration.

### Quality gate sandbox output (2026-03-23)
`@vercel/sandbox` `runCommand` may return stdout/stderr as `Buffer` or
`Uint8Array`. The quality gate route now normalizes these to strings so
autofix prompts receive actual `tsc`/`next build` error text instead of
the fallback "No output captured from sandbox command."

### Supabase vs Vercel hosting
Supabase provides Sajtmaskin's own database (Postgres). It does **not**
host generated Next.js sites. Supabase egress limits affect DB reads/writes
for Sajtmaskin's API but not the Vercel build/hosting of customer sites.
See `docs/architecture/repair-deploy-loop.md` for the full picture.
