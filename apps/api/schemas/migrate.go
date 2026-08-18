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

	return nil
}
