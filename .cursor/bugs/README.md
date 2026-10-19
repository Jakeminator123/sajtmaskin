# .cursor/bugs/

Gitignorerad lokal evidens (utom denna README) för backloggrader: skärmdumpar,
långa dumpar och repro-anteckningar. Status och sanning finns bara i
[`BUG-SWARM-BACKLOG.md`](../../BUG-SWARM-BACKLOG.md); en fil här är en frusen
snapshot och raderas när raden arkiveras.

Filnamn: `YYYY-MM-DD_HHMM_SM-###_<kort-slug>.md` med samma `SM-###` som raden
(aldrig `M#`). Format och arkivregler: `/buggrapport`. Städa med
`node scripts/dev/clean-scratch.mjs --apply --only .cursor/bugs`.
