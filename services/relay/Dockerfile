# Paya relay — long-running service (polls in-flight swaps), so it needs an
# always-on host (Railway, Render, Fly), not serverless.
FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm install --no-save tsx@4
COPY tsconfig.json ./
COPY src ./src
ENV NODE_ENV=production PORT=8787 DB_PATH=/data/paya-data.json
# Mount a persistent volume at /data so swap records survive restarts.
VOLUME ["/data"]
EXPOSE 8787
CMD ["npx", "tsx", "src/index.ts"]
