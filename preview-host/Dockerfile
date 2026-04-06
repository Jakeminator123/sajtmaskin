FROM node:22-alpine

RUN corepack enable

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev
COPY src ./src

EXPOSE 8080

CMD ["npm", "start"]
