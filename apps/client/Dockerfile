FROM oven/bun:1.2-alpine AS builder
WORKDIR /app
COPY package.json ./
COPY bun.lock ./
COPY apps/api/package.json ./apps/api/
COPY apps/client/package.json ./apps/client/
RUN bun install --frozen-lockfile --network-concurrency 8
COPY apps/client/ ./apps/client/
WORKDIR /app/apps/client
RUN bun run build

FROM oven/bun:1.2-alpine AS runner
WORKDIR /app
COPY --from=builder /app/apps/client/build ./build
COPY --from=builder /app/apps/client/package.json ./
COPY --from=builder /app/node_modules ./node_modules
ENV PORT=3000
ENV BODY_SIZE_LIMIT=Infinity
ENV ORIGIN=https://perception.facile.studio
EXPOSE 3000
CMD ["bun", "build/index.js"]
