FROM mcr.microsoft.com/playwright:v1.58.2-jammy

WORKDIR /app

COPY package.json package.json
RUN npm install --omit=dev --no-audit --no-fund

COPY server.mjs server.mjs

ENV NODE_ENV=production
ENV PORT=3310

EXPOSE 3310

CMD ["node", "server.mjs"]

