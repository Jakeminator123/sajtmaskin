#!/bin/sh
set -e

# These paths are overridable only so the real boot path can be regression-
# tested in a sandbox. Production uses the container defaults.
OPENCLAW_DIR="${SAJTAGENT_HOME_DIR:-/root/.openclaw}"
SEED_DIR="${SAJTAGENT_SEED_DIR:-/app/seed}"
CONFIG_GENERATOR="${SAJTAGENT_CONFIG_GENERATOR:-/usr/local/lib/openclaw/generate-config.mjs}"
CONFIG_FILE="$OPENCLAW_DIR/openclaw.json"
WORKSPACE_DIR="$OPENCLAW_DIR/workspace-sajtagenten"
LISTEN_PORT="${PORT:-${OPENCLAW_GATEWAY_PORT:-18789}}"
BIND_MODE="${OPENCLAW_GATEWAY_BIND:-lan}"
OPENCLAW_VERSION="$(openclaw --version 2>/dev/null | tr -d '\r')"

if [ -z "${OPENCLAW_GATEWAY_TOKEN:-}" ] && [ "$BIND_MODE" != "loopback" ]; then
  if [ -n "${RENDER:-}" ]; then
    echo "[entrypoint] ERROR: OPENCLAW_GATEWAY_TOKEN is required for a public Render gateway" >&2
    exit 1
  fi
  echo "[entrypoint] OPENCLAW_GATEWAY_TOKEN missing; forcing loopback bind"
  BIND_MODE="loopback"
fi

if [ -n "${OPENCLAW_CONTROLUI_DISABLE_DEVICE_AUTH:-}" ]; then
  echo "[entrypoint] WARNING: OPENCLAW_CONTROLUI_DISABLE_DEVICE_AUTH is retired and ignored; remove it from service env"
fi

mkdir -p "$WORKSPACE_DIR"
for agent_id in sajtagenten sajtagenten-balanced sajtagenten-fast; do
  agent_dir="$OPENCLAW_DIR/agents/$agent_id/agent"
  mkdir -p "$agent_dir"
  cp "$SEED_DIR/IDENTITY.md" "$agent_dir/IDENTITY.md"
done
echo "[entrypoint] IDENTITY.md refreshed for all Sajtagenten model lanes"

# Seeded workspace instructions are config-managed and refreshed on every boot.
# Files created by the agent outside the seeded names remain on the persistent
# disk, while skipBootstrap=true prevents OpenClaw from creating extra defaults.
if [ -d "$SEED_DIR/workspace" ]; then
  cp -rf "$SEED_DIR/workspace/." "$WORKSPACE_DIR/" 2>/dev/null || true
  echo "[entrypoint] Seeded workspace files refreshed from image"
fi

# Keep shell interpolation out of JSON entirely. The Node generator validates
# URLs/model refs, serializes every env value safely, and writes mode 0600. This
# also handles valid secrets beginning with '-' without passing them as Node
# command-line options.
OPENCLAW_GATEWAY_BIND="$BIND_MODE" \
  node "$CONFIG_GENERATOR" "$CONFIG_FILE" "$OPENCLAW_DIR"

echo "[entrypoint] OpenClaw version: ${OPENCLAW_VERSION:-unknown}"
echo "[entrypoint] Target site: ${SAJTAGENT_TARGET_SITE_URL:-http://localhost:3000}"
echo "[entrypoint] Control UI device auth: enabled (OpenClaw secure default)"
echo "[entrypoint] First browser connect: paste the gateway token, then run 'openclaw devices list --json' in Render Shell"
echo "[entrypoint] Approve only the current request with 'openclaw devices approve <requestId>'; pending IDs expire or can be superseded"
echo "[entrypoint] Render's untrusted proxy-header warning is expected with token auth and is not a device-pairing failure"

if [ -n "${OPENCLAW_GATEWAY_TOKEN:-}" ]; then
  exec openclaw gateway --port "${LISTEN_PORT}" --bind "${BIND_MODE}" --token "${OPENCLAW_GATEWAY_TOKEN}" --allow-unconfigured
fi

exec openclaw gateway --port "${LISTEN_PORT}" --bind "${BIND_MODE}" --allow-unconfigured
