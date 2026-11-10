# Perception

Context brain for Facile operations. Ingests structured events from across the suite, builds durable business memory, and answers grounded operational questions in natural language.

One Go binary serves the API under `/api` and the built SvelteKit dashboard on everything else. Storage is PostgreSQL 16 with pgvector; identity comes from Authentik over OIDC.

Live at [perception.facile.studio](https://perception.facile.studio).

## What it does

- Ingests HMAC-signed events from Antenne with deduplication and replay protection
- Records refused deliveries in an audit log without storing source addresses
- Computes Voyage text embeddings asynchronously into pgvector with retry backoff
- Exposes worker backlog and coverage metrics via the status API and readiness check
- Authenticates with email and password sessions or Authentik OIDC SSO
- Serves the SvelteKit dashboard and Go API from a single container

## Stack

| Layer | Tech |
|---|---|
| API | Go 1.25, Chi v5, GORM, PostgreSQL 16 + pgvector, [tronc](https://github.com/FacileStudio/tronc) |
| Client | SvelteKit 2, Svelte 5 (runes), Tailwind CSS 4, muse (`@facile/muse`) |
| Deploy | Docker Compose, single container behind Traefik |

## Quick start

`docker-compose.yml` is deployment-shaped: it publishes no host port and expects the external `dokploy-network` with Traefik in front of it.

```sh
cp .env.example .env
docker compose up -d --build
```

### Local development

Start local Postgres, install dependencies, and run the API and client in separate shells.

```sh
mise run db-up
mise run install
```

```sh
cd apps/api
go run .
```

```sh
cd apps/client
bun run dev
```

The client runs on <http://localhost:5173> and proxies `/api` requests to the Go backend on `:4000`.

## Configuration

| Variable | What it does |
|---|---|
| `DATABASE_URL` | Postgres connection string. Required — the API exits 1 without it |
| `PORT` | HTTP listen port. `tronc` defaults to `8080`; this repo pins `4000` |
| `CORS_ALLOWED_ORIGINS` | Comma-separated browser origins allowed to call the API |
| `INGEST_HMAC_SECRET` | HMAC secret key for incoming Antenne deliveries |
| `OIDC_ISSUER` | Authentik OIDC discovery URL |

Full reference: [docs/configuration.md](docs/configuration.md).

## Structure

```
apps/
  api/       Go backend — modules/ (auth, embeddings, events, ingest), schemas/
  client/    SvelteKit 5 frontend
docs/        Architecture, configuration, development, deployment, API
scripts/     check.sh quality gate and local database scripts
```

## Documentation

| Doc | What's in it |
|---|---|
| [Architecture](docs/architecture.md) | Request flow, data model, how the pieces fit |
| [Configuration](docs/configuration.md) | Every environment variable and default |
| [Development](docs/development.md) | Local setup, tests, the quality gate |
| [Deployment](docs/deployment.md) | Docker Compose, Dokploy, Traefik routing |
| [API](docs/api.md) | HTTP endpoints and payloads |

---

Part of the [Facile Suite](https://facile.studio) — self-hosted tools for creative studios
and freelancers. One login, zero cloud dependency.

## License

Perception is licensed under the GNU Affero General Public License v3.0 only (`AGPL-3.0-only`); see [LICENSE](LICENSE). A commercial license is available from Facile Studio for use that cannot meet the AGPL's terms.
