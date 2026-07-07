# Infrastructure Layout

Infrastructure and deployment files are grouped under `infra/` where possible.

## OpenClaw / Sajtagenten

- Deployment root: `infra/openclaw/`
- Render blueprint: `infra/openclaw/render.yaml`
- Docker image files:
  - `infra/openclaw/Dockerfile`
  - `infra/openclaw/docker-entrypoint.sh`
  - `infra/openclaw/docker-healthcheck.sh`
- Seeded OpenClaw config:
  - `infra/openclaw/config/agents/sajtagenten/agent/IDENTITY.md`
  - `infra/openclaw/config/workspace/`
- Runtime note: container entrypoint seeds one publik `sajtagenten`-yta och låter modellen använda en primär/fallback-kedja via `OPENCLAW_MODEL_PRIMARY` och `OPENCLAW_MODEL_FALLBACK`.

