# .cursor/kedja/

Gitignorerad säkerhetskopia (utom denna README) av `/kedja`-kandidaternas diffar:
`<YYYY-MM-DD_HHMM>/kandidat-<x>.diff`, sparade före teardown. Leveransen är
vinnarens `fix/kedja-*`-branch via `pr-workflow`, inte filerna här; en
förlorardiff kan vara enda kopian av den kandidaten.

Recept och städning: [`kedja-fix-pipeline`](../../.agents/skills/kedja-fix-pipeline/SKILL.md).
Rensa bara den här ytan med
`node scripts/dev/clean-scratch.mjs --apply --only .cursor/kedja`. Kör flaggor
via `node`, inte `npm run --`: npm äter `--only`, `--yes` och `--keep` innan de
når skriptet.
