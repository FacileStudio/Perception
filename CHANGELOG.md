# Changelog

## [0.2.0] - 2026-11-13

### Changed

- Database: the schema is ordered goose SQL under `apps/api/migrations/`, applied at boot by `tronc/migrate` v0.1.1 behind a Postgres advisory lock. `schemas.Migrate` is gone, and with it GORM `AutoMigrate`, porte/pg's `EnsureSchema` at boot, the raw DDL for the `search` column and the HNSW index, and the private advisory lock. The GORM structs stay as the query layer: `TestGORMModelsMatchTheMigratedSchema` fails when a struct names a column the migrations do not create or a type its field cannot hold, and `scripts/check.sh` fails on an `.AutoMigrate(` call outside a test file.
- Database: `00001_baseline.sql` is the schema v0.1.2 built on an empty Postgres 16 with pgvector 0.8.7, as `pg_dump --schema-only` printed it on 2026-11-13; Perception was never deployed, so no production schema exists to copy. A database built from it dumps byte-identical to one v0.1.2 built. It creates the `vector` extension in `public`, so a test database no longer needs the extension installed by hand first. porte's identity tables are part of it, and `TestPorteSchemaIsInTheMigrations` fails when a porte bump changes porte/pg's `Schema`. A database built by v0.1.x (the `events` table, no applied migration) is stamped at version 1 on its first boot with tronc/migrate's `baseline` command, so the baseline is recorded without running.
- Boot: a failed migration exits 1, as before. The porte v0.3.0 re-key of local identities, the one `UPDATE` in porte/pg's `Schema`, no longer runs: Perception adopted porte at v0.3.0, so no identity was ever keyed on an address. `BackfillPictures` still runs at every boot when OIDC is configured.

### Added

- `docker run <image> migrate status` (also `up`, `version`, `baseline <n>`) answers without a shell.
- Database: `00002_column_defaults.sql` gives `events.ingested_at`, `ingest_rejections.rejected_at` and `event_embeddings.created_at` a `now()` default, with a Down. The embedding backfill inserts its pending rows outside GORM and left `created_at` NULL, so the readiness check's oldest-pending age never saw them; new rows now get a timestamp. Rolling back to v0.1.x drops these defaults again, because `AutoMigrate` removes a default its struct tags do not declare, while the ledger still records version 2: before deploying this release again after such a rollback, run `DELETE FROM goose_db_version WHERE version_id = 2`.

## [0.1.2] - 2026-11-13

### Security

- Bump golang.org/x/crypto to 0.59.0, with x/sync 0.25.0, x/sys 0.50.0 and x/text 0.44.0. It clears GO-2026-5932, which douane reported as a scan gap because the advisory has no severity.

## [0.1.1] - 2026-11-11

### Fixed

- The favicon, touch and manifest icons, link preview image and web manifest come from the muse v0.19.0 brand generator, and the head carries the suite's canonical title, description, theme colours and Open Graph and Twitter tags. The home page title matches the suite catalog.

## [0.1.0] - 2026-11-11

### Added

- First tagged release.

### Security

- Build with Go 1.26.11.
- Bump golang.org/x/crypto to 0.58.0, with x/sync, x/sys and x/text, go-chi to 5.4.0 and go-jose to 4.1.6.
- Bump vite to 7.3.8 and pin patched devalue, source-map-js and cookie.
