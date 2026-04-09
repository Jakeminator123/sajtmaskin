# P04: Fly.io VM-stabilitet — deploy och skalning

## Status

`preview-host/fly.toml` är uppdaterad till 4 GB / 2 CPU men ännu inte deployad.

## Åtgärd

1. `cd preview-host && fly deploy` — kräver Fly CLI-åtkomst.
2. Övervaka minnesförbrukning via `fly logs` och Streamlit-dashboarden.
3. Om 4 GB inte räcker (hälsokontroller failar vid last): skala till 8 GB.

## Filer

- `preview-host/fly.toml` — redan uppdaterad, bara deploy kvar.

## Prioritet

Hög — VM kraschar under last och blockerar live-preview.
