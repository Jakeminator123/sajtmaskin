#!/bin/sh
set -e

# Both default to the container layout. They are overridable ONLY so the config
# generation below can be exercised in a sandbox — see
# tests/openclaw-entrypoint-config.test.ts.
OPENCLAW_DIR="${SAJTAGENT_HOME_DIR:-/root/.openclaw}"
SEED_DIR="${SAJTAGENT_SEED_DIR:-/app/seed}"
CONFIG_FILE="$OPENCLAW_DIR/openclaw.json"
AGENT_DIR="$OPENCLAW_DIR/agents/sajtagenten/agent"
WORKSPACE_DIR="$OPENCLAW_DIR/workspace-sajtagenten"
LISTEN_PORT="${PORT:-${OPENCLAW_GATEWAY_PORT:-18789}}"
BIND_MODE="${OPENCLAW_GATEWAY_BIND:-lan}"
# gpt-5.5 is OpenAI's current frontier model for complex coding / tool-heavy
# agentic work (best fit for debug-mode bug-hunt). gpt-5.3-codex / gpt-5.1-codex
# are deprecated. Override per instance with OPENCLAW_MODEL_PRIMARY/FALLBACK.
#
# OPENCLAW_MODEL_FALLBACK takes a COMMA-SEPARATED chain so the steps can span
# different provider quotas. A chain that stays inside one subscription (the
# openai/gpt-5.5 -> openai/gpt-5.4 default shares a single Codex plan) runs out
# on every step at once, and the app then shows an empty answer.
MODEL_PRIMARY="${OPENCLAW_MODEL_PRIMARY:-openai/gpt-5.5}"
MODEL_FALLBACK="${OPENCLAW_MODEL_FALLBACK:-openai/gpt-5.4}"
# Heartbeat is OFF by default ("0m"). This deployment has no chat channel
# (Telegram/Discord) configured, so the default 30m heartbeat woke gpt-5.5 with
# the full agent context, answered HEARTBEAT_OK into the void and burned real
# OpenAI credits around the clock (observed 2026-08-17). This file rewrites
# openclaw.json on every boot, so the value must be pinned here — a runtime
# `openclaw config set` does not survive a redeploy. Re-enable per instance
# with e.g. OPENCLAW_HEARTBEAT_EVERY=30m once a delivery channel exists.
HEARTBEAT_EVERY="${OPENCLAW_HEARTBEAT_EVERY:-0m}"
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

cp "$SEED_DIR/IDENTITY.md" "$AGENT_DIR/IDENTITY.md"
echo "[entrypoint] IDENTITY.md written for sajtagenten"

# Seed files are config-managed (git) — OVERWRITE them on every boot so a new
# deploy actually refreshes the agent's instructions on the persistent disk.
# Only the seeded filenames are touched; files the agent has created itself in
# the workspace (memory, notes) are left intact. (This used to be `cp -rn`,
# which meant updated SOUL/TOOLS/USER/BOOTSTRAP never reached a live instance.)
if [ -d "$SEED_DIR/workspace" ]; then
  cp -rf "$SEED_DIR/workspace/." "$WORKSPACE_DIR/" 2>/dev/null || true
  echo "[entrypoint] Seeded workspace files (refreshed from image)"
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

# Build the controlUi.allowedOrigins list entirely from env so a NEW
# deployment hostname works without any code change:
#   - http://localhost:3000 is always kept for local development
#   - SAJTAGENT_TARGET_SITE_URL is added when set
#   - SAJTAGENT_ALLOWED_ORIGINS is a comma-separated list of extra origins
# Blank entries and duplicates are dropped; the result is emitted as the
# JSON array body (comma-separated, quoted) for openclaw.json.
ALLOWED_ORIGINS_RAW="http://localhost:3000"
if [ -n "${TARGET_SITE_URL:-}" ]; then
  ALLOWED_ORIGINS_RAW="${ALLOWED_ORIGINS_RAW},${TARGET_SITE_URL}"
fi
if [ -n "${SAJTAGENT_ALLOWED_ORIGINS:-}" ]; then
  ALLOWED_ORIGINS_RAW="${ALLOWED_ORIGINS_RAW},${SAJTAGENT_ALLOWED_ORIGINS}"
fi

