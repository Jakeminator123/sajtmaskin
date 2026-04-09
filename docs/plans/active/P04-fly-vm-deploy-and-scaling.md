# P04: Fly.io VM-stabilitet — deploy och skalning

## Status

`preview-host/fly.toml` är uppdaterad till 4 GB / 2 CPU men ännu inte deployad.
Zombie-risk i cleanup var tidigare identifierad: utgångna sessioner/workspaces kunde rensas
utan att levande runtimeprocesser stoppades först. Det är nu fixat i `preview-host/src/runtime.js`
med stop-then-delete cleanup och bevarande av rader där stop misslyckas.

## Åtgärd

1. `cd preview-host && fly deploy` — kräver Fly CLI-åtkomst.
2. Övervaka minnesförbrukning via `fly logs` och Streamlit-dashboarden.
3. Om 4 GB inte räcker (hälsokontroller failar vid last): skala till 8 GB.

## Filer

- `preview-host/fly.toml` — redan uppdaterad, bara deploy kvar.
- `preview-host/src/runtime.js` — cleanup stoppar nu stale runtimes före session/workspace-rensning.
- `preview-host/README.md` — dokumenterat cleanup-beteende och driftnoter.

## Prioritet

Hög — VM kraschar under last och blockerar live-preview.
