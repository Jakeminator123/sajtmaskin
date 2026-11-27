#!/bin/bash
# Supervise both processes so a failed listener cannot leave a healthy orphan.
set -u
public_port=$1
internal_port=$2
gateway_pid=
proxy_pid=

stop_children() {
  trap '' TERM INT HUP QUIT
  for pid in "$proxy_pid" "$gateway_pid"; do
    if [[ -n "$pid" ]]; then kill -TERM "$pid" 2>/dev/null || true; fi
  done
  wait
}
trap 'stop_children; exit 0' TERM INT HUP QUIT

openclaw gateway --bind loopback --port "$internal_port" --allow-unconfigured &
gateway_pid=$!
env -i PATH="$PATH" HOME=/tmp SAJTAGENT_LISTEN_PORT="$public_port" \
  SAJTAGENT_INTERNAL_PORT="$internal_port" caddy run --config /etc/sajtagenten/Caddyfile &
proxy_pid=$!

status=0
wait -n "$gateway_pid" "$proxy_pid" || status=$?
echo "[entrypoint] Gateway or ingress exited. Stopping the service." >&2
stop_children
if (( status == 0 )); then status=1; fi
exit "$status"
