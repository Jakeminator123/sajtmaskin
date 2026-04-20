# Own-engine **Core Rules** (this folder)

These `.md` files are the **immutable product constraints** of the codegen system prompt. They are **concatenated in order** listed in `config/codegen-core-manifest.json` and sent as the **prefix** of the single `system` string to the **building** LLM.

Core Rules never vary per request. They define stack, output format, component contracts, behavioral rules, accessibility, import conventions, baseline visual quality and content voice.

## What is **not** here

### Per-request signal lives in `buildDynamicContext()` (TypeScript)
The app assembles request-specific context in `buildDynamicContext()` in `src/lib/gen/system-prompt.ts`:

- Custom instructions from the builder UI
- Build intent rules (template / website / app)
- Generation profile, scaffold variant (theme tokens, signature patterns, prompt hints)
- Serialized scaffold + capability hints
- Route plan, pre-generation contracts
- Scaffold research priorities / reference inspirations
- Brief structure from deep brief (when present) — colors, typography, tone, must-have/avoid
- Domain inference, motion guidance, quality bar (`resolveGuidanceBlocks`)
- Design references, theme signals, follow-up context
- Tier-3 build plan (F3) or F2 design contract

The signal **cascade** (highest precedence first) is: brief explicit → brief inferred → guidance-resolvers heuristics → static defaults in this folder.

The legacy `config/prompt-directives/` adaptive layer was removed 2026-04-18: only `visual-design` and `coding-direction` were ever runtime-injected, so they live as plain core fragments here (`03-visual-design.md`, `04-coding-direction.md`). The 10 unused directive files were aspirational placeholders the substitution engine never used.

If you duplicate per-request topics in core, the model gets **conflicting or stale** instructions.

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
