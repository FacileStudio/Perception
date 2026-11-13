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

The binary applies the pending files under `apps/api/migrations/` at every boot, through
`tronc/migrate`, holding a Postgres advisory lock so two containers starting together cannot both
migrate. A failed migration stops the boot and the process exits 1.

- `00001_baseline.sql` creates the `vector` extension in `public`, porte's identity tables, the
  three domain tables, the generated `search` column with its GIN index, and the HNSW index.
- `00002_column_defaults.sql` gives `events.ingested_at`, `ingest_rejections.rejected_at` and
  `event_embeddings.created_at` a `now()` default.

A database built before v0.2.0 (the `events` table, no applied migration) is stamped at the
baseline on its first boot: `migrate baseline 1` records version 1 as applied without running it,
then the later files run. The image answers the subcommands without a shell:

```sh
docker run --rm -e DATABASE_URL=... <image> migrate status
docker run --rm -e DATABASE_URL=... <image> migrate up
```

Rolling back to v0.1.x is a trap. Its `AutoMigrate` drops the defaults that 00002 added, while
`goose_db_version` still records version 2. Before deploying v0.2.0 or later again after such a
rollback, run `DELETE FROM goose_db_version WHERE version_id = 2`.