ALLOWED_ORIGINS_JSON=""
ORIGIN_SEEN="|"
ORIGIN_OLD_IFS="$IFS"
IFS=","
for origin in $ALLOWED_ORIGINS_RAW; do
  origin=$(printf '%s' "$origin" | sed 's/^[[:space:]]*//; s/[[:space:]]*$//')
  if [ -z "$origin" ]; then
    continue
  fi
  case "$ORIGIN_SEEN" in
    *"|${origin}|"*)
      continue
      ;;
  esac
  ORIGIN_SEEN="${ORIGIN_SEEN}${origin}|"
  if [ -z "$ALLOWED_ORIGINS_JSON" ]; then
    ALLOWED_ORIGINS_JSON="\"${origin}\""
  else
    ALLOWED_ORIGINS_JSON="${ALLOWED_ORIGINS_JSON},
        \"${origin}\""
  fi
done
IFS="$ORIGIN_OLD_IFS"

# Same treatment for the fallback chain: split on commas, trim, drop blanks and
# duplicates, and emit the quoted JSON array body for agents.*.model.fallbacks.
MODEL_FALLBACKS_JSON=""
FALLBACK_SEEN="|"
FALLBACK_OLD_IFS="$IFS"
IFS=","
for fallback in $MODEL_FALLBACK; do
  fallback=$(printf '%s' "$fallback" | sed 's/^[[:space:]]*//; s/[[:space:]]*$//')
  if [ -z "$fallback" ]; then
    continue
  fi
  case "$FALLBACK_SEEN" in
    *"|${fallback}|"*)
      continue
      ;;
  esac
  FALLBACK_SEEN="${FALLBACK_SEEN}${fallback}|"
  if [ -z "$MODEL_FALLBACKS_JSON" ]; then
    MODEL_FALLBACKS_JSON="\"${fallback}\""
  else
    MODEL_FALLBACKS_JSON="${MODEL_FALLBACKS_JSON}, \"${fallback}\""
  fi
done
IFS="$FALLBACK_OLD_IFS"

# `gateway.auth.rateLimit` repeats OpenClaw's own defaults on purpose. Recent
# versions enable the limiter implicitly when shared-secret auth is configured,
# but `openclaw security audit` only looks for the explicit key and reports a
# non-loopback gateway without it as a finding on every run. Writing it out ends
# that false positive and pins the numbers for a gateway that is reachable from
# the public internet.
cat > "$CONFIG_FILE" <<EOF
{
  ${CUSTOM_PROVIDERS}
  "gateway": {
    "mode": "local",
    "bind": "${BIND_MODE}",
    "auth": {
      "mode": "token",
      "token": "${OPENCLAW_GATEWAY_TOKEN}",
      "rateLimit": {
        "maxAttempts": 10,
        "windowMs": 60000,
        "lockoutMs": 300000,
        "exemptLoopback": true
      }
    },
    "controlUi": {
      "enabled": true,
      "dangerouslyDisableDeviceAuth": ${CONTROLUI_DISABLE_DEVICE_AUTH},
      "allowedOrigins": [
        ${ALLOWED_ORIGINS_JSON}
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
      "heartbeat": { "every": "${HEARTBEAT_EVERY}" },
      "model": {
        "primary": "${MODEL_PRIMARY}",
        "fallbacks": [${MODEL_FALLBACKS_JSON}]
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
          "fallbacks": [${MODEL_FALLBACKS_JSON}]
        }
      }
    ]
  }
}
EOF

# The config holds the gateway token in clear text and `cat >` creates it 0644
# under the container's default umask. Setting it by hand inside the container
# is pointless — this file is rewritten on every boot — so the permission has to
# be applied here.
chmod 600 "$CONFIG_FILE"

echo "[entrypoint] Config written — model=${MODEL_PRIMARY}, fallbacks=[${MODEL_FALLBACKS_JSON}], port=${LISTEN_PORT}, bind=${BIND_MODE}, heartbeat=${HEARTBEAT_EVERY}"
echo "[entrypoint] OpenClaw version: ${OPENCLAW_VERSION:-unknown}"
echo "[entrypoint] Target site: ${TARGET_SITE_URL}"
echo "[entrypoint] controlUi.allowedOrigins: [${ALLOWED_ORIGINS_JSON}]"
echo "[entrypoint] controlUi.dangerouslyDisableDeviceAuth=${CONTROLUI_DISABLE_DEVICE_AUTH}"

if [ -n "${OPENCLAW_GATEWAY_TOKEN:-}" ]; then
  exec openclaw gateway --port "${LISTEN_PORT}" --bind "${BIND_MODE}" --token "${OPENCLAW_GATEWAY_TOKEN}" --allow-unconfigured
fi

exec openclaw gateway --port "${LISTEN_PORT}" --bind "${BIND_MODE}" --allow-unconfigured
