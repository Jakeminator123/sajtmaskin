# Infrastructure Layout

Infrastructure and deployment files are grouped under `infra/` where possible.

## Inspector Worker

- Compose file: `infra/inspector-worker/docker-compose.yml`
- App service code: `services/inspector-worker/`
- Docker commands: use npm scripts in `package.json`:
  - `npm run inspector:docker:up`
  - `npm run inspector:docker:ps`
  - `npm run inspector:docker:logs`
  - `npm run inspector:docker:down`

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
