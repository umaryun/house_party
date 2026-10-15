FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
# Build the client, then drop dev-only packages (vite, playwright, ...) from the image.
RUN npm run build && npm prune --omit=dev
# Store accounts on a mounted volume (on Railway: attach a volume at /data).
# PORT is provided by the host at runtime; the server defaults to 3001.
ENV NODE_ENV=production DATA_DIR=/data
EXPOSE 3001
CMD ["node", "--import", "tsx", "src/server/index.ts"]
