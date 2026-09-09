FROM node:22-alpine

RUN corepack enable

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY src ./src
COPY scripts/write-release.cjs ./scripts/write-release.cjs

ARG PREVIEW_HOST_BUILD_SHA
RUN node scripts/write-release.cjs "$PREVIEW_HOST_BUILD_SHA" /app/build-release.json
LABEL org.opencontainers.image.revision=$PREVIEW_HOST_BUILD_SHA

EXPOSE 8080

CMD ["npm", "start"]
