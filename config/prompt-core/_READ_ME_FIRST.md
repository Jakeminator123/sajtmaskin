# Own-engine **Core Rules** (this folder)

These `.md` files are the **immutable product constraints** of the codegen system prompt. They are **concatenated in order** listed in `config/codegen-core-manifest.json` and sent as the **prefix** of the single `system` string to the **building** LLM.

Core Rules never vary per request. They define stack, output format, component contracts, behavioral rules, accessibility, and import conventions.

## What is **not** here

### Directives (adaptive prompt modules)
Anything that **adapts per request** — visual design, motion, quality bar, domain hints, seasonal palettes, follow-up scope, creative extensions — lives in `config/prompt-directives/`. Directives have placeholder defaults that are resolved through the **Directive Cascade**:

1. **EXPLICIT** — Brief/prompt provides an exact value
2. **INDICATED** — Strong signal in the prompt (Brief-LLM infers)
3. **INFERRED** — guidance-resolvers / deterministic heuristics
4. **DEFAULT** — Placeholder in the directive file

### Dynamic Context (built in TypeScript)
The app assembles request-specific context in `buildDynamicContext()` in `src/lib/gen/system-prompt.ts`:

- Custom instructions from the builder UI
- Build intent rules (template / website / app)
- Serialized scaffold + capability hints
- Route plan, pre-generation contracts
- Scaffold research priorities / reference inspirations
- Brief structure from deep brief (when present)
- Design references, theme signals, follow-up context

If you duplicate those topics here, the model gets **conflicting or stale** instructions.

## Editing

1. Open `config/codegen-core-manifest.json` — fragment order = assembly order.
2. Edit the relevant `prompt-core/*.md` file.
3. To add a section: new file under `prompt-core/` + add its path to `fragments` in the JSON.
4. Re-run `npm run dev` / save — the loader uses file mtimes (no rebuild required for text changes).

## Inspect generated prompts locally

Set `SAJTMASKIN_PROMPT_DUMP=1` (or `true`) in `.env.local`, restart `npm run dev`, then trigger a build. The app writes **overwritable "latest" files** under `data/prompt-dumps/` (gitignored):

| Folder | Content |
|--------|---------|
| `orchestration-dynamic/` | `latest.md` + `generation-input-package.json` — request-specific dynamic context and serialized fan-in artifact from orchestration. |
| `own-engine-codegen/` | `full-system.md` + `dynamic-context.md` — exactly what the codegen LLM receives as `system` (plus `meta.json`). |
| `plan-mode-planner/` | Plan mode: `planner-preamble.md`, `dynamic-context.md`, `full-system.md` (plus `meta.json`). |
