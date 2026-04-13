FROM node:22-alpine AS base
RUN corepack enable pnpm
WORKDIR /app

# Install dependencies
FROM base AS deps
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY packages/db/package.json packages/db/
COPY packages/domain/package.json packages/domain/
COPY packages/utils/package.json packages/utils/
COPY packages/ui/package.json packages/ui/
COPY apps/web/package.json apps/web/
COPY apps/ws-server/package.json apps/ws-server/
RUN pnpm install --frozen-lockfile

# Build packages
FROM deps AS builder
COPY . .
RUN pnpm --filter @oh-writers/domain build
RUN pnpm --filter @oh-writers/utils build
RUN pnpm --filter @oh-writers/db build
RUN pnpm --filter @oh-writers/ui build

# Web app target
FROM builder AS web-builder
RUN pnpm --filter @oh-writers/web build

FROM node:22-alpine AS web
RUN corepack enable pnpm
WORKDIR /app
COPY --from=web-builder /app/apps/web/.output ./
EXPOSE 3000
CMD ["node", "server/index.mjs"]

# WS server target
FROM builder AS ws-builder
RUN pnpm --filter @oh-writers/ws-server build

FROM node:22-alpine AS ws-server
RUN corepack enable pnpm
WORKDIR /app
COPY --from=ws-builder /app/apps/ws-server/dist ./
EXPOSE 1234
CMD ["node", "index.js"]
