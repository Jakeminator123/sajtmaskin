#!/bin/sh
set -e

OPENCLAW_DIR="/root/.openclaw"
CONFIG_FILE="$OPENCLAW_DIR/openclaw.json"
AGENT_DIR="$OPENCLAW_DIR/agents/sajtagenten/agent"
WORKSPACE_DIR="$OPENCLAW_DIR/workspace-sajtagenten"
LISTEN_PORT="${PORT:-${OPENCLAW_GATEWAY_PORT:-18789}}"
BIND_MODE="${OPENCLAW_GATEWAY_BIND:-lan}"
MODEL_PRIMARY="${OPENCLAW_MODEL_PRIMARY:-openai/gpt-5.1-codex}"
MODEL_FALLBACK="${OPENCLAW_MODEL_FALLBACK:-openai/gpt-5.3-codex}"
OPENCLAW_VERSION="$(openclaw --version 2>/dev/null | tr -d '\r')"
CONTROLUI_DISABLE_DEVICE_AUTH="${OPENCLAW_CONTROLUI_DISABLE_DEVICE_AUTH:-false}"

# Target site URL that the agent should have broad read access to
TARGET_SITE_URL="${SAJTAGENT_TARGET_SITE_URL:-http://localhost:3000}"

case "$(echo "$CONTROLUI_DISABLE_DEVICE_AUTH" | tr '[:upper:]' '[:lower:]')" in
  1|true|y|yes)
    CONTROLUI_DISABLE_DEVICE_AUTH=true
    ;;
  *)
    CONTROLUI_DISABLE_DEVICE_AUTH=false
    ;;
esac

if [ -z "${OPENCLAW_GATEWAY_TOKEN:-}" ] && [ "$BIND_MODE" != "loopback" ]; then
  echo "[entrypoint] OPENCLAW_GATEWAY_TOKEN missing; forcing loopback bind"
  BIND_MODE="loopback"
fi

mkdir -p "$AGENT_DIR"
mkdir -p "$WORKSPACE_DIR"

cp /app/seed/IDENTITY.md "$AGENT_DIR/IDENTITY.md"
echo "[entrypoint] IDENTITY.md written for sajtagenten"

if [ -d "/app/seed/workspace" ]; then
  cp -rn /app/seed/workspace/. "$WORKSPACE_DIR/" 2>/dev/null || true
  echo "[entrypoint] Seeded workspace files"
fi

CUSTOM_PROVIDERS=""
if [ -n "${JUICEFACTORY_API_KEY:-}" ]; then
  CUSTOM_PROVIDERS=$(cat <<'PROVIDERS_END'
  "models": {
    "providers": {
      "juicefactory": {
        "baseUrl": "https://api.juicefactory.ai/v1",
        "apiKey": "${JUICEFACTORY_API_KEY}",
        "api": "openai-completions",
        "models": [
          { "id": "qwen3-vl", "name": "Qwen 3 VL (JuiceFactory EU)" }
        ]
      }
    }
  },
PROVIDERS_END
)
  CUSTOM_PROVIDERS=$(echo "$CUSTOM_PROVIDERS" | sed "s|\${JUICEFACTORY_API_KEY}|${JUICEFACTORY_API_KEY}|g")
  echo "[entrypoint] JuiceFactory provider configured (qwen3-vl)"
fi

# Build allowed origins list from env, falling back to sensible defaults.
# SAJTAGENT_ALLOWED_ORIGINS is a comma-separated list of extra origins.
EXTRA_ORIGINS=""
if [ -n "${SAJTAGENT_ALLOWED_ORIGINS:-}" ]; then
  EXTRA_ORIGINS=$(echo "$SAJTAGENT_ALLOWED_ORIGINS" | sed 's/,/",\n        "/g')
  EXTRA_ORIGINS=$(printf ',\n        "%s"' "$EXTRA_ORIGINS" | tail -c +2)
fi

cat > "$CONFIG_FILE" <<EOF
{
  ${CUSTOM_PROVIDERS}
  "gateway": {
    "mode": "local",
    "bind": "${BIND_MODE}",
    "auth": {
      "mode": "token",
      "token": "${OPENCLAW_GATEWAY_TOKEN}"
    },
    "controlUi": {
      "enabled": true,
      "dangerouslyDisableDeviceAuth": ${CONTROLUI_DISABLE_DEVICE_AUTH},
      "allowedOrigins": [
        "https://sajtagenten.onrender.com",
        "${TARGET_SITE_URL}",
        "http://localhost:3000"${EXTRA_ORIGINS:+,
        ${EXTRA_ORIGINS}}
      ]
    },
    "http": {
      "endpoints": {
        "chatCompletions": { "enabled": true }
      }
    }
  },
  "agents": {
    "defaults": {
      "model": {
        "primary": "${MODEL_PRIMARY}",
        "fallbacks": ["${MODEL_FALLBACK}"]
      }
    },
    "list": [
      {
        "id": "sajtagenten",
        "name": "sajtagenten",
        "workspace": "${WORKSPACE_DIR}",
        "agentDir": "${AGENT_DIR}",
        "model": {
          "primary": "${MODEL_PRIMARY}",
          "fallbacks": ["${MODEL_FALLBACK}"]
        }
      }
    ]
  }
}
EOF

echo "[entrypoint] Config written — model=${MODEL_PRIMARY}, fallback=${MODEL_FALLBACK}, port=${LISTEN_PORT}, bind=${BIND_MODE}"
echo "[entrypoint] OpenClaw version: ${OPENCLAW_VERSION:-unknown}"
echo "[entrypoint] Target site: ${TARGET_SITE_URL}"
echo "[entrypoint] controlUi.dangerouslyDisableDeviceAuth=${CONTROLUI_DISABLE_DEVICE_AUTH}"

if [ -n "${OPENCLAW_GATEWAY_TOKEN:-}" ]; then
  exec openclaw gateway --port "${LISTEN_PORT}" --bind "${BIND_MODE}" --token "${OPENCLAW_GATEWAY_TOKEN}" --allow-unconfigured
fi

exec openclaw gateway --port "${LISTEN_PORT}" --bind "${BIND_MODE}" --allow-unconfigured
