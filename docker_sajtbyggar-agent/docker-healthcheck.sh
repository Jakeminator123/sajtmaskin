#!/bin/sh
PORT_TO_CHECK="${PORT:-${OPENCLAW_GATEWAY_PORT:-18789}}"
wget -qO- "http://localhost:${PORT_TO_CHECK}/health" || exit 1
