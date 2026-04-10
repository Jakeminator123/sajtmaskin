# Own-engine **static** prompt (this folder)

These `.md` files are **only** the fixed (“static”) half of the codegen system prompt. They are **concatenated in order** listed in `config/codegen-static-prompt.json` and sent as the **prefix** of the single `system` string to the **building** LLM.

Do **not** use `config/systemprompt` (no file extension). It is **not** a supported path anymore — use this folder + `config/codegen-static-prompt.json` only.

## What is **not** here (dynamic — built in TypeScript)

The app **does not** inject placeholders into these files. Anything that changes per request lives in **`buildDynamicContext`** in `src/lib/gen/system-prompt.ts`, for example:

- Custom instructions from the builder UI  
- Build intent rules (template / website / app)  
- Serialized scaffold + capability hints  
- Route plan, pre-generation contracts  
- Scaffold research priorities / reference inspirations  
- Brief structure from deep brief (when present)  
- Design references, theme signals, follow-up context  

If you duplicate those topics here, the model gets **conflicting or stale** instructions. Keep this folder for **stable** product rules only.

## Editing

1. Open `config/codegen-static-prompt.json` — fragment order = assembly order.  
2. Edit the relevant `prompt-static/*.md` file.  
3. To add a section: new file under `prompt-static/` + add its path to `fragments` in the JSON.  
4. Re-run `npm run dev` / save — the loader uses file mtimes (no rebuild required for text changes).

Follow-up / existing-project guardrails are now consolidated into
`07-existing-files-do-not-regenerate-unless-explicit.md` plus
`13-intent-fidelity-and-merge.md`; there is no separate `12-follow-up-messages.md`
fragment anymore.

## Inspect generated **dynamic** prompts locally

Set `SAJTMASKIN_PROMPT_DUMP=1` (or `true`) in `.env.local`, restart `npm run dev`, then trigger a build. The app writes **overwritable “latest” files** under `data/prompt-dumps/` (gitignored):

| Folder | Innehåll |
|--------|----------|
| `orchestration-dynamic/` | `latest.md` + `generation-input-package.json` — request-specifik dynamisk systemkontext och serialiserad fan-in-artefakt från orkestreringen. |
| `own-engine-codegen/` | `full-system.md` + `dynamic-context.md` — exakt vad codegen-LLM:en får som `system` (plus `meta.json`). |
| `plan-mode-planner/` | Planläge: `planner-preamble.md`, `dynamic-context.md`, `full-system.md` (plus `meta.json`). |

Utan denna env-variabel skrivs inga nya payload-dumpfiler. `meta.json` kan fortfarande uppdateras så dashboardar kan markera status som `disabled` eller `stale-risk`.
