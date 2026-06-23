# .cursor/bugs/

Valfri **lokal evidens-yta** för buggar — skärmdumpar, långa console-/network-dumpar och repro-anteckningar som inte ryms i en backlog-tabellcell. Mappen är **gitignored** (utom denna README) och ligger inte på GitHub.

> **Källan till sanning är [`BUG-SWARM-BACKLOG.md`](../../BUG-SWARM-BACKLOG.md)** (repo-rot). Den här mappen är **inte** en parallell bugglista och **inte** en tracker — bara lokal arbetsyta. Ingen Linear, ingen extern issue-tjänst används.

## Syfte

- Förvara tung evidens som en backlog-rad refererar till (bild, full stack trace, network-logg).
- Ge agenter snabb grep-yta för repro-detaljer utan att blåsa upp `BUG-SWARM-BACKLOG.md`.
- Stötta dublettkoll: agenter grep:ar både backloggen och denna mapp innan de lägger en ny rad.

Mappen är **inte** i `.cursorignore`, så agenter kan läsa innehållet.

## Hur buggar hamnar här

1. **Via `/buggrapport`** — en `[ ]`-rad läggs i `BUG-SWARM-BACKLOG.md § Aktiv kö`. Om rapporten har tung evidens skrivs en valfri detaljfil hit.
2. **Via agent/automation** — innan nya buggar föreslås: läs backloggen + denna mapp för att undvika dubletter.

## Status

Status lever **bara** i `BUG-SWARM-BACKLOG.md`. En fil här är en frusen evidens-snapshot, inte en status-källa. När en bugg fixas: flytta backlog-raden till arkivet (`docs/plans/avklarat/bug-swarm/backlog-arkiv-*.md`) och radera ev. lokal evidens-fil här.

## Filnamn-konvention

```text
YYYY-MM-DD_HHMM_M<n>_<kort-slug>.md
```

- `M<n>` = samma källa-id som backlog-raden (manuellt rapporterad bugg).
- Tidsstämpel = lokal tid: `Get-Date -Format "yyyy-MM-dd_HHmm"`.
- Slug: 3–6 ord, kebab-case, transliterera å→a, ä→a, ö→o.
