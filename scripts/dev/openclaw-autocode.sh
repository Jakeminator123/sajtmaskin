#!/usr/bin/env bash
#
# OpenClaw autocode loop (Väg A): aider (hands) -> OpenClaw gateway (brain).
#
# The OpenClaw gateway exposes an OpenAI-compatible /v1/chat/completions that
# routes through the `openclaw/sajtkodare` agent onto gpt-5.x-codex. aider does
# the file edits, runs the verify loop, and commits each accepted change.
#
# Guardrails enforced here:
#   - refuses to run on master/main
#   - reads secrets from .env.local (never hardcoded)
#   - auto-commits each edit on the current branch (easy to revert/review)
#   - runs typecheck after every edit; failures are fed back to the model
#
# Usage:
#   scripts/dev/openclaw-autocode.sh "din uppgift här"
#   FULL_TEST=1 scripts/dev/openclaw-autocode.sh "..."   # also run vitest in the loop
#
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

# --- guardrail: never run on master/main ---
BRANCH="$(git rev-parse --abbrev-ref HEAD)"
case "$BRANCH" in
  master|main)
    echo "VÄGRAR: kör inte autocode direkt på '$BRANCH'. Skapa en feature-branch först." >&2
    exit 1
    ;;
esac

# --- load gateway secrets from .env.local ---
if [ ! -f .env.local ]; then
  echo "Saknar .env.local (behöver OPENCLAW_GATEWAY_TOKEN)." >&2
  exit 1
fi
set -a; . ./.env.local; set +a
: "${OPENCLAW_GATEWAY_TOKEN:?OPENCLAW_GATEWAY_TOKEN saknas i .env.local}"

GW_URL="${OPENCLAW_AUTOCODE_GATEWAY_URL:-http://127.0.0.1:18789/v1}"
MODEL="${OPENCLAW_AUTOCODE_MODEL:-openai/openclaw/sajtkodare}"

# --- preflight: gateway must be up ---
if ! curl -sf -o /dev/null --max-time 5 "${GW_URL%/v1}/health"; then
  echo "OpenClaw-gateway svarar inte på ${GW_URL%/v1}/health — starta den först." >&2
  exit 1
fi

# aider talks to the gateway as if it were OpenAI.
export OPENAI_API_BASE="$GW_URL"
export OPENAI_API_KEY="$OPENCLAW_GATEWAY_TOKEN"

# --- verify loop ---
TEST_CMD="npm run typecheck"
if [ "${FULL_TEST:-0}" = "1" ]; then
  TEST_CMD="npm run typecheck && npx vitest run"
fi

if [ "$#" -eq 0 ]; then
  echo "Ange en uppgift: scripts/dev/openclaw-autocode.sh \"...\"" >&2
  exit 1
fi

echo "[autocode] branch=$BRANCH model=$MODEL test='$TEST_CMD'"
exec ~/.local/bin/aider \
  --model "$MODEL" \
  --no-show-model-warnings \
  --auto-commits \
  --auto-test --test-cmd "$TEST_CMD" \
  --lint-cmd "npm run lint" \
  --yes \
  --message "$*"
