# P04: Fly.io VM-stabilitet — deploy och skalning

## Status

**Klar.** `preview-host/fly.toml` är nu deployad med uppskalade värden (`8gb`, `4 cpu`),
och `https://vm-fly-jakem.fly.dev/health` svarar korrekt efter deploy.
Zombie-risk i cleanup är fixad i `preview-host/src/runtime.js`
med stop-then-delete cleanup och bevarande av rader där stop misslyckas.

## Notering efter deploy

- Fly CLI visade en kort listen-varning under rollout, men health check passerade direkt efter att
  appen startat och `/health` verifierades manuellt.
- Nästa uppföljning är bara vanlig driftobservation under verklig last, inte ett öppet implementationsspår.

## Åtgärd

1. `cd preview-host && fly deploy`
2. Övervaka minnesförbrukning via `fly logs` och Streamlit-dashboarden
3. Justera vidare bara om verklig last fortfarande visar minnestryck

## Filer

- `preview-host/fly.toml` — uppdaterad och deployad.
- `preview-host/src/runtime.js` — cleanup stoppar nu stale runtimes före session/workspace-rensning.
- `preview-host/README.md` — dokumenterat cleanup-beteende och driftnoter.

## Prioritet

Hög — VM kraschar under last och blockerar live-preview.
