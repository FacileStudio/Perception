FROM oven/bun:1.2-alpine AS base
WORKDIR /app

FROM base AS deps
COPY package.json ./
COPY bun.lock ./
COPY apps/api/package.json ./apps/api/
COPY apps/client/package.json ./apps/client/
RUN bun install --frozen-lockfile --network-concurrency 8

FROM base AS runner
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/bun.lock ./bun.lock
COPY apps/api/src ./apps/api/src
COPY apps/api/package.json ./apps/api/
WORKDIR /app/apps/api
RUN mkdir -p /app/data
EXPOSE 8787
CMD ["bun", "run", "src/server.ts"]
