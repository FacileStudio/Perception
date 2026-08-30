# Perception — Deployment

How the container image is built, what Docker Compose declares, and how Perception is routed on la ruche.

## The image

The `Dockerfile` is a multi-stage build resulting in a single distroless container:

1. `oven/bun:1` installs `apps/client` dependencies and builds the SvelteKit frontend into `/client/build`.
2. `golang:1.25-alpine` downloads Go modules and compiles `apps/api` with `CGO_ENABLED=0` and `-ldflags="-s -w"`.
3. `gcr.io/distroless/static-debian12:nonroot` receives the compiled binary at `/api` and the static assets at `/client`.

The container sets `ENV CLIENT_DIR=/client` and executes as user `nonroot:nonroot` on port 4000.

## Compose topology

Production deployments run through `docker-compose.yml` under Dokploy:

| Service | Image | Notes |
|---|---|---|
| `perception-db` | `pgvector/pgvector:pg16` | PostgreSQL 16 with pgvector extension, healthchecked with `pg_isready` |
| `perception-api` | Built from `Dockerfile` | API server and static client, port 4000 exposed to Traefik |

The API container depends on the database healthcheck before booting.

## Healthcheck

Because distroless containers contain no shell, `curl`, or `wget`, health monitoring uses the binary self-probe:

```yaml
healthcheck:
  test: ["CMD", "/api", "healthcheck"]
  interval: 10s
  timeout: 5s
  retries: 3
  start_period: 10s
```

`main.go` detects the `healthcheck` argument and executes an internal HTTP request to `http://127.0.0.1:4000/health`.

## Traefik labels

Traefik terminates TLS and proxies traffic to port 4000 on the external `dokploy-network`:

```yaml
labels:
  traefik.enable: "true"
  traefik.docker.network: dokploy-network
  traefik.http.routers.perception-web.rule: "Host(`perception.facile.studio`)"
  traefik.http.routers.perception-web.entrypoints: web
  traefik.http.routers.perception-web.middlewares: redirect-to-https@file
  traefik.http.routers.perception-web.service: perception-svc
  traefik.http.routers.perception-secure.rule: "Host(`perception.facile.studio`)"
  traefik.http.routers.perception-secure.entrypoints: websecure
  traefik.http.routers.perception-secure.tls.certresolver: letsencrypt
  traefik.http.routers.perception-secure.service: perception-svc
  traefik.http.services.perception-svc.loadbalancer.server.port: "4000"
```

## Migrations

Database schema migrations run automatically on startup via `schemas.Migrate`.

1. Acquires a PostgreSQL session advisory lock (`8140251019`) to prevent concurrent migration races.
2. Creates the `vector` extension if not present.
3. Applies `porte` identity table migrations.
4. Executes GORM AutoMigrate for `Event`, `IngestRejection`, and `EventEmbedding`.
5. Ensures the generated `search` tsvector column with its GIN index and the HNSW vector index exist.
