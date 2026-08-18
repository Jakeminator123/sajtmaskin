FROM node:22-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates git wget \
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
ARG OPENCLAW_VERSION=2026.7.1-2
RUN npm install -g "openclaw@${OPENCLAW_VERSION}" --ignore-scripts \
 && openclaw --version

# Seed files (IDENTITY.md, workspace skills) — no secrets in image
RUN mkdir -p /app/seed/workspace
COPY config/agents/sajtagenten/agent/IDENTITY.md /app/seed/IDENTITY.md
COPY config/workspace/ /app/seed/workspace/

COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
COPY docker-healthcheck.sh /usr/local/bin/docker-healthcheck.sh
COPY generate-config.mjs /usr/local/lib/openclaw/generate-config.mjs

RUN sed -i 's/\r$//' /usr/local/bin/docker-entrypoint.sh /usr/local/bin/docker-healthcheck.sh \
 && chmod +x /usr/local/bin/docker-entrypoint.sh /usr/local/bin/docker-healthcheck.sh

EXPOSE 18789

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD docker-healthcheck.sh

ENTRYPOINT ["docker-entrypoint.sh"]
