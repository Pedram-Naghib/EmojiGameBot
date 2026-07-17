FROM node:20-bookworm-slim

# better-sqlite3 needs to compile a native addon
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --omit=dev

COPY . .

ENV NODE_ENV=production
ENV PORT=3000
ENV DB_PATH=/app/data/bot.db

VOLUME ["/app/data"]
EXPOSE 3000

CMD ["node", "src/server.js"]
