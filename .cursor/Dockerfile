FROM node:22.22.2-bookworm

RUN apt-get update \
  && apt-get install -y --no-install-recommends git sudo ca-certificates python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

# The Postgres instance injected into Cloud Agent VMs presents a self-signed
# certificate chain. Both scripts/db/db-init.mjs and src/lib/db/client.ts honor
# this flag to use TLS without strict CA verification, so db:init and runtime DB
# access succeed against the managed dev database.
ENV DB_SSL_REJECT_UNAUTHORIZED=false
