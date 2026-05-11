FROM oven/bun:1.2-alpine AS builder
WORKDIR /app
ARG VITE_API_URL=/api
ENV VITE_API_URL=$VITE_API_URL
COPY package.json ./
COPY bun.lock ./
COPY apps/api/package.json ./apps/api/
COPY apps/client/package.json ./apps/client/
RUN bun install --frozen-lockfile --network-concurrency 8
COPY apps/client/ ./apps/client/
WORKDIR /app/apps/client
RUN bun run build

FROM nginx:1.27-alpine AS runner
COPY --from=builder /app/apps/client/build /usr/share/nginx/html
COPY apps/client/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 3000
CMD ["nginx", "-g", "daemon off;"]
