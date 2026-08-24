FROM node:22-alpine AS base
RUN corepack enable pnpm
WORKDIR /app

# Install dependencies
FROM base AS deps
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY packages/db/package.json packages/db/
COPY packages/auth/package.json packages/auth/
COPY packages/domain/package.json packages/domain/
COPY packages/utils/package.json packages/utils/
COPY packages/ui/package.json packages/ui/
COPY apps/web/package.json apps/web/
COPY apps/ws-server/package.json apps/ws-server/
RUN pnpm install --frozen-lockfile

# Build packages — @oh-writers/domain, @oh-writers/utils and @oh-writers/ui
# ship raw TS source (no build script); consumers (vinxi, tsup) compile it
# themselves. Only @oh-writers/db has a real build step.
FROM deps AS builder
COPY . .
RUN pnpm --filter @oh-writers/db build

# Web app target
FROM builder AS web-builder
RUN pnpm --filter @oh-writers/web build

FROM node:22-alpine AS web
RUN corepack enable pnpm
WORKDIR /app
COPY --from=web-builder /app/apps/web/.output ./
EXPOSE 3000
CMD ["node", "server/index.mjs"]

# WS server target — the compiled bundle inlines @oh-writers/domain and
# @oh-writers/utils (see tsup.config.ts noExternal) but leaves real npm deps
# (hono, ws, ioredis, yjs...) and the workspace-linked @oh-writers/db
# external, so both node_modules (pnpm symlinks resolved) and the built
# @oh-writers/db dist must ship alongside the bundle.
FROM builder AS ws-builder
RUN pnpm --filter @oh-writers/ws-server build
RUN pnpm --filter @oh-writers/ws-server --prod --no-optional deploy --legacy /app/ws-server-deploy
RUN cp -r /app/packages/db/dist /app/ws-server-deploy/node_modules/@oh-writers/db/dist

FROM node:22-alpine AS ws-server
WORKDIR /app
COPY --from=ws-builder /app/ws-server-deploy/node_modules ./node_modules
COPY --from=ws-builder /app/apps/ws-server/dist ./
EXPOSE 1234
CMD ["node", "index.js"]
