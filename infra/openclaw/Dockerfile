FROM caddy:2.11.9-alpine@sha256:003a97808e781aa9f7e75cc2f43d34d461099031faf5e20faefb9f61126836f0 AS ingress
FROM node:24.22.1-bookworm-slim@sha256:55fb5f5a527ea2c5c4a95f963e48ef90aa38c7b346054fdc8ee9957a2b55d205

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates git libgomp1 wget \
 && update-ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# Force git to use HTTPS for any GitHub SSH dependency.
# Use --add so multiple rewrite rules are kept (not overwritten).
RUN git config --global --add url."https://github.com/".insteadOf "ssh://git@github.com/" \
 && git config --global --add url."https://github.com/".insteadOf "ssh://git@github.com" \
 && git config --global --add url."https://github.com/".insteadOf "git@github.com:"

# Install the last version verified by this repo. Do not use `latest` here:
# rebuilding an unchanged commit must not silently change gateway auth/config
# semantics. Upgrade this pin in a dedicated PR after the entrypoint contract
# test and the Render smoke checklist pass.
ENV NODE_LLAMA_CPP_SKIP_DOWNLOAD=true
ARG OPENCLAW_VERSION=2026.10.34
# This release uses its lifecycle to prepare bundled provider plugins.
RUN npm install -g "openclaw@${OPENCLAW_VERSION}" --allow-scripts=openclaw \
 && openclaw --version

# Seed files (IDENTITY.md, workspace skills) â€” no secrets in image
RUN mkdir -p /app/seed/workspace
COPY config/agents/sajtagenten/agent/IDENTITY.md /app/seed/IDENTITY.md
COPY config/workspace/ /app/seed/workspace/

COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
COPY docker-healthcheck.sh /usr/local/bin/docker-healthcheck.sh
COPY serve-render-gateway.sh /usr/local/bin/serve-render-gateway.sh
COPY --from=ingress /usr/bin/caddy /usr/local/bin/caddy
COPY Caddyfile /etc/sajtagenten/Caddyfile
COPY generate-config.mjs /usr/local/lib/openclaw/generate-config.mjs

# Check the generated config with the exact package in the image, without provider credentials.
RUN config_check_dir="$(mktemp -d)" \
 && OPENCLAW_GATEWAY_TOKEN=image-config-check node /usr/local/lib/openclaw/generate-config.mjs "$config_check_dir/openclaw.json" "$config_check_dir" \
 && OPENCLAW_STATE_DIR="$config_check_dir" OPENCLAW_CONFIG_PATH="$config_check_dir/openclaw.json" openclaw config validate \
 && rm -rf -- "$config_check_dir"

RUN sed -i 's/\r$//' /usr/local/bin/docker-entrypoint.sh /usr/local/bin/docker-healthcheck.sh /usr/local/bin/serve-render-gateway.sh \
 && chmod +x /usr/local/bin/docker-entrypoint.sh /usr/local/bin/docker-healthcheck.sh /usr/local/bin/serve-render-gateway.sh \
 && SAJTAGENT_LISTEN_PORT=10000 SAJTAGENT_INTERNAL_PORT=18789 caddy validate --config /etc/sajtagenten/Caddyfile

RUN --network=none --mount=type=bind,source=check-render-proxy.mjs,target=/tmp/check-render-proxy.mjs \
    node --test /tmp/check-render-proxy.mjs

EXPOSE 18789

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD docker-healthcheck.sh

ENTRYPOINT ["docker-entrypoint.sh"]
