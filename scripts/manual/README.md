# Manual scripts

Interaktiva eller sällan körda verktyg som **inte** har `npm run`‑alias i rotens `package.json`.

| Script | Beskrivning |
|--------|-------------|
| [`scaffold-pipeline.py`](./scaffold-pipeline.py) | Meny för template-library-kedjan ovanpå den kanoniska data-roten `data/external-template-pipeline/`, med entrypoint via `full_template_refresh.py` / `hamta_sidor_branch_emil.py`. Kör: `python scripts/manual/scaffold-pipeline.py` från repo-rot. |

`vercel_template_cli.py` (tidigare här) är borttagen. Använd `hamta_sidor_branch_emil.py` eller `full_template_refresh.py` i stället.

Se även [`scripts/README.md`](../README.md).
