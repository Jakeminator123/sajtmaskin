# External Reference Library

This folder stores curated external reference dossiers derived from raw template
research, local datasets, and cloned repos.

It belongs to the research lane, not the runtime lane.

## Purpose

- Give agents a cleaner, smaller, and more trustworthy external reference layer.
- Separate raw discovery noise from curated reusable knowledge.
- Support future scaffold upgrades without turning full external repos into
  direct runtime dependencies.

## Structure

- `catalog.json` full audit output
- `catalog.md` human summary
- `schema.template-manifest.json` shape of each reference dossier manifest (must be **UTF-8 without BOM** — not UTF-16)
- `dossiers/<template-id>/manifest.json`
- `dossiers/<template-id>/summary.md`
- `dossiers/<template-id>/selected_files/*.md`

## Encoding (especially on Windows)

JSON here must be **UTF-8** (ASCII is fine). **Do not** save as UTF-16 (“Unicode” in some dialogs) — tools then see a BOM/null-byte pattern and `JSON.parse` / Python `json` will fail.

- **Cursor / VS Code:** status bar → encoding → **Save with Encoding** → **UTF-8** (avoid *UTF-16 LE/BE*). Optionally set `files.encoding` to `utf8` in settings.
- **Notepad (Win 11):** *Save as* → encoding **UTF-8** (not *UTF-16 LE*).
- **PowerShell:** avoid `Set-Content` defaults; use  
  `[System.IO.File]::WriteAllText($path, $content, [System.Text.UTF8Encoding]::new($false))` for BOM-free UTF-8.

## Important boundary

This folder does not directly power runtime scaffolds.
It is a curated reference layer for improving them over time.

Runtime generation still uses:

- `src/lib/gen/scaffolds/registry.ts`
- `src/lib/gen/scaffolds/matcher.ts`
- `src/lib/gen/scaffolds/serialize.ts`

Promotion into runtime should happen only after evaluation, not automatically
when a reference dossier is generated.

## Upstream inputs

Typical upstream inputs include:

- canonical raw discovery under `scaffold-pipeline/discovery/current/`
- local repo cache under `scaffold-pipeline/repo-cache/`
- legacy `_sidor` datasets only through normalized import or transitional fallback

The curation/build scripts should prefer the repo-local cache and canonical raw
discovery lane. Legacy desktop paths are migration inputs, not the preferred
steady state.
