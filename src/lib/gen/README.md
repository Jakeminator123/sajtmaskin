# gen/ — Code Generation Module

**Product terms (builderns Mallar-tab vs runtime `template-library` vs Vercel-mall, own-engine, buildern):** [`.cursor/rules/terminology.mdc`](../../../.cursor/rules/terminology.mdc). **Repo map:** [`docs/architecture/repo-tree.md`](../../../docs/architecture/repo-tree.md). **Static prompts / manifest:** [`config/README.md`](../../../config/README.md).

Human architecture overview: [`docs/architecture/README.md`](../../../docs/architecture/README.md) · [`builder-generation.md`](../../../docs/architecture/builder-generation.md).

Sajtmaskin's own code generation engine. Uses OpenAI models via AI SDK to
generate Next.js/React sites from prompts. Builder **codegen** uses this
own-engine path only; v0 Platform API is not used for `createGenerationPipeline`.

## Current Flow

```
Builder/API prompt
    │
    ├─ orchestratePromptMessage()  (promptOrchestration.ts) — alltid
    ├─ (create-chat) ev. server Deep Brief → meta.brief  (site-brief-generation.ts)
    │
    └─ prepareGenerationContext()  (orchestrate.ts)
           │
           ├─ resolveOrchestrationBase()
           │    ├─ scaffold selection (manual / persisted / auto)
           │    ├─ route plan + pre-generation contracts
           │    └─ BuildSpec / token budgets / policy
           │
           └─ finalizeOrchestrationPrompts()
                └─ buildDynamicContext()  (system-prompt.ts)
                     ├─ scaffold context
                     ├─ template-library guidance
                     ├─ knowledge-base enrichment
                     └─ final engine system prompt

own-engine stream
    │
    └─ finalizeAndSaveVersion()  (stream/finalize-version.ts)
           ├─ autofix + URL expansion
           ├─ optional deep path (image materialize / polish)
           ├─ syntax validate/fix (early-stop on fixer noop / no improvement)
           ├─ parse + merge + preflight
           ├─ save assistant + version
           └─ sandbox / verification follow-up
```

This module is the canonical generation path (own-engine). If you need the
actual scaffold/template lookup behavior, read `scaffolds/README.md` and
`template-library/README.md` before opening the generated JSON blobs.

## Key Files

| File | Role |
|------|------|
| `orchestrate.ts` | Canonical fan-in for scaffold selection, route planning, contract inference, BuildSpec derivation, and prompt assembly inputs. |
| `system-prompt.ts` | Builds dynamic prompt context (scaffold, KB, template-library guidance) and composes the final engine system prompt. |
| `scaffolds/` | Runtime scaffold manifests, matcher/search/serialize logic, and generated scaffold research/embeddings. |
| `template-library/` | Curated external-template guidance used by prompt ranking and reference injection. |
| `stream/finalize-version.ts` | Shared post-stream pipeline: autofix, deep-path steps, parse/merge/preflight, persistence, telemetry, and scaffold-retry suggestions. |
| `generation-input-package.ts` | `GenerationInputPackage` type, `computeLineageHash()`, and dump serialization. |
| `server-verify.ts` | Server-side verify+repair loop triggered after finalize, with early stop on fixer noop / no improvement. |
| `engine.ts` | Core generation via `streamText()` + `createCodeGenSSEStream()`. |
| `stream-format.ts` | Converts AI SDK stream to SSE events (`meta`, `thinking`, `content`, `done`, `error`). |
| `url-compress.ts` | Compresses long URLs to aliases before LLM (saves tokens), expands after. |
| `suspense/` | TransformStream rules that fix code during streaming (shadcn imports, Lucide icons, URL expansion). |
| `autofix/` | Post-generation fixers: import validation, JSX check, dep completer. |
| `parser.ts` | Parses fenced code blocks from streamed content. |
| `preview/` | Preview runtime modules. `preview/index.ts` exposes `buildPreviewHtml()` and `buildPreviewUrl()`, while sibling files split resolution, CSS, transpilation, script assembly, and shims. |
| `version-manager.ts` | Creates versions from content, parses files. |

## Generated Artifacts And Indexing

Large generated files under `src/lib/gen/` are part of the runtime surface, even
when they are excluded from normal Cursor indexing.

Paths in the table below are relative to `src/lib/gen/` unless noted otherwise.

| Path | Role | Normal handling |
|------|------|----------------|
| `data/docs-embeddings.json` | Embeddings derived from documentation snippets used by generation support. | Generated, committed, rarely hand-edited, usually safe to keep in `.cursorignore`. |
| `scaffolds/scaffold-research.generated.json` | Generated scaffold research metadata committed for runtime/build-time use. | Generated, committed, do not hand-edit unless you are deliberately repairing a bad artifact. |
| `scaffolds/scaffold-embeddings.json` | Embeddings for the internal runtime scaffolds. | Generated, committed, direct-read only when debugging scaffold search/matching. |
| `template-library/template-library.generated.json` | Curated template-library artifact used for runtime search and prompt support. | Generated, committed, large enough to keep out of default indexing. |
| `template-library/template-library-embeddings.json` | Embeddings for the curated template-library artifact. | Generated, committed, usually only needed for targeted debugging or rebuild validation. |
| `../../data/external-template-pipeline/reports/scaffold-candidates-curated.json` | Ranked scaffold candidate report from the external template pipeline. | Generated, not a runtime dependency, useful for curation and agent orientation only. |

Guidelines:

- Treat these files as runtime-critical artifacts, not disposable local output.
- Do not hand-edit them as a normal workflow. Prefer regenerating them from the
  scripts documented in `scripts/README.md`.
- Keeping them in `.cursorignore` is about search/indexing cost, not about
  forbidding access. Read them directly when a task actually depends on their
  structure or contents.
- When you only need orientation, prefer this README plus
  `docs/architecture/repository-and-platform.md` over opening the full JSON artifacts.

Common regeneration entry points:

```bash
npm run template-library:build
npm run template-library:embeddings
npm run scaffolds:embeddings
npm run scaffolds:curate
npm run scaffolds:validate
```

## Practical Smoke Test

For a real prompt-driven dry run against the local dev server, use:

```bash
python scripts/cli/builder-generate.py
```

That script calls the same own-engine HTTP/SSE routes as Builder and writes the
captured result under `output/generations/<timestamp>-<slug>/` with:

- `metadata.json` (`streamMeta`, `templateLibrarySearch`, route plan, preflight)
- `brief.json` when deep brief was used
- `files/` with the saved version payload

## Adding suspense stream rules

Add `suspense/rules/<name>.ts` implementing `SuspenseRule` from `suspense/transform.ts`, export it from `suspense/index.ts`, and append to `DEFAULT_RULES` (order matters). Do not throw from `transform` — return the line unchanged on failure. Copy an existing rule as a template.
