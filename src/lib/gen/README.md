# gen/ — Code Generation Module

**Product terms (builderns Mallar-tab vs runtime `template-library` vs Vercel-mall, own-engine, buildern):** [`.cursor/rules/terminology.mdc`](../../../.cursor/rules/terminology.mdc). **Repo map:** [`docs/architecture/code-map.md`](../../../docs/architecture/code-map.md). **Static prompts / manifest:** [`config/README.md`](../../../config/README.md).

Human architecture overview: [`docs/architecture/README.md`](../../../docs/architecture/README.md) · [`llm-pipeline.md`](../../../docs/architecture/llm-pipeline.md) (FAS 1→2→3).

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
           │    ├─ capability inference + route plan + pre-generation contracts
           │    └─ BuildSpec / token budgets / policy
           │
           └─ finalizeOrchestrationPrompts()
                └─ buildDynamicContext()  (system-prompt/)
                     ├─ capability hints
                     ├─ scaffold context
                     ├─ route plan + pre-generation contracts
                     ├─ brief / visual identity / design references
                     ├─ token budget + block pruning → `DynamicContextPruning`
                     └─ compose static core + dynamic → `engineSystemPrompt`
                (user prompt text → **user** message in the completions request, not duplicated in system)

own-engine stream
    │
    └─ finalizeAndSaveVersion()  (stream/finalize-version.ts)
           ├─ autofix + URL expansion
           ├─ syntax validate/fix (early-stop on fixer noop / no improvement)
           ├─ optional deep path (image materialize)
           ├─ optional verifier
           ├─ parse + merge + preflight
           ├─ save assistant + version
           └─ preview / verification follow-up
