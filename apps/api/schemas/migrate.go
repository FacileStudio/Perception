package schemas

import (
	"fmt"

	"gorm.io/gorm"
)

// Migrate brings the database up to date. It enables pgvector before the tables
// exist even though nothing stores an embedding yet: the extension is a
// privileged, once-per-database step, and doing it now keeps the embeddings
// phase to application code instead of a deployment change.
func Migrate(db *gorm.DB) error {
	if err := db.Exec(`CREATE EXTENSION IF NOT EXISTS vector`).Error; err != nil {
		return fmt.Errorf("enable pgvector: %w", err)
	}

	return db.AutoMigrate(&User{}, &Session{})
}
