FROM node:20-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends pandoc \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY server ./server
COPY public ./public

ENV PORT=3000
EXPOSE 3000

CMD ["node", "server/index.js"]
