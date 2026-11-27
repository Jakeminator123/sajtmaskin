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

if [ -n "${RENDER:-}" ]; then
  if [ -z "${OPENCLAW_GATEWAY_TOKEN:-}" ]; then
    echo "[entrypoint] ERROR: OPENCLAW_GATEWAY_TOKEN is required for a public Render gateway" >&2
    exit 1
  fi
  BIND_MODE=loopback
  export OPENCLAW_GATEWAY_BIND=loopback
  SAJTAGENT_INTERNAL_PORT=18789
  if [ "$LISTEN_PORT" = "$SAJTAGENT_INTERNAL_PORT" ]; then SAJTAGENT_INTERNAL_PORT=18790; fi
  export SAJTAGENT_INTERNAL_PORT
  export OPENCLAW_GATEWAY_PORT="$SAJTAGENT_INTERNAL_PORT"
elif [ -z "${OPENCLAW_GATEWAY_TOKEN:-}" ] && [ "$BIND_MODE" != "loopback" ]; then
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
export OPENCLAW_STATE_DIR="$OPENCLAW_DIR" OPENCLAW_CONFIG_PATH="$CONFIG_FILE"
write_config() {
  OPENCLAW_GATEWAY_BIND="$BIND_MODE" node "$CONFIG_GENERATOR" "$CONFIG_FILE" "$OPENCLAW_DIR"
}
write_config

# The pinned Doctor can exit 0 after blocking/deferment. Its successful outro
# must be the final nonblank stdout line. Pass its exit code through the pipe
# separately so POSIX sh can check both without logging the private report.
echo "[entrypoint] Checking mounted OpenClaw state before gateway startup"
if ! {
  doctor_exit=0
  # Doctor owns this container-local receipt for a sealed pre-repair capture.
  # A restart still checks and repairs state without retaining a duplicate copy.
  OPENCLAW_IMAGE_ACTIVATION_CAPTURE_MARKER=/run/sajtagenten-doctor-capture \
    NO_COLOR=1 FORCE_COLOR=0 openclaw doctor --fix --non-interactive 2>/dev/null || doctor_exit=$?
  printf '\nexit=%s\n' "$doctor_exit"
} | awk '
  NF { previous = last; last = $0 }
  END { exit !(last == "exit=0" && previous ~ /^[[:space:]]*((—|└)[[:space:]]+)?Doctor complete\.[[:space:]]*$/) }
'; then
  echo "[entrypoint] OpenClaw state repair did not complete. Gateway startup stopped." >&2
  exit 78
fi

# Doctor may rewrite openclaw.json. Render owns the gateway auth, models and
# tools. Restore that contract after the repair and before starting the gateway.
write_config >/dev/null
echo "[entrypoint] OpenClaw state repair complete"

echo "[entrypoint] OpenClaw version: ${OPENCLAW_VERSION:-unknown}"
echo "[entrypoint] Target site: ${SAJTAGENT_TARGET_SITE_URL:-http://localhost:3000}"
echo "[entrypoint] Control UI device auth: enabled (OpenClaw secure default)"
echo "[entrypoint] First browser connect: paste the gateway token and list pending devices on the internal gateway port"
echo "[entrypoint] Approve only the current request with 'openclaw devices approve <requestId>'; pending IDs expire or can be superseded"
if [ -n "${RENDER:-}" ]; then
  echo "[entrypoint] Render ingress on port $LISTEN_PORT, OpenClaw on loopback port $SAJTAGENT_INTERNAL_PORT"
  exec /usr/local/bin/serve-render-gateway.sh "$LISTEN_PORT" "$SAJTAGENT_INTERNAL_PORT"
fi

if [ -n "${OPENCLAW_GATEWAY_TOKEN:-}" ]; then
  exec openclaw gateway --port "${LISTEN_PORT}" --bind "${BIND_MODE}" --token "${OPENCLAW_GATEWAY_TOKEN}" --allow-unconfigured
fi

exec openclaw gateway --port "${LISTEN_PORT}" --bind "${BIND_MODE}" --allow-unconfigured
