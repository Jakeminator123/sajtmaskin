# v0 + Vercel Doc Agents

Local helper scripts for asking simple documentation questions directly in the
browser UI for:

- `v0.app/docs`
- `vercel.com/docs`

These are research helpers only. They are not part of the production builder,
the own engine, or the runtime deployment path.

## Files

- `talk_to_v0_doc/ask_v0.py`
- `talk_to_vercel_doc/ask_vercel.py`

Each script opens the relevant docs page, clicks the site's "Ask AI" UI if
needed, sends a prompt, waits for the answer to finish streaming, and prints
the result in the terminal.

## Local-only files

The following are intentionally gitignored:

- `.env`
- `.chrome-v0-profile/`
- `.chrome-vercel-profile/`
- Python cache files

Those files may contain local browser state or machine-specific settings and
must not be committed.

## Usage

Install Playwright with Chrome support in the Python environment you use for
these helpers.

Optional env:

```env
HEADLESS_ASK=n
```

Run either helper from its own folder, or from the repo root:

```powershell
python .\tools\doc-browser\talk_to_v0_doc\ask_v0.py
python .\tools\doc-browser\talk_to_vercel_doc\ask_vercel.py
```

Commands inside the interactive loop:

- `/reset`
- `/reload`
- `/exit`

## Notes

- These helpers are useful for quick doc lookups and product-behavior questions.
- For structured platform operations, prefer the existing MCP tools in this repo.
- For the main builder/generation flow, the own engine remains the default path.