```

This module is the canonical generation path (own-engine). If you need the
actual scaffold/template lookup behavior, read `scaffolds/README.md` before
opening the generated JSON blobs. The legacy `template-library/` runtime
artifact is no longer present in this folder (pipeline deprecated 2026-04-17;
see `scaffolds/registry.ts` header comment).

## Phase Model

Files in `gen/` follow the LLM pipeline's three phases:

- **Phase 2 (orchestration + generation):** Root files — orchestrate, scaffold, route plan, contracts, BuildSpec, system prompt, engine, streaming. Subdirs: `scaffolds/`, `scaffold-variants/`, `contract/`, `dossiers/`, `system-prompt/`, `build-spec/`, `orchestrate/`, `plan/`, `packs/`, `security/`.
- **Phase 3 (post-generation):** Autofix, repair, verify, quality gate, preview, export, finalize. Subdirs: `autofix/`, `stream/` (incl. `finalize-version/`), `verify/`, `validation/`, `post-process/`, `export/`, `preview/`, `suspense/`, `retry/`.
- **Phase 1 (pre-orchestration):** Prompt processing, brief, intent, model selection. Lives in `src/lib/builder/`, not here.

## Key Files

| File | Phase | Role |
|------|-------|------|
| `orchestrate.ts` | 2 | Canonical fan-in: scaffold selection, route planning, contract inference, BuildSpec, prompt assembly. |
| `orchestrate/` | 2 | Helpers split out of `orchestrate.ts` (generation-package, scaffold-query-context, scaffold-variant-resolver, policy-helpers). |
| `system-prompt/` | 2 | Builds dynamic prompt context (`build-dynamic-context.ts`) and composes the final engine system prompt (`compose.ts`). |
| `engine.ts` | 2 | Core generation via `streamText()` + `createCodeGenSSEStream()`. |
| `generation-input-package.ts` | 2 | `GenerationInputPackage` type, `computeLineageHash()`, dump serialization. |
| `build-spec/` | 2 | Derives `BuildSpec` (policy, budgets, quality targets) from all inputs. Public entry: `deriveBuildSpec` in `builder.ts`, types in `types.ts`, barrel in `index.ts` (post-OMTAG-03 split — no top-level `build-spec.ts` anymore). |
| `route-plan.ts` | 2 | Builds and normalizes route plans from brief/prompt/scaffold. |
| `capability-inference.ts` | 2 | Regex-based prompt capability classification. |
| `parser.ts` | 2–3 | Parses fenced code blocks from streamed content. Used across phases. |
| `version-manager.ts` | 2–3 | DB version accessors, file parsing, merge. Used across phases. |
| `url-compress.ts` | 2 | Compresses long URLs to aliases before LLM, expands after. |
| `scaffolds/` | 2 | Runtime scaffold manifests, matcher/search/serialize, research/embeddings. |
| `scaffold-variants/` | 2 | Visual variant per scaffold: signature patterns, motifs, anti-patterns, embedding pick. |
| `dossiers/` | 2 | Capability-baserad dossier-pipeline (ersättare för legacy template-library guidance). |
| `stream/finalize-version/` | 3 | Shared post-stream pipeline package: autofix, parse/merge/preflight, persistence (`runner.ts` + phase/policy/persist-helpers; post-OMTAG-03 split). |
| `stream/stream-format.ts` | 2–3 | Converts AI SDK stream to SSE events. |
| `stream/sse-parser.ts` | 2–3 | SSE buffer parser + suspense line processor (f.d. `route-helpers.ts`). |
| `autofix/` | 3 | Post-generation fixers: imports, JSX, deps, repair. |
| `autofix/repair-generated-files.ts` | 3 | Deterministic repairs (imports, hooks, Lucide, metadata). |
| `verify/` | 3 | Verifier pass, quality gate, server-verify loop. |
| `preview/` | 3 | Preview runtime: HTML build, transpile, CSS, shims. |
| `export/project-scaffold.ts` | 3 | Project skeleton for export/preview: baseline package.json, tsconfig, boilerplate. |
| `export/build-exportable-project.ts` | 3 | Canonical wrapper: scaffold merge + UI resolution + repair. |

## Generated Artifacts And Indexing

Large generated files under `src/lib/gen/` can shape runtime or local validation/tooling,
even when they are excluded from normal Cursor indexing.

Paths in the table below are relative to `src/lib/gen/` unless noted otherwise.

| Path | Role | Normal handling |
|------|------|----------------|
| `scaffolds/scaffold-research.generated.json` | Generated scaffold research metadata overlaid into runtime scaffold manifests. | Generated locally, gitignored, do not hand-edit unless you are deliberately repairing a bad artifact. |
| `scaffolds/scaffold-embeddings.json` | Embeddings for the internal runtime scaffolds. | Generated locally, gitignored, only used by semantic scaffold fallback/debugging. |

The legacy `template-library/template-library.generated.json` + embeddings file is no longer present in this folder; the pipeline was deprecated 2026-04-17 (see `scaffolds/registry.ts`). Use the dossier pipeline (`dossiers/`) for per-integration runtime guidance.

Guidelines:

- Treat scaffold artifacts as runtime/build-time helpers, not disposable scratch output.
- Do not hand-edit them as a normal workflow. Prefer regenerating them from the
  scripts documented in `scripts/README.md`.
- Keeping them in `.cursorignore` is about search/indexing cost, not about
  forbidding access. Read them directly when a task actually depends on their
  structure or contents.
- When you only need orientation, prefer this README plus
  `docs/architecture/code-map.md` over opening the full JSON artifacts.

Common regeneration entry points (verify against `package.json` "scripts" — `template-library:*` is gone):

```bash
npm run scaffolds:embeddings
npm run scaffolds:variant-embeddings
npm run scaffolds:variant-patterns
npm run scaffolds:validate
npm run scaffolds:eval
```

## Practical Smoke Test

For a real prompt-driven dry run against the local dev server, use Builder or
call the own-engine HTTP/SSE routes directly:

```bash
POST /api/engine/chats/stream
GET  /api/engine/chats/{chatId}/files?versionId=...
```

## Adding suspense stream rules

Add `suspense/rules/<name>.ts` implementing `SuspenseRule` from `suspense/transform.ts`, export it from `suspense/index.ts`, and append to `DEFAULT_RULES` (order matters). Do not throw from `transform` — return the line unchanged on failure. Copy an existing rule as a template.
