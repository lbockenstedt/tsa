# TSA — single-container app (Express serves the built React client + the API).
# Multi-stage build keeps the final image small: build deps + artifacts in one
# stage, only production deps + compiled output in the runtime stage.

# syntax=docker/dockerfile:1.6

# ---- Build stage -----------------------------------------------------------
FROM node:20-bookworm-slim AS build
WORKDIR /app

# Copy manifests and install all deps (including devDeps for the build).
COPY package.json package-lock.json* ./
COPY prisma ./prisma
RUN npm ci || npm install

# Copy source and build server + client.
COPY tsconfig.json tsconfig.server.json tsconfig.client.json vite.config.ts vitest.config.ts ./
COPY src ./src
RUN npx prisma generate \
 && npm run build

# ---- Runtime stage ---------------------------------------------------------
FROM node:20-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app

# Install only production dependencies.
COPY package.json package-lock.json* ./
COPY prisma ./prisma
RUN npm ci --omit=dev || npm install --omit=dev
RUN npx prisma generate

# Copy compiled server (dist/server) and built client (dist/client).
COPY --from=build /app/dist ./dist

# Express listens on PORT (default 3001). Map 8080 -> PORT in Azure.
ENV PORT=3001
EXPOSE 3001

# Apply migrations at startup, then start the server.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/server/index.js"]