# API Surface

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `GET` | `/health` | none | process is alive |
| `GET` | `/ready` | none | DB and worker dependencies available |
| `POST` | `/ingest` | HMAC | receive Nook event envelope |
| `POST` | `/chat` | session | stream grounded answer |
| `GET` | `/events` | session | list/search events |
| `GET` | `/events/:id` | session | inspect event and facts |
| `GET` | `/stats` | session | latest stats snapshots |
| `POST` | `/admin/embedding-jobs/retry` | session | retry failed embeddings |
| `POST` | `/admin/backfill-embeddings` | session | enqueue missing embeddings |
| `POST` | `/auth/login` | none | create dashboard session |
| `POST` | `/auth/logout` | session | clear dashboard session |
