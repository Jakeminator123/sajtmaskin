# Preview guest image (SM-080): one of these runs per customer project as its
# own Fly Machine. It contains the agent, Node + corepack, and a WARM package
# layer so a typical generated Next.js project installs from a local cache
# instead of the network. Nothing in this image is shared with another
# project at runtime; sharing happens only at image-build time, read-only.
FROM node:22-alpine

RUN corepack enable \
  && addgroup -S guest \
  && adduser -S -G guest -h /home/guest guest

WORKDIR /opt/sajtmaskin-guest
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY agent.js ./agent.js
COPY lib ./lib
COPY scripts ./scripts

# Warm layer: the baseline dependency set every generated project starts from.
# `write-warm-state.cjs` stamps the fingerprint of the baseline package.json
# BEFORE install so a project whose package.json is byte-identical can copy
# node_modules instead of installing; the populated npm cache serves every
# other project with `--prefer-offline` hits for the same tarballs.
ENV NPM_CONFIG_CACHE=/opt/sajtmaskin-warm/npm-cache
COPY warm/package.json /opt/sajtmaskin-warm/project/package.json
RUN node scripts/write-warm-state.cjs /opt/sajtmaskin-warm \
  && cd /opt/sajtmaskin-warm/project \
  && npm install --no-audit --no-fund --include=dev \
  && rm -f package-lock.json

RUN mkdir -p /workspace \
  && chown -R guest:guest /workspace /opt/sajtmaskin-warm /home/guest

USER guest
ENV HOME=/home/guest \
    SAJTMASKIN_GUEST_ROOT=/workspace \
    SAJTMASKIN_GUEST_WARM_DIR=/opt/sajtmaskin-warm \
    SAJTMASKIN_GUEST_PORT=7070 \
    SAJTMASKIN_GUEST_DEV_PORT=3000 \
    NEXT_TELEMETRY_DISABLED=1

EXPOSE 7070
CMD ["node", "agent.js"]
