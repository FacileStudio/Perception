-- +goose Up
-- GORM fills these timestamps itself, so the baseline has no default there and a
-- row inserted outside GORM got NULL. The embedding backfill is such an insert:
-- its pending rows had no created_at, so the readiness check's oldest-pending age
-- never saw them. The database now fills all three.

ALTER TABLE event_embeddings ALTER COLUMN created_at SET DEFAULT now();
ALTER TABLE events ALTER COLUMN ingested_at SET DEFAULT now();
ALTER TABLE ingest_rejections ALTER COLUMN rejected_at SET DEFAULT now();

-- +goose Down
ALTER TABLE ingest_rejections ALTER COLUMN rejected_at DROP DEFAULT;
ALTER TABLE events ALTER COLUMN ingested_at DROP DEFAULT;
ALTER TABLE event_embeddings ALTER COLUMN created_at DROP DEFAULT;
