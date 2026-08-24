package schemas

import (
	"context"
	"database/sql"
	"fmt"
	"log"

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
	unlock, err := lockMigrations(sqlDB)
	if err != nil {
		return err
	}
	defer unlock()

	if err := db.Exec(`CREATE EXTENSION IF NOT EXISTS vector`).Error; err != nil {
		return fmt.Errorf("enable pgvector: %w", err)
	}

	if err := portepg.EnsureSchema(context.Background(), sqlDB); err != nil {
		return fmt.Errorf("ensure porte schema: %w", err)
	}

	if err := db.AutoMigrate(&Event{}, &IngestRejection{}, &EventEmbedding{}); err != nil {
		return fmt.Errorf("migrate events: %w", err)
	}
	if err := fullTextSearch(db); err != nil {
		return err
	}
	return vectorIndex(db)
}

// migrationLockKey is an arbitrary constant, shared by every process that
// migrates this database and used by nothing else.
const migrationLockKey = 8_140_251_019

// lockMigrations serialises migrations across processes, returning the release.
//
// IF NOT EXISTS is not the protection it reads as. Two processes migrating at
// once both find the extension missing and both create it, and one loses with a
// unique violation on pg_extension_name_index; the same race exists for
// CREATE TABLE, and porte's DDL deadlocks outright. All three were observed —
// the extension one in `go test ./...`, which runs packages concurrently, and
// the deadlock before the tests moved to a schema per binary.
//
// It matters outside tests too: a rolling deploy overlaps two containers, and
// without this the new one exits 1 on a migration that was only ever going to
// be run by somebody.
//
// The lock is held on its own pinned connection because a session-level
// advisory lock belongs to the connection that took it, and a pool would
// otherwise release it from a different one. Closing that connection drops the
// lock regardless, so a failed unlock costs nothing but a tidy log.
func lockMigrations(sqlDB *sql.DB) (func(), error) {
	ctx := context.Background()

	conn, err := sqlDB.Conn(ctx)
	if err != nil {
		return nil, fmt.Errorf("acquire a connection for the migration lock: %w", err)
	}
	if _, err := conn.ExecContext(ctx, `SELECT pg_advisory_lock($1)`, migrationLockKey); err != nil {
		conn.Close()
		return nil, fmt.Errorf("take the migration lock: %w", err)
	}

	return func() {
		if _, err := conn.ExecContext(ctx, `SELECT pg_advisory_unlock($1)`, migrationLockKey); err != nil {
			log.Printf("release the migration lock: %v", err)
		}
		if err := conn.Close(); err != nil {
			log.Printf("close the migration lock connection: %v", err)
		}
	}, nil
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

// vectorIndex adds the HNSW index over the embedding column.
//
// It is raw DDL because an index over a pgvector operator class is not
// something a GORM tag can express. Cosine is the distance phase 3 retrieval
// will query with; building it now keeps that phase to application code.
func vectorIndex(db *gorm.DB) error {
	statement := `CREATE INDEX IF NOT EXISTS idx_event_embeddings_embedding
		ON event_embeddings USING hnsw (embedding vector_cosine_ops)`
	if err := db.Exec(statement).Error; err != nil {
		return fmt.Errorf("index embeddings: %w", err)
	}
	return nil
}
