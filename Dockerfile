FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
ENV NODE_ENV=production PORT=3001 DATA_DIR=/data
VOLUME /data
EXPOSE 3001
CMD ["npx", "tsx", "src/server/index.ts"]
