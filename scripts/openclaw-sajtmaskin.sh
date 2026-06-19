#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Kör en autonom OpenClaw-kodningsturn i Sajtmaskin-repot.
#
#   Modell : openai/gpt-5.3-codex (override med OPENCLAW_MODEL=openai/gpt-5.5)
#   Profil : "sajtmaskin" (isolerad under ~/.openclaw-sajtmaskin — rör aldrig
#            din vanliga OpenClaw-setup / hittayta / 1753)
#   Secret : OPENAI_API_KEY läses ur repo-rotens .env.local vid körning,
#            lagras ALDRIG i git.
#
# Autonominivå: agenten får läsa/skriva/testa/commita FRITT på en
# feature-branch, men får ALDRIG pusha till produktion utan ditt uttryckliga
# godkännande. Skriptet vägrar köra direkt på master/main.
#
# Användning:
#   scripts/openclaw-sajtmaskin.sh "<uppgift till agenten>"
#   echo "<lång uppgift>" | scripts/openclaw-sajtmaskin.sh
#
# Tunables (env): THINKING=high|medium|low  TIMEOUT=<sek>  SESSION=<id>
#                 OPENCLAW_MODEL=openai/gpt-5.3-codex
# ---------------------------------------------------------------------------
set -euo pipefail

REPO="/Users/christophergenberg/Desktop/Sajtmaskin-2.0"
PROFILE="sajtmaskin"
THINKING="${THINKING:-high}"
TIMEOUT="${TIMEOUT:-1800}"
AGENT="${AGENT:-main}"
# Stabil session => agenten minns tidigare turer. SESSION="" => ny varje gång.
SESSION="${SESSION:-sajtmaskin-main}"
MODEL="${OPENCLAW_MODEL:-openai/gpt-5.3-codex}"

# Node via nvm (openclaw-CLI:t ligger under nvm-node).
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
# shellcheck disable=SC1091
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" && nvm use 22.22.2 >/dev/null 2>&1 || true
OPENCLAW="${OPENCLAW_BIN:-$(command -v openclaw || echo "$HOME/.local/bin/openclaw")}"

cd "$REPO"

# Guardrail: aldrig direkt på master/main.
BRANCH="$(git rev-parse --abbrev-ref HEAD)"
case "$BRANCH" in
  master|main)
    echo "VÄGRAR: kör inte autocode direkt på '$BRANCH'. Skapa en feature-branch först." >&2
    exit 1
    ;;
esac

# OPENAI-nyckel ur .env.local (aldrig committad).
if [ ! -f .env.local ]; then
  echo "FEL: saknar .env.local (behöver OPENAI_API_KEY)." >&2
  exit 1
fi
set -a; . ./.env.local; set +a
: "${OPENAI_API_KEY:?OPENAI_API_KEY saknas i .env.local}"
export OPENAI_API_KEY

# Uppgift: argument eller stdin.
if [ "$#" -gt 0 ]; then
  MSG="$*"
elif [ ! -t 0 ]; then
  MSG="$(cat)"
else
  echo "Användning: $(basename "$0") \"<uppgift till agenten>\"" >&2
  exit 2
fi
[ -n "${MSG//[[:space:]]/}" ] || { echo "FEL: tom uppgift." >&2; exit 2; }

echo "▶ OpenClaw (profil: $PROFILE · agent: $AGENT · modell: $MODEL · thinking: $THINKING)" >&2
echo "▶ Workspace: $REPO · branch: $BRANCH" >&2
exec "$OPENCLAW" --profile "$PROFILE" agent --local \
  --agent "$AGENT" \
  --session-id "$SESSION" \
  --model "$MODEL" \
  --thinking "$THINKING" \
  --timeout "$TIMEOUT" \
  --message "$MSG"
