package schemas

import (
	"context"
	"database/sql"
	"fmt"

	portepg "github.com/FacileStudio/porte/pg"

	"gorm.io/gorm"
)

// Migrate brings the database up to date.
//
// It enables pgvector before any table exists even though nothing stores an
// embedding yet: the extension is a privileged, once-per-database step, and
// doing it now keeps the embeddings phase to application code instead of a
// deployment change.
//
// The identity tables are porte's and are created from porte's own DDL rather
// than from GORM models here. Perception keeps no user table of its own — no
// domain row hangs off an account — so there is nothing to join and nothing to
// migrate alongside them.
//
// The search index is raw DDL for the same reason in reverse: a generated
// column is not something a GORM tag can describe.
//
// It takes the *sql.DB rather than reaching for db.DB() itself, so the handle is
// acquired once, above this call, and a handle failure is reported as what it is
// instead of arriving disguised as a migration error.
func Migrate(db *gorm.DB, sqlDB *sql.DB) error {
	if err := db.Exec(`CREATE EXTENSION IF NOT EXISTS vector`).Error; err != nil {
		return fmt.Errorf("enable pgvector: %w", err)
	}

	if err := portepg.EnsureSchema(context.Background(), sqlDB); err != nil {
		return fmt.Errorf("ensure porte schema: %w", err)
	}

	if err := db.AutoMigrate(&Event{}, &IngestRejection{}); err != nil {
		return fmt.Errorf("migrate events: %w", err)
	}
	if err := fullTextSearch(db); err != nil {
		return err
	}

	return nil
}

// fullTextSearch adds the generated tsvector column and its index.
//
// It is raw DDL because a generated column is not something GORM tags can
// express, and it is generated rather than filled by the application so the
// two can never drift: an event's searchable text and its search vector are
// the same fact, and maintaining them separately is how one ends up stale.
func fullTextSearch(db *gorm.DB) error {
	statements := []string{
		`ALTER TABLE events ADD COLUMN IF NOT EXISTS search tsvector
			GENERATED ALWAYS AS (to_tsvector('simple', coalesce(searchable_text, ''))) STORED`,
		`CREATE INDEX IF NOT EXISTS idx_events_search ON events USING GIN (search)`,
	}
	for _, statement := range statements {
		if err := db.Exec(statement).Error; err != nil {
			return fmt.Errorf("enable full-text search: %w", err)
		}
	}
	return nil
}
