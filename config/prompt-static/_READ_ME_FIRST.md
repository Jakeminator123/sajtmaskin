# Own-engine **static** prompt (this folder)

These `.md` files are **only** the fixed (“static”) half of the codegen system prompt. They are **concatenated in order** listed in `config/codegen-static-prompt.json` and sent as the **prefix** of the single `system` string to the **building** LLM.

Do **not** use `config/systemprompt` (no file extension). It is **not** a supported path anymore — use this folder + `config/codegen-static-prompt.json` only (or temporary `config/systemprompt.md` if you are about to run the split script).

## What is **not** here (dynamic — built in TypeScript)

The app **does not** inject placeholders into these files. Anything that changes per request lives in **`buildDynamicContext`** in `src/lib/gen/system-prompt.ts`, for example:

- Custom instructions from the builder UI  
- Build intent rules (template / website / app)  
- Serialized scaffold + research hints  
- Route plan, pre-generation contracts  
- Template-library matches, KB snippets  
- Brief structure from deep brief (when present)  

If you duplicate those topics here, the model gets **conflicting or stale** instructions. Keep this folder for **stable** product rules only.

## Editing

1. Open `config/codegen-static-prompt.json` — fragment order = assembly order.  
2. Edit the relevant `prompt-static/*.md` file.  
3. To add a section: new file under `prompt-static/` + add its path to `fragments` in the JSON.  
4. Re-run `npm run dev` / save — the loader uses file mtimes (no rebuild required for text changes).

## Regenerate fragments from an old monolith

If you restore a single `config/systemprompt.md`, you can re-split:

`node scripts/split-codegen-static-prompt.mjs`

## Inspect generated **dynamic** prompts locally

Set `SAJTMASKIN_PROMPT_DUMP=1` (or `true`) in `.env.local`, restart `npm run dev`, then trigger a build. The app writes **overwritable “latest” files** under `data/prompt-dumps/` (gitignored):

| Folder | Innehåll |
|--------|----------|
| `orchestration-dynamic/` | `latest.md` — output från `buildDynamicContext` (samma som `v0EnrichmentContext`). |
| `own-engine-codegen/` | `full-system.md` + `dynamic-context.md` — exakt vad codegen-LLM:en får som `system` (plus `meta.json`). |
| `plan-mode-planner/` | Planläge: `planner-preamble.md`, `dynamic-context.md`, `full-system.md`. |

Utan denna env-variabel skrivs inga dumpfiler (t.ex. i produktion).
